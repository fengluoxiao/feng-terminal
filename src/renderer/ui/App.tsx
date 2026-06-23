import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Check,
  CircleStop,
  Command,
  Cpu,
  Keyboard,
  Link,
  MessageSquare,
  Monitor,
  Maximize2,
  MessageSquarePlus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  TerminalSquare,
  X,
  XIcon
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { ConversationMode, ConversationRecord, ConversationStore } from '../../shared/conversation';
import { defaultCliBindings, defaultSettings } from '../../shared/settings';
import type { AppSettings, CliBinding } from '../../shared/settings';
import type { CliId, CliProfile, ShellOption } from '../../shared/terminal';
import type { WorkspaceState } from '../../shared/workspace';
import { AgentPane } from './AgentPane';
import type { AgentContextSource } from './AgentPane';
import { ContextPanel } from './ContextPanel';
import { DesktopPet } from './DesktopPet';
import { TerminalPane } from './TerminalPane';
import type { DesktopPetAsset } from '../../shared/desktopPetAsset';

const profileIcons: Record<CliId, typeof TerminalSquare> = {
  shell: TerminalSquare,
  opencode: Sparkles,
  codex: Bot,
  antigtravaty: Cpu,
  antigravity: Cpu,
  claude: Command,
  kimi: Sparkles
};

const cliClassNames: Record<CliId, string> = {
  shell: 'cli-shell',
  opencode: 'cli-opencode',
  codex: 'cli-codex',
  antigtravaty: 'cli-antigtravaty',
  antigravity: 'cli-antigravity',
  claude: 'cli-claude',
  kimi: 'cli-kimi'
};

const translations = {
  en: {
    appName: 'Island Light Console',
    appMenu: ['File', 'Edit', 'View', 'Window', 'Help'],
    search: 'Search sessions, agents, commands',
    newTerminal: 'New terminal',
    newConversation: 'New conversation',
    expandConversation: 'Expand conversations',
    collapseConversation: 'Collapse conversations',
    restartTerminal: 'Restart active terminal',
    stopTerminal: 'Stop active terminal',
    toggleSidebar: 'Toggle sidebar',
    focusMode: 'Focus mode',
    settings: 'Settings',
    terminal: 'Terminal',
    agents: 'Agents',
    conversations: 'Conversations',
    project: 'Project',
    projectPath: 'Project directory',
    chooseProject: 'Choose',
    recentProjects: 'Recent projects',
    conversationTitle: 'Conversation title',
    autoTitle: 'Auto title when empty',
    conversationMode: 'Mode',
    sessionId: 'Session ID',
    createConversation: 'Create conversation',
    cancel: 'Cancel',
    startNew: 'New',
    continueLast: 'Continue last',
    resumeSession: 'Resume session',
    forkSession: 'Fork session',
    selected: 'Selected',
    loading: 'Loading',
    preparingProfiles: 'Preparing terminal profiles.',
    deleteConversation: 'Delete conversation',
    profileDescriptions: {
      shell: 'Start a regular local terminal session.',
      opencode: 'Launch OpenCode CLI in the current workspace.',
      codex: 'Launch Codex CLI with the active working directory.',
      antigtravaty: 'Launch the Antigtravaty CLI profile.',
      antigravity: 'Launch the Antigravity CLI profile.',
      claude: 'Launch Claude Code CLI.',
      kimi: 'Launch Kimi CLI.'
    },
    agentPane: {
      user: 'You',
      running: 'running',
      ready: 'ready',
      inputPlaceholder: 'Type a message',
      interrupted: 'Task was interrupted before a reply was captured.',
      thinking: 'Thinking...',
      retry: 'Retry'
    },
    contextPanel: {
      noProject: 'No project',
      shellSession: 'Shell session',
      terminalTab: 'terminal-tab',
      session: 'Session',
      project: 'Project',
      agent: 'Agent',
      profile: 'Profile',
      mode: 'Mode',
      sessionId: 'Session ID',
      context: 'Context',
      messages: 'Messages',
      runs: 'Runs',
      noRuns: 'No runs yet',
      prompt: 'Prompt',
      statuses: {
        running: 'RUNNING',
        done: 'DONE',
        error: 'ERROR'
      },
      modes: {
        new: 'New',
        'resume-last': 'Continue last',
        'resume-id': 'Resume session',
        fork: 'Fork session',
        pty: 'Terminal'
      }
    },
    terminalPane: {
      starting: 'Starting',
      status: {
        booting: 'booting',
        ready: 'ready',
        closed: 'closed'
      },
      failedToStart: 'Failed to start',
      exitedWithCode: 'Session exited with code',
      unknownExitCode: 'unknown'
    },
    preferences: 'Preferences',
    appearance: 'Appearance',
    theme: 'Theme',
    themeDescription: 'Use the light shell for now.',
    language: 'Language',
    languageDescription: 'Choose the interface language.',
    nativeMaterial: 'Native material',
    nativeMaterialDescription: 'Windows acrylic and macOS vibrancy.',
    terminalGroup: 'Terminal',
    system: 'System',
    shortcuts: 'Shortcuts',
    terminalBinding: 'Terminal bindings',
    fontSize: 'Font size',
    fontSizeDescription: 'Controls new terminal panes.',
    shellProfile: 'Shell profile',
    shellProfileDescription: 'Default profile for new sessions.',
    shellCommand: 'Shell',
    shellCommandDescription: 'Detected from this system.',
    behavior: 'Behavior',
    confirmClose: 'Confirm close',
    confirmCloseDescription: 'Ask before closing running sessions.',
    openLinksExternally: 'Open links externally',
    openLinksExternallyDescription: 'Use the system browser for terminal links.',
    desktopPet: 'Desktop pet',
    desktopPetDescription: 'Show a floating assistant pet for this app.',
    desktopPetNativeWindow: 'Native pet window',
    desktopPetNativeWindowDescription: 'Use the native sidecar when available; falls back to embedded.',
    desktopPetStyle: 'Pet style',
    desktopPetStyleDescription: 'Uses Codex pet folders with pet.json and spritesheet.webp.',
    desktopPetScale: 'Pet size',
    desktopPetScaleDescription: 'Adjust the floating pet window size.',
    importDesktopPet: 'Import',
    refreshDesktopPets: 'Refresh',
    wakeDesktopPet: 'Wake Pet',
    selectDesktopPet: 'Select',
    selectedDesktopPet: 'Selected',
    unselectedDesktopPet: 'Not selected',
    noDesktopPets: 'No pets found',
    shortcutCommandPalette: 'Command palette',
    shortcutCommandPaletteValue: '⌘K / Ctrl+K',
    shortcutNewTerminal: 'New terminal',
    shortcutNewTerminalValue: 'Ctrl+Shift+T',
    bindingsDescription: 'Commands are used when a new terminal is created.',
    commandPath: 'Command or path',
    arguments: 'Arguments',
    bindingPlaceholder: 'command, absolute path, or npx package',
    checkBinding: 'Check binding',
    themes: {
      light: 'Light',
      system: 'System',
      dark: 'Dark'
    },
    languages: {
      system: 'System',
      en: 'English',
      'zh-CN': '简体中文'
    }
  },
  'zh-CN': {
    appName: 'Island Light Console',
    appMenu: ['文件', '编辑', '视图', '窗口', '帮助'],
    search: '搜索会话、代理、命令',
    newTerminal: '新建终端',
    newConversation: '新建对话',
    expandConversation: '展开对话',
    collapseConversation: '收起对话',
    restartTerminal: '重启当前终端',
    stopTerminal: '停止当前终端',
    toggleSidebar: '切换侧边栏',
    focusMode: '专注模式',
    settings: '设置',
    terminal: '终端',
    agents: '代理',
    conversations: '对话',
    project: '项目',
    projectPath: '项目目录',
    chooseProject: '选择',
    recentProjects: '最近项目',
    conversationTitle: '对话标题',
    autoTitle: '留空自动生成',
    conversationMode: '模式',
    sessionId: '会话 ID',
    createConversation: '创建对话',
    cancel: '取消',
    startNew: '新对话',
    continueLast: '继续最近',
    resumeSession: '恢复会话',
    forkSession: '分叉会话',
    selected: '已选择',
    loading: '加载中',
    preparingProfiles: '正在准备终端配置。',
    deleteConversation: '删除对话',
    profileDescriptions: {
      shell: '启动普通本地终端会话。',
      opencode: '在当前工作目录启动 OpenCode CLI。',
      codex: '在当前工作目录启动 Codex CLI。',
      antigtravaty: '启动 Antigtravaty CLI 配置。',
      antigravity: '启动 Antigravity CLI 配置。',
      claude: '启动 Claude Code CLI。',
      kimi: '启动 Kimi CLI。'
    },
    agentPane: {
      user: '你',
      running: '运行中',
      ready: '就绪',
      inputPlaceholder: '输入消息',
      interrupted: '任务被中断，未拿到回复。',
      thinking: '正在思考...',
      retry: '重试'
    },
    contextPanel: {
      noProject: '无项目',
      shellSession: 'Shell 会话',
      terminalTab: '终端标签',
      session: '会话',
      project: '项目',
      agent: '代理',
      profile: '配置',
      mode: '模式',
      sessionId: '会话 ID',
      context: '上下文',
      messages: '消息',
      runs: '运行',
      noRuns: '暂无运行记录',
      prompt: '提示词',
      statuses: {
        running: '运行中',
        done: '完成',
        error: '错误'
      },
      modes: {
        new: '新对话',
        'resume-last': '继续最近',
        'resume-id': '恢复会话',
        fork: '分叉会话',
        pty: '终端'
      }
    },
    terminalPane: {
      starting: '启动中',
      status: {
        booting: '启动中',
        ready: '就绪',
        closed: '已关闭'
      },
      failedToStart: '启动失败',
      exitedWithCode: '会话退出，代码',
      unknownExitCode: '未知'
    },
    preferences: '偏好设置',
    appearance: '外观',
    theme: '主题',
    themeDescription: '当前使用浅色界面。',
    language: '语言',
    languageDescription: '选择界面显示语言。',
    nativeMaterial: '系统材质',
    nativeMaterialDescription: 'Windows acrylic 和 macOS vibrancy。',
    terminalGroup: '终端',
    system: '系统',
    shortcuts: '快捷键',
    terminalBinding: '终端绑定',
    fontSize: '字体大小',
    fontSizeDescription: '控制新终端面板。',
    shellProfile: 'Shell 配置',
    shellProfileDescription: '新会话的默认配置。',
    shellCommand: 'Shell',
    shellCommandDescription: '根据当前系统检测。',
    behavior: '行为',
    confirmClose: '关闭确认',
    confirmCloseDescription: '关闭运行中的会话前询问。',
    openLinksExternally: '外部打开链接',
    openLinksExternallyDescription: '使用系统浏览器打开终端链接。',
    desktopPet: '桌宠',
    desktopPetDescription: '显示这个应用的悬浮桌宠。',
    desktopPetNativeWindow: '原生独立窗口',
    desktopPetNativeWindowDescription: '可用时使用原生 sidecar；不可用时回退到内嵌。',
    desktopPetStyle: '桌宠样式',
    desktopPetStyleDescription: '使用 Codex 桌宠文件夹格式：pet.json 和 spritesheet.webp。',
    desktopPetScale: '桌宠大小',
    desktopPetScaleDescription: '调整悬浮桌宠窗口大小。',
    importDesktopPet: '导入',
    refreshDesktopPets: '刷新',
    wakeDesktopPet: '唤醒桌宠',
    selectDesktopPet: '选择',
    selectedDesktopPet: '已选择',
    unselectedDesktopPet: '未选择',
    noDesktopPets: '未找到桌宠',
    shortcutCommandPalette: '命令面板',
    shortcutCommandPaletteValue: '⌘K / Ctrl+K',
    shortcutNewTerminal: '新建终端',
    shortcutNewTerminalValue: 'Ctrl+Shift+T',
    bindingsDescription: '新建终端时会使用这里配置的命令。',
    commandPath: '命令或路径',
    arguments: '参数',
    bindingPlaceholder: '命令、绝对路径或 npx 包',
    checkBinding: '检测绑定',
    themes: {
      light: '浅色',
      system: '跟随系统',
      dark: '深色'
    },
    languages: {
      system: '跟随系统',
      en: 'English',
      'zh-CN': '简体中文'
    }
  }
} as const;

type Translation = (typeof translations)[keyof typeof translations];
type ResolvedLanguage = keyof typeof translations;

function resolveLanguage(language: AppSettings['language']): ResolvedLanguage {
  if (language !== 'system') return language;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

interface SessionTab {
  id: string;
  profileId: CliId;
  title: string;
  cwd?: string;
  extraArgs?: string[];
  conversationId?: string;
  projectPath?: string;
  sessionKey?: string;
}

const modeOptions: ConversationMode[] = ['new', 'resume-last', 'resume-id', 'fork'];

function getSupportedConversationModes(cliId: CliId): ConversationMode[] {
  if (cliId === 'codex' || cliId === 'opencode') return modeOptions;
  if (cliId === 'claude') return ['new', 'resume-last', 'resume-id'];
  return ['new'];
}

function getModeLabel(mode: ConversationMode, t: Translation): string {
  if (mode === 'new') return t.startNew;
  if (mode === 'resume-last') return t.continueLast;
  if (mode === 'resume-id') return t.resumeSession;
  return t.forkSession;
}

function formatConversationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function App(): ReactNode {
  const fallbackTab = useMemo<SessionTab>(
    () => {
      const id = crypto.randomUUID();
      return { id, profileId: 'shell', title: 'Shell', sessionKey: id };
    },
    []
  );
  const [profiles, setProfiles] = useState<CliProfile[]>([]);
  const [availableProfileIds, setAvailableProfileIds] = useState<CliId[]>([]);
  const [shellOptions, setShellOptions] = useState<ShellOption[]>([]);
  const [conversationStore, setConversationStore] = useState<ConversationStore>({
    conversations: [],
    recentProjectPaths: []
  });
  const [conversationDialogOpen, setConversationDialogOpen] = useState(false);
  const [activeProfile, setActiveProfile] = useState<CliId>('codex');
  const [activeView, setActiveView] = useState<'terminal' | 'settings'>('terminal');
  const [conversationPanelOpen, setConversationPanelOpen] = useState(true);
  const [expandedAgentKeys, setExpandedAgentKeys] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [nativePetAvailable, setNativePetAvailable] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [tabs, setTabs] = useState<SessionTab[]>([fallbackTab]);
  const [activeTabId, setActiveTabId] = useState(fallbackTab.id);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const activeConversation = conversationStore.conversations.find(
    (conversation) => conversation.id === activeTab.conversationId
  );
  const contextSources = useMemo<AgentContextSource[]>(
    () => [
      ...conversationStore.conversations.map((conversation) => ({
        id: `conversation:${conversation.id}`,
        type: 'conversation' as const,
        title: conversation.title,
        cliId: conversation.cliId,
        projectPath: conversation.projectPath,
        conversation
      })),
      ...tabs
        .filter((tab) => tab.profileId === 'shell')
        .map((tab) => ({
          id: `terminal:${tab.sessionKey ?? tab.id}`,
          type: 'terminal' as const,
          title: tab.title,
          cliId: 'shell' as const,
          projectPath: tab.projectPath ?? tab.cwd,
          sessionKey: tab.sessionKey ?? tab.id
        }))
    ],
    [conversationStore.conversations, tabs]
  );
  const resolvedLanguage = resolveLanguage(settings.language);
  const t = translations[resolvedLanguage];

  useEffect(() => {
    void window.terminalApi.listProfiles().then((items) => {
      setProfiles(items);
      if (items.some((item) => item.id === 'codex')) setActiveProfile('codex');
    });
    void window.terminalApi.listShells().then(setShellOptions);
  }, []);

  useEffect(() => {
    void window.settingsApi.load().then((loadedSettings) => {
      setSettings(loadedSettings);
      setActiveProfile(loadedSettings.defaultProfileId);
    });
    void window.petApi.nativeAvailable().then(setNativePetAvailable);
    void window.conversationApi.list().then(setConversationStore);
    void window.workspaceApi.load().then((workspace) => {
      if (workspace.tabs.length > 0) {
        setTabs(workspace.tabs);
        setActiveTabId(workspace.activeTabId ?? workspace.tabs[0].id);
        setActiveProfile(workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.profileId ?? workspace.tabs[0].profileId);
      }
      setActiveView(workspace.activeView);
      setConversationPanelOpen(workspace.conversationPanelOpen);
      setWorkspaceLoaded(true);
    });
  }, []);

  useEffect(
    () =>
      window.agentApi.onUpdate((event) => {
        setConversationStore(event.store);
        window.petApi.agentUpdate(event.store);
      }),
    []
  );

  useEffect(() => {
    if (!workspaceLoaded) return;
    const workspace: WorkspaceState = {
      tabs,
      activeTabId,
      activeView: 'terminal',
      conversationPanelOpen
    };
    const timeout = window.setTimeout(() => {
      void window.workspaceApi.save(workspace);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [activeTabId, conversationPanelOpen, tabs, workspaceLoaded]);

  useEffect(() => {
    if (profiles.length === 0) return;

    let canceled = false;

    async function refreshAvailableProfiles(): Promise<void> {
      const results = await Promise.all(
        profiles.map(async (profile) => {
          const binding = settings.cliBindings[profile.id] ?? defaultCliBindings[profile.id];
          const command = binding?.command || profile.command;
          try {
            const result = await window.terminalApi.checkBinding({ command });
            return result.available ? profile.id : null;
          } catch {
            return null;
          }
        })
      );
      if (canceled) return;

      const nextIds = results.filter((id): id is CliId => Boolean(id));
      setAvailableProfileIds(nextIds);

      if (nextIds.length > 0 && !nextIds.includes(activeProfile)) {
        setActiveProfile(nextIds[0]);
      }
    }

    void refreshAvailableProfiles();

    return () => {
      canceled = true;
    };
  }, [activeProfile, profiles, settings.cliBindings]);

  const visibleProfiles = useMemo(
    () => profiles.filter((profile) => availableProfileIds.includes(profile.id)),
    [availableProfileIds, profiles]
  );

  const currentProfile = useMemo(
    () => visibleProfiles.find((profile) => profile.id === activeProfile) ?? visibleProfiles[0],
    [activeProfile, visibleProfiles]
  );

  const conversationsByProject = useMemo(() => {
    const groups = new Map<string, Map<CliId, ConversationRecord[]>>();
    for (const conversation of conversationStore.conversations) {
      const agentGroups = groups.get(conversation.projectPath) ?? new Map<CliId, ConversationRecord[]>();
      const items = agentGroups.get(conversation.cliId) ?? [];
      agentGroups.set(conversation.cliId, [...items, conversation]);
      groups.set(conversation.projectPath, agentGroups);
    }

    return Array.from(groups.entries())
      .map(([projectPath, agentGroups]) => {
        const agents = Array.from(agentGroups.entries())
          .map(([cliId, conversations]) => ({
            cliId,
            conversations: [...conversations].sort(
              (left, right) =>
                new Date(right.lastOpenedAt).getTime() - new Date(left.lastOpenedAt).getTime()
            )
          }))
          .sort(
            (left, right) =>
              new Date(right.conversations[0]?.lastOpenedAt ?? 0).getTime() -
              new Date(left.conversations[0]?.lastOpenedAt ?? 0).getTime()
          );

        return {
          projectPath,
          conversationCount: agents.reduce((total, agent) => total + agent.conversations.length, 0),
          agents
        };
      })
      .sort((left, right) => {
        const leftLatest = left.agents[0]?.conversations[0]?.lastOpenedAt ?? 0;
        const rightLatest = right.agents[0]?.conversations[0]?.lastOpenedAt ?? 0;
        return new Date(rightLatest).getTime() - new Date(leftLatest).getTime();
      });
  }, [conversationStore.conversations]);

  function getAgentKey(projectPath: string, cliId: CliId): string {
    return `${projectPath}::${cliId}`;
  }

  function getProfileName(profileId: CliId): string {
    return profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
  }

  function getConversationArgs(conversation: ConversationRecord): string[] {
    if (conversation.cliId === 'codex') {
      if (conversation.mode === 'new') return [];
      if (conversation.mode === 'resume-last') return ['resume', '--last'];
      if (conversation.mode === 'resume-id' && conversation.sessionId) return ['resume', conversation.sessionId];
      if (conversation.mode === 'fork' && conversation.sessionId) return ['fork', conversation.sessionId];
      return [];
    }

    if (conversation.cliId === 'claude') {
      if (conversation.mode === 'new') return [];
      if (conversation.mode === 'resume-last') return ['--continue'];
      if ((conversation.mode === 'resume-id' || conversation.mode === 'fork') && conversation.sessionId) {
        return ['--resume', conversation.sessionId];
      }
      return [];
    }

    if (conversation.cliId === 'opencode') {
      const args = [conversation.projectPath];
      if (conversation.mode === 'new') return args;
      if (conversation.mode === 'resume-last') return [...args, '--continue'];
      if (conversation.mode === 'resume-id' && conversation.sessionId) return [...args, '--session', conversation.sessionId];
      if (conversation.mode === 'fork' && conversation.sessionId) return [...args, '--fork', conversation.sessionId];
      return args;
    }

    return [];
  }

  function createTab(profileId = activeProfile): void {
    const targetProfileId = visibleProfiles.some((profile) => profile.id === profileId)
      ? profileId
      : visibleProfiles[0]?.id ?? profileId;
    const profile = profiles.find((item) => item.id === targetProfileId);
    const tab = {
      id: crypto.randomUUID(),
      profileId: targetProfileId,
      title: profile?.name ?? 'Terminal',
      sessionKey: crypto.randomUUID()
    };
    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    setActiveView('terminal');
  }

  function openConversation(conversation: ConversationRecord): void {
    const existingTab = tabs.find((tab) => tab.conversationId === conversation.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setActiveProfile(existingTab.profileId);
      setActiveView('terminal');
      void window.conversationApi.touch(conversation.id).then(setConversationStore);
      return;
    }

    const profile = profiles.find((item) => item.id === conversation.cliId);
    const tab = {
      id: crypto.randomUUID(),
      profileId: conversation.cliId,
      title: conversation.title || profile?.name || 'Conversation',
      cwd: conversation.projectPath,
      extraArgs: getConversationArgs(conversation),
      conversationId: conversation.id,
      projectPath: conversation.projectPath,
      sessionKey: conversation.id
    };

    setTabs((items) => [...items, tab]);
    setActiveTabId(tab.id);
    setActiveProfile(conversation.cliId);
    setActiveView('terminal');
    void window.conversationApi.touch(conversation.id).then(setConversationStore);
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

  function updateSettings(patch: Partial<AppSettings>): void {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    if (patch.defaultProfileId) setActiveProfile(patch.defaultProfileId);
    void window.settingsApi.save(nextSettings).then((savedSettings) => {
      setSettings(savedSettings);
      if ('desktopPet' in patch || 'desktopPetNativeWindow' in patch || 'desktopPetAssetPath' in patch || 'desktopPetScale' in patch) {
        if (
          'desktopPetScale' in patch &&
          !('desktopPet' in patch) &&
          !('desktopPetNativeWindow' in patch) &&
          !('desktopPetAssetPath' in patch)
        ) {
          void window.petApi.resize(savedSettings.desktopPetScale, true);
        } else {
          void window.petApi.toggle(savedSettings.desktopPet);
        }
        window.setTimeout(() => {
          void window.petApi.nativeAvailable().then(setNativePetAvailable);
        }, 120);
      }
    });
  }

  return (
    <Tooltip.Provider delayDuration={450}>
      <main className="app-shell">
        <header className="window-chrome">
          <nav className="app-menu" aria-label="Application menu">
            {t.appMenu.map((item) => (
              <button key={item} type="button">
                {item}
              </button>
            ))}
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
          <IconButton label={t.newConversation} onClick={() => setConversationDialogOpen(true)}>
            <MessageSquarePlus size={17} />
          </IconButton>
          <IconButton label={t.restartTerminal} onClick={restartActiveTab}>
            <RotateCcw size={17} />
          </IconButton>
          <IconButton label={t.stopTerminal} onClick={closeActiveTab}>
            <CircleStop size={17} />
          </IconButton>
          <div className="rail-divider" />
          <IconButton
            label={conversationPanelOpen ? t.collapseConversation : t.expandConversation}
            onClick={() => {
              setConversationPanelOpen((isOpen) => !isOpen);
              setActiveView('terminal');
            }}
          >
            {conversationPanelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </IconButton>
          <IconButton label={t.focusMode}>
            <Maximize2 size={16} />
          </IconButton>
          <IconButton label={t.settings} onClick={() => setActiveView('settings')}>
            <Settings size={16} />
          </IconButton>
        </aside>

        <section className="workspace">
          <header className="titlebar">
            <div>
              <p className="eyebrow">TUI AI Terminal</p>
              <h1>{t.appName}</h1>
            </div>
            <div className="command-palette">
              <Command size={15} />
              <span>{t.search}</span>
              <kbd>⌘K</kbd>
            </div>
          </header>

          {conversationDialogOpen ? (
            <ConversationDialog
              profiles={visibleProfiles}
              recentProjectPaths={conversationStore.recentProjectPaths}
              t={t}
              onCancel={() => setConversationDialogOpen(false)}
              onCreate={(request) => {
                void window.conversationApi.create(request).then((store) => {
                  setConversationStore(store);
                  const conversation = store.conversations[0];
                  if (conversation) openConversation(conversation);
                  setConversationDialogOpen(false);
                });
              }}
            />
          ) : null}

          {activeView === 'settings' ? (
            <SettingsView
              profiles={profiles}
              shellOptions={shellOptions}
              settings={settings}
              t={t}
              onBack={() => setActiveView('terminal')}
              onChange={updateSettings}
            />
          ) : (
            <div className={conversationPanelOpen ? 'content-grid' : 'content-grid conversation-collapsed'}>
              {conversationPanelOpen ? (
              <aside className="agent-panel">
                <div className="panel-heading">
                  <span>{t.conversations}</span>
                  <div className="panel-actions">
                    <button type="button" onClick={() => setConversationDialogOpen(true)}>
                      <Plus size={14} />
                      <span>{t.newConversation}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t.collapseConversation}
                      title={t.collapseConversation}
                      onClick={() => setConversationPanelOpen(false)}
                    >
                      <PanelLeftClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="agent-list">
                  {conversationsByProject.length === 0 ? (
                    <button className="empty-conversation-button" type="button" onClick={() => setConversationDialogOpen(true)}>
                      <MessageSquarePlus size={17} />
                      <span>
                        <strong>{t.newConversation}</strong>
                        <small>{t.chooseProject}</small>
                      </span>
                    </button>
                  ) : null}
                  {conversationsByProject.map((group) => (
                    <div className="conversation-project" key={group.projectPath}>
                      <div className="conversation-project-title">
                        <BriefcaseBusiness size={13} />
                        <span>{group.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? group.projectPath}</span>
                        <small>{group.conversationCount}</small>
                      </div>
                      {group.agents.map((agent) => {
                        const Icon = profileIcons[agent.cliId] ?? MessageSquare;
                        const activeConversation = agent.conversations.find(
                          (conversation) => conversation.id === activeTab.conversationId
                        );
                        const latestConversation = activeConversation ?? agent.conversations[0];
                        const agentKey = getAgentKey(group.projectPath, agent.cliId);
                        const isExpanded =
                          expandedAgentKeys[agentKey] ?? (Boolean(activeConversation) || agent.conversations.length > 1);
                        const profileName = getProfileName(agent.cliId);
                        return (
                          <div className={`conversation-agent-group ${cliClassNames[agent.cliId]}`} key={agentKey}>
                            <button
                              className={activeConversation ? 'conversation-agent-header selected' : 'conversation-agent-header'}
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedAgentKeys((items) => ({
                                  ...items,
                                  [agentKey]: !isExpanded
                                }))
                              }
                            >
                              <Icon size={16} />
                              <span>
                                <strong>
                                  {profileName}
                                  <b>{agent.conversations.length}</b>
                                </strong>
                                <small>{latestConversation?.title ?? profileName}</small>
                              </span>
                              <ChevronDown size={14} />
                            </button>
                            {isExpanded ? (
                              <div className="conversation-agent-conversations">
                                {agent.conversations.map((conversation, index) => (
                                  <div className="conversation-item" key={conversation.id}>
                                    <button
                                      className={
                                        conversation.id === activeTab.conversationId
                                          ? 'conversation-row selected'
                                          : 'conversation-row'
                                      }
                                      type="button"
                                      onClick={() => openConversation(conversation)}
                                    >
                                      <span className="conversation-row-index">#{index + 1}</span>
                                      <span>
                                        <strong>{conversation.title}</strong>
                                        <small>
                                          {getModeLabel(conversation.mode, t)} ·{' '}
                                          {formatConversationTime(conversation.lastOpenedAt)}
                                        </small>
                                      </span>
                                    </button>
                                    <button
                                      className="conversation-delete"
                                      type="button"
                                      aria-label={t.deleteConversation}
                                      title={t.deleteConversation}
                                      onClick={() => {
                                        void window.conversationApi.delete(conversation.id).then(setConversationStore);
                                      }}
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="profile-detail">
                  <span>{t.selected}</span>
                  <strong>{currentProfile?.name ?? t.loading}</strong>
                  <p>{currentProfile ? t.profileDescriptions[currentProfile.id] : t.preparingProfiles}</p>
                </div>
              </aside>
              ) : null}
              {!conversationPanelOpen ? (
                <button
                  className="conversation-expand-button"
                  type="button"
                  aria-label={t.expandConversation}
                  title={t.expandConversation}
                  onClick={() => setConversationPanelOpen(true)}
                >
                  <PanelLeftOpen size={15} />
                </button>
              ) : null}

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
                <div className="terminal-panes">
                  {tabs.map((tab) => (
                    tab.profileId === 'shell' ? (
                      <TerminalPane
                        key={tab.id}
                        active={tab.id === activeTab.id}
                        cwd={tab.cwd}
                        extraArgs={tab.extraArgs}
                        fontSize={settings.terminalFontSize}
                        labels={t.terminalPane}
                        profileId={tab.profileId}
                        sessionKey={tab.sessionKey ?? tab.conversationId ?? tab.id}
                      />
                    ) : (
                      <AgentPane
                        key={tab.id}
                        active={tab.id === activeTab.id}
                        conversationId={tab.conversationId}
                        conversationStore={conversationStore}
                        contextSources={contextSources}
                        labels={t.agentPane}
                        onStoreChange={setConversationStore}
                        profileId={tab.profileId}
                        profileName={profiles.find((profile) => profile.id === tab.profileId)?.name ?? tab.profileId}
                      />
                    )
                  ))}
                </div>
              </section>
              <ContextPanel
                conversation={activeConversation}
                conversationStore={conversationStore}
                profile={profiles.find((profile) => profile.id === activeTab.profileId)}
                profileId={activeTab.profileId}
                projectPath={activeTab.projectPath ?? activeTab.cwd}
                tabTitle={activeTab.title}
                labels={t.contextPanel}
                onStoreChange={setConversationStore}
              />
            </div>
          )}
        </section>
        {settings.desktopPet &&
        settings.desktopPetAssetPath &&
        (!settings.desktopPetNativeWindow || !nativePetAvailable) ? (
          <DesktopPet
            embedded
            settings={settings}
            onScaleChange={(desktopPetScale) => updateSettings({ desktopPetScale })}
          />
        ) : null}
      </main>
    </Tooltip.Provider>
  );
}

function SettingsView({
  profiles,
  shellOptions,
  settings,
  t,
  onBack,
  onChange
}: {
  profiles: CliProfile[];
  shellOptions: ShellOption[];
  settings: AppSettings;
  t: Translation;
  onBack: () => void;
  onChange: (patch: Partial<AppSettings>) => void;
}): ReactNode {
  const [bindingChecks, setBindingChecks] = useState<
    Partial<Record<CliId, 'idle' | 'checking' | 'available' | 'missing'>>
  >({});
  const [petAssets, setPetAssets] = useState<DesktopPetAsset[]>([]);
  const [petPreviewUrls, setPetPreviewUrls] = useState<Record<string, string>>({});
  const [petListOpen, setPetListOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState<
    'personalization' | 'system' | 'behavior' | 'shortcuts' | 'terminalBinding'
  >('personalization');
  const categories = [
    { id: 'personalization', icon: Monitor, label: t.appearance },
    { id: 'system', icon: Settings, label: t.system },
    { id: 'behavior', icon: Settings, label: t.behavior },
    { id: 'shortcuts', icon: Keyboard, label: t.shortcuts },
    { id: 'terminalBinding', icon: Link, label: t.terminalBinding }
  ] as const;

  useEffect(() => {
    void window.petApi.listAssets().then(setPetAssets);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function buildPreviews(): Promise<void> {
      const entries = await Promise.all(
        petAssets.map(async (asset) => [asset.manifestPath, await createPetPreviewUrl(asset)] as const)
      );
      if (cancelled) return;
      setPetPreviewUrls(
        entries.reduce<Record<string, string>>((items, [manifestPath, previewUrl]) => {
          if (previewUrl) items[manifestPath] = previewUrl;
          return items;
        }, {})
      );
    }
    void buildPreviews();
    return () => {
      cancelled = true;
    };
  }, [petAssets]);

  function getBinding(profile: CliProfile): CliBinding {
    return (
      settings.cliBindings[profile.id] ??
      defaultCliBindings[profile.id] ?? {
        command: profile.command,
        args: profile.args.join(' ')
      }
    );
  }

  function updateBinding(profileId: CliId, patch: Partial<CliBinding>): void {
    const currentBinding =
      settings.cliBindings[profileId] ?? defaultCliBindings[profileId] ?? { command: '', args: '' };

    onChange({
      cliBindings: {
        ...settings.cliBindings,
        [profileId]: {
          ...currentBinding,
          ...patch
        }
      }
    });
    setBindingChecks((items) => ({ ...items, [profileId]: 'idle' }));
  }

  function checkBinding(profile: CliProfile): void {
    const binding = getBinding(profile);
    const command = binding.command || profile.command;

    setBindingChecks((items) => ({ ...items, [profile.id]: 'checking' }));
    void window.terminalApi
      .checkBinding({ command })
      .then((result) => {
        setBindingChecks((items) => ({
          ...items,
          [profile.id]: result.available ? 'available' : 'missing'
        }));
      })
      .catch(() => {
        setBindingChecks((items) => ({ ...items, [profile.id]: 'missing' }));
      });
  }

  function importDesktopPet(): void {
    void window.petApi.importAsset().then((result) => {
      if (!result.ok || !result.asset) return;
      setPetAssets((items) => {
        const nextItems = items.filter((item) => item.manifestPath !== result.asset?.manifestPath);
        return [result.asset!, ...nextItems];
      });
      onChange({ desktopPet: true, desktopPetAssetPath: result.asset.manifestPath });
    });
  }

  return (
    <section className="settings-page">
      <div className="settings-header">
        <div>
          <p className="eyebrow">{t.settings}</p>
          <h2>{t.preferences}</h2>
        </div>
        <button className="settings-back" type="button" onClick={onBack}>
          <TerminalSquare size={15} />
          {t.terminal}
        </button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t.settings}>
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <button
                className={category.id === activeCategory ? 'active' : undefined}
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
              >
                <Icon size={16} />
                <span>{category.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-grid">
        {activeCategory === 'personalization' ? (
          <section className="settings-group">
          <div className="settings-group-title">
            <Monitor size={17} />
            <span>{t.appearance}</span>
          </div>
          <label className="setting-row">
            <span>
              <strong>{t.theme}</strong>
              <small>{t.themeDescription}</small>
            </span>
            <SelectMenu
              options={[
                { label: t.themes.light, value: 'light' },
                { label: t.themes.system, value: 'system' },
                { label: t.themes.dark, value: 'dark' }
              ]}
              value={settings.theme}
              onChange={(value) => onChange({ theme: value as AppSettings['theme'] })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>{t.language}</strong>
              <small>{t.languageDescription}</small>
            </span>
            <SelectMenu
              options={[
                { label: t.languages.system, value: 'system' },
                { label: t.languages.en, value: 'en' },
                { label: t.languages['zh-CN'], value: 'zh-CN' }
              ]}
              value={settings.language}
              onChange={(value) => onChange({ language: value as AppSettings['language'] })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>{t.nativeMaterial}</strong>
              <small>{t.nativeMaterialDescription}</small>
            </span>
            <input
              checked={settings.nativeMaterial}
              type="checkbox"
              onChange={(event) => onChange({ nativeMaterial: event.target.checked })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>{t.desktopPet}</strong>
              <small>{t.desktopPetDescription}</small>
            </span>
            <input
              checked={settings.desktopPet}
              type="checkbox"
              onChange={(event) => onChange({ desktopPet: event.target.checked })}
            />
          </label>
          {settings.desktopPet ? (
            <label className="setting-row">
              <span>
                <strong>{t.desktopPetNativeWindow}</strong>
                <small>{t.desktopPetNativeWindowDescription}</small>
              </span>
              <input
                checked={settings.desktopPetNativeWindow}
                type="checkbox"
                onChange={(event) => onChange({ desktopPetNativeWindow: event.target.checked })}
              />
            </label>
          ) : null}
          <div className="pet-panel">
            <button className="pet-panel-header" type="button" onClick={() => setPetListOpen((isOpen) => !isOpen)}>
              <span>
                <strong>{t.desktopPetStyle}</strong>
                <small>
                  {petAssets.find((asset) => asset.manifestPath === settings.desktopPetAssetPath)?.displayName ??
                    t.unselectedDesktopPet}
                </small>
              </span>
              <ChevronDown className={petListOpen ? 'open' : undefined} size={16} />
            </button>
            {petListOpen ? (
              <>
                <div className="pet-panel-toolbar">
                  <button type="button" onClick={importDesktopPet}>
                    {t.importDesktopPet}
                  </button>
                  <button type="button" onClick={() => void window.petApi.listAssets().then(setPetAssets)}>
                    {t.refreshDesktopPets}
                  </button>
                  <button type="button" onClick={() => void window.petApi.action('waving')}>
                    {t.wakeDesktopPet}
                  </button>
                </div>
                <div className="pet-list">
                  <PetListItem
                    description={t.desktopPetStyleDescription}
                    name={t.unselectedDesktopPet}
                    preview={<Bot size={26} />}
                    selected={!settings.desktopPetAssetPath}
                    selectLabel={t.selectDesktopPet}
                    selectedLabel={t.selectedDesktopPet}
                    onSelect={() => onChange({ desktopPetAssetPath: undefined })}
                  />
                  {petAssets.length > 0 ? (
                    petAssets.map((asset) => (
                      <PetListItem
                        description={asset.description ?? asset.kind ?? t.desktopPetStyleDescription}
                        key={asset.manifestPath}
                        name={asset.displayName}
                        preview={
                          petPreviewUrls[asset.manifestPath] ? (
                            <img alt="" src={petPreviewUrls[asset.manifestPath]} />
                          ) : (
                            <Bot size={26} />
                          )
                        }
                        selected={settings.desktopPetAssetPath === asset.manifestPath}
                        selectLabel={t.selectDesktopPet}
                        selectedLabel={t.selectedDesktopPet}
                        onSelect={() => onChange({ desktopPetAssetPath: asset.manifestPath })}
                      />
                    ))
                  ) : (
                    <div className="pet-list-empty">{t.noDesktopPets}</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
          <div className="setting-row">
            <span>
              <strong>{t.desktopPetScale}</strong>
              <small>{t.desktopPetScaleDescription}</small>
            </span>
            <label className="range-control">
              <input
                max={2}
                min={0.5}
                step={0.05}
                type="range"
                value={settings.desktopPetScale}
                onChange={(event) => onChange({ desktopPetScale: Number(event.target.value) })}
              />
              <strong>{Math.round(settings.desktopPetScale * 100)}%</strong>
            </label>
          </div>
          </section>
        ) : null}

        {activeCategory === 'system' ? (
          <section className="settings-group">
          <div className="settings-group-title">
            <TerminalSquare size={17} />
            <span>{t.system}</span>
          </div>
          <label className="setting-row">
            <span>
              <strong>{t.fontSize}</strong>
              <small>{t.fontSizeDescription}</small>
            </span>
            <input
              max={22}
              min={11}
              type="number"
              value={settings.terminalFontSize}
              onChange={(event) => onChange({ terminalFontSize: Number(event.target.value) })}
            />
          </label>
          </section>
        ) : null}

        {activeCategory === 'terminalBinding' ? (
          <section className="settings-group">
          <div className="settings-group-title">
            <Link size={17} />
            <span>{t.terminalBinding}</span>
          </div>
          <label className="setting-row">
            <span>
              <strong>{t.shellProfile}</strong>
              <small>{t.shellProfileDescription}</small>
            </span>
            <SelectMenu
              options={profiles.map((profile) => ({ label: profile.name, value: profile.id }))}
              value={settings.defaultProfileId}
              onChange={(value) => onChange({ defaultProfileId: value as CliId })}
            />
          </label>
          <div className="binding-list">
            {profiles.map((profile) => {
              const binding = getBinding(profile);
              const isShell = profile.id === 'shell';
              const checkState = bindingChecks[profile.id] ?? 'idle';
              const shellSelectOptions =
                shellOptions.length > 0
                  ? shellOptions.map((shell) => ({
                      label: shell.label,
                      value: shell.command
                    }))
                  : [{ label: profile.command, value: profile.command }];
              return (
                <div className="binding-card" key={profile.id}>
                  <div className="binding-title">
                    <strong>{profile.name}</strong>
                    <small>{profile.id}</small>
                  </div>
                  <label>
                    <span>{isShell ? t.shellCommand : t.commandPath}</span>
                    {isShell ? (
                      <SelectMenu
                        options={shellSelectOptions}
                        value={binding.command || shellSelectOptions[0]?.value || profile.command}
                        onChange={(value) => updateBinding(profile.id, { command: value })}
                      />
                    ) : (
                      <input
                        spellCheck={false}
                        type="text"
                        value={binding.command}
                        placeholder={profile.command || t.bindingPlaceholder}
                        onChange={(event) => updateBinding(profile.id, { command: event.target.value })}
                      />
                    )}
                  </label>
                  <label>
                    <span>{t.arguments}</span>
                    <input
                      spellCheck={false}
                      type="text"
                      value={binding.args}
                      placeholder={profile.args.join(' ')}
                      onChange={(event) => updateBinding(profile.id, { args: event.target.value })}
                    />
                  </label>
                  <button
                    className="binding-check-button"
                    type="button"
                    aria-label={t.checkBinding}
                    title={t.checkBinding}
                    onClick={() => checkBinding(profile)}
                  >
                    <BadgeCheck size={15} strokeWidth={1.8} />
                    <span className={`binding-check-dot ${checkState}`} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="settings-note">{t.bindingsDescription}</p>
          </section>
        ) : null}

        {activeCategory === 'behavior' ? (
          <section className="settings-group">
          <div className="settings-group-title">
            <Settings size={17} />
            <span>{t.behavior}</span>
          </div>
          <label className="setting-row">
            <span>
              <strong>{t.confirmClose}</strong>
              <small>{t.confirmCloseDescription}</small>
            </span>
            <input
              checked={settings.confirmClose}
              type="checkbox"
              onChange={(event) => onChange({ confirmClose: event.target.checked })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>{t.openLinksExternally}</strong>
              <small>{t.openLinksExternallyDescription}</small>
            </span>
            <input
              checked={settings.openLinksExternally}
              type="checkbox"
              onChange={(event) => onChange({ openLinksExternally: event.target.checked })}
            />
          </label>
          </section>
        ) : null}

        {activeCategory === 'shortcuts' ? (
          <section className="settings-group">
          <div className="settings-group-title">
            <Keyboard size={17} />
            <span>{t.shortcuts}</span>
          </div>
          <div className="setting-row">
            <span>
              <strong>{t.shortcutCommandPalette}</strong>
              <small>{t.search}</small>
            </span>
            <kbd>{t.shortcutCommandPaletteValue}</kbd>
          </div>
          <div className="setting-row">
            <span>
              <strong>{t.shortcutNewTerminal}</strong>
              <small>{t.newTerminal}</small>
            </span>
            <kbd>{t.shortcutNewTerminalValue}</kbd>
          </div>
          </section>
        ) : null}
        </div>
      </div>
    </section>
  );
}

function ConversationDialog({
  profiles,
  recentProjectPaths,
  t,
  onCancel,
  onCreate
}: {
  profiles: CliProfile[];
  recentProjectPaths: string[];
  t: Translation;
  onCancel: () => void;
  onCreate: (request: {
    cliId: CliId;
    projectPath: string;
    title?: string;
    mode: ConversationMode;
    sessionId?: string;
  }) => void;
}): ReactNode {
  const [cliId, setCliId] = useState<CliId>(profiles[0]?.id ?? 'shell');
  const [projectPath, setProjectPath] = useState(recentProjectPaths[0] ?? '');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<ConversationMode>('new');
  const [sessionId, setSessionId] = useState('');
  const selectedProfile = profiles.find((profile) => profile.id === cliId) ?? profiles[0];
  const supportedModes = useMemo(() => getSupportedConversationModes(cliId), [cliId]);

  useEffect(() => {
    if (!supportedModes.includes(mode)) setMode('new');
  }, [mode, supportedModes]);

  function submit(): void {
    if (!projectPath.trim()) return;
    onCreate({
      cliId,
      projectPath: projectPath.trim(),
      title: title.trim() || undefined,
      mode,
      sessionId: sessionId.trim() || undefined
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="conversation-dialog" role="dialog" aria-modal="true">
        <header className="conversation-dialog-header">
          <div>
            <p className="eyebrow">{t.newConversation}</p>
            <h2>{selectedProfile?.name ?? t.terminal}</h2>
          </div>
          <button type="button" onClick={onCancel}>
            <X size={15} />
          </button>
        </header>

        <div className="conversation-form">
          <label>
            <span>CLI</span>
            <SelectMenu
              options={profiles.map((profile) => ({ label: profile.name, value: profile.id }))}
              value={cliId}
              onChange={(value) => setCliId(value as CliId)}
            />
          </label>

          <label>
            <span>{t.conversationMode}</span>
            <SelectMenu
              options={supportedModes.map((item) => ({
                label:
                  item === 'new'
                    ? t.startNew
                    : item === 'resume-last'
                      ? t.continueLast
                      : item === 'resume-id'
                        ? t.resumeSession
                        : t.forkSession,
                value: item
              }))}
              value={mode}
              onChange={(value) => setMode(value as ConversationMode)}
            />
          </label>

          <label className="conversation-wide">
            <span>{t.projectPath}</span>
            <div className="project-picker">
              <input
                spellCheck={false}
                type="text"
                value={projectPath}
                onChange={(event) => setProjectPath(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  void window.conversationApi.chooseProject().then((path) => {
                    if (path) setProjectPath(path);
                  });
                }}
              >
                {t.chooseProject}
              </button>
            </div>
          </label>

          {recentProjectPaths.length > 0 ? (
            <div className="recent-projects conversation-wide">
              <span>{t.recentProjects}</span>
              <div>
                {recentProjectPaths.slice(0, 4).map((path) => (
                  <button key={path} type="button" onClick={() => setProjectPath(path)}>
                    {path.split(/[\\/]/).filter(Boolean).pop() ?? path}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="conversation-wide">
            <span>{t.conversationTitle}</span>
            <input
              spellCheck={false}
              type="text"
              placeholder={t.autoTitle}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          {mode === 'resume-id' || mode === 'fork' ? (
            <label className="conversation-wide">
              <span>{t.sessionId}</span>
              <input
                spellCheck={false}
                type="text"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        <footer className="conversation-dialog-actions">
          <button type="button" onClick={onCancel}>
            {t.cancel}
          </button>
          <button type="button" disabled={!projectPath.trim()} onClick={submit}>
            {t.createConversation}
          </button>
        </footer>
      </section>
    </div>
  );
}

function createPetPreviewUrl(asset: DesktopPetAsset): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = asset.atlas.cellWidth;
      canvas.height = asset.atlas.cellHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        0,
        0,
        asset.atlas.cellWidth,
        asset.atlas.cellHeight,
        0,
        0,
        asset.atlas.cellWidth,
        asset.atlas.cellHeight
      );
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(null);
    image.src = asset.spritesheetDataUrl;
  });
}

function PetListItem({
  name,
  description,
  preview,
  selected,
  selectLabel,
  selectedLabel,
  onSelect
}: {
  name: string;
  description: string;
  preview: ReactNode;
  selected: boolean;
  selectLabel: string;
  selectedLabel: string;
  onSelect: () => void;
}): ReactNode {
  return (
    <div className="pet-list-item">
      <div className="pet-list-preview">{preview}</div>
      <span>
        <strong>{name}</strong>
        <small>{description}</small>
      </span>
      <button disabled={selected} type="button" onClick={onSelect}>
        {selected ? selectedLabel : selectLabel}
      </button>
    </div>
  );
}

function SelectMenu({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="select-menu" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        aria-expanded={open}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <span>{selected?.label ?? 'Select'}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="select-menu-popover">
          {options.map((option) => (
            <button
              className={option.value === value ? 'selected' : undefined}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="select-check">{option.value === value ? <Check size={14} /> : null}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
