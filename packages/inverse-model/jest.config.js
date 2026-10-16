const path = require('node:path');

// The test script runs jest with --experimental-vm-modules: NestJS 12 ships as
// ES modules, which jest only requires from CommonJS with the flag. graphql is
// pinned to its CommonJS build, since jest cannot require its ES build in the
// import cycle Nest and Apollo load it in.
const graphql = path.dirname(require.resolve('graphql'));

module.exports = {
  rootDir: 'lib',
  testRegex: '/__tests__/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleNameMapper: {
    '^graphql$': path.join(graphql, 'index.js'),
    '^graphql/(.*)$': path.join(graphql, '$1'),
  },
};
