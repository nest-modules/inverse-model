// Runs against the databases of compose.yaml; see the CI workflow for the URLs.
// Needs --experimental-vm-modules: the mongodb driver loads `os` with a dynamic import,
// and without the flag jest makes it send an empty handshake that the server rejects.
module.exports = {
  rootDir: 'lib',
  testRegex: '/__integration__/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 30000,
  // The suites share the databases, and some count whole tables.
  maxWorkers: 1,
};
