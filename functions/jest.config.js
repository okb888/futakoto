/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^firebase-admin$': '<rootDir>/src/__mocks__/firebase-admin.ts',
    '^firebase-admin/(.*)$': '<rootDir>/src/__mocks__/firebase-admin.ts',
    '^firebase-functions/v2/https$': '<rootDir>/src/__mocks__/firebase-functions.ts',
    '^firebase-functions/params$': '<rootDir>/src/__mocks__/firebase-functions-params.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    }],
  },
};
