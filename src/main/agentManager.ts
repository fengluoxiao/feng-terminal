import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path';
import { homedir, platform } from 'node:os';
import { BrowserWindow, ipcMain } from 'electron';
import { getCliProfile } from './cliProfiles';
import {
  appendConversationMessages,
  readConversationStore,
  replaceConversationMessageAndRun
} from './conversationManager';
import { readAppSettings } from './settingsManager';
import type { AgentSendRequest, AgentSendResult } from '../shared/agent';
import type { ConversationMessage, ConversationRecord, ConversationRun } from '../shared/conversation';
import type { CliId } from '../shared/terminal';

interface AgentLaunch {
  command: string;
  args: string[];
}

interface ProcessOutput {
  stdout: string;
  stderr: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createMessage(role: ConversationMessage['role'], content: string, status?: ConversationMessage['status']): ConversationMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: nowIso(),
    status
  };
}

function createRunningRun(prompt: string, startedAt: string): ConversationRun {
  return {
    id: randomUUID(),
    prompt,
    output: '',
    status: 'running',
    startedAt
  };
}

function finishRun(run: ConversationRun, output: string, status: ConversationRun['status'], error?: string): ConversationRun {
  const finishedAt = nowIso();

  return {
    ...run,
    output,
    status,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(run.startedAt).getTime(),
    error
  };
}

function parseCommandLine(value: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;

  for (const char of value.trim()) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (token) tokens.push(token);
      token = '';
      continue;
    }

    token += char;
  }

  if (token) tokens.push(token);
  return tokens;
}

async function getBoundCommand(cliId: CliId): Promise<{ command: string; args: string[] }> {
  const profile = getCliProfile(cliId);
  const settings = await readAppSettings();
  const binding = settings.cliBindings[cliId];
  const commandParts = parseCommandLine(binding?.command || profile.command);

  return {
    command: commandParts[0] || profile.command,
    args: [...commandParts.slice(1), ...parseCommandLine(binding?.args || profile.args.join(' '))]
  };
}

function getExtraPathEntries(): string[] {
  if (platform() === 'win32') {
    return [
      process.env.APPDATA ? join(process.env.APPDATA, 'npm') : '',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'npm') : ''
    ].filter(Boolean);
  }

  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homedir(), '.npm-global', 'bin'),
    join(homedir(), '.local', 'bin')
  ];
}

function createAgentEnv(): NodeJS.ProcessEnv {
  const pathEntries = [process.env.PATH ?? '', ...getExtraPathEntries()].filter(Boolean);

  return {
    ...process.env,
    PATH: Array.from(new Set(pathEntries.join(delimiter).split(delimiter).filter(Boolean))).join(delimiter),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1'
  };
}

function getExecutableExtensions(): string[] {
  if (platform() !== 'win32') return [''];
  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  return ['.CMD', '.EXE', '.BAT', '.COM', ...extensions, ...extensions.map((extension) => extension.toLowerCase()), '.ps1', ''];
}

function getPathEntries(env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? env.Path ?? env.path ?? '').split(delimiter).filter(Boolean);
}

function runProcess(launch: AgentLaunch, cwd: string, env: NodeJS.ProcessEnv): Promise<ProcessOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      cwd,
      env,
      windowsHide: true,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    function finish(callback: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    }

    function killTree(): void {
      if (platform() === 'win32' && child.pid) {
        const commandShell = process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
        spawn(commandShell, ['/d', '/c', 'taskkill', '/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true
        });
        return;
      }

      child.kill('SIGKILL');
    }

    const timeout = setTimeout(() => {
      killTree();
      finish(() => reject(new Error(`${launch.command} timed out after 90s`)));
    }, 90_000);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });
    child.stdin?.end();
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(new Error((stderr || stdout || `${launch.command} exited with code ${code}`).trim()));
      });
    });
  });
}

function resolveCommand(command: string, env: NodeJS.ProcessEnv): string {
  if (isAbsolute(command)) {
    if (platform() === 'win32' && !extname(command)) {
      for (const extension of getExecutableExtensions()) {
        const candidate = `${command}${extension}`;
        if (existsSync(candidate)) return candidate;
      }
    }

    return command;
  }

  for (const entry of getPathEntries(env)) {
    for (const extension of getExecutableExtensions()) {
      const candidate = join(entry, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  return command;
}

function createLaunch(command: string, args: string[], env: NodeJS.ProcessEnv): AgentLaunch {
  const resolvedCommand = resolveCommand(command, env);
  if (platform() !== 'win32') return { command: resolvedCommand, args };
  const commandShell = process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');

  if (/\.(?:cmd|bat)$/iu.test(resolvedCommand)) {
    return {
      command: commandShell,
      args: ['/d', '/c', 'call', resolvedCommand, ...args]
    };
  }

  if (/\.ps1$/iu.test(resolvedCommand)) {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', resolvedCommand, ...args]
    };
  }

  return { command: resolvedCommand, args };
}

function createCodexLaunch(command: string, args: string[], env: NodeJS.ProcessEnv): AgentLaunch {
  const resolvedCommand = resolveCommand(command, env);
  if (platform() === 'win32' && /\.(?:cmd|ps1)$/iu.test(resolvedCommand)) {
    const baseDirectory = dirname(resolvedCommand);
    const nodeCommand = join(baseDirectory, 'node.exe');
    const codexScript = join(baseDirectory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(nodeCommand) && existsSync(codexScript)) {
      return {
        command: nodeCommand,
        args: [codexScript, ...args]
      };
    }
  }

  return createLaunch(command, args, env);
}

function parseCodexJsonOutput(stdout: string): { output: string; sessionId?: string } {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  let sessionId: string | undefined;
  const messages: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const type = typeof event.type === 'string' ? event.type : '';
      const payload = event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : event;
      const item = payload.item && typeof payload.item === 'object' ? (payload.item as Record<string, unknown>) : undefined;
      const itemType = typeof item?.type === 'string' ? item.type : '';

      if (!sessionId) {
        const id = payload.thread_id ?? payload.id ?? payload.session_id ?? payload.sessionId;
        if (typeof id === 'string') sessionId = id;
      }

      const content = payload.content ?? payload.text ?? item?.text ?? payload.message;
      const isAssistantMessage =
        itemType === 'agent_message' ||
        itemType === 'assistant_message' ||
        type.includes('message') ||
        type.includes('output') ||
        type.includes('response');
      if (isAssistantMessage && typeof content === 'string') {
        messages.push(content);
      }
    } catch {
      if (!line.startsWith('{')) messages.push(line);
    }
  }

  return {
    output: messages.join('\n').trim() || stdout.trim(),
    sessionId
  };
}

async function runCodex(conversation: ConversationRecord, prompt: string): Promise<{ output: string; sessionId?: string }> {
  const binding = await getBoundCommand('codex');
  const env = createAgentEnv();
  const args =
    conversation.sessionId || conversation.mode === 'resume-last'
      ? [
          ...binding.args,
          'exec',
          'resume',
          ...(conversation.sessionId ? [conversation.sessionId] : ['--last']),
          '--json',
          '--skip-git-repo-check',
          prompt
        ]
      : [...binding.args, 'exec', '--json', '--skip-git-repo-check', '-C', conversation.projectPath, prompt];

  const launch = createCodexLaunch(binding.command, args, env);
  const { stdout, stderr } = await runProcess(launch, conversation.projectPath, env);
  const parsed = parseCodexJsonOutput(stdout);

  return {
    output: parsed.output || stderr.trim() || 'Codex completed without text output.',
    sessionId: parsed.sessionId
  };
}

async function runFallback(conversation: ConversationRecord, prompt: string): Promise<{ output: string; sessionId?: string }> {
  const binding = await getBoundCommand(conversation.cliId);
  const env = createAgentEnv();
  const launch = createLaunch(binding.command, [...binding.args, prompt], env);
  const { stdout, stderr } = await runProcess(launch, conversation.projectPath, env);

  return {
    output: stdout.trim() || stderr.trim() || `${conversation.cliId} completed without text output.`
  };
}

function broadcastAgentUpdate(conversationId: string, store: Awaited<ReturnType<typeof readConversationStore>>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('agent:update', { conversationId, store });
  }
}

async function sendAgentMessage(request: AgentSendRequest): Promise<AgentSendResult> {
  const store = await readConversationStore();
  const conversation = store.conversations.find((item) => item.id === request.conversationId);
  const prompt = request.prompt.trim();
  if (!conversation || !prompt) {
    return {
      store,
      output: ''
    };
  }

  const startedAt = nowIso();
  const userMessage = createMessage('user', prompt, 'done');
  const assistantMessage = createMessage('assistant', 'Running...', 'running');
  const runningRun = createRunningRun(prompt, startedAt);
  const startedStore = await appendConversationMessages(conversation.id, [userMessage, assistantMessage], undefined, runningRun);
  broadcastAgentUpdate(conversation.id, startedStore);

  void (async () => {
    try {
      const result = conversation.cliId === 'codex' ? await runCodex(conversation, prompt) : await runFallback(conversation, prompt);
      const nextMessage: ConversationMessage = {
        ...assistantMessage,
        content: result.output,
        status: 'done'
      };
      const nextRun = finishRun(runningRun, result.output, 'done');
      const nextStore = await replaceConversationMessageAndRun(conversation.id, nextMessage, nextRun, result.sessionId);
      broadcastAgentUpdate(conversation.id, nextStore);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextMessage: ConversationMessage = {
        ...assistantMessage,
        content: message,
        status: 'error'
      };
      const nextRun = finishRun(runningRun, message, 'error', message);
      const nextStore = await replaceConversationMessageAndRun(conversation.id, nextMessage, nextRun);
      broadcastAgentUpdate(conversation.id, nextStore);
    }
  })();

  return { store: startedStore, output: '' };
}

export function registerAgentIpc(): void {
  ipcMain.handle('agent:send', (_event, request: AgentSendRequest) => sendAgentMessage(request));
}
