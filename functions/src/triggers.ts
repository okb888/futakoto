import { onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, REGION } from './shared';

export const cleanupOnEntryDelete = onDocumentDeleted(
  { document: 'users/{uid}/entries/{entryId}', region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const entryId = event.params.entryId;
    const cacheKey = `${uid}_${entryId}`;

    const ownerSnap = await db.doc(`users/${uid}`).get();
    const partnerUid = ownerSnap.data()?.partnerUid as string | undefined;

    const tasks: Promise<unknown>[] = [];
    tasks.push(
      db.doc(`users/${uid}/favorites/${cacheKey}`).delete().catch(() => {}),
    );
    if (partnerUid) {
      tasks.push(
        db.doc(`users/${partnerUid}/favorites/${cacheKey}`).delete().catch(() => {}),
        db.doc(`users/${partnerUid}/interpretationCache/${cacheKey}`).delete().catch(() => {}),
      );
    }
    await Promise.all(tasks);
  }
);

export const invalidateInterpretationCacheOnEntryUpdate = onDocumentUpdated(
  { document: 'users/{uid}/entries/{entryId}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // memo/mood/visibility のいずれかが変われば、相手側に残っている解釈キャッシュを無効化する
    if (
      before.memo === after.memo &&
      before.mood === after.mood &&
      before.visibility === after.visibility
    ) {
      return;
    }

    const uid = event.params.uid;
    const entryId = event.params.entryId;
    const cacheKey = `${uid}_${entryId}`;

    const ownerSnap = await db.doc(`users/${uid}`).get();
    const partnerUid = ownerSnap.data()?.partnerUid;
    if (!partnerUid) return;
    await db.doc(`users/${partnerUid}/interpretationCache/${cacheKey}`).delete().catch(() => {});
  }
);
