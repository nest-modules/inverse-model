// The test script runs jest with --experimental-vm-modules: NestJS 12 ships as
// ES modules, which jest only requires from CommonJS with the flag.
const { dirname, join } = require('node:path');

module.exports = {
  rootDir: 'lib',
  testRegex: '/__tests__/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  // graphql's ES build loaded through require ends in a cycle inside jest, so
  // every importer gets its CommonJS build.
  moduleNameMapper: {
    '^graphql$': join(dirname(require.resolve('graphql')), 'index.js'),
  },
};
