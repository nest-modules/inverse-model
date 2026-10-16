import {
  driverFor,
  SUPPORTED_PROTOCOLS,
} from '@nestjs-modules/inverse-model/drivers';

const EXAMPLE = 'postgres://user:pass@localhost:5432/blog';

/**
 * Name of the database a connection string points at, e.g. `blog`. Throws
 * when the string is not a URL, its protocol is not supported or its path
 * names no database.
 */
export function databaseNameOf(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      `The connection string is not a URL; expected something like ${EXAMPLE}`,
    );
  }

  const protocol = url.protocol.replace(/:$/, '').toLowerCase();
  if (!driverFor(protocol)) {
    throw new Error(
      `Unsupported database protocol: ${protocol} (supported: ${SUPPORTED_PROTOCOLS.join(', ')})`,
    );
  }

  const name = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  if (!name || name.includes('/')) {
    throw new Error(
      `The connection string names no database; put it after the host, as in ${EXAMPLE}`,
    );
  }
  return name;
}
