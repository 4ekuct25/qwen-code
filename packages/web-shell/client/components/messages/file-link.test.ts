/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { openFileLink, openLocalImagePreview } from './file-link';

function capture(eventName: string): unknown[] {
  const seen: unknown[] = [];
  const handler = (e: Event) => seen.push((e as CustomEvent).detail);
  window.addEventListener(eventName, handler);
  return {
    seen,
    stop: () => window.removeEventListener(eventName, handler),
  };
}

describe('openFileLink', () => {
  it('dispatches qwen:open-file with the path', () => {
    const { seen, stop } = capture('qwen:open-file');
    openFileLink('docs/REPORT.md');
    stop();
    expect(seen).toEqual([{ path: 'docs/REPORT.md' }]);
  });
});

describe('openLocalImagePreview', () => {
  it('dispatches qwen:open-local-image with path and alt', () => {
    const { seen, stop } = capture('qwen:open-local-image');
    openLocalImagePreview('/tmp/shot.png', 'Screenshot');
    stop();
    expect(seen).toEqual([{ path: '/tmp/shot.png', alt: 'Screenshot' }]);
  });

  it('omits an empty alt', () => {
    const { seen, stop } = capture('qwen:open-local-image');
    openLocalImagePreview('/tmp/shot.png');
    stop();
    expect(seen).toEqual([{ path: '/tmp/shot.png' }]);
  });
});
