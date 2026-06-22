import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { emptyConversationStore } from '../shared/conversation';
import type {
  ConversationCreateRequest,
  ConversationRecord,
  ConversationStore
} from '../shared/conversation';
import type { CliId } from '../shared/terminal';

const conversationsPath = join(app.getPath('userData'), 'conversations.json');
const profileIds: CliId[] = ['shell', 'opencode', 'codex', 'antigtravaty', 'antigravity', 'claude', 'kimi'];

function sanitizeProjectPath(value: unknown): string {
  return typeof value === 'string' ? normalize(value.trim()) : '';
}

function sanitizeConversation(value: Partial<ConversationRecord> | null | undefined): ConversationRecord | null {
  const projectPath = sanitizeProjectPath(value?.projectPath);
  const cliId = profileIds.includes(value?.cliId as CliId) ? (value?.cliId as CliId) : null;
  if (!projectPath || !cliId || typeof value?.id !== 'string') return null;

  const now = new Date().toISOString();
  const mode =
    value?.mode === 'resume-last' || value?.mode === 'resume-id' || value?.mode === 'fork'
      ? value.mode
      : 'new';

  return {
    id: value.id,
    cliId,
    projectPath,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : basename(projectPath),
    mode,
    sessionId: typeof value.sessionId === 'string' ? value.sessionId.trim() : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
    lastOpenedAt: typeof value.lastOpenedAt === 'string' ? value.lastOpenedAt : now
  };
}

function sanitizeStore(value: Partial<ConversationStore> | null | undefined): ConversationStore {
  const conversations = (Array.isArray(value?.conversations)
    ? value.conversations
        .map((item) => sanitizeConversation(item))
        .filter((item): item is ConversationRecord => Boolean(item))
    : []
  ).sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  const recentProjectPaths = Array.isArray(value?.recentProjectPaths)
    ? value.recentProjectPaths.map(sanitizeProjectPath).filter(Boolean)
    : [];

  return {
    conversations,
    recentProjectPaths: Array.from(
      new Set([...recentProjectPaths, ...conversations.map((conversation) => conversation.projectPath)])
    ).slice(0, 20)
  };
}

async function readStore(): Promise<ConversationStore> {
  try {
    const contents = await readFile(conversationsPath, 'utf8');
    return sanitizeStore(JSON.parse(contents) as Partial<ConversationStore>);
  } catch {
    return emptyConversationStore;
  }
}

async function writeStore(store: ConversationStore): Promise<ConversationStore> {
  const nextStore = sanitizeStore(store);
  await mkdir(dirname(conversationsPath), { recursive: true });
  await writeFile(conversationsPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  return nextStore;
}

async function createConversation(request: ConversationCreateRequest): Promise<ConversationStore> {
  const store = await readStore();
  const projectPath = sanitizeProjectPath(request.projectPath);
  if (!projectPath || !profileIds.includes(request.cliId)) return store;
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: randomUUID(),
    cliId: request.cliId,
    projectPath,
    title: request.title?.trim() || basename(projectPath),
    mode: request.mode,
    sessionId: request.sessionId?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  };

  return writeStore({
    conversations: [conversation, ...store.conversations],
    recentProjectPaths: [projectPath, ...store.recentProjectPaths]
  });
}

async function touchConversation(id: string): Promise<ConversationStore> {
  const store = await readStore();
  const now = new Date().toISOString();

  return writeStore({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === id
        ? {
            ...conversation,
            updatedAt: now,
            lastOpenedAt: now
          }
        : conversation
    )
  });
}

async function deleteConversation(id: string): Promise<ConversationStore> {
  const store = await readStore();
  return writeStore({
    ...store,
    conversations: store.conversations.filter((conversation) => conversation.id !== id)
  });
}

export function registerConversationIpc(): void {
  ipcMain.handle('conversation:list', () => readStore());
  ipcMain.handle('conversation:create', (_event, request: ConversationCreateRequest) => createConversation(request));
  ipcMain.handle('conversation:touch', (_event, id: string) => touchConversation(id));
  ipcMain.handle('conversation:delete', (_event, id: string) => deleteConversation(id));
  ipcMain.handle('conversation:choose-project', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory']
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
}
