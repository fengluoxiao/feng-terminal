import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import * as pty from 'node-pty';
import { cliProfiles, getCliProfile } from './cliProfiles';
import { readAppSettings } from './settingsManager';
import type { CliBinding } from '../shared/settings';
import type { CliProfile, ShellOption } from '../shared/terminal';
import type {
  TerminalBindingCheckRequest,
  TerminalBindingCheckResult,
  TerminalCreateRequest,
  TerminalCreateResult
} from '../shared/terminal';

interface TerminalSession {
  owner: number;
  pty: pty.IPty;
  sessionKey?: string;
}

interface PtyLaunch {
  command: string;
  args: string[];
}

const sessions = new Map<string, TerminalSession>();
const maxTranscriptLength = 250_000;

export function killAllTerminalSessions(): void {
  for (const [id, session] of sessions.entries()) {
    session.pty.kill();
    sessions.delete(id);
  }
}

function getWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
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

function createEnv(): NodeJS.ProcessEnv {
  const pathEntries = [process.env.PATH ?? '', ...getExtraPathEntries()].filter(Boolean);

  return {
    ...process.env,
    PATH: Array.from(new Set(pathEntries.join(delimiter).split(delimiter).filter(Boolean))).join(delimiter),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1'
  };
}

function sendToOwner(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

function getPathEntries(env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? env.Path ?? env.path ?? '').split(delimiter).filter(Boolean);
}

function getExecutableExtensions(): string[] {
  if (platform() !== 'win32') return [''];
  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  return [...extensions, '.PS1', ...extensions.map((extension) => extension.toLowerCase()), '.ps1', ''];
}

function resolveCommand(command: string, env: NodeJS.ProcessEnv): string | null {
  if (!command) return null;
  if (isAbsolute(command)) {
    if (platform() === 'win32' && !extname(command)) {
      for (const extension of getExecutableExtensions()) {
        const candidate = `${command}${extension}`;
        if (existsSync(candidate)) return candidate;
      }
    }

    return existsSync(command) ? command : null;
  }

  const extensions = getExecutableExtensions();

  for (const entry of getPathEntries(env)) {
    for (const extension of extensions) {
      const candidate = join(entry, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function addShellOption(options: ShellOption[], label: string, command: string, env: NodeJS.ProcessEnv): void {
  const resolvedCommand = resolveCommand(command, env);
  if (!resolvedCommand) return;
  if (options.some((option) => option.command.toLowerCase() === command.toLowerCase())) return;

  options.push({
    label,
    command
  });
}

function listShellOptions(): ShellOption[] {
  const env = createEnv();
  const options: ShellOption[] = [];

  if (platform() === 'win32') {
    addShellOption(options, 'Windows PowerShell', 'powershell.exe', env);
    addShellOption(options, 'PowerShell 7', 'pwsh.exe', env);
    addShellOption(options, 'Command Prompt', 'cmd.exe', env);
    return options;
  }

  const currentShell = process.env.SHELL;
  if (currentShell) addShellOption(options, currentShell.split('/').pop() ?? currentShell, currentShell, env);

  addShellOption(options, 'zsh', '/bin/zsh', env);
  addShellOption(options, 'bash', '/bin/bash', env);
  addShellOption(options, 'fish', '/opt/homebrew/bin/fish', env);
  addShellOption(options, 'fish', '/usr/local/bin/fish', env);
  addShellOption(options, 'sh', '/bin/sh', env);

  return options;
}

function parseCommandLine(value: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of value.trim()) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote === '"') {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }

    token += char;
  }

  if (escaping) token += '\\';
  if (token) tokens.push(token);
  return tokens;
}

function applyBinding(profile: CliProfile, binding: CliBinding | undefined): CliProfile {
  const rawCommand = binding?.command.trim();
  const rawArgs = binding?.args.trim() ?? '';

  if (!rawCommand && !rawArgs) return profile;

  const commandParts =
    rawCommand && isAbsolute(rawCommand) && existsSync(rawCommand) ? [rawCommand] : parseCommandLine(rawCommand ?? '');
  const args = [...commandParts.slice(1), ...parseCommandLine(rawArgs)];

  return {
    ...profile,
    command: commandParts[0] || profile.command,
    args
  };
}

function checkTerminalBinding(request: TerminalBindingCheckRequest): TerminalBindingCheckResult {
  const commandParts = parseCommandLine(request.command);
  const command = commandParts[0] ?? request.command.trim();
  const resolvedCommand = resolveCommand(command, createEnv());

  return {
    available: Boolean(resolvedCommand),
    command,
    resolvedCommand: resolvedCommand ?? undefined
  };
}

function getShellArgs(profile: CliProfile): string[] {
  return platform() === 'win32' && profile.id === 'shell' && profile.args.length === 0 ? ['-NoLogo'] : profile.args;
}

function createPtyLaunch(command: string, args: string[]): PtyLaunch {
  if (platform() !== 'win32') {
    return { command, args };
  }
  const commandShell = process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');

  if (/\.(?:cmd|bat)$/iu.test(command)) {
    return {
      command: commandShell,
      args: ['/d', '/c', 'call', command, ...args]
    };
  }

  if (/\.ps1$/iu.test(command)) {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', command, ...args]
    };
  }

  return { command, args };
}

function getUnavailableProfileMessage(profileName: string, command: string): string {
  return `${profileName} is not available on PATH: ${command}\r\nCheck Terminal bindings or install the CLI, then open a new terminal.`;
}

function sanitizeSessionKey(value: string | undefined): string | undefined {
  return value?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || undefined;
}

function getTranscriptPath(sessionKey: string): string {
  return join(homedir(), '.tui-ai-terminal', 'transcripts', `${sessionKey}.ansi`);
}

async function readTranscript(sessionKey: string | undefined): Promise<string> {
  if (!sessionKey) return '';
  try {
    return await readFile(getTranscriptPath(sessionKey), 'utf8');
  } catch {
    return '';
  }
}

async function appendTranscript(sessionKey: string | undefined, data: string): Promise<void> {
  if (!sessionKey) return;
  const transcriptPath = getTranscriptPath(sessionKey);
  const current = await readTranscript(sessionKey);
  const next = `${current}${data}`.slice(-maxTranscriptLength);
  await mkdir(dirname(transcriptPath), { recursive: true });
  await writeFile(transcriptPath, next, 'utf8');
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:list-profiles', () => cliProfiles);
  ipcMain.handle('terminal:list-shells', () => listShellOptions());
  ipcMain.handle('terminal:check-binding', (_event, request: TerminalBindingCheckRequest) =>
    checkTerminalBinding(request)
  );

  ipcMain.handle(
    'terminal:create',
    async (event, request: TerminalCreateRequest): Promise<TerminalCreateResult> => {
      const window = getWindow(event);
      const settings = await readAppSettings();
      const baseProfile = getCliProfile(request.profileId);
      const profile = applyBinding(baseProfile, settings.cliBindings[baseProfile.id]);
      const profileWithRequestArgs = {
        ...profile,
        args: [
          ...profile.args,
          ...(baseProfile.id === 'codex' ? ['--no-alt-screen'] : []),
          ...(Array.isArray(request.extraArgs) ? request.extraArgs : [])
        ]
      };
      const id = randomUUID();
      const sessionKey = sanitizeSessionKey(request.sessionKey);
      const replay = await readTranscript(sessionKey);
      const fallbackProfile = getCliProfile('shell');
      const env = createEnv();
      const resolvedCommand = resolveCommand(profileWithRequestArgs.command, env);
      const launchProfile = resolvedCommand ? profileWithRequestArgs : fallbackProfile;
      const launchCommand = resolvedCommand ?? resolveCommand(fallbackProfile.command, env) ?? fallbackProfile.command;
      const launch = createPtyLaunch(launchCommand, getShellArgs(launchProfile));
      const warning = resolvedCommand
        ? undefined
        : getUnavailableProfileMessage(profileWithRequestArgs.name, profileWithRequestArgs.command);
      const terminal = pty.spawn(launch.command, launch.args, {
        name: 'xterm-256color',
        cols: request.cols || 100,
        rows: request.rows || 32,
        cwd: request.cwd || process.cwd() || homedir(),
        env
      });

      sessions.set(id, {
        owner: event.sender.id,
        pty: terminal,
        sessionKey
      });

      terminal.onData((data) => {
        void appendTranscript(sessionKey, data);
        sendToOwner(window, 'terminal:data', { id, data });
      });

      terminal.onExit(({ exitCode, signal }) => {
        sessions.delete(id);
        sendToOwner(window, 'terminal:exit', { id, exitCode, signal });
      });

      return { id, pid: terminal.pid, profile: profileWithRequestArgs, replay, warning };
    }
  );

  ipcMain.on('terminal:input', (event, id: string, data: string) => {
    const session = sessions.get(id);
    if (session?.owner === event.sender.id) {
      session.pty.write(data);
    }
  });

  ipcMain.on('terminal:resize', (event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (session?.owner === event.sender.id) {
      session.pty.resize(Math.max(cols, 2), Math.max(rows, 1));
    }
  });

  ipcMain.on('terminal:kill', (event, id: string) => {
    const session = sessions.get(id);
    if (session?.owner === event.sender.id) {
      session.pty.kill();
      sessions.delete(id);
    }
  });

  ipcMain.on('terminal:kill-all', (event) => {
    for (const [id, session] of sessions.entries()) {
      if (session.owner === event.sender.id) {
        session.pty.kill();
        sessions.delete(id);
      }
    }
  });
}
