/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalImagePreview } from './LocalImagePreview';

const state = vi.hoisted(() => ({
  context: undefined as
    | { actions: { readFileBytes: unknown; stat: unknown } }
    | undefined,
}));

vi.mock('@qwen-code/web-shell/daemon-react-sdk', () => ({
  useOptionalWorkspace: () => state.context,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement | undefined;
let root: Root | undefined;

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

// jsdom has no URL object-url API; the repo pattern is a defineProperty
// stub (see ArtifactPanel.test.tsx), not vi.stubGlobal with a dotted key.
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL',
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL',
);

beforeEach(() => {
  state.context = undefined;
  createObjectUrl = vi.fn(() => 'blob:mock-1');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectUrl,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectUrl,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

function render(element: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(element);
  });
}

function imageActions(overrides?: {
  statError?: Error;
  bytes?: Array<{
    contentBase64: string;
    offset: number;
    returnedBytes: number;
    sizeBytes: number;
  }>;
}) {
  const bytes = overrides?.bytes ?? [
    {
      contentBase64: Buffer.from('PNGDATA').toString('base64'),
      offset: 0,
      returnedBytes: 7,
      sizeBytes: 7,
    },
  ];
  return {
    readFileBytes: vi.fn((_path: string, opts?: { offset?: number }) =>
      Promise.resolve(
        bytes.find((chunk) => chunk.offset === (opts?.offset ?? 0)) ??
          bytes[0]!,
      ),
    ),
    stat: vi.fn(
      overrides?.statError
        ? () => Promise.reject(overrides.statError)
        : () =>
            Promise.resolve({
              kind: 'stat',
              path: '/tmp/shot.png',
              type: 'file',
              sizeBytes: 7,
              modifiedMs: 123,
            }),
    ),
  };
}

// The daemon read chain is stat -> byte loop -> stat -> blob; a real 0ms
// timer drains the whole microtask queue between polls, so every hop gets
// its turns.
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor<T extends Element = Element>(
  selector: string,
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const el = container?.querySelector<T>(selector);
    if (el) return el;
    if (Date.now() - startedAt > 2000) {
      throw new Error(
        `Timed out waiting for ${selector}; html: ${container?.innerHTML}`,
      );
    }
    await flush();
  }
}

describe('LocalImagePreview', () => {
  it('renders the image after loading it through the daemon', async () => {
    const actions = imageActions();
    state.context = { actions };
    const seen: unknown[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('qwen:open-local-image', handler);

    render(
      createElement(LocalImagePreview, {
        path: '/tmp/shot.png',
        alt: 'Chart',
      }),
    );

    const img = await waitFor<HTMLImageElement>('img');
    expect(img.getAttribute('src')).toBe('blob:mock-1');
    expect(img.getAttribute('role')).toBe('button');
    expect(img.getAttribute('title')).toBe('/tmp/shot.png');
    expect(img.getAttribute('alt')).toBe('Chart');
    // readWorkspaceFileAsBlob stats before and after the byte loop.
    expect(actions.stat).toHaveBeenCalledTimes(2);

    act(() => {
      img.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    window.removeEventListener('qwen:open-local-image', handler);
    expect(seen).toEqual([{ path: '/tmp/shot.png', alt: 'Chart' }]);
  });

  it('revokes the object url on unmount', async () => {
    state.context = { actions: imageActions() };
    render(createElement(LocalImagePreview, { path: '/tmp/shot.png' }));
    await waitFor('img');
    act(() => root!.unmount());
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-1');
  });

  it('shows a chip when the daemon read fails', async () => {
    state.context = {
      actions: imageActions({
        statError: new Error('path_outside_workspace'),
      }),
    };
    render(createElement(LocalImagePreview, { path: '/tmp/shot.png' }));
    const chip = await waitFor('[data-web-shell-local-image="error"]');
    expect(chip.textContent).toBe('/tmp/shot.png');
    expect(container!.querySelector('img')).toBeNull();
  });

  it('shows a chip outside a workspace provider', async () => {
    state.context = undefined;
    render(createElement(LocalImagePreview, { path: '/tmp/shot.png' }));
    const chip = await waitFor('[data-web-shell-local-image="error"]');
    expect(chip.textContent).toBe('/tmp/shot.png');
  });

  it('shows a placeholder while the bytes are loading', () => {
    state.context = {
      actions: {
        readFileBytes: vi.fn(() => new Promise(() => {})),
        stat: vi.fn(() =>
          Promise.resolve({
            kind: 'stat',
            path: '/tmp/shot.png',
            type: 'file',
            sizeBytes: 7,
            modifiedMs: 123,
          }),
        ),
      },
    };
    render(createElement(LocalImagePreview, { path: '/tmp/shot.png' }));
    expect(
      container!.querySelector('[data-web-shell-local-image="loading"]'),
    ).not.toBeNull();
    expect(container!.querySelector('img')).toBeNull();
  });
});
