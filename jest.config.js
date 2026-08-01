/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/services/health/trendEngine.ts',
    'src/middlewares/safetyFilter.ts',
    'src/controllers/dailyLog.controller.ts',
    'src/controllers/healthPlan.controller.ts',
  ],
  testMatch: ['**/?(*.)+(spec|test).ts'],
};
