/**
 * RevenueCat 雛形。
 *
 * 現状は API キー未取得のため、すべての関数は no-op で動作する。
 * App Store Connect で IAP プロダクトを登録し、RevenueCat ダッシュボードで
 * API キーを取得したら以下を実施:
 *
 * 1. `expo install react-native-purchases`
 * 2. app.json の plugins に "react-native-purchases" 追加（必要なら）
 * 3. .env / EAS Secrets に EXPO_PUBLIC_REVENUECAT_IOS_KEY を設定
 * 4. このファイルの SDK インポート + configure 実装を有効化
 * 5. functions/src/revenuecat-webhook.ts で署名検証付きの webhook を実装
 */

import Constants from 'expo-constants';

const REVENUECAT_IOS_KEY: string | undefined =
  (Constants.expoConfig?.extra as any)?.revenuecat?.iosKey ??
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

let configured = false;

export function isPurchasesConfigured(): boolean {
  return configured && !!REVENUECAT_IOS_KEY;
}

/**
 * RevenueCat SDK を初期化する。
 * API キー未設定なら no-op（雛形のまま）。
 */
export async function configurePurchases(uid: string): Promise<void> {
  if (!REVENUECAT_IOS_KEY) {
    if (__DEV__) console.log('[purchases] RevenueCat API key not configured. Skipping.');
    return;
  }

  try {
    // 本実装時は以下を有効化:
    // const Purchases = (await import('react-native-purchases')).default;
    // Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: uid });
    configured = true;
  } catch (e) {
    console.warn('[purchases] configure failed', e);
  }
}

export type PaywallOffering = {
  productId: string;
  priceString: string;
  title: string;
  description: string;
};

/**
 * 現在のオファリング（月額プラン）を取得する。
 * 未設定時はモック値を返し、UIプレビュー可能にする。
 */
export async function getCurrentOffering(): Promise<PaywallOffering | null> {
  if (!isPurchasesConfigured()) {
    return {
      productId: 'futakoto_premium_monthly',
      priceString: '¥500',
      title: 'ふたこと プレミアム',
      description: 'AI機能が無制限。月額¥500・いつでも解約可能。',
    };
  }

  try {
    // 本実装時:
    // const Purchases = (await import('react-native-purchases')).default;
    // const offerings = await Purchases.getOfferings();
    // const monthly = offerings.current?.monthly;
    // if (!monthly) return null;
    // return {
    //   productId: monthly.product.identifier,
    //   priceString: monthly.product.priceString,
    //   title: monthly.product.title,
    //   description: monthly.product.description,
    // };
    return null;
  } catch (e) {
    console.warn('[purchases] getOfferings failed', e);
    return null;
  }
}

/**
 * プレミアムプランを購入する。成功時は RevenueCat webhook 経由で
 * users/{uid}.premium が更新される。
 */
export async function purchasePremium(): Promise<{ success: boolean; error?: string }> {
  if (!isPurchasesConfigured()) {
    return {
      success: false,
      error: '課金機能は現在準備中です。App Store Connect 設定後にご利用いただけます。',
    };
  }

  try {
    // 本実装時:
    // const Purchases = (await import('react-native-purchases')).default;
    // const offerings = await Purchases.getOfferings();
    // const pkg = offerings.current?.monthly;
    // if (!pkg) return { success: false, error: '商品が取得できませんでした' };
    // const result = await Purchases.purchasePackage(pkg);
    // return { success: result.customerInfo.entitlements.active.premium != null };
    return { success: false, error: '未実装' };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false };
    }
    return { success: false, error: e?.message ?? '購入処理に失敗しました' };
  }
}

export async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
  if (!isPurchasesConfigured()) {
    return { success: false, error: '課金機能は現在準備中です。' };
  }

  try {
    // 本実装時:
    // const Purchases = (await import('react-native-purchases')).default;
    // const customerInfo = await Purchases.restorePurchases();
    // return { success: customerInfo.entitlements.active.premium != null };
    return { success: false, error: '未実装' };
  } catch (e: any) {
    return { success: false, error: e?.message ?? '復元に失敗しました' };
  }
}
