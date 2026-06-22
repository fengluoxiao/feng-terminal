import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { CheckCircle2, LoaderCircle, TerminalSquare } from 'lucide-react';
import type { CliId } from '../../shared/terminal';

interface TerminalPaneProps {
  profileId: CliId;
  fontSize: number;
  active: boolean;
  cwd?: string;
  extraArgs?: string[];
  sessionKey?: string;
  labels: {
    starting: string;
    status: Record<'booting' | 'ready' | 'closed', string>;
    failedToStart: string;
    exitedWithCode: string;
    unknownExitCode: string;
  };
}

export function TerminalPane({
  profileId,
  fontSize,
  active,
  cwd,
  extraArgs,
  sessionKey,
  labels
}: TerminalPaneProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const labelsRef = useRef(labels);
  const [status, setStatus] = useState<'booting' | 'ready' | 'closed'>('booting');
  const [sessionLabel, setSessionLabel] = useState(labels.starting);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    labelsRef.current = labels;
    if (status === 'booting') setSessionLabel(labels.starting);
  }, [labels, status]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize,
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
        rows: terminal.rows,
        cwd,
        extraArgs,
        sessionKey
      })
      .then((session) => {
        if (disposed) {
          window.terminalApi.kill(session.id);
          return;
        }
        sessionIdRef.current = session.id;
        setStatus('ready');
        setSessionLabel(`${session.profile.name}${session.pid ? ` · ${session.pid}` : ''}`);
        if (session.replay) terminal.write(session.replay);
        requestAnimationFrame(() => fitAddon.fit());
        if (session.warning) {
          terminal.writeln(`\r\n${session.warning}\r\n`);
        }
      })
      .catch((error: unknown) => {
        setStatus('closed');
        const message = error instanceof Error ? error.message : String(error);
        terminal.writeln(`\r\n${labelsRef.current.failedToStart} ${profileId}: ${message}`);
      });

    const inputDisposable = terminal.onData((data) => {
      const id = sessionIdRef.current;
      if (id) window.terminalApi.input(id, data);
    });

    const removeDataListener = window.terminalApi.onData((event) => {
      if (event.id === sessionIdRef.current) {
        terminal.write(event.data);
        if (activeRef.current) requestAnimationFrame(() => fitAddon.fit());
      }
    });

    const removeExitListener = window.terminalApi.onExit((event) => {
      if (event.id === sessionIdRef.current) {
        setStatus('closed');
        terminal.writeln(
          `\r\n\r\n${labelsRef.current.exitedWithCode} ${event.exitCode ?? labelsRef.current.unknownExitCode}.`
        );
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
  }, [cwd, extraArgs, fontSize, profileId, sessionKey]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      terminalRef.current?.focus();
    });
  }, [active]);

  return (
    <div className={active ? 'terminal-frame active' : 'terminal-frame'} aria-hidden={!active}>
      <div className="terminal-meta">
        <span className={`status-dot ${status}`} />
        <TerminalSquare size={15} />
        <strong>{sessionLabel}</strong>
        <span className="terminal-state">
          {status === 'ready' ? <CheckCircle2 size={14} /> : <LoaderCircle size={14} />}
          {labels.status[status]}
        </span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
