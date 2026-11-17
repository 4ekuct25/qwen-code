/**
 * Local file references in markdown are turned into artifact-panel actions
 * (file preview, full-size image view) by App-level listeners. The markdown
 * layer must not reach into session/workspace state, mirroring
 * {@link openSessionLink} in `session-link.ts`.
 */

export interface OpenFileLinkDetail {
  path: string;
}

export interface OpenLocalImageDetail {
  path: string;
  alt?: string;
}

/** Ask the Web Shell to open `path` in the artifact panel's file view. */
export function openFileLink(path: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenFileLinkDetail>('qwen:open-file', {
      detail: { path },
    }),
  );
}

/** Ask the Web Shell to open the full-size local image in the artifact panel. */
export function openLocalImagePreview(path: string, alt?: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenLocalImageDetail>('qwen:open-local-image', {
      detail: { path, ...(alt ? { alt } : {}) },
    }),
  );
}
