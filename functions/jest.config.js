export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js',
    '**/tests/contract/**/*.test.js',
    '**/tests/e2e/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 50,
      statements: 50
    },
    './src/modules/**/*.js': {
      branches: 65,
      functions: 100,
      lines: 80,
      statements: 80
    }
  },
  transform: {},
  testTimeout: 10000
};
