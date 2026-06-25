import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { Bot, CheckCircle2, ChevronLeft, Image, LoaderCircle, RotateCcw, SendHorizonal, TerminalSquare, X } from 'lucide-react';
import { LiquidGlass } from 'simple-liquid-glass';
import type { ConversationFileReference, ConversationMessage, ConversationRecord, ConversationReference, ConversationStore } from '../../shared/conversation';
import type { CliId } from '../../shared/terminal';
import type {
  AgentContextReferenceInput,
  AgentContextSnippet,
  AgentContextSnippetInput,
  AgentFileReferenceInput,
  AgentImageAttachmentInput,
  AgentProjectEntry,
  AgentSkill
} from '../../shared/agent';
import { getCliSkills } from '../../shared/skills';
import { getMessageReferenceLabels, MarkdownMessage, PlainMarkdownLine } from './MarkdownRenderer';

interface ImagePreviewState {
  name: string;
  url: string;
}

export interface AgentContextSource {
  id: string;
  type: 'conversation' | 'terminal';
  title: string;
  cliId: CliId;
  projectPath?: string;
  sessionKey?: string;
  conversation?: ConversationRecord;
}

function GlassSuggestionMenu({
  children,
  className = '',
  enabled,
  menuClassName = 'agent-reference-menu'
}: {
  children: ReactNode;
  className?: string;
  enabled: boolean;
  menuClassName?: string;
}): ReactNode {
  if (!enabled) {
    return (
      <div className={`agent-reference-glass-shell plain ${className}`}>
        <div className={menuClassName}>{children}</div>
      </div>
    );
  }

  return (
    <div className={`agent-reference-glass-shell ${className}`}>
      <LiquidGlass
        alpha={0.35}
        blur={8}
        className="agent-reference-glass"
        displace={7}
        dispersion={28}
        effectMode="svg"
        frost={0.08}
        glassColor="rgba(255,255,255,0.28)"
        lens="convex"
        lensStrength={1.35}
        lightness={68}
        liquid="flow"
        liquidScale={3}
        liquidSpeed={0.75}
        quality="high"
        radius={8}
        saturation={180}
        scale={220}
        style={{ width: '100%' }}
      >
        <div className={menuClassName}>{children}</div>
      </LiquidGlass>
    </div>
  );
}

function getSkillSearchScore(skill: AgentSkill, query: string): number {
  if (!query) return 1;
  const command = skill.command.toLowerCase();
  const label = skill.label.toLowerCase();
  const source = (skill.source ?? '').toLowerCase();
  const description = skill.description.toLowerCase();
  const id = skill.id.toLowerCase();

  if (command === `/${query}` || id === query) return 1000;
  if (command.startsWith(`/${query}`) || id.startsWith(query)) return 800;
  if (label.startsWith(query)) return 700;
  if (source.startsWith(query)) return 620;
  if (command.includes(query) || id.includes(query)) return 520;
  if (label.includes(query)) return 460;
  if (source.includes(query)) return 380;
  if (description.includes(query)) return 220;

  const words = query.split(/\s+/u).filter(Boolean);
  if (words.length > 1 && words.every((word) => `${command} ${label} ${source} ${description}`.includes(word))) return 120;
  return 0;
}

function getContextSourceSearchScore(source: AgentContextSource, query: string): number {
  if (!query) return 1;
  const title = source.title.toLowerCase();
  const project = (source.projectPath ?? '').toLowerCase();
  const cli = source.cliId.toLowerCase();
  const id = source.id.toLowerCase();

  if (title === query || id === query) return 1000;
  if (title.startsWith(query)) return 820;
  if (project.split(/[\\/]/u).pop()?.toLowerCase().startsWith(query)) return 740;
  if (cli.startsWith(query)) return 620;
  if (title.includes(query)) return 520;
  if (project.includes(query)) return 420;
  if (id.includes(query)) return 260;
  return 0;
}

function getTrailingTrigger(value: string, symbols: string[]): { symbol: string; query: string; start: number; nested: boolean } | null {
  const lineStart = Math.max(value.lastIndexOf('\n') + 1, 0);
  const tail = value.slice(lineStart);
  const match = /(?:^|\s|->)([@#])([^\s@#\\]*)$/u.exec(tail);
  if (!match || !symbols.includes(match[1])) return null;
  const prefix = match[0].slice(0, match[0].lastIndexOf(match[1]));
  return {
    symbol: match[1],
    query: match[2].trim().toLowerCase(),
    start: lineStart + match.index + match[0].lastIndexOf(match[1]),
    nested: prefix.endsWith('->')
  };
}

function getSkillTrigger(value: string): { query: string; start: number } | null {
  const lineStart = Math.max(value.lastIndexOf('\n') + 1, 0);
  const tail = value.slice(lineStart);
  const match = /(?:^|\s)\/([^\s/]*)$/u.exec(tail);
  if (!match) return null;
  return {
    query: match[1].trim().toLowerCase(),
    start: lineStart + match.index + match[0].lastIndexOf('/')
  };
}

function replaceTrailingTrigger(value: string, trigger: { start: number } | null, label: string): string {
  if (!trigger) return `${value}${label}`;
  const before = value.slice(0, trigger.start).replace(/->$/u, '').trimEnd();
  const after = value.slice(trigger.start).replace(/^[@#][^\s@#\\]*/u, '');
  const separator = before && !/\s$/u.test(before) ? ' ' : '';
  const suffix = after ? (!/^\s/u.test(after) ? ' ' : '') : ' ';
  return `${before}${separator}${label}${suffix}${after}`;
}

function replaceSkillTrigger(value: string, trigger: { start: number } | null, replacement: string): string {
  if (!trigger) return `${replacement}${value}`.trimStart();
  const before = value.slice(0, trigger.start);
  const after = value.slice(trigger.start).replace(/^\/[^\s/]*/u, '');
  const separator = before && !/\s$/u.test(before) ? ' ' : '';
  const suffix = after ? (!/^\s/u.test(after) ? ' ' : '') : '';
  return `${before}${separator}${replacement}${suffix}${after}`.trimStart();
}

function getPathSegments(path: string | undefined): string[] {
  return path?.split(/[\\/]/u).filter(Boolean) ?? [];
}

function normalizeLocalPath(path: string | undefined): string {
  return (path ?? '').replace(/[\\/]+$/u, '').toLowerCase();
}

function isSamePath(left: string | undefined, right: string | undefined): boolean {
  return normalizeLocalPath(left) === normalizeLocalPath(right);
}

function getParentPath(path: string | undefined, root: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!root || isSamePath(path, root)) return undefined;
  const normalized = path.replace(/[\\/]+$/u, '');
  const index = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (index <= 0) return undefined;
  const parent = normalized.slice(0, index);
  if (isSamePath(parent, root)) return undefined;
  return parent;
}

function getBreadcrumbLabel(root: string | undefined, current: string | undefined): string {
  const rootName = getPathSegments(root).at(-1) ?? 'Project';
  if (!current || isSamePath(current, root)) return rootName;
  const rootSegments = getPathSegments(root);
  const currentSegments = getPathSegments(current);
  const relative = currentSegments.slice(rootSegments.length);
  return [rootName, ...relative].filter(Boolean).join(' / ');
}

function renderPromptHighlight(
  text: string,
  files: AgentProjectEntry[],
  sources: AgentContextSource[],
  snippets: AgentContextSnippet[]
): ReactNode[] {
  const labels = [
    ...files.map((item) => ({ label: `@${item.name}`, className: 'file' })),
    ...sources.map((item) => ({ label: `#${item.title}`, className: 'context' })),
    ...snippets.map((item) => ({ label: `#${item.title}`, className: 'context' }))
  ]
    .filter((item) => item.label.length > 1)
    .sort((left, right) => right.label.length - left.label.length);
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < text.length) {
    const match = labels
      .map((item) => ({ ...item, index: text.indexOf(item.label, index) }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index || right.label.length - left.label.length)[0];

    if (!match) {
      nodes.push(text.slice(index));
      break;
    }

    if (match.index > index) nodes.push(text.slice(index, match.index));
    nodes.push(
      <span className={`agent-message-reference-text ${match.className}`} key={`${match.label}-${match.index}`}>
        {match.label}
      </span>
    );
    index = match.index + match.label.length;
  }

  return nodes.length ? nodes : [''];
}

function renderPromptEditorContent(
  text: string,
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  const ordered = labels.sort((left, right) => right.label.length - left.label.length);

  while (index < text.length) {
    const match = ordered
      .map((item) => ({ ...item, index: text.indexOf(item.label, index) }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index || right.label.length - left.label.length)[0];

    if (!match) {
      nodes.push(text.slice(index));
      break;
    }

    if (match.index > index) nodes.push(text.slice(index, match.index));
    nodes.push(
      <button
        className={`agent-reference-token ${match.kind === 'file' ? 'file' : 'context'}`}
        contentEditable={false}
        data-reference-id={match.id}
        data-reference-kind={match.kind}
        data-reference-label={match.label}
        key={`${match.id}-${match.index}`}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      >
        {match.label}
      </button>
    );
    index = match.index + match.label.length;
  }

  return nodes.length ? nodes : [''];
}

function renderPromptEditorDom(
  editor: HTMLDivElement | null,
  text: string,
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): void {
  if (!editor) return;
  editor.replaceChildren();
  const ordered = [...labels].sort((left, right) => right.label.length - left.label.length);
  let index = 0;

  while (index < text.length) {
    const match = ordered
      .map((item) => ({ ...item, index: text.indexOf(item.label, index) }))
      .filter((item) => item.index >= 0)
      .sort((left, right) => left.index - right.index || right.label.length - left.label.length)[0];

    if (!match) {
      editor.append(document.createTextNode(text.slice(index)));
      break;
    }

    if (match.index > index) editor.append(document.createTextNode(text.slice(index, match.index)));
    const button = document.createElement('button');
    button.className = `agent-reference-token ${match.kind === 'file' ? 'file' : 'context'}`;
    button.contentEditable = 'false';
    button.dataset.referenceId = match.id;
    button.dataset.referenceKind = match.kind;
    button.dataset.referenceLabel = match.label;
    button.type = 'button';
    button.textContent = match.label;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    editor.append(button);
    index = match.index + match.label.length;
  }
}

function getPromptReferenceLabels(
  files: AgentProjectEntry[],
  sources: AgentContextSource[],
  snippets: AgentContextSnippet[]
): Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }> {
  return [
    ...files.map((item) => ({ label: `@${item.name}`, id: item.id, kind: 'file' as const })),
    ...sources.map((item) => ({ label: `#${item.title}`, id: item.id, kind: 'context' as const })),
    ...snippets.map((item) => ({ label: `#${item.title}`, id: item.id, kind: 'snippet' as const }))
  ].sort((left, right) => right.label.length - left.label.length);
}

function getPlainTextFromEditor(element: HTMLElement): string {
  let text = '';
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
      return;
    }

    if (node instanceof HTMLElement) {
      text += node.dataset.referenceLabel ?? node.textContent ?? '';
    }
  });
  return text.replace(/\u00a0/gu, ' ');
}

function getCaretOffsetWithin(element: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().replace(/\u00a0/gu, ' ').length;
}

function setCaretOffsetWithin(element: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function focusEditorAtEnd(editor: HTMLDivElement | null): void {
  if (!editor) return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      editor.focus();
      setCaretOffsetWithin(editor, getPlainTextFromEditor(editor).length);
    });
  });
}

function updateEditorPrompt(
  editor: HTMLDivElement | null,
  text: string,
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): void {
  renderPromptEditorDom(editor, text, labels);
  window.requestAnimationFrame(() => focusEditorAtEnd(editor));
}

function findReferenceTokenAtCursor(
  text: string,
  cursor: number,
  key: 'Backspace' | 'Delete',
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): { start: number; end: number; id: string; kind: 'file' | 'context' | 'snippet' } | null {
  for (const item of labels) {
    let start = text.indexOf(item.label);
    while (start >= 0) {
      const end = start + item.label.length;
      const inside =
        key === 'Backspace'
          ? cursor > start && cursor <= end
          : cursor >= start && cursor < end;
      if (inside) return { start, end, id: item.id, kind: item.kind };
      start = text.indexOf(item.label, start + item.label.length);
    }
  }
  return null;
}

function findReferenceTokenBoundary(
  text: string,
  cursor: number,
  direction: 'left' | 'right',
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): number | null {
  for (const item of labels) {
    let start = text.indexOf(item.label);
    while (start >= 0) {
      const end = start + item.label.length;
      const enteringFromRight = direction === 'left' && cursor > start && cursor <= end;
      const enteringFromLeft = direction === 'right' && cursor >= start && cursor < end;
      if (enteringFromRight) return start;
      if (enteringFromLeft) return end;
      start = text.indexOf(item.label, start + item.label.length);
    }
  }
  return null;
}

function getNearestReferenceTokenBoundary(
  text: string,
  cursor: number,
  labels: Array<{ label: string; id: string; kind: 'file' | 'context' | 'snippet' }>
): number | null {
  for (const item of labels) {
    let start = text.indexOf(item.label);
    while (start >= 0) {
      const end = start + item.label.length;
      if (cursor > start && cursor < end) {
        return cursor - start <= end - cursor ? start : end;
      }
      start = text.indexOf(item.label, start + item.label.length);
    }
  }
  return null;
}

function getPreviousUserMessage(messages: ConversationMessage[], index: number): ConversationMessage | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = messages[cursor];
    if (
      message.role === 'user' &&
      !/^Permission approved (?:once|always) for\b/iu.test(message.content.trim())
    ) {
      return message;
    }
  }
  return undefined;
}

function detectPermissionRequest(content: string): string | null {
  const normalized = content.toLowerCase();
  if (
    /(?:需要|请).{0,12}(?:授权|批准|允许|权限)/u.test(content) ||
    /(?:permission|approve|approval|authorize|allow)/iu.test(content)
  ) {
    const toolMatch = /\b(WebSearch|WebFetch|Bash|Read|Write|Edit|MultiEdit|Grep|Glob)\b/u.exec(content);
    if (toolMatch) return toolMatch[1];
    if (/联网|网络|搜索|websearch|web search/iu.test(content)) return 'WebSearch';
    return 'tool';
  }
  if (normalized.includes('websearch') && /(?:权限|授权|permission|approve|allow)/iu.test(content)) return 'WebSearch';
  return null;
}

function isCoordinationMessage(content: string): boolean {
  return /^(?:Calling #.+|正在调用 #.+|#.+\s*(?:\(.+\)|（.+）)\s*(?:returned|failed):|#.+（.+）(?:已返回|调用失败)：)/u.test(content.trim());
}

function UserMessageContent({
  content,
  fileReferences,
  references
}: {
  content: string;
  fileReferences?: ConversationFileReference[];
  references?: ConversationReference[];
}): ReactNode {
  return (
    <div className="agent-message-markdown">
      <p>
        <PlainMarkdownLine content={content} references={getMessageReferenceLabels(fileReferences, references)} />
      </p>
    </div>
  );
}

interface AgentPaneProps {
  active: boolean;
  conversationId?: string;
  conversationStore: ConversationStore;
  contextSources: AgentContextSource[];
  profileName: string;
  profileId: CliId;
  language: 'en' | 'zh-CN';
  nativeMaterial: boolean;
  onStoreChange: (store: ConversationStore) => void;
  labels: {
    user: string;
    running: string;
    ready: string;
    inputPlaceholder: string;
    interrupted: string;
    thinking: string;
    retry: string;
    system: string;
    approvePermission: string;
    permissionRequest: string;
    search: string;
    skills: string;
    contexts: string;
    terminal: string;
    terminalTranscript: string;
    searchInContext: string;
    selectFromContext: string;
    back: string;
    use: string;
    folder: string;
    file: string;
    previewClose: string;
    preview: {
      cwd: string;
      cmd: string;
      output: string;
      statuses: Record<'queued' | 'sent' | 'running' | 'warning' | 'failed' | 'completed' | 'skipped', string>;
    };
  };
}

export function AgentPane({
  active,
  conversationId,
  conversationStore,
  contextSources,
  profileName,
  profileId,
  language,
  nativeMaterial,
  onStoreChange,
  labels
}: AgentPaneProps): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<AgentImageAttachmentInput[]>([]);
  const [previewImage, setPreviewImage] = useState<ImagePreviewState | null>(null);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedReferenceIndex, setSelectedReferenceIndex] = useState(0);
  const [selectedSnippetIndex, setSelectedSnippetIndex] = useState(0);
  const [projectEntries, setProjectEntries] = useState<AgentProjectEntry[]>([]);
  const [fileBrowsePath, setFileBrowsePath] = useState<string | undefined>();
  const [contextSnippets, setContextSnippets] = useState<AgentContextSnippet[]>([]);
  const [referencedSnippets, setReferencedSnippets] = useState<AgentContextSnippet[]>([]);
  const [referencedFiles, setReferencedFiles] = useState<AgentProjectEntry[]>([]);
  const [referencedContextIds, setReferencedContextIds] = useState<string[]>([]);
  const [codexSkills, setCodexSkills] = useState<AgentSkill[] | null>(null);
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const conversation = useMemo<ConversationRecord | undefined>(
    () => conversationStore.conversations.find((item) => item.id === conversationId),
    [conversationId, conversationStore.conversations]
  );
  const messages = conversation?.messages ?? [];
  const running = sending || messages.some((message) => message.status === 'running');
  const skills = useMemo(
    () => (profileId === 'codex' && codexSkills?.length ? codexSkills : getCliSkills(profileId)),
    [codexSkills, profileId]
  );
  const skillTrigger = useMemo(() => getSkillTrigger(prompt), [prompt]);
  const skillQuery = skillTrigger?.query ?? null;
  const matchingSkills = useMemo(
    () => {
      if (skillQuery === null) return [];
      return skills
        .map((skill) => ({ skill, score: getSkillSearchScore(skill, skillQuery) }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score || left.skill.command.localeCompare(right.skill.command))
        .map((item) => item.skill)
        .slice(0, 80);
    },
    [skillQuery, skills]
  );
  const showSkillMenu = matchingSkills.length > 0;
  const trailingTrigger = useMemo(() => getTrailingTrigger(prompt, ['@', '#']), [prompt]);
  const fileQuery = trailingTrigger?.symbol === '@' ? trailingTrigger.query : null;
  const nestedFileSource = trailingTrigger?.symbol === '@' && trailingTrigger.nested ? referencedFiles.filter((item) => item.type === 'directory').at(-1) : undefined;
  const browsingFiles = fileQuery !== null && fileQuery.length === 0;
  const contextQuery = trailingTrigger?.symbol === '#' && !trailingTrigger.nested ? trailingTrigger.query : null;
  const snippetQuery = trailingTrigger?.symbol === '#' && trailingTrigger.nested ? trailingTrigger.query : null;
  const referencedSources = useMemo(
    () =>
      referencedContextIds
        .map((id) => contextSources.find((item) => item.id === id))
        .filter((item): item is AgentContextSource => Boolean(item)),
    [contextSources, referencedContextIds]
  );
  const referenceLabels = useMemo(
    () => getPromptReferenceLabels(referencedFiles, referencedSources, referencedSnippets),
    [referencedFiles, referencedSnippets, referencedSources]
  );
  const matchingFiles = useMemo(() => {
    if (fileQuery === null) return [];
    return projectEntries.slice(0, 80);
  }, [fileQuery, projectEntries]);
  const showFileMenu = matchingFiles.length > 0;
  const matchingSnippets = useMemo(() => {
    if (snippetQuery === null) return [];
    return contextSnippets.slice(0, 80);
  }, [contextSnippets, snippetQuery]);
  const showSnippetMenu = matchingSnippets.length > 0;
  const matchingSources = useMemo(() => {
    if (contextQuery === null) return [];
    return contextSources
      .filter((item) => item.conversation?.id !== conversationId && !referencedContextIds.includes(item.id))
      .map((item) => ({ source: item, score: getContextSourceSearchScore(item, contextQuery) }))
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          Number(right.source.type === 'terminal') - Number(left.source.type === 'terminal') ||
          left.source.title.localeCompare(right.source.title)
      )
      .map((item) => item.source)
      .slice(0, 80);
  }, [contextSources, conversationId, contextQuery, referencedContextIds]);
  const showReferenceMenu = matchingSources.length > 0;

  useEffect(() => {
    setSelectedSkillIndex(0);
  }, [skillQuery, profileId]);

  useEffect(() => {
    setSelectedFileIndex(0);
  }, [fileQuery, conversationId]);

  useEffect(() => {
    if (fileQuery === null) return;
    setFileBrowsePath(nestedFileSource?.path);
  }, [conversationId, fileQuery === null, nestedFileSource?.path]);

  useEffect(() => {
    setSelectedReferenceIndex(0);
  }, [contextQuery, conversationId]);

  useEffect(() => {
    setSelectedSnippetIndex(0);
  }, [snippetQuery, conversationId]);

  useEffect(() => {
    if (fileQuery === null || !conversation?.projectPath) return;
    let cancelled = false;
    void window.agentApi
      .listProjectEntries(conversation.projectPath, fileQuery, browsingFiles ? fileBrowsePath : undefined)
      .then((items) => {
        if (!cancelled) setProjectEntries(items);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setProjectEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [browsingFiles, conversation?.projectPath, fileBrowsePath, fileQuery]);

  useEffect(() => {
    if (snippetQuery === null) return;
    const source = referencedSources.at(-1);
    if (!source) {
      setContextSnippets([]);
      return;
    }
    const request =
      source.type === 'conversation'
        ? source.conversation
          ? ({ type: 'conversation', id: source.conversation.id } satisfies AgentContextReferenceInput)
          : null
        : source.sessionKey
          ? ({
              type: 'terminal',
              id: source.sessionKey,
              title: source.title,
              projectPath: source.projectPath,
              sessionKey: source.sessionKey
            } satisfies AgentContextReferenceInput)
          : null;
    if (!request) return;
    let cancelled = false;
    void window.agentApi
      .listContextSnippets(request, snippetQuery)
      .then((items) => {
        if (!cancelled) setContextSnippets(items);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setContextSnippets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [referencedSources, snippetQuery]);

  useEffect(() => {
    if (profileId !== 'codex' || codexSkills) return;
    void window.agentApi
      .listSkills()
      .then((items) => {
        if (items.length) setCodexSkills(items);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }, [codexSkills, profileId]);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      const element = messagesRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active, conversationId, messages.length, messages.at(-1)?.content, messages.at(-1)?.status]);

  useEffect(() => {
    const text = ` ${prompt} `;
    setReferencedFiles((current) => current.filter((item) => text.includes(`@${item.name}`)));
    setReferencedContextIds((current) =>
      current.filter((id) => {
        const source = contextSources.find((item) => item.id === id);
        return source ? text.includes(`#${source.title}`) : false;
      })
    );
    setReferencedSnippets((current) => current.filter((item) => text.includes(`#${item.title}`)));
  }, [contextSources, prompt]);

  function sendAgentRequest(request: Omit<Parameters<typeof window.agentApi.send>[0], 'conversationId'>): void {
    if (!conversation || sending) return;
    setSending(true);
    void window.agentApi
      .send({
        conversationId: conversation.id,
        language,
        ...request
      })
      .then((result) => {
        onStoreChange(result.store);
      })
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setSending(false);
      });
  }

  function toContextReferenceInput(reference: ConversationReference): AgentContextReferenceInput | null {
    const source = contextSources.find((item) => item.id === reference.id || item.title === reference.title);
    if (source?.type === 'terminal' && source.sessionKey) {
      return {
        type: 'terminal',
        id: source.sessionKey,
        title: source.title,
        projectPath: source.projectPath,
        sessionKey: source.sessionKey
      };
    }
    if (source?.type === 'conversation' && source.conversation) return { type: 'conversation', id: source.conversation.id };
    if (reference.cliId !== 'shell') return { type: 'conversation', id: reference.id };
    return null;
  }

  function sendText(value: string, nextAttachments = attachments): void {
    const nextPrompt = value.trim();
    const attachmentSnapshot = nextAttachments.slice();
    const promptReferenceText = ` ${nextPrompt} `;
    const fileSnapshot = referencedFiles
      .filter((item) => promptReferenceText.includes(`@${item.name}`))
      .map<AgentFileReferenceInput>((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        path: item.path,
        relativePath: item.relativePath
      }));
    const snippetSnapshot = referencedSnippets
      .filter((item) => promptReferenceText.includes(`#${item.title}`))
      .map<AgentContextSnippetInput>((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle,
        title: item.title,
        body: item.body
      }));
    const referenceSnapshot = referencedSources
      .filter((item) => promptReferenceText.includes(`#${item.title}`))
      .map<AgentContextReferenceInput | null>((item) =>
        item.type === 'conversation'
          ? item.conversation
            ? { type: 'conversation', id: item.conversation.id }
            : null
          : item.sessionKey
            ? {
                type: 'terminal',
                id: item.sessionKey,
                title: item.title,
                projectPath: item.projectPath,
                sessionKey: item.sessionKey
              }
            : null
      )
      .filter((item): item is AgentContextReferenceInput => Boolean(item));
    if (!conversation || (!nextPrompt && attachmentSnapshot.length === 0) || sending) return;

    setPrompt('');
    editorRef.current?.replaceChildren();
    setAttachments([]);
    setReferencedFiles([]);
    setReferencedSnippets([]);
    setReferencedContextIds([]);
    sendAgentRequest({
        prompt: nextPrompt || 'Describe this image.',
        attachments: attachmentSnapshot,
        fileReferences: fileSnapshot,
        contextSnippets: snippetSnapshot,
        contextReferences: referenceSnapshot
      });
  }

  function sendPrompt(): void {
    sendText(prompt);
  }

  function insertSkill(skill: AgentSkill): void {
    const current = getPlainTextFromEditor(editorRef.current ?? document.createElement('div')) || prompt;
    const trigger = getSkillTrigger(current);
    const nextText = replaceSkillTrigger(current, trigger, '');
    const nextPrompt = `${skill.prompt}${nextText}`.trimStart();
    setPrompt(nextPrompt);
    updateEditorPrompt(editorRef.current, nextPrompt, referenceLabels);
    setSelectedSkillIndex(0);
  }

  function insertContextReference(item: AgentContextSource): void {
    setReferencedContextIds((current) => (current.includes(item.id) ? current : [...current, item.id].slice(0, 8)));
    const nextPrompt = replaceTrailingTrigger(prompt, trailingTrigger, `#${item.title}`);
    setPrompt(nextPrompt);
    updateEditorPrompt(editorRef.current, nextPrompt, [
      ...referenceLabels,
      { label: `#${item.title}`, id: item.id, kind: 'context' }
    ]);
    setSelectedReferenceIndex(0);
  }

  function insertFileReference(item: AgentProjectEntry, forceSelect = false): void {
    if (browsingFiles && item.type === 'directory' && !forceSelect) {
      setFileBrowsePath(item.path);
      setSelectedFileIndex(0);
      return;
    }

    setReferencedFiles((current) => (current.some((entry) => entry.id === item.id) ? current : [...current, item].slice(0, 10)));
    const nextPrompt = replaceTrailingTrigger(prompt, trailingTrigger, `@${item.name}`);
    setPrompt(nextPrompt);
    updateEditorPrompt(editorRef.current, nextPrompt, [
      ...referenceLabels,
      { label: `@${item.name}`, id: item.id, kind: 'file' }
    ]);
    setSelectedFileIndex(0);
  }

  function insertCurrentFolderReference(): void {
    if (!conversation?.projectPath) return;
    const currentPath = fileBrowsePath ?? conversation.projectPath;
    const name = getPathSegments(currentPath).at(-1) ?? currentPath;
    const item: AgentProjectEntry = {
      id: `directory:${currentPath}`,
      type: 'directory',
      name,
      path: currentPath,
      relativePath: fileBrowsePath ? getPathSegments(currentPath).slice(-1)[0] ?? name : name
    };
    setReferencedFiles((current) => (current.some((entry) => entry.id === item.id) ? current : [...current, item].slice(0, 10)));
    const nextPrompt = replaceTrailingTrigger(prompt, trailingTrigger, `@${item.name}`);
    setPrompt(nextPrompt);
    updateEditorPrompt(editorRef.current, nextPrompt, [
      ...referenceLabels,
      { label: `@${item.name}`, id: item.id, kind: 'file' }
    ]);
    setSelectedFileIndex(0);
  }

  function insertContextSnippet(item: AgentContextSnippet): void {
    setReferencedSnippets((current) => (current.some((entry) => entry.id === item.id) ? current : [...current, item].slice(0, 12)));
    const nextPrompt = replaceTrailingTrigger(prompt, trailingTrigger, `#${item.title}`);
    setPrompt(nextPrompt);
    updateEditorPrompt(editorRef.current, nextPrompt, [
      ...referenceLabels,
      { label: `#${item.title}`, id: item.id, kind: 'snippet' }
    ]);
    setSelectedSnippetIndex(0);
  }

  function retryBefore(index: number): void {
    const previousUserMessage = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === 'user');
    if (previousUserMessage) sendText(previousUserMessage.content);
  }

  function approvePermissionBefore(index: number, tool: string): void {
    const previousUserMessage = getPreviousUserMessage(messages, index);
    const originalTask = previousUserMessage?.content ? previousUserMessage.content : '';
    const contextReferences = (previousUserMessage?.references ?? [])
      .map(toContextReferenceInput)
      .filter((item): item is AgentContextReferenceInput => Boolean(item));
    const fileReferences = (previousUserMessage?.fileReferences ?? []).map<AgentFileReferenceInput>((item) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      path: item.path,
      relativePath: item.relativePath
    }));
    const request: Omit<Parameters<typeof window.agentApi.send>[0], 'conversationId'> = {
      prompt: originalTask || `Continue with the approved ${tool} capability.`,
      contextReferences,
      fileReferences,
      toolApprovals: [{ tool, scope: 'once' }]
    };
    if (conversation && !conversation.sessionId && conversation.cliId === 'opencode') {
      void window.conversationApi
        .bindSession({ id: conversation.id })
        .then((store) => {
          onStoreChange(store);
          sendAgentRequest(request);
        })
        .catch(() => sendAgentRequest(request));
      return;
    }
    sendAgentRequest(request);
  }

  function addImageAttachment(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setAttachments((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          name: file.name || `clipboard-image-${current.length + 1}.png`,
          mimeType: file.type || 'image/png',
          dataUrl
        }
      ]);
    };
    reader.readAsDataURL(file);
  }

  function addImageDataUrl(dataUrl: string, name?: string): void {
    if (attachments.length >= 6) return;
    setAttachments((current) => {
      if (current.length >= 6) return current;
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          name: name || `clipboard-image-${current.length + 1}.png`,
          mimeType: dataUrl.match(/^data:([^;]+);/u)?.[1] || 'image/png',
          dataUrl
        }
      ];
    });
  }

  function addClipboardImage(): boolean {
    const dataUrl = window.clipboardApi.readImage();
    if (!dataUrl) return false;
    addImageDataUrl(dataUrl);
    return true;
  }

  function chooseImage(): void {
    void window.agentApi
      .chooseImage()
      .then((result) => {
        if (!result) return;
        addImageDataUrl(result.dataUrl, result.name);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
  }

  function pasteImages(event: ClipboardEvent<HTMLElement>): void {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    const imageItems = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const images = files.length ? files : imageItems;
    if (!images.length) {
      if (addClipboardImage()) event.preventDefault();
      return;
    }

    event.preventDefault();
    images.slice(0, 6 - attachments.length).forEach(addImageAttachment);
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function snapCursorOutOfReference(target: HTMLTextAreaElement): void {
    if (target.selectionStart !== target.selectionEnd) return;
    const nextCursor = getNearestReferenceTokenBoundary(
      prompt,
      target.selectionStart,
      getPromptReferenceLabels(referencedFiles, referencedSources, referencedSnippets)
    );
    if (nextCursor !== null) target.setSelectionRange(nextCursor, nextCursor);
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const clearEditorPrompt = (): void => {
      setPrompt('');
      editorRef.current?.replaceChildren();
    };

    if (showSkillMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedSkillIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + matchingSkills.length) % matchingSkills.length;
      });
      return;
    }

    if (showSkillMenu && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertSkill(matchingSkills[selectedSkillIndex] ?? matchingSkills[0]);
      return;
    }

    if (showSkillMenu && event.key === 'Escape') {
      event.preventDefault();
      clearEditorPrompt();
      return;
    }

    if (showFileMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedFileIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + matchingFiles.length) % matchingFiles.length;
      });
      return;
    }

    if (showFileMenu && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertFileReference(matchingFiles[selectedFileIndex] ?? matchingFiles[0], event.ctrlKey || event.metaKey);
      return;
    }

    if (showFileMenu && event.key === 'Escape') {
      event.preventDefault();
      clearEditorPrompt();
      return;
    }

    if (showSnippetMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedSnippetIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + matchingSnippets.length) % matchingSnippets.length;
      });
      return;
    }

    if (showSnippetMenu && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertContextSnippet(matchingSnippets[selectedSnippetIndex] ?? matchingSnippets[0]);
      return;
    }

    if (showSnippetMenu && event.key === 'Escape') {
      event.preventDefault();
      clearEditorPrompt();
      return;
    }

    if (showReferenceMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setSelectedReferenceIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        return (current + offset + matchingSources.length) % matchingSources.length;
      });
      return;
    }

    if (showReferenceMenu && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertContextReference(matchingSources[selectedReferenceIndex] ?? matchingSources[0]);
      return;
    }

    if (showReferenceMenu && event.key === 'Escape') {
      event.preventDefault();
      clearEditorPrompt();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  }

  return (
    <div className={active ? 'agent-terminal active' : 'agent-terminal'} aria-hidden={!active}>
      <div className="terminal-meta">
        <span className={`status-dot ${running ? 'booting' : 'ready'}`} />
        <Bot size={15} />
        <strong>{conversation?.title ?? profileName}</strong>
        <span className="terminal-state">
          {running ? <LoaderCircle size={14} /> : <CheckCircle2 size={14} />}
          {running ? labels.running : labels.ready}
        </span>
      </div>
      <div className={`agent-chat ${profileId ? `agent-chat-${profileId}` : ''}`}>
        <div className="agent-messages" ref={messagesRef}>
          {messages.length === 0 ? (
            <div className="agent-empty">
              <strong>{profileName}</strong>
              <span>{conversation?.projectPath ?? ''}</span>
            </div>
          ) : null}
          {messages.map((message, index) => (
            <article
              className={[
                'agent-message',
                message.role,
                message.status ?? '',
                message.role === 'system' ? 'coordination' : '',
                message.role === 'system' && isCoordinationMessage(message.content) ? 'agent-call' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              key={message.id}
            >
              <div className="agent-message-avatar">{message.role === 'user' ? '你' : <Bot size={13} />}</div>
              <div className="agent-message-bubble">
                <span className="agent-message-author">
                  {message.role === 'user' ? labels.user : message.role === 'system' ? labels.system : profileName}
                </span>
                {message.role === 'user' ? (
                  <UserMessageContent
                    content={message.content}
                    fileReferences={message.fileReferences}
                    references={message.references}
                  />
                ) : (
                  <MarkdownMessage
                    className={message.status === 'running' ? 'agent-message-running' : undefined}
                    content={
                      message.content === 'Interrupted.'
                        ? labels.interrupted
                        : message.status === 'running'
                          ? labels.thinking
                          : message.content
                    }
                    labels={labels}
                    references={getMessageReferenceLabels(
                      getPreviousUserMessage(messages, index)?.fileReferences,
                      getPreviousUserMessage(messages, index)?.references
                    )}
                  />
                )}
                {message.attachments?.length ? (
                  <div className="agent-message-attachments">
                    {message.attachments.map((attachment) => (
                      <button
                        aria-label={`Preview ${attachment.name}`}
                        key={attachment.id}
                        type="button"
                        onClick={() => setPreviewImage({ name: attachment.name, url: attachment.previewUrl })}
                      >
                        <img alt={attachment.name} src={attachment.previewUrl} />
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.status === 'error' ? (
                  <button className="agent-message-action" type="button" onClick={() => retryBefore(index)}>
                    <RotateCcw size={13} />
                    <span>{labels.retry}</span>
                  </button>
                ) : null}
                {message.role !== 'user' && message.status !== 'running' && detectPermissionRequest(message.content) ? (
                  <button
                    className="agent-message-action permission"
                    type="button"
                    onClick={() => approvePermissionBefore(index, detectPermissionRequest(message.content) ?? 'tool')}
                  >
                    <CheckCircle2 size={13} />
                    <span>{labels.approvePermission}</span>
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <div className="agent-input-row">
          <div
            className={[
              'agent-composer',
              attachments.length ? 'has-attachments' : '',
              ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {attachments.length ? (
              <div className="agent-attachment-tray">
                {attachments.map((attachment) => (
                  <span className="agent-attachment-chip" key={attachment.id}>
                    <button
                      className="agent-attachment-preview"
                      aria-label={`Preview ${attachment.name}`}
                      type="button"
                      onClick={() => setPreviewImage({ name: attachment.name, url: attachment.dataUrl })}
                    >
                      <img alt={attachment.name} src={attachment.dataUrl} />
                    </button>
                    <button
                      className="agent-attachment-remove"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                      aria-label="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="agent-textarea-wrap">
              <button className="agent-image-picker-button" type="button" onClick={chooseImage} aria-label="Choose image">
                <Image size={14} />
              </button>
              <div
                ref={editorRef}
                className="agent-token-editor"
                contentEditable
                data-placeholder={labels.inputPlaceholder}
                role="textbox"
                spellCheck={false}
                suppressContentEditableWarning
                onInput={(event) => {
                  setPrompt(getPlainTextFromEditor(event.currentTarget));
                  setSelectedSkillIndex(0);
                }}
                onPaste={pasteImages}
                onKeyDown={handleEditorKeyDown}
              />
            </div>
            {showSkillMenu ? (
              <GlassSuggestionMenu enabled={nativeMaterial} menuClassName="agent-skill-menu">
                <div className="agent-skill-menu-meta">
                  <span>{skillQuery ? `${labels.search}: ${skillQuery}` : `${skills.length} ${labels.skills}`}</span>
                </div>
                {matchingSkills.map((skill, index) => (
                  <button
                    className={index === selectedSkillIndex ? 'selected' : undefined}
                    key={skill.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertSkill(skill)}
                  >
                    <span title={skill.command}>{skill.command}</span>
                    <strong title={skill.label}>{skill.label}</strong>
                    <small title={skill.source ? `${skill.source} - ${skill.description}` : skill.description}>
                      {skill.source ? `${skill.source} - ${skill.description}` : skill.description}
                    </small>
                  </button>
                ))}
              </GlassSuggestionMenu>
            ) : null}
            {showReferenceMenu ? (
              <GlassSuggestionMenu className="agent-reference-context-menu" enabled={nativeMaterial}>
                <div className="agent-skill-menu-meta">
                  <span>
                    {contextQuery ? `${labels.search}: ${contextQuery}` : `${contextSources.length} ${labels.contexts}`}
                  </span>
                </div>
                {matchingSources.map((item, index) => (
                  <button
                    className={index === selectedReferenceIndex ? 'selected' : undefined}
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertContextReference(item)}
                  >
                    <span title={`#${item.title}`}>#{item.title}</span>
                    <strong title={item.type === 'terminal' ? labels.terminal : item.cliId}>
                      {item.type === 'terminal' ? labels.terminal : item.cliId}
                    </strong>
                    <small title={item.type === 'terminal' ? `${labels.terminalTranscript} - ${item.projectPath ?? ''}` : item.projectPath}>
                      {item.type === 'terminal' ? `${labels.terminalTranscript} - ${item.projectPath ?? ''}` : item.projectPath}
                    </small>
                  </button>
                ))}
              </GlassSuggestionMenu>
            ) : null}
            {showSnippetMenu ? (
              <GlassSuggestionMenu className="agent-reference-context-menu agent-snippet-menu" enabled={nativeMaterial}>
                <div className="agent-skill-menu-meta">
                  <span>{snippetQuery ? `${labels.searchInContext}: ${snippetQuery}` : labels.selectFromContext}</span>
                </div>
                {matchingSnippets.map((item, index) => (
                  <button
                    className={index === selectedSnippetIndex ? 'selected' : undefined}
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertContextSnippet(item)}
                  >
                    <span title={`#${item.title}`}>#{item.title}</span>
                    <strong title={item.sourceTitle}>{item.sourceTitle}</strong>
                    <small title={item.body.replace(/\s+/gu, ' ')}>{item.body.replace(/\s+/gu, ' ')}</small>
                  </button>
                ))}
              </GlassSuggestionMenu>
            ) : null}
            {showFileMenu ? (
              <GlassSuggestionMenu className="agent-reference-file-menu" enabled={nativeMaterial}>
                <div className="agent-skill-menu-meta">
                  {browsingFiles ? (
                    <div className="agent-file-breadcrumbs">
                      <button
                        type="button"
                        disabled={!fileBrowsePath}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => setFileBrowsePath(getParentPath(fileBrowsePath, conversation?.projectPath))}
                        aria-label={labels.back}
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span title={fileBrowsePath ?? conversation?.projectPath}>
                        {getBreadcrumbLabel(conversation?.projectPath, fileBrowsePath)}
                      </span>
                      <button
                        className="agent-file-use-current"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={insertCurrentFolderReference}
                      >
                        {labels.use}
                      </button>
                    </div>
                  ) : (
                    <span>{`${labels.search}: ${fileQuery}`}</span>
                  )}
                </div>
                {matchingFiles.map((item, index) => (
                  <button
                    className={index === selectedFileIndex ? 'selected' : undefined}
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => insertFileReference(item, event.ctrlKey || event.metaKey)}
                  >
                    <span title={`@${item.name}`}>@{item.name}</span>
                    <strong title={item.type === 'directory' ? labels.folder : labels.file}>
                      {item.type === 'directory' ? labels.folder : labels.file}
                    </strong>
                    <small title={item.relativePath}>{item.relativePath}</small>
                  </button>
                ))}
              </GlassSuggestionMenu>
            ) : null}
          </div>
          <button type="button" disabled={(!prompt.trim() && attachments.length === 0) || sending || !conversation} onClick={sendPrompt}>
            <SendHorizonal size={15} />
          </button>
        </div>
      </div>
      {previewImage ? (
        <div
          className="agent-image-preview-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={previewImage.name}
          onClick={() => setPreviewImage(null)}
        >
          <div className="agent-image-preview" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="agent-image-preview-close" onClick={() => setPreviewImage(null)} aria-label={labels.previewClose}>
              <X size={16} />
            </button>
            <img alt={previewImage.name} src={previewImage.url} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
