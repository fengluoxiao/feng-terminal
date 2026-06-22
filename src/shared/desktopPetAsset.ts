export interface CodexPetManifest {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  kind?: string;
  atlas?: DesktopPetAtlas;
  actions?: Partial<Record<DesktopPetActionName, DesktopPetAction>>;
}

export type DesktopPetActionName =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

export interface DesktopPetAtlas {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
}

export interface DesktopPetAction {
  row: number;
  frames: number;
  fps?: number;
}

export interface DesktopPetAsset {
  id: string;
  displayName: string;
  description?: string;
  kind?: string;
  directory: string;
  manifestPath: string;
  spritesheetPath: string;
  spritesheetUrl: string;
  spritesheetDataUrl: string;
  spritesheetWidth?: number;
  spritesheetHeight?: number;
  atlas: DesktopPetAtlas;
  actions: Record<DesktopPetActionName, DesktopPetAction>;
  source: 'codex' | 'imported' | 'external';
}

export interface DesktopPetImportResult {
  ok: boolean;
  asset?: DesktopPetAsset;
  error?: string;
}

export const codexPetAtlas: DesktopPetAtlas = {
  columns: 8,
  rows: 9,
  cellWidth: 192,
  cellHeight: 208
};

export const codexPetActions: Record<DesktopPetActionName, DesktopPetAction> = {
  idle: { row: 0, frames: 6, fps: 4 },
  'running-right': { row: 1, frames: 8, fps: 10 },
  'running-left': { row: 2, frames: 8, fps: 10 },
  waving: { row: 3, frames: 4, fps: 6 },
  jumping: { row: 4, frames: 5, fps: 7 },
  failed: { row: 5, frames: 8, fps: 6 },
  waiting: { row: 6, frames: 6, fps: 5 },
  running: { row: 7, frames: 6, fps: 8 },
  review: { row: 8, frames: 6, fps: 5 }
};
