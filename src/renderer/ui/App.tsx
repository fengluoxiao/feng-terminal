import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  CircleStop,
  Command,
  Cpu,
  Maximize2,
  MessageSquarePlus,
  Minus,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  TerminalSquare,
  X,
  XIcon
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { CliId, CliProfile } from '../../shared/terminal';
import { TerminalPane } from './TerminalPane';

const profileIcons: Record<CliId, typeof TerminalSquare> = {
  shell: TerminalSquare,
  opencode: Sparkles,
  codex: Bot,
  antigtravaty: Cpu,
  antigravity: Cpu,
  claude: Command,
  kimi: Sparkles
};

interface SessionTab {
  id: string;
  profileId: CliId;
  title: string;
}

export function App(): ReactNode {
  const [profiles, setProfiles] = useState<CliProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<CliId>('codex');
  const [tabs, setTabs] = useState<SessionTab[]>([
    { id: crypto.randomUUID(), profileId: 'shell', title: 'Shell' }
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    void window.terminalApi.listProfiles().then((items) => {
      setProfiles(items);
      if (items.some((item) => item.id === 'codex')) setActiveProfile('codex');
    });
  }, []);

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfile) ?? profiles[0],
    [activeProfile, profiles]
  );

  function createTab(profileId = activeProfile): void {
    const profile = profiles.find((item) => item.id === profileId);
    const tab = {
      id: crypto.randomUUID(),
      profileId,
      title: profile?.name ?? 'Terminal'
    };
    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
  }

  function closeActiveTab(): void {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const nextTabs = tabs.filter((tab) => tab.id !== activeTabId);
    setTabs(nextTabs);
    setActiveTabId(nextTabs[Math.max(0, index - 1)].id);
  }

  function restartActiveTab(): void {
    const nextId = crypto.randomUUID();
    setTabs((items) =>
      items.map((tab) =>
        tab.id === activeTabId
          ? {
              ...tab,
              id: nextId
            }
          : tab
      )
    );
    setActiveTabId(nextId);
  }

  function closeTab(tabId: string): void {
    if (tabs.length === 1) return;
    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (tabId === activeTabId) {
      setActiveTabId(nextTabs[Math.max(0, index - 1)].id);
    }
  }

  return (
    <Tooltip.Provider delayDuration={450}>
      <main className="app-shell">
        <header className="window-chrome">
          <nav className="app-menu" aria-label="Application menu">
            <button type="button">File</button>
            <button type="button">Edit</button>
            <button type="button">View</button>
            <button type="button">Window</button>
            <button type="button">Help</button>
          </nav>
          <div className="window-controls">
            <button type="button" aria-label="Minimize" onClick={() => void window.windowApi.minimize()}>
              <Minus size={13} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Maximize"
              onClick={() => void window.windowApi.toggleMaximize()}
            >
              <Square size={11} strokeWidth={1.8} />
            </button>
            <button className="close" type="button" aria-label="Close" onClick={() => void window.windowApi.close()}>
              <X size={13} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <aside className="rail">
          <div className="traffic-spacer" />
          <IconButton label="New terminal" onClick={() => createTab(activeProfile)}>
            <MessageSquarePlus size={17} />
          </IconButton>
          <IconButton label="Restart active terminal" onClick={restartActiveTab}>
            <RotateCcw size={17} />
          </IconButton>
          <IconButton label="Stop active terminal" onClick={closeActiveTab}>
            <CircleStop size={17} />
          </IconButton>
          <div className="rail-divider" />
          <IconButton label="Toggle sidebar">
            <PanelLeftClose size={17} />
          </IconButton>
          <IconButton label="Focus mode">
            <Maximize2 size={16} />
          </IconButton>
        </aside>

        <section className="workspace">
          <header className="titlebar">
            <div>
              <p className="eyebrow">TUI AI Terminal</p>
              <h1>Island Light Console</h1>
            </div>
            <div className="command-palette">
              <Command size={15} />
              <span>Search sessions, agents, commands</span>
              <kbd>⌘K</kbd>
            </div>
          </header>

          <div className="content-grid">
            <aside className="agent-panel">
              <div className="panel-heading">
                <span>Agents</span>
                <button type="button" onClick={() => createTab(activeProfile)}>
                  <Plus size={15} />
                </button>
              </div>
              <div className="agent-list">
                {profiles.map((profile) => {
                  const Icon = profileIcons[profile.id];
                  return (
                    <button
                      className={profile.id === activeProfile ? 'agent-card selected' : 'agent-card'}
                      key={profile.id}
                      type="button"
                      onClick={() => setActiveProfile(profile.id)}
                      onDoubleClick={() => createTab(profile.id)}
                    >
                      <Icon size={17} />
                      <span>
                        <strong>{profile.name}</strong>
                        <small>{profile.command}</small>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="profile-detail">
                <span>Selected</span>
                <strong>{currentProfile?.name ?? 'Loading'}</strong>
                <p>{currentProfile?.description ?? 'Preparing terminal profiles.'}</p>
              </div>
            </aside>

            <section className="terminal-stage">
              <div className="tabs">
                {tabs.map((tab) => {
                  const Icon = profileIcons[tab.profileId] ?? TerminalSquare;
                  return (
                  <button
                    key={tab.id}
                    type="button"
                    className={tab.id === activeTab.id ? 'tab active' : 'tab'}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <Icon size={14} />
                    <span>{tab.title}</span>
                    <span
                      className="tab-close"
                      role="button"
                      tabIndex={0}
                      aria-label={`Close ${tab.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          closeTab(tab.id);
                        }
                      }}
                    >
                      <XIcon size={12} />
                    </span>
                  </button>
                  );
                })}
                <button className="tab-tool" type="button" aria-label="New tab" onClick={() => createTab(activeProfile)}>
                  <Plus size={14} />
                </button>
                <button className="tab-tool" type="button" aria-label="Tab menu">
                  <ChevronDown size={14} />
                </button>
              </div>
              <TerminalPane key={activeTab.id} profileId={activeTab.profileId} />
            </section>
          </div>
        </section>
      </main>
    </Tooltip.Provider>
  );
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}): ReactNode {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="icon-button" type="button" aria-label={label} onClick={onClick}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side="right" sideOffset={9}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
