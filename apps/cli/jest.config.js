// The test script runs jest with --experimental-vm-modules: NestJS 12 and
// nest-commander ship as ES modules, which jest only requires from CommonJS
// with the flag.
module.exports = {
  rootDir: 'src',
  testRegex: '/__tests__/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts', '!main.ts', '!**/__tests__/**'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: { lines: 90, statements: 90, functions: 90, branches: 90 },
  },
};
