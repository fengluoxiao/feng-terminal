import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Bot, CheckCircle2, LoaderCircle, MessageCircle } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { DesktopPetStatus } from '../../shared/desktopPet';
import type { DesktopPetActionName, DesktopPetAsset } from '../../shared/desktopPetAsset';

const emptyStore: ConversationStore = {
  conversations: [],
  recentProjectPaths: []
};

function getProjectName(conversation: ConversationRecord | undefined): string {
  if (!conversation) return 'Agent';
  return conversation.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? conversation.title;
}

function getPetStatus(conversation: ConversationRecord | undefined): DesktopPetStatus {
  const latestMessage = conversation?.messages?.at(-1);
  const latestRun = conversation?.runs?.at(-1);
  if (latestMessage?.status === 'running' || latestRun?.status === 'running') return 'running';
  if (latestMessage?.status === 'error' || latestRun?.status === 'error') return 'error';
  if (latestMessage || latestRun) return 'done';
  return 'idle';
}

function getStatusText(status: DesktopPetStatus): string {
  if (status === 'running') return '思考中';
  if (status === 'error') return '需要处理';
  if (status === 'done') return '已就绪';
  return '待命';
}

function StatusIcon({ status }: { status: DesktopPetStatus }): ReactNode {
  if (status === 'running') return <LoaderCircle size={13} />;
  if (status === 'error') return <AlertCircle size={13} />;
  if (status === 'done') return <CheckCircle2 size={13} />;
  return <MessageCircle size={13} />;
}

function getActionName(status: DesktopPetStatus, transientAction: DesktopPetActionName | null): DesktopPetActionName {
  if (transientAction) return transientAction;
  if (status === 'running') return 'running';
  if (status === 'error') return 'failed';
  if (status === 'done') return 'review';
  return 'idle';
}

export function DesktopPet(): ReactNode {
  const [store, setStore] = useState<ConversationStore>(emptyStore);
  const [asset, setAsset] = useState<DesktopPetAsset | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [transientAction, setTransientAction] = useState<DesktopPetActionName | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const displayFrameWidth = 112;
  const displayFrameHeight = 121;

  useEffect(() => {
    void window.conversationApi.list().then(setStore);
    void window.settingsApi
      .load()
      .then((settings) => window.petApi.resolveAsset(settings.desktopPetAssetPath))
      .then(setAsset);
    return window.agentApi.onUpdate((event) => setStore(event.store));
  }, []);

  const conversation = useMemo(
    () => [...store.conversations].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))[0],
    [store.conversations]
  );
  const status = getPetStatus(conversation);
  const latestText = conversation?.messages?.filter((message) => message.role === 'assistant').at(-1)?.content;
  const actionName = getActionName(status, transientAction);
  const atlas = asset?.atlas;
  const action = asset?.actions[actionName];
  const frameDuration = Math.round(1000 / (action?.fps ?? 5));

  useEffect(() => {
    setImageFailed(false);
  }, [asset?.spritesheetUrl]);

  useEffect(() => {
    setFrameIndex(0);
  }, [actionName, asset?.id]);

  useEffect(() => {
    if (!action || action.frames <= 1) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % action.frames);
    }, frameDuration);
    return () => window.clearInterval(timer);
  }, [action?.frames, frameDuration]);

  useEffect(() => {
    if (!transientAction) return undefined;
    const timer = window.setTimeout(() => setTransientAction(null), 900);
    return () => window.clearTimeout(timer);
  }, [transientAction]);

  function wakeMainWindow(): void {
    setTransientAction(status === 'idle' ? 'waving' : 'jumping');
    void window.petApi.focusMain();
  }

  return (
    <main className={`desktop-pet desktop-pet-${status}`} onDoubleClick={wakeMainWindow}>
      <button className="desktop-pet-hit-area" type="button" aria-label="Open app" onClick={wakeMainWindow}>
        {asset && !imageFailed ? (
          <>
            <img
              className="desktop-pet-loader"
              alt=""
              src={asset.spritesheetDataUrl}
              onError={() => setImageFailed(true)}
            />
            <span
              className="desktop-pet-sprite"
              aria-hidden="true"
              style={{
                width: `${displayFrameWidth}px`,
                height: `${displayFrameHeight}px`,
                backgroundImage: `url("${asset.spritesheetDataUrl}")`,
                backgroundSize: `${(atlas?.columns ?? 8) * displayFrameWidth}px ${(atlas?.rows ?? 9) * displayFrameHeight}px`,
                backgroundPosition: `${-frameIndex * displayFrameWidth}px ${-(action?.row ?? 0) * displayFrameHeight}px`
              }}
            />
          </>
        ) : (
          <span className="desktop-pet-fallback">
            <Bot size={34} />
          </span>
        )}
        <span className="desktop-pet-status">
          <StatusIcon status={status} />
          {getStatusText(status)}
        </span>
        <strong>{getProjectName(conversation)}</strong>
        <small>{latestText || asset?.displayName || '双击回到应用'}</small>
      </button>
    </main>
  );
}
