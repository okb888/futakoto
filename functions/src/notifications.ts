import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { admin, db, REGION, SHARED_POST_NOTIFICATION_COOLDOWN_MS, sendExpoPush } from './shared';

async function sendSharedEntryNotification(authorUid: string, entryId: string): Promise<void> {
  const authorSnap = await db.doc(`users/${authorUid}`).get();
  const author = authorSnap.data();
  const partnerUid = author?.partnerUid;
  if (!partnerUid) return;

  const partnerRef = db.doc(`users/${partnerUid}`);
  const partnerSnap = await partnerRef.get();
  const partner = partnerSnap.data();
  if (!partner?.notificationSettings?.sharedPostNotificationsEnabled) return;

  const lastNotifiedAt = partner.notificationMeta?.lastSharedPostNotificationAt;
  if (
    lastNotifiedAt?.toMillis &&
    Date.now() - lastNotifiedAt.toMillis() < SHARED_POST_NOTIFICATION_COOLDOWN_MS
  ) {
    return;
  }

  const tokenSnap = await partnerRef.collection('pushTokens').get();
  const tokens = tokenSnap.docs
    .map((doc) => doc.data().token)
    .filter((token): token is string => (
      typeof token === 'string' &&
      (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))
    ));

  await sendExpoPush(tokens.map((token) => ({
    to: token,
    title: 'ふたこと',
    body: 'ふたりの記録に新しい投稿があります',
    sound: null as null,
    data: { kind: 'sharedEntry', entryId, authorUid },
  })));

  await partnerRef.set({
    notificationMeta: {
      lastSharedPostNotificationAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });
}

export const notifyPartnerOnSharedEntry = onDocumentCreated(
  { region: REGION, document: 'users/{authorUid}/entries/{entryId}' },
  async (event) => {
    const entry = event.data?.data();
    const authorUid = event.params.authorUid;
    const entryId = event.params.entryId;
    if (!entry || entry.visibility !== 'shared') return;
    await sendSharedEntryNotification(authorUid, entryId);
  }
);

export const notifyPartnerOnVisibilityChange = onDocumentUpdated(
  { region: REGION, document: 'users/{authorUid}/entries/{entryId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const authorUid = event.params.authorUid;
    const entryId = event.params.entryId;
    if (!before || !after) return;
    if (before.visibility === 'shared' || after.visibility !== 'shared') return;
    await sendSharedEntryNotification(authorUid, entryId);
  }
);
