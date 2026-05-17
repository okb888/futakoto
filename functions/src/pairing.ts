import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { admin, db, PAIR_OPTIONS, generateInviteCode } from './shared';

export const ensureUserProfile = onCall(PAIR_OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');

  const uid = request.auth.uid;
  const tokenEmail = request.auth.token.email;
  const email = typeof tokenEmail === 'string'
    ? tokenEmail
    : ((request.data as { email?: string } | undefined)?.email ?? '');
  const userRef = db.doc(`users/${uid}`);

  for (let attempt = 0; attempt < 10; attempt++) {
    const inviteCode = generateInviteCode();
    const codeRef = db.doc(`inviteCodes/${inviteCode}`);

    try {
      const profile = await db.runTransaction(async (transaction) => {
        const [userSnap, codeSnap] = await Promise.all([
          transaction.get(userRef),
          transaction.get(codeRef),
        ]);

        if (codeSnap.exists) {
          throw new Error('invite-code-collision');
        }

        if (userSnap.exists) {
          const data = userSnap.data()!;
          if (data.inviteCode) {
            return {
              uid,
              email: data.email ?? email,
              ...data,
            };
          }

          transaction.set(codeRef, { uid });
          transaction.update(userRef, {
            inviteCode,
            email: data.email ?? email,
          });
          return {
            uid,
            email: data.email ?? email,
            ...data,
            inviteCode,
          };
        }

        const newProfile = {
          uid,
          email,
          displayName: email.includes('@') ? email.split('@')[0] : 'ふたことユーザー',
          inviteCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        transaction.set(codeRef, { uid });
        transaction.set(userRef, newProfile);

        return {
          ...newProfile,
          createdAt: new Date().toISOString(),
        };
      });

      return { profile };
    } catch (e: any) {
      if (e?.message === 'invite-code-collision') continue;
      throw e;
    }
  }

  throw new HttpsError('internal', '招待コードを生成できませんでした');
});

export const pairWithCode = onCall(PAIR_OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
  const { code } = request.data as { code?: string };
  if (!code) throw new HttpsError('invalid-argument', 'コードが必要です');

  // 招待コード形式検証: 6文字、A-Z(I,L,O除く)+2-9
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-HJ-KM-NP-Z2-9]{6}$/.test(normalizedCode)) {
    throw new HttpsError('invalid-argument', '招待コードの形式が正しくありません');
  }

  const myUid = request.auth.uid;
  const codeRef = db.doc(`inviteCodes/${normalizedCode}`);
  const myRef = db.doc(`users/${myUid}`);

  await db.runTransaction(async (transaction) => {
    const codeSnap = await transaction.get(codeRef);
    if (!codeSnap.exists) throw new HttpsError('not-found', '招待コードが見つかりません');
    const partnerUid = codeSnap.data()!.uid as string;
    if (partnerUid === myUid) throw new HttpsError('invalid-argument', '自分のコードは使えません');

    const partnerRef = db.doc(`users/${partnerUid}`);
    const [mySnap, partnerSnap] = await Promise.all([
      transaction.get(myRef),
      transaction.get(partnerRef),
    ]);
    if (!mySnap.exists) throw new HttpsError('not-found', '自分のプロフィールが見つかりません');
    if (!partnerSnap.exists) throw new HttpsError('not-found', '相手のアカウントが見つかりません');

    const myData = mySnap.data()!;
    const partnerData = partnerSnap.data()!;
    if (partnerData.partnerUid && partnerData.partnerUid !== myUid) {
      throw new HttpsError('failed-precondition', '相手はすでに別のパートナーと繋がっています');
    }
    if (myData.partnerUid && myData.partnerUid !== partnerUid) {
      throw new HttpsError('failed-precondition', '既にペアリング済みです。先に解除してください');
    }

    transaction.update(myRef, { partnerUid });
    transaction.update(partnerRef, { partnerUid: myUid });
  });
});

export const unpairPartner = onCall(PAIR_OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
  const myUid = request.auth.uid;

  const myRef = db.doc(`users/${myUid}`);

  // まず partnerUid を取得してからトランザクションで解除
  const mySnap = await myRef.get();
  if (!mySnap.exists) throw new HttpsError('not-found', 'プロフィールが見つかりません');
  const partnerUid = mySnap.data()!.partnerUid as string | undefined;
  if (!partnerUid) throw new HttpsError('failed-precondition', 'ペアリングされていません');

  await db.runTransaction(async (transaction) => {
    const partnerRef = db.doc(`users/${partnerUid}`);
    const partnerSnap = await transaction.get(partnerRef);
    transaction.update(myRef, { partnerUid: admin.firestore.FieldValue.delete() });
    if (partnerSnap.exists && partnerSnap.data()?.partnerUid === myUid) {
      transaction.update(partnerRef, { partnerUid: admin.firestore.FieldValue.delete() });
    }
  });

  // 解除後: 互いのお気に入り・解釈キャッシュのうち相手の投稿を参照するものを削除
  const [myFavsSnap, myCacheSnap, partnerFavsSnap, partnerCacheSnap] = await Promise.all([
    db.collection(`users/${myUid}/favorites`).get(),
    db.collection(`users/${myUid}/interpretationCache`).get(),
    db.collection(`users/${partnerUid}/favorites`).get(),
    db.collection(`users/${partnerUid}/interpretationCache`).get(),
  ]);

  const batch = db.batch();
  const myPrefix = `${myUid}_`;
  const partnerPrefix = `${partnerUid}_`;

  myFavsSnap.docs.filter(d => d.id.startsWith(partnerPrefix)).forEach(d => batch.delete(d.ref));
  myCacheSnap.docs.filter(d => d.id.startsWith(partnerPrefix)).forEach(d => batch.delete(d.ref));
  partnerFavsSnap.docs.filter(d => d.id.startsWith(myPrefix)).forEach(d => batch.delete(d.ref));
  partnerCacheSnap.docs.filter(d => d.id.startsWith(myPrefix)).forEach(d => batch.delete(d.ref));
  await batch.commit();
});

export const regenerateInviteCode = onCall(PAIR_OPTIONS, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です');
  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);

  for (let attempt = 0; attempt < 10; attempt++) {
    const newCode = generateInviteCode();
    const newCodeRef = db.doc(`inviteCodes/${newCode}`);

    try {
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const newCodeSnap = await transaction.get(newCodeRef);

        if (!userSnap.exists) {
          throw new HttpsError('not-found', 'プロフィールが見つかりません');
        }
        if (newCodeSnap.exists) {
          throw new Error('invite-code-collision');
        }

        const currentCode = userSnap.data()?.inviteCode as string | undefined;
        if (currentCode) {
          transaction.delete(db.doc(`inviteCodes/${currentCode}`));
        }
        transaction.set(newCodeRef, { uid });
        transaction.update(userRef, { inviteCode: newCode });
      });

      return { inviteCode: newCode };
    } catch (e: any) {
      if (e?.message === 'invite-code-collision') continue;
      throw e;
    }
  }

  throw new HttpsError('internal', '招待コードを生成できませんでした');
});
