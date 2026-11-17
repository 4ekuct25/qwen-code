/**
 * Detection of local filesystem paths in LLM-generated markdown.
 *
 * Browsers cannot load machine paths (`C:\…`, `~…`, POSIX absolute paths),
 * and a same-origin absolute path would resolve against the Web Shell origin
 * (the daemon), which does not serve arbitrary files. These predicates pick
 * out the paths Web Shell can route to the daemon's workspace-scoped file
 * API instead of rendering a dead link or a broken image.
 *
 * The daemon's `GET /file*` routes enforce workspace containment, so this
 * detection is a UX gate, not a security boundary: a false positive at most
 * produces a "file not found" in the preview, never a path escape.
 */
import { getImageMimeTypeFromPath } from '../artifacts/artifactUtils';

/** Plausible file references are shorter than this. */
export const MAX_LOCAL_FILE_PATH_LENGTH = 4096;

// The markdown pipeline percent-encodes backslashes before the raw path
// reaches the renderer (`C:\foo` arrives as `C:%5Cfoo`).
const PERCENT_ENCODED_BACKSLASH = /%5[cC]/g;

/**
 * Windows drive (`C:\…` / `C:/…`), home (`~` / `~user/…`), POSIX absolute
 * paths rooted at well-known OS directories, or relative paths ending in a
 * short file extension. Rejects empty/overlong values, `#` fragments,
 * protocol-relative `//host`, query strings, whitespace and control
 * characters, `..` traversal (both separator styles), and every URI scheme
 * except a Windows drive letter.
 */
export function isLocalFilePath(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LOCAL_FILE_PATH_LENGTH) return false;
  const normalized = trimmed.replace(PERCENT_ENCODED_BACKSLASH, '\\');
  // A code-point scan (instead of a control-character regex) keeps the
  // no-control-regex lint rule quiet while rejecting the same characters.
  const hasForbiddenCharacter =
    normalized.includes('?') ||
    Array.from(normalized).some((ch) => {
      const code = ch.codePointAt(0);
      return code !== undefined && (code <= 0x20 || code === 0xa0);
    });
  if (
    normalized.startsWith('#') ||
    normalized.startsWith('//') ||
    hasForbiddenCharacter ||
    /(^|[/\\])\.\.([/\\]|$)/.test(normalized)
  ) {
    return false;
  }
  if (
    !/^[A-Za-z]:[\\/]/.test(normalized) &&
    /^[a-z][a-z0-9+.-]*:/i.test(normalized)
  ) {
    return false;
  }
  return (
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    /^~/.test(normalized) ||
    /^\/(?:Users|home|tmp|var|opt|private|Volumes|mnt|media|srv|data|root|etc|boot|bin|sbin|usr|lib64|lib|dev|run|proc|sys)[\\/]/i.test(
      normalized,
    ) ||
    /\.[A-Za-z][A-Za-z0-9]{0,7}$/.test(normalized)
  );
}

/** A local filesystem path that names an image file (by extension). */
export function isLocalImageSrc(value: string | undefined): boolean {
  if (typeof value !== 'string' || !isLocalFilePath(value)) return false;
  return getImageMimeTypeFromPath(value.trim()) !== undefined;
}
