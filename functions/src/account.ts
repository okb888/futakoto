import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { admin, db, REGION } from './shared';

export const deleteAccount = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
    const uid = request.auth.uid;

    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'アカウントが見つかりません');
    const userData = userSnap.data()!;

    if (userData.partnerUid) {
      const partnerUid = userData.partnerUid as string;

      // パートナー側のお気に入り・解釈キャッシュのうち削除ユーザーの投稿を参照するものを先に消す。
      // Firestoreトリガー (cleanupOnEntryDelete) は非同期で遅延するため明示的に処理する。
      const [partnerFavsSnap, partnerCacheSnap] = await Promise.all([
        db.collection(`users/${partnerUid}/favorites`).get(),
        db.collection(`users/${partnerUid}/interpretationCache`).get(),
      ]);
      const cleanupBatch = db.batch();
      const prefix = `${uid}_`;
      partnerFavsSnap.docs
        .filter(d => d.id.startsWith(prefix))
        .forEach(d => cleanupBatch.delete(d.ref));
      partnerCacheSnap.docs
        .filter(d => d.id.startsWith(prefix))
        .forEach(d => cleanupBatch.delete(d.ref));
      await cleanupBatch.commit();

      await db.doc(`users/${partnerUid}`).update({
        partnerUid: admin.firestore.FieldValue.delete(),
      }).catch(() => {});
    }

    if (userData.inviteCode) {
      await db.doc(`inviteCodes/${userData.inviteCode}`).delete().catch(() => {});
    }

    const subcollections = [
      'entries',
      'consultations',
      'consultationSessions',
      'favorites',
      'pushTokens',
      'aiUsage',
      'aiMonthlyUsage',
      'interpretationCache',
    ];
    for (const sub of subcollections) {
      let hasMore = true;
      while (hasMore) {
        const snap = await db.collection(`users/${uid}/${sub}`).limit(400).get();
        if (snap.empty) { hasMore = false; break; }
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        hasMore = snap.docs.length === 400;
      }
    }

    await db.doc(`users/${uid}`).delete();
    await admin.auth().deleteUser(uid);
  }
);
