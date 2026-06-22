# TUI AI Terminal

A fresh Electron scaffold for a Warp-like AI terminal that can launch local shells and AI CLIs:

- OpenCode: `opencode`
- Codex CLI: `codex`
- Antigtravaty CLI: `antigtravaty`
- Claude Code: `claude`
- Kimi CLI: `kimi`

## Stack Decision

- Electron + electron-vite for fast renderer HMR and clean main/preload/renderer builds.
- React + Radix Primitives for light, accessible UI foundations without a heavy component system.
- node-pty + @xterm/xterm for real pseudoterminal sessions on Windows and macOS.
- Native window material hooks: macOS vibrancy and Windows 11 mica.

## Development

```bash
npm install
npm run dev
```

## Project Shape

```text
src/main       Electron main process, native window, PTY session manager
src/preload    Secure IPC bridge
src/renderer   React UI and xterm terminal surface
src/shared     Shared TypeScript contracts
```

The renderer never gets direct Node access. It talks to the terminal manager through `window.terminalApi`.
