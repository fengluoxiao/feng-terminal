import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { CheckCircle2, LoaderCircle, TerminalSquare } from 'lucide-react';
import type { CliId } from '../../shared/terminal';

interface TerminalPaneProps {
  profileId: CliId;
}

export function TerminalPane({ profileId }: TerminalPaneProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'booting' | 'ready' | 'closed'>('booting');
  const [sessionLabel, setSessionLabel] = useState('Starting');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.42,
      letterSpacing: 0,
      scrollback: 12000,
      allowProposedApi: true,
      theme: {
        background: '#ffffff',
        foreground: '#24292f',
        cursor: '#246bfe',
        cursorAccent: '#ffffff',
        selectionBackground: '#dbeafe',
        black: '#3f4652',
        red: '#bd2c00',
        green: '#116329',
        yellow: '#9a6700',
        blue: '#0969da',
        magenta: '#8250df',
        cyan: '#1b7c83',
        white: '#f6f8fa',
        brightBlack: '#68717d',
        brightRed: '#cf222e',
        brightGreen: '#1a7f37',
        brightYellow: '#bf8700',
        brightBlue: '#218bff',
        brightMagenta: '#a475f9',
        brightCyan: '#3192aa',
        brightWhite: '#ffffff'
      }
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(host);
    terminal.focus();
    fitAddon.fit();

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    let disposed = false;

    window.terminalApi
      .create({
        profileId,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .then((session) => {
        if (disposed) {
          window.terminalApi.kill(session.id);
          return;
        }
        sessionIdRef.current = session.id;
        setStatus('ready');
        setSessionLabel(`${session.profile.name}${session.pid ? ` · ${session.pid}` : ''}`);
      })
      .catch((error: unknown) => {
        setStatus('closed');
        const message = error instanceof Error ? error.message : String(error);
        terminal.writeln(`\r\nFailed to start ${profileId}: ${message}`);
      });

    const inputDisposable = terminal.onData((data) => {
      const id = sessionIdRef.current;
      if (id) window.terminalApi.input(id, data);
    });

    const removeDataListener = window.terminalApi.onData((event) => {
      if (event.id === sessionIdRef.current) terminal.write(event.data);
    });

    const removeExitListener = window.terminalApi.onExit((event) => {
      if (event.id === sessionIdRef.current) {
        setStatus('closed');
        terminal.writeln(`\r\n\r\nSession exited with code ${event.exitCode ?? 'unknown'}.`);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const id = sessionIdRef.current;
      if (id) window.terminalApi.resize(id, terminal.cols, terminal.rows);
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      inputDisposable.dispose();
      removeDataListener();
      removeExitListener();
      resizeObserver.disconnect();
      if (sessionIdRef.current) window.terminalApi.kill(sessionIdRef.current);
      terminal.dispose();
      sessionIdRef.current = null;
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [profileId]);

  return (
    <div className="terminal-frame">
      <div className="terminal-meta">
        <span className={`status-dot ${status}`} />
        <TerminalSquare size={15} />
        <strong>{sessionLabel}</strong>
        <span className="terminal-state">
          {status === 'ready' ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} />}
          {status}
        </span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
