import { jest } from '@jest/globals';

export class HttpsError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const onCall = jest.fn((options: unknown, handler: unknown) => handler);
