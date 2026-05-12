import { jest } from '@jest/globals';

const increment = jest.fn((n: number) => ({ type: 'increment', n }));
const serverTimestamp = jest.fn(() => ({ type: 'serverTimestamp' }));
const FieldValue = { increment, serverTimestamp, delete: jest.fn(() => ({ type: 'delete' })) };
const Timestamp = { now: jest.fn(() => ({ type: 'timestamp' })) };

const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockDb = {
  doc: jest.fn(() => ({ get: jest.fn(), set: jest.fn(), update: jest.fn() })),
  collection: jest.fn(() => ({ get: jest.fn() })),
  runTransaction: jest.fn(async (fn: (t: typeof mockTransaction) => Promise<unknown>) => fn(mockTransaction)),
  batch: jest.fn(() => ({
    delete: jest.fn(),
    commit: jest.fn<() => Promise<void>>().mockResolvedValue(),
  })),
};

const firestore = jest.fn(() => mockDb) as jest.Mock & {
  FieldValue: typeof FieldValue;
  Timestamp: typeof Timestamp;
};
firestore.FieldValue = FieldValue;
firestore.Timestamp = Timestamp;

const admin = {
  initializeApp: jest.fn(),
  firestore,
  __mockDb: mockDb,
  __mockTransaction: mockTransaction,
};

module.exports = admin;
module.exports.default = admin;
