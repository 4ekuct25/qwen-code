/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DaemonSessionSummary } from '@qwen-code/sdk/daemon';
import {
  clickSidebarElement as click,
  createSidebarMocks,
  DAEMON_APPROVAL_MODES,
  flushSidebar,
  installSidebarDomShims,
  makeSidebarSession as makeSession,
  resolvedWebShellSessions,
  sidebarSessionCatalogQuery,
  sidebarSessionPage,
} from '../../test/sidebarHarness';

const mocks = createSidebarMocks({
  colorOptions: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'],
  searchWorkspaceSessions: true,
  connection: { capabilities: undefined },
});
const {
  connection,
  workspace,
  workspaceActions,
  active,
  pinned,
  archived,
  refreshSessionCatalogQueries,
  useSessionCatalogQueries,
  loadSession,
} = mocks;

vi.mock('@qwen-code/web-shell/daemon-react-sdk', () => ({
  DAEMON_APPROVAL_MODES,
  useConnection: () => mocks.connection,
  useActions: () => mocks.actions,
  useWorkspace: () => mocks.workspace,
  useWorkspaceActions: () => mocks.workspaceActions,
  useChannels: () => mocks.channels,
  useSessions: (options?: { archiveState?: string; group?: string }) =>
    sidebarSessionPage(mocks, options),
}));

vi.mock('../../session-catalog/session-catalog-hooks', () => ({
  useWebShellSessions: (options?: {
    enabled?: boolean;
    archiveState?: string;
    group?: string;
  }) => resolvedWebShellSessions(mocks, options),
  useSessionCatalogController: () => ({
    refreshQueries: refreshSessionCatalogQueries,
    invalidateWorkspace: vi.fn(),
    refreshWorkspace: vi.fn(),
    renamed: vi.fn(),
    toggleSessionPinned: vi.fn(),
  }),
  useSessionCatalogPolling: () => undefined,
  useSessionCatalogQuery: (
    client: typeof mocks.workspace.client,
    query: { workspaceCwd: string; options?: Record<string, unknown> },
    options: { autoLoad?: boolean; enabled?: boolean },
  ) => sidebarSessionCatalogQuery(client, query, options),
  useSessionCatalogQueries,
}));

const { I18nProvider } = await import('../../i18n');
const { WebShellSidebar } = await import('./WebShellSidebar');

installSidebarDomShims();

let root: Root;
let container: HTMLDivElement;

function renderSidebar(
  props: {
    onError?: (error: unknown, message?: string) => void;
    onSessionsDeleted?: (sessionIds: string[]) => void;
  } = {},
): void {
  const onError = props.onError ?? (() => {});
  act(() => {
    root.render(
      <I18nProvider language="en">
        <WebShellSidebar
          collapsed={false}
          onCollapsedChange={() => {}}
          onOpenSettings={() => {}}
          onOpenDaemonStatus={() => {}}
          onOpenScheduledTasks={() => {}}
          onOpenGoals={() => {}}
          onOpenSessions={() => {}}
          onOpenSplitView={() => {}}
          onNewSession={() => false}
          onLoadSession={loadSession}
          onError={onError}
          onSessionsDeleted={props.onSessionsDeleted}
          // Surface delete as an inline hover button so the row's disabled
          // state is directly assertable without opening the dropdown.
          sessionActions={{ inlineItems: ['delete'] }}
        />
      </I18nProvider>,
    );
  });
}

function findSessionDeleteButton(displayName: string): HTMLButtonElement {
  const titles = Array.from(
    container.querySelectorAll('[data-web-shell-session-title]'),
  ).filter((node) => node.textContent === displayName);
  expect(titles.length).toBeGreaterThan(0);
  for (const title of titles) {
    let node: HTMLElement | null = title as HTMLElement;
    while (node) {
      const button = node.querySelector<HTMLButtonElement>(
        'button[aria-label="Delete"]',
      );
      if (button) return button;
      node = node.parentElement;
    }
  }
  throw new Error(`No delete button found for ${displayName}`);
}

// The delete confirmation renders through a radix portal (document.body when
// no WebShellPortalRoot provider is mounted), not inside the sidebar root.
function confirmDeleteButton(): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent === 'Delete',
  );
}

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  connection.sessionId = null;
  connection.workspaceCwd = '/tmp/project';
  connection.capabilities = undefined;
  workspace.capabilities = undefined;
  active.sessions = [];
  active.data = active.sessions;
  active.deleteSession.mockClear();
  active.deleteSession.mockResolvedValue(true);
  pinned.sessions = [];
  pinned.data = pinned.sessions;
  archived.sessions = [];
  archived.data = archived.sessions;
  refreshSessionCatalogQueries.mockReset();
  useSessionCatalogQueries.mockReset();
  useSessionCatalogQueries.mockReturnValue([]);
  loadSession.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
});

describe('WebShellSidebar current-session delete (issue #12619)', () => {
  it('deletes the current session from the sidebar row when it is idle', async () => {
    active.sessions = [
      makeSession('session-current', { displayName: 'Current session' }),
      makeSession('session-other', { displayName: 'Other session' }),
    ];
    active.data = active.sessions;
    connection.sessionId = 'session-current';
    const onSessionsDeleted = vi.fn();

    renderSidebar({ onSessionsDeleted });
    await flushSidebar();

    const deleteButton = findSessionDeleteButton('Current session');
    expect(deleteButton.disabled).toBe(false);
    // No "current session cannot be deleted" tooltip anymore.
    expect(deleteButton.title).toBe('Delete');

    act(() => click(deleteButton));
    await flushSidebar();

    const confirm = confirmDeleteButton();
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(active.deleteSession).toHaveBeenCalledWith('session-current');
    // The row is the attached one, so the sidebar reports the id it captured
    // at confirm time: the daemon's terminal `session_closed` frame clears the
    // attachment before the delete response resolves (#12619).
    expect(onSessionsDeleted).toHaveBeenCalledWith(['session-current'], {
      attachedSessionId: 'session-current',
    });
  });

  it('disables delete for the current session while it is running', async () => {
    active.sessions = [
      makeSession('session-current', {
        displayName: 'Current session',
        hasActivePrompt: true,
      }),
    ];
    active.data = active.sessions;
    connection.sessionId = 'session-current';

    renderSidebar();
    await flushSidebar();

    expect(findSessionDeleteButton('Current session').disabled).toBe(true);
  });

  it('still deletes a non-current session unchanged', async () => {
    active.sessions = [
      makeSession('session-current', { displayName: 'Current session' }),
      makeSession('session-other', { displayName: 'Other session' }),
    ];
    active.data = active.sessions;
    connection.sessionId = 'session-current';
    const onSessionsDeleted = vi.fn();

    renderSidebar({ onSessionsDeleted });
    await flushSidebar();

    const deleteButton = findSessionDeleteButton('Other session');
    expect(deleteButton.disabled).toBe(false);

    act(() => click(deleteButton));
    await flushSidebar();

    const confirm = confirmDeleteButton();
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(active.deleteSession).toHaveBeenCalledWith('session-other');
    expect(onSessionsDeleted).toHaveBeenCalledWith(['session-other'], {
      attachedSessionId: undefined,
    });
  });
});
