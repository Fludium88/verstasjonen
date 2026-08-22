export const ACCESS_COOKIE_NAME = 'vaerstasjonen_access';
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const ACCESS_TOKEN_HASH_PREFIX = 'vaerstasjonen:';

export function getSafeLocalReturnPath(requestedPath: string, origin: string): string {
  try {
    const decodedPath = decodeURIComponent(requestedPath);
    if (
      !requestedPath.startsWith('/') ||
      requestedPath.startsWith('//') ||
      decodedPath.startsWith('//') ||
      /[\\\u0000-\u001f\u007f]/.test(decodedPath) ||
      /%(?:2f|5c)/i.test(requestedPath)
    ) {
      return '/';
    }

    const target = new URL(requestedPath, origin);
    if (target.origin !== origin) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}
