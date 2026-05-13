/**
 * RevenueCat Webhook ハンドラ。
 *
 * 連携手順:
 * 1. RevenueCat ダッシュボード → Project Settings → Integrations → Webhooks
 * 2. URL に本関数のデプロイ先 URL を設定
 *    例: https://asia-northeast1-<project>.cloudfunctions.net/revenuecatWebhook
 * 3. Authorization header に共有シークレットを設定
 * 4. Cloud Functions のシークレットを設定:
 *    firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
 *
 * RevenueCat イベント仕様:
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 *
 * 課金は「ペアの片方が premium なら両方 premium 扱い」という方針なので、
 * webhook では本人の users/{uid} のみを更新する。ペア連鎖判定は
 * functions/src/shared.ts の isPremiumUser で都度評価される。
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { admin, db, REGION } from './shared';

export const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'NON_RENEWING_PURCHASE'
  | 'PRODUCT_CHANGE'
  | 'UNCANCELLATION'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'SUBSCRIBER_ALIAS'
  | 'SUBSCRIPTION_PAUSED'
  | 'TRANSFER'
  | 'TEST';

type RevenueCatEvent = {
  type: RevenueCatEventType;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number;
  grace_period_expiration_at_ms?: number | null;
  purchased_at_ms?: number;
  event_timestamp_ms?: number;
  is_trial_period?: boolean;
  store?: string;
};

type RevenueCatPayload = {
  event?: RevenueCatEvent;
  api_version?: string;
};

const PREMIUM_ENTITLEMENT_ID = 'premium';

// premium = true にすべきイベント。CANCELLATION は予約解約なので
// expiration_at_ms まで premium 維持 → ここに含める。
const PREMIUM_ACTIVATING_EVENTS: RevenueCatEventType[] = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'CANCELLATION',
];

// premium = false にすべきイベント
const PREMIUM_DEACTIVATING_EVENTS: RevenueCatEventType[] = [
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
];

export const revenuecatWebhook = onRequest(
  {
    region: REGION,
    secrets: [REVENUECAT_WEBHOOK_AUTH],
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // 認証: RevenueCat ダッシュボードで設定した Authorization ヘッダを検証
    const expected = REVENUECAT_WEBHOOK_AUTH.value();
    if (!expected) {
      logger.error('REVENUECAT_WEBHOOK_AUTH secret is not set');
      res.status(503).send('Webhook not configured');
      return;
    }
    const provided = req.get('Authorization') ?? '';
    if (provided !== expected) {
      logger.warn('Unauthorized RevenueCat webhook request', {
        hasHeader: !!provided,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    const payload = req.body as RevenueCatPayload | undefined;
    const event = payload?.event;
    if (!event || !event.type) {
      logger.warn('RevenueCat webhook missing event payload');
      res.status(400).send('Bad Request');
      return;
    }

    // TEST イベントはダッシュボードから動作確認時に飛んでくる
    if (event.type === 'TEST') {
      logger.info('RevenueCat TEST event received');
      res.status(200).send('ok');
      return;
    }

    const uid = event.app_user_id || event.original_app_user_id;
    if (!uid) {
      logger.warn('RevenueCat event without app_user_id', { type: event.type });
      res.status(400).send('Missing app_user_id');
      return;
    }

    try {
      await applyEventToUser(uid, event);
      res.status(200).send('ok');
    } catch (e: any) {
      logger.error('RevenueCat webhook processing failed', {
        error: e?.message,
        type: event.type,
        uid,
      });
      // 5xx を返すと RevenueCat はリトライしてくれる
      res.status(500).send('Internal error');
    }
  }
);

async function applyEventToUser(uid: string, event: RevenueCatEvent): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    logger.warn('RevenueCat event for unknown user', { uid, type: event.type });
    // ユーザー削除済みでも 200 を返す（リトライさせない）
    return;
  }

  // SUBSCRIBER_ALIAS / TRANSFER は所有権移動。本実装ではログのみで状態は変えない
  if (event.type === 'SUBSCRIBER_ALIAS' || event.type === 'TRANSFER') {
    logger.info('RevenueCat alias/transfer event received', { uid, type: event.type });
    return;
  }

  // entitlement が premium 以外なら無視（将来別 SKU を追加した時の防御）
  const entitlements = event.entitlement_ids ?? [];
  if (entitlements.length > 0 && !entitlements.includes(PREMIUM_ENTITLEMENT_ID)) {
    logger.info('RevenueCat event for non-premium entitlement', {
      uid,
      type: event.type,
      entitlements,
    });
    return;
  }

  const now = Date.now();
  const update: Record<string, unknown> = {
    revenuecatLastEvent: event.type,
    revenuecatLastEventAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (event.product_id) {
    update.revenuecatProductId = event.product_id;
  }

  // BILLING_ISSUE は grace_period_expiration_at_ms が未来なら premium 維持
  if (event.type === 'BILLING_ISSUE') {
    const graceUntil = event.grace_period_expiration_at_ms ?? 0;
    if (graceUntil > now) {
      update.premium = true;
      update.premiumExpiresAt = admin.firestore.Timestamp.fromMillis(graceUntil);
      update.premiumState = 'grace';
    } else {
      update.premium = false;
      update.premiumState = 'billing_issue';
    }
    await userRef.set(update, { merge: true });
    return;
  }

  if (PREMIUM_ACTIVATING_EVENTS.includes(event.type)) {
    update.premium = true;
    if (event.expiration_at_ms) {
      update.premiumExpiresAt = admin.firestore.Timestamp.fromMillis(event.expiration_at_ms);
    }
    update.premiumState = event.type === 'CANCELLATION' ? 'cancelled' : 'active';
    await userRef.set(update, { merge: true });
    return;
  }

  if (PREMIUM_DEACTIVATING_EVENTS.includes(event.type)) {
    update.premium = false;
    update.premiumState = event.type === 'SUBSCRIPTION_PAUSED' ? 'paused' : 'expired';
    await userRef.set(update, { merge: true });
    return;
  }

  // 想定外のイベントもログだけ残して 200 を返す
  logger.info('RevenueCat event ignored (unhandled type)', { uid, type: event.type });
}
