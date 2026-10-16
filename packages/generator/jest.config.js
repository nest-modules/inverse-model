module.exports = {
  rootDir: 'lib',
  testRegex: '/__tests__/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts', '!index.ts', '!**/__tests__/**'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 90 },
  },
};
