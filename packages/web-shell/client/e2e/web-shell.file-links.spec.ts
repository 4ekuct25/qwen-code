import { expect, test, type Page } from '@playwright/test';
import {
  assistantTextEvent,
  createWebShellDaemonScenario,
  installMockDaemon,
  turnCompleteEvent,
  userTextEvent,
} from './utils/mockDaemon';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSxkAAAAASUVORK5CYII=';

// UI integration uses a simulated daemon; the file routes below stand in for
// the daemon's workspace-scoped `/stat`, `/file`, and `/file/bytes`.
async function openFileLinks(
  page: Page,
  baseURL: string,
  workspaceCwd = '/tmp/qwen-web-shell-file-links',
) {
  const scenario = createWebShellDaemonScenario({
    workspaceCwd,
    capabilities: {
      workspaceCwd,
      workspaces: [
        {
          id: 'file-links-workspace',
          cwd: workspaceCwd,
          primary: true,
          trusted: true,
        },
      ],
    },
    events: [
      userTextEvent('Summarize the build.', { id: 1 }),
      assistantTextEvent(
        'Here is the [report](report.md) and the chart:\n\n![chart](chart.png)',
        { id: 2 },
      ),
      turnCompleteEvent('file-links-ready', { id: 3 }),
    ],
  });
  const buffers: Record<string, Buffer> = {
    'report.md': Buffer.from('# Report\n\nThe build is green.\n'),
    'chart.png': Buffer.from(PNG_BASE64, 'base64'),
  };
  await installMockDaemon(page, scenario, { baseURL });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path') ?? '';
    if (/^(?:\/workspaces\/[^/]+)?\/stat$/.test(url.pathname)) {
      const buffer = buffers[path];
      await route.fulfill(
        buffer
          ? {
              json: {
                kind: 'stat',
                path,
                type: 'file',
                sizeBytes: buffer.length,
                modifiedMs: 1,
              },
            }
          : { status: 404, json: { error: 'No such file' } },
      );
      return;
    }
    if (/^(?:\/workspaces\/[^/]+)?\/file\/bytes$/.test(url.pathname)) {
      const buffer = buffers[path];
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const chunk = buffer?.subarray(
        offset,
        offset + Number(url.searchParams.get('maxBytes') ?? buffer.length),
      );
      await route.fulfill(
        buffer
          ? {
              json: {
                path,
                contentBase64: chunk!.toString('base64'),
                offset,
                returnedBytes: chunk!.length,
                sizeBytes: buffer.length,
              },
            }
          : { status: 404, json: { error: 'No such file' } },
      );
      return;
    }
    if (/^(?:\/workspaces\/[^/]+)?\/file$/.test(url.pathname)) {
      const buffer = buffers[path];
      await route.fulfill(
        buffer
          ? {
              json: {
                kind: 'file',
                path,
                content: buffer.toString('utf8'),
                encoding: 'utf-8',
                truncated: false,
                sizeBytes: buffer.length,
              },
            }
          : { status: 404, json: { error: 'No such file' } },
      );
      return;
    }
    await route.fallback();
  });
  await page.goto(`/session/${scenario.sessionId}?language=en`);
  await expect(page.getByText('Here is the')).toBeVisible();
}

test('@smoke opens markdown file links in the file view and images inline', async ({
  page,
}, testInfo) => {
  await openFileLinks(page, String(testInfo.project.use.baseURL));

  // A local path never becomes a navigation href: the anchor is a button
  // that carries the path as a tooltip.
  const link = page.getByRole('button', { name: 'report', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('title', 'report.md');

  // The local image is proxied through the daemon instead of 404ing against
  // the Web Shell origin.
  const image = page.locator('img[title="chart.png"]');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^blob:/);

  await link.click();
  await expect(
    page.getByRole('tab', { name: 'report.md', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();

  // Clicking the inline image opens the full-size image tab, whose src is
  // the daemon-served bytes as a data: URL (the inline copy keeps a blob:).
  await image.click();
  await expect(
    page.locator('img[src^="data:image/png;base64,"]').first(),
  ).toBeVisible();
});
