import type { ReactNode } from 'react';
import { Activity, Bot, FolderGit2, History, Link2, Layers3, Plus, X } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { CliId, CliProfile } from '../../shared/terminal';

interface ContextPanelProps {
  conversation?: ConversationRecord;
  conversationStore: ConversationStore;
  profile?: CliProfile;
  tabTitle: string;
  profileId: CliId;
  projectPath?: string;
  labels: {
    noProject: string;
    shellSession: string;
    terminalTab: string;
    session: string;
    project: string;
    agent: string;
    profile: string;
    mode: string;
    sessionId: string;
    context: string;
    messages: string;
    runs: string;
    noRuns: string;
    prompt: string;
    statuses: Record<string, string>;
    modes: Record<string, string>;
  };
  onStoreChange: (store: ConversationStore) => void;
}

function basename(path: string | undefined, fallback: string): string {
  if (!path) return fallback;
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function formatDuration(value: number | undefined): string {
  if (!value) return '-';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function ContextPanel({
  conversation,
  conversationStore,
  profile,
  tabTitle,
  profileId,
  projectPath,
  labels,
  onStoreChange
}: ContextPanelProps): ReactNode {
  const messages = conversation?.messages ?? [];
  const runs = conversation?.runs ?? [];
  const latestRun = runs.at(-1);
  const activeProjectPath = conversation?.projectPath ?? projectPath;
  const linkedConversations = (conversation?.linkedConversationIds ?? [])
    .map((id) => conversationStore.conversations.find((item) => item.id === id))
    .filter((item): item is ConversationRecord => Boolean(item));
  const linkableConversations = conversationStore.conversations.filter(
    (item) => item.id !== conversation?.id && !(conversation?.linkedConversationIds ?? []).includes(item.id)
  );

  function setLinkedConversationIds(ids: string[]): void {
    if (!conversation) return;
    void window.conversationApi
      .update({
        id: conversation.id,
        linkedConversationIds: ids
      })
      .then(onStoreChange)
      .catch((error: unknown) => console.error(error));
  }

  function addLinkedConversation(id: string): void {
    setLinkedConversationIds(Array.from(new Set([...(conversation?.linkedConversationIds ?? []), id])).slice(0, 8));
  }

  function removeLinkedConversation(id: string): void {
    setLinkedConversationIds((conversation?.linkedConversationIds ?? []).filter((item) => item !== id));
  }

  return (
    <aside className="context-panel">
      <section className="context-section context-session">
        <div className="context-section-title">
          <Layers3 size={14} />
          <span>{labels.session}</span>
        </div>
        <strong>{conversation?.title ?? tabTitle}</strong>
        <small>{conversation?.id ?? labels.terminalTab}</small>
      </section>

      <section className="context-section">
        <div className="context-section-title">
          <FolderGit2 size={14} />
          <span>{labels.project}</span>
        </div>
        <strong>{basename(activeProjectPath, labels.noProject)}</strong>
        <small>{activeProjectPath ?? labels.shellSession}</small>
      </section>

      {conversation ? (
        <section className="context-section context-links">
          <div className="context-section-title">
            <Link2 size={14} />
            <span>Linked</span>
          </div>
          {linkedConversations.length === 0 ? <small>No linked conversations</small> : null}
          {linkedConversations.map((item) => (
            <article className="context-link" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{basename(item.projectPath, item.projectPath)}</small>
              </span>
              <button type="button" onClick={() => removeLinkedConversation(item.id)} aria-label={`Unlink ${item.title}`}>
                <X size={12} />
              </button>
            </article>
          ))}
          {linkableConversations.length ? (
            <div className="context-link-add">
              <Plus size={12} />
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value) addLinkedConversation(event.target.value);
                }}
              >
                <option value="">Link conversation</option>
                {linkableConversations.slice(0, 80).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} - {basename(item.projectPath, item.projectPath)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="context-section">
        <div className="context-section-title">
          <Bot size={14} />
          <span>{labels.agent}</span>
        </div>
        <div className="context-kv">
          <span>{labels.profile}</span>
          <b>{profile?.name ?? profileId}</b>
        </div>
        <div className="context-kv">
          <span>{labels.mode}</span>
          <b>{labels.modes[conversation?.mode ?? 'pty'] ?? conversation?.mode ?? 'pty'}</b>
        </div>
        <div className="context-kv">
          <span>{labels.sessionId}</span>
          <b>{conversation?.sessionId ?? '-'}</b>
        </div>
      </section>

      <section className="context-section">
        <div className="context-section-title">
          <Activity size={14} />
          <span>{labels.context}</span>
        </div>
        <div className="context-meter">
          <span style={{ width: `${Math.min(100, messages.length * 8)}%` }} />
        </div>
        <div className="context-kv">
          <span>{labels.messages}</span>
          <b>{messages.length}</b>
        </div>
        <div className="context-kv">
          <span>{labels.runs}</span>
          <b>{runs.length}</b>
        </div>
      </section>

      <section className="context-section context-runs">
        <div className="context-section-title">
          <History size={14} />
          <span>{labels.runs}</span>
        </div>
        {runs.length === 0 ? <small>{labels.noRuns}</small> : null}
        {runs.slice(-5).reverse().map((run) => (
          <article className={`context-run ${run.status}`} key={run.id}>
            <span>{labels.statuses[run.status] ?? run.status}</span>
            <strong>{run.prompt || labels.prompt}</strong>
            <small>{formatDuration(run.durationMs)}</small>
          </article>
        ))}
        {latestRun?.error ? <p className="context-error">{latestRun.error}</p> : null}
      </section>
    </aside>
  );
}
