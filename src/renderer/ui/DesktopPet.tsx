import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { AlertCircle, Bot, CheckCircle2, LoaderCircle, MessageCircle } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { DesktopPetStatus } from '../../shared/desktopPet';
import type { DesktopPetActionName, DesktopPetAsset } from '../../shared/desktopPetAsset';
import type { AppSettings } from '../../shared/settings';

interface DesktopPetProps {
  embedded?: boolean;
  settings?: AppSettings;
  onScaleChange?: (scale: number) => void;
}

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
  return 'idle';
}

export function DesktopPet({ embedded = false, settings: externalSettings, onScaleChange }: DesktopPetProps = {}): ReactNode {
  const [store, setStore] = useState<ConversationStore>(emptyStore);
  const [asset, setAsset] = useState<DesktopPetAsset | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [transientAction, setTransientAction] = useState<DesktopPetActionName | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [spriteFrameUrl, setSpriteFrameUrl] = useState<string | null>(null);
  const [petScale, setPetScale] = useState(1);
  const displayFrameWidth = Math.round(112 * petScale);
  const displayFrameHeight = Math.round(121 * petScale);
  const hitAreaWidth = Math.round(148 * petScale);
  const hitAreaHeight = Math.round(190 * petScale);
  const spriteOffsetY = Math.round(-13 * petScale);
  const statusBottom = Math.round(30 * petScale);
  const titleBottom = Math.round(14 * petScale);
  const statusFontSize = Math.max(9, Math.round(11 * petScale));
  const titleFontSize = Math.max(10, Math.round(12 * petScale));

  useEffect(() => {
    void window.conversationApi.list().then(setStore);
    if (embedded) return window.agentApi.onUpdate((event) => setStore(event.store));
    void window.settingsApi
      .load()
      .then((settings: AppSettings) => {
        setPetScale(settings.desktopPetScale);
        return window.petApi.resolveAsset(settings.desktopPetAssetPath);
      })
      .then(setAsset);
    return window.agentApi.onUpdate((event) => setStore(event.store));
  }, [embedded]);

  useEffect(() => {
    if (!externalSettings) return;
    setPetScale(externalSettings.desktopPetScale);
    void window.petApi.resolveAsset(externalSettings.desktopPetAssetPath).then(setAsset);
  }, [externalSettings?.desktopPetAssetPath, externalSettings?.desktopPetScale]);

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
    setSpriteFrameUrl(null);
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
    const timer = window.setTimeout(() => setTransientAction(null), 650);
    return () => window.clearTimeout(timer);
  }, [transientAction]);

  useEffect(() => {
    if (!asset || imageFailed) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = asset.atlas.cellWidth;
    canvas.height = asset.atlas.cellHeight;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      context.clearRect(0, 0, asset.atlas.cellWidth, asset.atlas.cellHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        frameIndex * asset.atlas.cellWidth,
        (action?.row ?? 0) * asset.atlas.cellHeight,
        asset.atlas.cellWidth,
        asset.atlas.cellHeight,
        0,
        0,
        asset.atlas.cellWidth,
        asset.atlas.cellHeight
      );
      setSpriteFrameUrl(canvas.toDataURL('image/png'));
    };
    image.onerror = () => setImageFailed(true);
    image.src = asset.spritesheetDataUrl;

    return () => {
      cancelled = true;
    };
  }, [action?.row, asset, frameIndex, imageFailed]);

  function wakeMainWindow(): void {
    setTransientAction(status === 'idle' ? 'waving' : 'jumping');
  }

  function resizePet(scale: number, persist = false): void {
    const nextScale = Math.min(2, Math.max(0.5, Math.round(scale * 100) / 100));
    setPetScale(nextScale);
    if (embedded) {
      if (persist) onScaleChange?.(nextScale);
      return;
    }
    if (persist) {
      void window.petApi.resize(nextScale, true).then((settings) => {
        setPetScale(settings.desktopPetScale);
      });
      return;
    }
    void window.petApi.resize(nextScale, false);
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startScale = petScale;
    const baseSize = 202;

    function onPointerMove(moveEvent: PointerEvent): void {
      const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY);
      resizePet(startScale + delta / baseSize);
    }

    function onPointerUp(upEvent: PointerEvent): void {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const delta = Math.max(upEvent.clientX - startX, upEvent.clientY - startY);
      resizePet(startScale + delta / baseSize, true);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  return (
    <main className={`desktop-pet desktop-pet-${status}${embedded ? ' desktop-pet-embedded' : ''}`} onDoubleClick={wakeMainWindow}>
      <div
        className="desktop-pet-hit-area"
        role="button"
        tabIndex={0}
        aria-label="Open app"
        style={{ width: `${hitAreaWidth}px`, height: `${hitAreaHeight}px` }}
        onClick={(event) => {
          if (event.currentTarget.dataset.dragged === 'true') return;
          wakeMainWindow();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            wakeMainWindow();
          }
        }}
      >
        {asset && !imageFailed ? (
          <>
            {spriteFrameUrl ? (
              <img
                className="desktop-pet-sprite"
                alt=""
                aria-hidden="true"
                src={spriteFrameUrl}
                onError={() => setImageFailed(true)}
                style={{
                  width: `${displayFrameWidth}px`,
                  height: `${displayFrameHeight}px`,
                  transform: `translateY(${spriteOffsetY}px)`
                }}
              />
            ) : null}
          </>
        ) : (
          <span className="desktop-pet-fallback">
            <Bot size={34} />
          </span>
        )}
        <span
          className="desktop-pet-status"
          style={{ bottom: `${statusBottom}px`, fontSize: `${statusFontSize}px` }}
        >
          <StatusIcon status={status} />
          {getStatusText(status)}
        </span>
        <strong style={{ bottom: `${titleBottom}px`, fontSize: `${titleFontSize}px` }}>{getProjectName(conversation)}</strong>
        <small>{latestText || asset?.displayName || '双击回到应用'}</small>
      </div>
      <button
        className="desktop-pet-resize-handle"
        type="button"
        aria-label="调整桌宠大小"
        title="拖动调整大小"
        onPointerDown={startResize}
      />
    </main>
  );
}
