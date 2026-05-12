import { jest } from '@jest/globals';

export const defineSecret = jest.fn((name: string) => ({
  value: () => 'test-api-key',
  name,
}));
