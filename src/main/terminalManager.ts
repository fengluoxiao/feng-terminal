import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import * as pty from 'node-pty';
import { cliProfiles, getCliProfile } from './cliProfiles';
import type { TerminalCreateRequest, TerminalCreateResult } from '../shared/terminal';

interface TerminalSession {
  owner: number;
  pty: pty.IPty;
}

const sessions = new Map<string, TerminalSession>();

function getWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

function createEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1'
  };
}

function sendToOwner(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:list-profiles', () => cliProfiles);

  ipcMain.handle(
    'terminal:create',
    (event, request: TerminalCreateRequest): TerminalCreateResult => {
      const window = getWindow(event);
      const profile = getCliProfile(request.profileId);
      const id = randomUUID();
      const shellArgs = platform() === 'win32' && profile.id === 'shell' ? ['-NoLogo'] : profile.args;
      const terminal = pty.spawn(profile.command, shellArgs, {
        name: 'xterm-256color',
        cols: request.cols || 100,
        rows: request.rows || 32,
        cwd: request.cwd || process.cwd() || homedir(),
        env: createEnv()
      });

      sessions.set(id, {
        owner: event.sender.id,
        pty: terminal
      });

      terminal.onData((data) => {
        sendToOwner(window, 'terminal:data', { id, data });
      });

      terminal.onExit(({ exitCode, signal }) => {
        sessions.delete(id);
        sendToOwner(window, 'terminal:exit', { id, exitCode, signal });
      });

      return { id, pid: terminal.pid, profile };
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
