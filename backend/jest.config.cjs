module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  testMatch: ['**/backend/src/**/*.test.ts', '**/backend/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/backend/tsconfig.json' }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
