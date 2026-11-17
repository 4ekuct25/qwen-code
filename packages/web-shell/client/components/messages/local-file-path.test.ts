import { describe, expect, it } from 'vitest';
import {
  MAX_LOCAL_FILE_PATH_LENGTH,
  isLocalFilePath,
  isLocalImageSrc,
} from './local-file-path';

describe('isLocalFilePath', () => {
  it.each([
    '/Users/foo/report.md',
    '/home/user/docs/a.txt',
    '/tmp/chart.png',
    '/private/var/log/sys.log',
    '/Volumes/Data/notes.md',
    '/var/www/site/index.html',
    'C:\\Users\\foo\\shot.png',
    'C:/Users/foo/shot.png',
    'c:\\notes.md',
    // The markdown pipeline percent-encodes backslashes before the renderer
    // sees the path.
    'C:%5CUsers%5Cfoo%5Cshot.png',
    '~/.qwen/settings.json',
    '~/pics/a.png',
    '~',
    'docs/REPORT.md',
    'chart.png',
    'nested/dir/file.txt',
    '  /Users/foo/padded.md  ',
  ])('accepts a local path: %s', (value) => {
    expect(isLocalFilePath(value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    '#section',
    '#/Users/foo/a.md',
    '//evil.com/x.md',
    '/Users/foo/a.md?x=1',
    '/Users/foo/a b.md',
    '/Users/foo/\u0000a.md',
    '/Users/foo/\ta.md',
    '/Users/foo/../etc/passwd',
    'docs/../secrets.md',
    '..\\..\\evil.md',
    '..%5C..%5Cevil.md',
    'https://example.com/x.md',
    'http://example.com/x.md',
    'file:///Users/foo/a.md',
    'mailto:a@b.c',
    'javascript:alert(1)',
    'Makefile',
    'notes',
    'a/b',
    'x'.repeat(MAX_LOCAL_FILE_PATH_LENGTH + 1),
  ])('rejects a non-local value: %s', (value) => {
    expect(isLocalFilePath(value)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isLocalFilePath(undefined)).toBe(false);
    expect(isLocalFilePath(42)).toBe(false);
    expect(isLocalFilePath(null)).toBe(false);
  });
});

describe('isLocalImageSrc', () => {
  it.each([
    '/Users/foo/shot.png',
    '/tmp/shot.jpg',
    '/tmp/shot.jpeg',
    '/tmp/shot.gif',
    '/tmp/shot.webp',
    '/tmp/shot.bmp',
    '/tmp/shot.avif',
    '/tmp/shot.ico',
    'assets/chart.PNG',
    'C:%5CUsers%5Cfoo%5Cshot.png',
  ])('accepts a local image path: %s', (value) => {
    expect(isLocalImageSrc(value)).toBe(true);
  });

  it.each([
    '/Users/foo/notes.md',
    '/Users/foo/archive.tar',
    'https://example.com/a.png',
    'data:image/png;base64,iVBORw0KGgo=',
    'assets/script.js',
    undefined,
  ])('rejects a non-image value: %s', (value) => {
    expect(isLocalImageSrc(value)).toBe(false);
  });
});
