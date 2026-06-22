import { useEffect, useMemo, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { AlertCircle, Bot, CheckCircle2, LoaderCircle, MessageCircle } from 'lucide-react';
import type { ConversationRecord, ConversationStore } from '../../shared/conversation';
import type { DesktopPetStatus } from '../../shared/desktopPet';
import type { DesktopPetActionName, DesktopPetAsset } from '../../shared/desktopPetAsset';
import type { AppSettings } from '../../shared/settings';

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

export function DesktopPet(): ReactNode {
  const [store, setStore] = useState<ConversationStore>(emptyStore);
  const [asset, setAsset] = useState<DesktopPetAsset | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [transientAction, setTransientAction] = useState<DesktopPetActionName | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [processedSpritesheetUrl, setProcessedSpritesheetUrl] = useState<string | null>(null);
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
    void window.settingsApi
      .load()
      .then((settings: AppSettings) => {
        setPetScale(settings.desktopPetScale);
        return window.petApi.resolveAsset(settings.desktopPetAssetPath);
      })
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
    setProcessedSpritesheetUrl(null);
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

  function wakeMainWindow(): void {
    setTransientAction(status === 'idle' ? 'waving' : 'jumping');
    void window.petApi.focusMain();
  }

  function removeConnectedCellBackground(event: SyntheticEvent<HTMLImageElement>): void {
    if (!asset) return;

    const image = event.currentTarget;
    const atlasColumns = asset.atlas.columns;
    const atlasRows = asset.atlas.rows;
    const cellWidth = asset.atlas.cellWidth;
    const cellHeight = asset.atlas.cellHeight;
    const width = atlasColumns * cellWidth;
    const height = atlasRows * cellHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const tolerance = 42;

    function colorDistanceSquared(pixelIndex: number, color: [number, number, number]): number {
      const dataIndex = pixelIndex * 4;
      const red = data[dataIndex] - color[0];
      const green = data[dataIndex + 1] - color[1];
      const blue = data[dataIndex + 2] - color[2];
      return red * red + green * green + blue * blue;
    }

    function flood(seedX: number, seedY: number): void {
      if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return;
      const seedIndex = seedY * width + seedX;
      if (visited[seedIndex]) return;

      const seedDataIndex = seedIndex * 4;
      if (data[seedDataIndex + 3] < 8) {
        visited[seedIndex] = 1;
        return;
      }

      const seedColor: [number, number, number] = [
        data[seedDataIndex],
        data[seedDataIndex + 1],
        data[seedDataIndex + 2]
      ];
      const threshold = tolerance * tolerance;
      let head = 0;
      let tail = 0;
      queue[tail++] = seedIndex;
      visited[seedIndex] = 1;

      while (head < tail) {
        const index = queue[head++];
        if (colorDistanceSquared(index, seedColor) > threshold) continue;

        data[index * 4 + 3] = 0;
        const x = index % width;
        const y = Math.floor(index / width);
        const neighbors = [index - 1, index + 1, index - width, index + width];

        for (const nextIndex of neighbors) {
          if (nextIndex < 0 || nextIndex >= visited.length || visited[nextIndex]) continue;
          const nextX = nextIndex % width;
          const nextY = Math.floor(nextIndex / width);
          if (Math.abs(nextX - x) + Math.abs(nextY - y) !== 1) continue;
          visited[nextIndex] = 1;
          queue[tail++] = nextIndex;
        }
      }
    }

    for (let row = 0; row < atlasRows; row += 1) {
      for (let column = 0; column < atlasColumns; column += 1) {
        const left = column * cellWidth;
        const top = row * cellHeight;
        const right = left + cellWidth - 1;
        const bottom = top + cellHeight - 1;

        for (let x = left; x <= right; x += 1) {
          flood(x, top);
          flood(x, bottom);
        }

        for (let y = top; y <= bottom; y += 1) {
          flood(left, y);
          flood(right, y);
        }
      }
    }

    context.putImageData(imageData, 0, 0);
    setProcessedSpritesheetUrl(canvas.toDataURL('image/png'));
  }

  return (
    <main className={`desktop-pet desktop-pet-${status}`} onDoubleClick={wakeMainWindow}>
      <button
        className="desktop-pet-hit-area"
        type="button"
        aria-label="Open app"
        style={{ width: `${hitAreaWidth}px`, height: `${hitAreaHeight}px` }}
        onClick={wakeMainWindow}
      >
        {asset && !imageFailed ? (
          <>
            <img
              className="desktop-pet-loader"
              alt=""
              src={asset.spritesheetDataUrl}
              onLoad={removeConnectedCellBackground}
              onError={() => setImageFailed(true)}
            />
            <span
              className="desktop-pet-sprite"
              aria-hidden="true"
              style={{
                width: `${displayFrameWidth}px`,
                height: `${displayFrameHeight}px`,
                backgroundImage: `url("${processedSpritesheetUrl ?? asset.spritesheetDataUrl}")`,
                backgroundSize: `${(atlas?.columns ?? 8) * displayFrameWidth}px ${(atlas?.rows ?? 9) * displayFrameHeight}px`,
                backgroundPosition: `${-frameIndex * displayFrameWidth}px ${-(action?.row ?? 0) * displayFrameHeight}px`,
                transform: `translateY(${spriteOffsetY}px)`
              }}
            />
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
      </button>
    </main>
  );
}
