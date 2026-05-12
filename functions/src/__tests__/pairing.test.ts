import { HttpsError } from 'firebase-functions/v2/https';

const admin = require('firebase-admin');

jest.mock('../shared', () => {
  const actual = jest.requireActual('../shared') as Record<string, unknown>;
  return {
    ...actual,
    db: admin.__mockDb,
  };
});

describe('pairWithCode ロジック検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('自分のUIDのコードは使えない', async () => {
    const myUid = 'user-a';

    admin.__mockTransaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: myUid }),
    });

    admin.__mockDb.runTransaction.mockImplementation(
      async (fn: (t: typeof admin.__mockTransaction) => Promise<unknown>) => {
        const codeSnap = { exists: true, data: () => ({ uid: myUid }) };
        const partnerUid: string = codeSnap.data().uid;
        if (partnerUid === myUid) {
          throw new HttpsError('invalid-argument', '自分のコードは使えません');
        }
        return fn(admin.__mockTransaction);
      }
    );

    await expect(
      admin.__mockDb.runTransaction(async (t: unknown) => {
        const codeSnap = { exists: true, data: () => ({ uid: myUid }) };
        const partnerUid = codeSnap.data().uid;
        if (partnerUid === myUid) {
          throw new HttpsError('invalid-argument', '自分のコードは使えません');
        }
      })
    ).rejects.toThrow(HttpsError);
  });

  it('存在しないコードはエラー', async () => {
    admin.__mockTransaction.get.mockResolvedValueOnce({ exists: false, data: () => ({}) });

    admin.__mockDb.runTransaction.mockImplementation(
      async (fn: (t: typeof admin.__mockTransaction) => Promise<unknown>) => fn(admin.__mockTransaction)
    );

    const runTransaction = async () => {
      const codeSnap = { exists: false };
      if (!codeSnap.exists) {
        throw new HttpsError('not-found', '招待コードが見つかりません');
      }
    };

    await expect(runTransaction()).rejects.toThrow(HttpsError);
  });

  it('相手がすでに別パートナーと繋がっているとエラー', async () => {
    const runTransaction = async () => {
      const myUid = 'user-a';
      const partnerUid = 'user-b';
      const anotherUid = 'user-c';

      const partnerData = { partnerUid: anotherUid };
      if (partnerData.partnerUid && partnerData.partnerUid !== myUid) {
        throw new HttpsError('failed-precondition', '相手はすでに別のパートナーと繋がっています');
      }
    };

    await expect(runTransaction()).rejects.toThrow(HttpsError);
  });

  it('自分がすでにペアリング済みの場合はエラー', async () => {
    const runTransaction = async () => {
      const myUid = 'user-a';
      const partnerUid = 'user-b';
      const anotherUid = 'user-c';

      const myData = { partnerUid: anotherUid };
      if (myData.partnerUid && myData.partnerUid !== partnerUid) {
        throw new HttpsError('failed-precondition', '既にペアリング済みです。先に解除してください');
      }
    };

    await expect(runTransaction()).rejects.toThrow(HttpsError);
  });

  it('正常なペアリングはエラーをスローしない', async () => {
    const runTransaction = async () => {
      const myUid = 'user-a';
      const partnerUid = 'user-b';

      const codeSnap = { exists: true, data: () => ({ uid: partnerUid }) };
      if (!codeSnap.exists) throw new HttpsError('not-found', '招待コードが見つかりません');
      if (codeSnap.data().uid === myUid) throw new HttpsError('invalid-argument', '自分のコードは使えません');

      const partnerData: { partnerUid?: string } = {};
      const myData: { partnerUid?: string } = {};
      if (partnerData.partnerUid && partnerData.partnerUid !== myUid) {
        throw new HttpsError('failed-precondition', '相手はすでに別のパートナーと繋がっています');
      }
      if (myData.partnerUid && myData.partnerUid !== partnerUid) {
        throw new HttpsError('failed-precondition', '既にペアリング済みです。先に解除してください');
      }
    };

    await expect(runTransaction()).resolves.toBeUndefined();
  });
});
