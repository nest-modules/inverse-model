const HIDDEN = '****';

// `scheme://user:password@` and `?password=...` in any connection string.
const URL_PASSWORD = /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*):[^\s@/]*@/gi;
const QUERY_PASSWORD = /([?&;](?:password|pwd|pass)=)[^&;\s]*/gi;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function passwordOf(url: string): string | undefined {
  try {
    return new URL(url).password || undefined;
  } catch {
    return url.match(/:\/\/[^:/@]*:([^@/]+)@/)?.[1];
  }
}

export type Redactor = (text: string) => string;

/**
 * Hides the passwords of connection strings in text: any `user:password@`
 * and `password=` of a URL, and the passwords of `urls` wherever they show up.
 */
export function createRedactor(
  urls: readonly (string | undefined)[],
): Redactor {
  const secrets = urls
    .filter((url): url is string => Boolean(url))
    .map(passwordOf)
    .filter((password): password is string => Boolean(password))
    .flatMap((password) => {
      let decoded = password;
      try {
        decoded = decodeURIComponent(password);
      } catch {}
      return [password, decoded];
    })
    // Too short to tell from ordinary text; the URL patterns still hide it in URLs.
    .filter((password) => password.length >= 4)
    .sort((a, b) => b.length - a.length);
  const exact =
    secrets.length > 0
      ? new RegExp([...new Set(secrets)].map(escapeRegex).join('|'), 'g')
      : undefined;

  return (text) => {
    const masked = text
      .replace(URL_PASSWORD, `$1:${HIDDEN}@`)
      .replace(QUERY_PASSWORD, `$1${HIDDEN}`);
    return exact ? masked.replace(exact, HIDDEN) : masked;
  };
}

/** Redacts the message, stack and other text properties of an error in place, and returns it. */
export function redactError<T>(error: T, redact: Redactor): T {
  if (typeof error !== 'object' || error === null) return error;
  const record = error as Record<string, unknown>;
  for (const key of new Set([
    ...Object.getOwnPropertyNames(error),
    'message',
    'stack',
  ])) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    try {
      record[key] = redact(value);
    } catch {}
  }
  return error;
}
