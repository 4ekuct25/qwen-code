import { useEffect, useState } from 'react';
import {
  getImageMimeTypeFromPath,
  readWorkspaceFileAsBlob,
} from '../artifacts/artifactUtils';
import { openLocalImagePreview } from './file-link';
import { useOptionalWorkspace } from '@qwen-code/web-shell/daemon-react-sdk';
import styles from './Markdown.module.css';

type LocalImageStatus = 'loading' | 'ready' | 'error';

/**
 * Renders a local workspace image inline by proxying its bytes through the
 * daemon (`GET /file/bytes`): a markdown `<img src>` cannot point at a
 * machine path directly. Clicking the image asks the App-level listener to
 * open the full-size image in the artifact panel. Outside a live workspace
 * (standalone/export renderers) it degrades to the path chip.
 */
export function LocalImagePreview({
  path,
  alt,
}: {
  path: string;
  alt?: string;
}) {
  const actions = useOptionalWorkspace()?.actions;
  const [status, setStatus] = useState<LocalImageStatus>('loading');
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setStatus('loading');
    setSrc(null);
    const mimeType = getImageMimeTypeFromPath(path);
    if (!actions || !mimeType) {
      setStatus('error');
      return;
    }
    void readWorkspaceFileAsBlob(
      (filePath, options) => actions.readFileBytes(filePath, options),
      path,
      mimeType,
      {
        statFile: (filePath) => actions.stat(filePath),
        isCancelled: () => cancelled,
      },
    )
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [actions, path]);

  if (status === 'error') {
    return (
      <span
        className={styles.localImageChip}
        title={path}
        data-web-shell-local-image="error"
      >
        {alt && alt !== path ? `${alt} — ${path}` : path}
      </span>
    );
  }
  if (status !== 'ready' || !src) {
    return (
      <span
        className={styles.localImagePlaceholder}
        data-web-shell-local-image="loading"
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt || ''}
      className={`${styles.image} ${styles.localImage}`}
      role="button"
      title={path}
      onClick={() => openLocalImagePreview(path, alt)}
    />
  );
}
