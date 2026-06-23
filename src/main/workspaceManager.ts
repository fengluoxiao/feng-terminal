import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { app, ipcMain } from 'electron';
import { emptyWorkspaceState } from '../shared/workspace';
import type { WorkspaceState, WorkspaceTabRecord } from '../shared/workspace';
import type { CliId } from '../shared/terminal';

const workspacePath = join(app.getPath('userData'), 'workspace.json');
const profileIds: CliId[] = ['shell', 'opencode', 'codex', 'antigtravaty', 'antigravity', 'claude', 'kimi'];

function sanitizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sanitizePath(value: unknown): string | undefined {
  const text = sanitizeText(value);
  return text ? normalize(text) : undefined;
}

function sanitizeTab(value: Partial<WorkspaceTabRecord> | null | undefined): WorkspaceTabRecord | null {
  const id = sanitizeText(value?.id);
  const profileId = profileIds.includes(value?.profileId as CliId) ? (value?.profileId as CliId) : null;
  if (!id || !profileId) return null;

  return {
    id,
    profileId,
    title: sanitizeText(value?.title) ?? 'Terminal',
    cwd: sanitizePath(value?.cwd),
    extraArgs: Array.isArray(value?.extraArgs)
      ? value.extraArgs.filter((item): item is string => typeof item === 'string')
      : undefined,
    conversationId: sanitizeText(value?.conversationId),
    projectPath: sanitizePath(value?.projectPath),
    sessionKey: sanitizeText(value?.sessionKey)
  };
}

function sanitizeWorkspace(value: Partial<WorkspaceState> | null | undefined): WorkspaceState {
  const tabs = (Array.isArray(value?.tabs)
    ? value.tabs.map((item) => sanitizeTab(item)).filter((item): item is WorkspaceTabRecord => Boolean(item))
    : []
  ).slice(0, 12);
  const activeTabId =
    typeof value?.activeTabId === 'string' && tabs.some((tab) => tab.id === value.activeTabId)
      ? value.activeTabId
      : tabs[0]?.id;

  return {
    tabs,
    activeTabId,
    activeView: 'terminal',
    conversationPanelOpen:
      typeof value?.conversationPanelOpen === 'boolean'
        ? value.conversationPanelOpen
        : emptyWorkspaceState.conversationPanelOpen
  };
}

async function readWorkspace(): Promise<WorkspaceState> {
  try {
    const contents = await readFile(workspacePath, 'utf8');
    return sanitizeWorkspace(JSON.parse(contents) as Partial<WorkspaceState>);
  } catch {
    return emptyWorkspaceState;
  }
}

async function writeWorkspace(workspace: WorkspaceState): Promise<WorkspaceState> {
  const nextWorkspace = sanitizeWorkspace(workspace);
  await mkdir(dirname(workspacePath), { recursive: true });
  await writeFile(workspacePath, `${JSON.stringify(nextWorkspace, null, 2)}\n`, 'utf8');
  return nextWorkspace;
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace:load', () => readWorkspace());
  ipcMain.handle('workspace:save', (_event, workspace: WorkspaceState) => writeWorkspace(workspace));
}
