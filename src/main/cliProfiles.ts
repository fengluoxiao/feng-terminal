import { platform } from 'node:os';
import type { CliId, CliProfile } from '../shared/terminal';

const defaultShell = platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh';

export const cliProfiles: CliProfile[] = [
  {
    id: 'shell',
    name: 'Shell',
    command: defaultShell,
    args: [],
    description: 'Start a regular local terminal session.'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: [],
    description: 'Launch OpenCode CLI in the current workspace.'
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    command: 'codex',
    args: [],
    description: 'Launch Codex CLI with the active working directory.'
  },
  {
    id: 'antigtravaty',
    name: 'Antigtravaty CLI',
    command: 'antigtravaty',
    args: [],
    description: 'Launch the Antigtravaty CLI profile.'
  },
  {
    id: 'antigravity',
    name: 'Antigravity CLI',
    command: 'antigravity',
    args: [],
    description: 'Launch the Antigravity CLI profile.'
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    args: [],
    description: 'Launch Claude Code CLI.'
  },
  {
    id: 'kimi',
    name: 'Kimi CLI',
    command: 'kimi',
    args: [],
    description: 'Launch Kimi CLI.'
  }
];

export function getCliProfile(id: CliId): CliProfile {
  return cliProfiles.find((profile) => profile.id === id) ?? cliProfiles[0];
}
