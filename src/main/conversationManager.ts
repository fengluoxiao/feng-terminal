import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { emptyConversationStore } from '../shared/conversation';
import type {
  ConversationBindSessionRequest,
  ConversationCreateRequest,
  ConversationMessage,
  ConversationRecord,
  ConversationRun,
  ConversationStore,
  ConversationUpdateRequest
} from '../shared/conversation';
import type { CliId } from '../shared/terminal';

const conversationsPath = join(app.getPath('userData'), 'conversations.json');
const homePath = homedir();
const codexSessionsPath = join(homePath, '.codex', 'sessions');
const claudeProjectsPath = join(homePath, '.claude', 'projects');
const profileIds: CliId[] = ['shell', 'opencode', 'codex', 'antigtravaty', 'antigravity', 'claude', 'kimi'];
const cliNames: Record<CliId, string> = {
  shell: 'Shell',
  opencode: 'OpenCode',
  codex: 'Codex CLI',
  antigtravaty: 'Antigtravaty CLI',
  antigravity: 'Antigravity CLI',
  claude: 'Claude Code',
  kimi: 'Kimi CLI'
};

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
    messages: Array.isArray(value.messages)
      ? value.messages.map((message) => sanitizeMessage(message)).filter((item): item is ConversationMessage => Boolean(item))
      : [],
    runs: Array.isArray(value.runs)
      ? value.runs.map((run) => sanitizeRun(run)).filter((item): item is ConversationRun => Boolean(item))
      : [],
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
    lastOpenedAt: typeof value.lastOpenedAt === 'string' ? value.lastOpenedAt : now
  };
}

function sanitizeRun(value: Partial<ConversationRun> | null | undefined): ConversationRun | null {
  if (!value || typeof value.id !== 'string') return null;
  const now = new Date().toISOString();
  const startedAt = typeof value.startedAt === 'string' ? value.startedAt : now;
  const staleRunning = value.status === 'running' && Date.now() - new Date(startedAt).getTime() > 120_000;
  const status = staleRunning ? 'error' : value.status === 'running' || value.status === 'error' ? value.status : 'done';

  return {
    id: value.id,
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    output: staleRunning ? 'Interrupted.' : typeof value.output === 'string' ? normalizeCodexJsonlText(value.output) : '',
    status,
    startedAt,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : staleRunning ? now : undefined,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : undefined,
    error: staleRunning ? 'Interrupted.' : typeof value.error === 'string' ? normalizeCodexJsonlText(value.error) : undefined
  };
}

function sanitizeMessage(value: Partial<ConversationMessage> | null | undefined): ConversationMessage | null {
  if (!value || typeof value.id !== 'string' || typeof value.content !== 'string') return null;
  const now = new Date().toISOString();
  const role = value.role === 'assistant' || value.role === 'system' ? value.role : 'user';
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : now;
  const staleRunning = value.status === 'running' && Date.now() - new Date(createdAt).getTime() > 120_000;
  const status = staleRunning ? 'error' : value.status === 'error' || value.status === 'running' ? value.status : value.status === 'done' ? 'done' : undefined;

  return {
    id: value.id,
    role,
    content: staleRunning ? 'Interrupted.' : normalizeCodexJsonlText(value.content),
    createdAt,
    status
  };
}

function normalizeCodexJsonlText(value: string): string {
  const lines = value.split(/\r?\n/).filter(Boolean);
  if (!lines.some((line) => line.startsWith('{"type":'))) return value;
  const messages: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const type = typeof event.type === 'string' ? event.type : '';
      const payload = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : event;
      const item = payload.item && typeof payload.item === 'object' ? (payload.item as Record<string, unknown>) : undefined;
      const itemType = typeof item?.type === 'string' ? item.type : '';
      const text = item?.text ?? payload.text;
      const isAssistantMessage =
        itemType === 'agent_message' ||
        itemType === 'assistant_message' ||
        type.includes('message') ||
        type.includes('output') ||
        type.includes('response');
      if (isAssistantMessage && typeof text === 'string') messages.push(text);
    } catch {
      // Ignore malformed JSONL fragments.
    }
  }

  return messages.join('\n').trim() || value;
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

export async function readConversationStore(): Promise<ConversationStore> {
  let contents: string;
  try {
    contents = await readFile(conversationsPath, 'utf8');
  } catch {
    return emptyConversationStore;
  }

  let store: ConversationStore;
  try {
    store = sanitizeStore(JSON.parse(contents) as Partial<ConversationStore>);
  } catch {
    return emptyConversationStore;
  }
  const nextContents = `${JSON.stringify(store, null, 2)}\n`;
  if (nextContents !== contents) {
    try {
      await mkdir(dirname(conversationsPath), { recursive: true });
      await writeFile(conversationsPath, nextContents, 'utf8');
    } catch {
      // Reading should not fail just because the one-time cleanup could not write back.
    }
  }
  return store;
}

export async function writeConversationStore(store: ConversationStore): Promise<ConversationStore> {
  const nextStore = sanitizeStore(store);
  await mkdir(dirname(conversationsPath), { recursive: true });
  await writeFile(conversationsPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  return nextStore;
}

async function createConversation(request: ConversationCreateRequest): Promise<ConversationStore> {
  const store = await readConversationStore();
  const projectPath = sanitizeProjectPath(request.projectPath);
  if (!projectPath || !profileIds.includes(request.cliId)) return store;
  const now = new Date().toISOString();
  const fallbackTitle = `${cliNames[request.cliId]} · ${request.mode} · ${new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
  const conversation: ConversationRecord = {
    id: randomUUID(),
    cliId: request.cliId,
    projectPath,
    title: request.title?.trim() || fallbackTitle,
    mode: request.mode,
    sessionId: request.sessionId?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  };

  return writeConversationStore({
    conversations: [conversation, ...store.conversations],
    recentProjectPaths: [projectPath, ...store.recentProjectPaths]
  });
}

async function touchConversation(id: string): Promise<ConversationStore> {
  const store = await readConversationStore();
  const now = new Date().toISOString();

  return writeConversationStore({
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

async function updateConversation(request: ConversationUpdateRequest): Promise<ConversationStore> {
  const store = await readConversationStore();
  const now = new Date().toISOString();
  const mode =
    request.mode === 'new' || request.mode === 'resume-last' || request.mode === 'resume-id' || request.mode === 'fork'
      ? request.mode
      : undefined;

  return writeConversationStore({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === request.id
        ? {
            ...conversation,
            title: request.title?.trim() || conversation.title,
            mode: mode ?? conversation.mode,
            sessionId: request.sessionId?.trim() || conversation.sessionId,
            updatedAt: now
          }
        : conversation
    )
  });
}

async function findLatestCodexSessionId(projectPath: string, since: string): Promise<string | null> {
  const sinceTime = new Date(since).getTime() - 60_000;
  const candidates: Array<{ id: string; updatedAt: number }> = [];

  async function visit(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }

        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return;
        const fileStat = await stat(entryPath);
        if (fileStat.mtimeMs < sinceTime) return;

        const firstLine = (await readFile(entryPath, 'utf8')).split(/\r?\n/, 1)[0];
        if (!firstLine) return;

        try {
          const event = JSON.parse(firstLine) as {
            type?: string;
            payload?: {
              id?: string;
              cwd?: string;
            };
          };
          const id = event.payload?.id;
          const cwd = event.payload?.cwd ? normalize(event.payload.cwd) : '';
          if (event.type === 'session_meta' && id && cwd === normalize(projectPath)) {
            candidates.push({ id, updatedAt: fileStat.mtimeMs });
          }
        } catch {
          // Ignore partial session files while Codex is still writing them.
        }
      })
    );
  }

  await visit(codexSessionsPath);
  candidates.sort((left, right) => right.updatedAt - left.updatedAt);
  return candidates[0]?.id ?? null;
}

function getOpenCodeSessionRoots(): string[] {
  return [
    join(homePath, '.opencode'),
    join(homePath, '.local', 'share', 'opencode'),
    process.env.APPDATA ? join(process.env.APPDATA, 'opencode') : '',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'opencode') : ''
  ].filter(Boolean);
}

async function readJsonlSample(filePath: string, maxLines = 12): Promise<unknown[]> {
  try {
    return (await readFile(filePath, 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, maxLines)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getNestedString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;

  for (const key of keys) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object') {
      const nested = getNestedString(item, keys);
      if (nested) return nested;
    }
  }

  return null;
}

function eventMatchesProject(value: unknown, projectPath: string): boolean {
  const candidate =
    getNestedString(value, ['cwd', 'projectPath', 'path', 'directory', 'workingDirectory']) ?? '';
  return candidate ? normalize(candidate) === normalize(projectPath) : false;
}

function getSessionIdFromEvent(value: unknown): string | null {
  return getNestedString(value, ['sessionId', 'session_id', 'id', 'uuid']);
}

async function findLatestSessionInJsonlTree(root: string, projectPath: string, since: string): Promise<string | null> {
  const sinceTime = new Date(since).getTime() - 60_000;
  const candidates: Array<{ id: string; updatedAt: number }> = [];

  async function visit(directory: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }

        if (!entry.isFile() || !/\.(?:jsonl|json)$/iu.test(entry.name)) return;
        const fileStat = await stat(entryPath);
        if (fileStat.mtimeMs < sinceTime) return;

        const sample = await readJsonlSample(entryPath);
        const matchingEvent = sample.find((event) => eventMatchesProject(event, projectPath));
        if (!matchingEvent) return;

        const id = getSessionIdFromEvent(matchingEvent) ?? entry.name.replace(/\.(?:jsonl|json)$/iu, '');
        if (id) candidates.push({ id, updatedAt: fileStat.mtimeMs });
      })
    );
  }

  await visit(root);
  candidates.sort((left, right) => right.updatedAt - left.updatedAt);
  return candidates[0]?.id ?? null;
}

async function findLatestClaudeSessionId(projectPath: string, since: string): Promise<string | null> {
  return findLatestSessionInJsonlTree(claudeProjectsPath, projectPath, since);
}

async function findLatestOpenCodeSessionId(projectPath: string, since: string): Promise<string | null> {
  for (const root of getOpenCodeSessionRoots()) {
    const sessionId = await findLatestSessionInJsonlTree(root, projectPath, since);
    if (sessionId) return sessionId;
  }

  return null;
}

async function bindConversationSession(request: ConversationBindSessionRequest): Promise<ConversationStore> {
  const store = await readConversationStore();
  const conversation = store.conversations.find((item) => item.id === request.id);
  if (!conversation || conversation.sessionId) return store;

  const findSessionId: Partial<Record<CliId, () => Promise<string | null>>> = {
    codex: () => findLatestCodexSessionId(conversation.projectPath, conversation.createdAt),
    claude: () => findLatestClaudeSessionId(conversation.projectPath, conversation.createdAt),
    opencode: () => findLatestOpenCodeSessionId(conversation.projectPath, conversation.createdAt)
  };

  const sessionId = await findSessionId[conversation.cliId]?.();

  if (!sessionId) return store;

  return updateConversation({
    id: conversation.id,
    mode: 'resume-id',
    sessionId
  });
}

export async function appendConversationMessages(
  conversationId: string,
  messages: ConversationMessage[],
  sessionId?: string,
  run?: ConversationRun
): Promise<ConversationStore> {
  const store = await readConversationStore();
  const now = new Date().toISOString();

  return writeConversationStore({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            sessionId: sessionId ?? conversation.sessionId,
            mode: sessionId ? 'resume-id' : conversation.mode,
            messages: [...(conversation.messages ?? []), ...messages],
            runs: run ? [...(conversation.runs ?? []), run] : conversation.runs,
            updatedAt: now,
            lastOpenedAt: now
          }
        : conversation
    )
  });
}

export async function replaceConversationMessageAndRun(
  conversationId: string,
  message: ConversationMessage,
  run: ConversationRun,
  sessionId?: string
): Promise<ConversationStore> {
  const store = await readConversationStore();
  const now = new Date().toISOString();

  return writeConversationStore({
    ...store,
    conversations: store.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            sessionId: sessionId ?? conversation.sessionId,
            mode: sessionId ? 'resume-id' : conversation.mode,
            messages: (conversation.messages ?? []).map((item) => (item.id === message.id ? message : item)),
            runs: (conversation.runs ?? []).map((item) => (item.id === run.id ? run : item)),
            updatedAt: now,
            lastOpenedAt: now
          }
        : conversation
    )
  });
}

async function deleteConversation(id: string): Promise<ConversationStore> {
  const store = await readConversationStore();
  return writeConversationStore({
    ...store,
    conversations: store.conversations.filter((conversation) => conversation.id !== id)
  });
}

export function registerConversationIpc(): void {
  ipcMain.handle('conversation:list', () => readConversationStore());
  ipcMain.handle('conversation:create', (_event, request: ConversationCreateRequest) => createConversation(request));
  ipcMain.handle('conversation:update', (_event, request: ConversationUpdateRequest) => updateConversation(request));
  ipcMain.handle('conversation:bind-session', (_event, request: ConversationBindSessionRequest) =>
    bindConversationSession(request)
  );
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
