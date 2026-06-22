import { constants } from 'node:fs';
import { access, cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, dialog, ipcMain } from 'electron';
import { codexPetActions, codexPetAtlas } from '../shared/desktopPetAsset';
import type {
  CodexPetManifest,
  DesktopPetAction,
  DesktopPetActionName,
  DesktopPetAsset,
  DesktopPetAtlas,
  DesktopPetImportResult
} from '../shared/desktopPetAsset';

const codexPetsRoot = join(homedir(), '.codex', 'pets');
const importedPetsRoot = join(app.getPath('userData'), 'pets');

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitizeManifest(value: unknown): CodexPetManifest | null {
  const manifest = value as Partial<CodexPetManifest> | null;
  if (!isString(manifest?.id) || !isString(manifest?.displayName) || !isString(manifest?.spritesheetPath)) {
    return null;
  }

  return {
    id: manifest.id.trim(),
    displayName: manifest.displayName.trim(),
    description: isString(manifest.description) ? manifest.description.trim() : undefined,
    spritesheetPath: manifest.spritesheetPath.trim(),
    kind: isString(manifest.kind) ? manifest.kind.trim() : undefined,
    atlas: sanitizeAtlas(manifest.atlas),
    actions: sanitizeActions(manifest.actions)
  };
}

function sanitizeAtlas(value: unknown): DesktopPetAtlas | undefined {
  const atlas = value as Partial<DesktopPetAtlas> | null;
  if (
    typeof atlas?.columns !== 'number' ||
    typeof atlas?.rows !== 'number' ||
    typeof atlas?.cellWidth !== 'number' ||
    typeof atlas?.cellHeight !== 'number'
  ) {
    return undefined;
  }

  return {
    columns: Math.max(1, Math.round(atlas.columns)),
    rows: Math.max(1, Math.round(atlas.rows)),
    cellWidth: Math.max(1, Math.round(atlas.cellWidth)),
    cellHeight: Math.max(1, Math.round(atlas.cellHeight))
  };
}

function sanitizeActions(value: unknown): Partial<Record<DesktopPetActionName, DesktopPetAction>> | undefined {
  const actions = value as Partial<Record<DesktopPetActionName, Partial<DesktopPetAction>>> | null;
  if (!actions || typeof actions !== 'object') return undefined;

  return Object.entries(actions).reduce<Partial<Record<DesktopPetActionName, DesktopPetAction>>>(
    (items, [name, action]) => {
      if (
        !action ||
        typeof action.row !== 'number' ||
        typeof action.frames !== 'number' ||
        !(name in codexPetActions)
      ) {
        return items;
      }

      items[name as DesktopPetActionName] = {
        row: Math.max(0, Math.round(action.row)),
        frames: Math.max(1, Math.round(action.frames)),
        fps: typeof action.fps === 'number' ? Math.max(1, Math.round(action.fps)) : undefined
      };
      return items;
    },
    {}
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readWebpSize(bytes: Buffer): { width?: number; height?: number } {
  const signature = bytes.toString('latin1', 0, 12);
  if (!signature.startsWith('RIFF') || !signature.endsWith('WEBP')) return {};

  let offset = 12;
  while (offset + 8 < bytes.length) {
    const chunkType = bytes.toString('latin1', offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 'VP8X' && dataOffset + 10 <= bytes.length) {
      return {
        width: 1 + bytes[dataOffset + 4] + (bytes[dataOffset + 5] << 8) + (bytes[dataOffset + 6] << 16),
        height: 1 + bytes[dataOffset + 7] + (bytes[dataOffset + 8] << 8) + (bytes[dataOffset + 9] << 16)
      };
    }

    if (chunkType === 'VP8L' && dataOffset + 5 <= bytes.length) {
      const bits =
        bytes[dataOffset + 1] |
        (bytes[dataOffset + 2] << 8) |
        (bytes[dataOffset + 3] << 16) |
        (bytes[dataOffset + 4] << 24);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1
      };
    }

    offset += 8 + chunkLength + (chunkLength % 2);
  }

  return {};
}

async function readPetAsset(directory: string, source: DesktopPetAsset['source']): Promise<DesktopPetAsset | null> {
  const manifestPath = join(directory, 'pet.json');
  try {
    const manifest = sanitizeManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    if (!manifest) return null;

    const spritesheetPath = resolve(directory, manifest.spritesheetPath);
    if (!spritesheetPath.startsWith(resolve(directory)) || !(await pathExists(spritesheetPath))) return null;
    const spritesheetBytes = await readFile(spritesheetPath);
    const spritesheetSize = readWebpSize(spritesheetBytes);
    const extension = spritesheetPath.toLowerCase().split('.').pop();
    const mimeType = extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/webp';

    return {
      id: manifest.id,
      displayName: manifest.displayName,
      description: manifest.description,
      kind: manifest.kind,
      directory,
      manifestPath,
      spritesheetPath,
      spritesheetUrl: pathToFileURL(spritesheetPath).toString(),
      spritesheetDataUrl: `data:${mimeType};base64,${spritesheetBytes.toString('base64')}`,
      spritesheetWidth: spritesheetSize.width,
      spritesheetHeight: spritesheetSize.height,
      atlas: manifest.atlas ?? codexPetAtlas,
      actions: { ...codexPetActions, ...(manifest.actions ?? {}) },
      source
    };
  } catch {
    return null;
  }
}

async function listAssetsInRoot(root: string, source: DesktopPetAsset['source']): Promise<DesktopPetAsset[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const assets = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => readPetAsset(join(root, entry.name), source))
    );
    return assets.filter((asset): asset is DesktopPetAsset => Boolean(asset));
  } catch {
    return [];
  }
}

export async function listDesktopPetAssets(): Promise<DesktopPetAsset[]> {
  const [importedAssets, codexAssets] = await Promise.all([
    listAssetsInRoot(importedPetsRoot, 'imported'),
    listAssetsInRoot(codexPetsRoot, 'codex')
  ]);
  const seen = new Set<string>();
  return [...importedAssets, ...codexAssets].filter((asset) => {
    if (seen.has(asset.manifestPath)) return false;
    seen.add(asset.manifestPath);
    return true;
  });
}

export async function resolveDesktopPetAsset(manifestPath?: string): Promise<DesktopPetAsset | null> {
  if (!manifestPath) return null;
  return readPetAsset(dirname(manifestPath), 'external');
}

async function importDesktopPetAsset(directory: string): Promise<DesktopPetImportResult> {
  const asset = await readPetAsset(directory, 'external');
  if (!asset) return { ok: false, error: 'Invalid Codex pet folder' };

  const targetDirectory = join(importedPetsRoot, asset.id || basename(directory));
  await mkdir(importedPetsRoot, { recursive: true });
  await rm(targetDirectory, { force: true, recursive: true });
  await cp(directory, targetDirectory, { recursive: true });

  const importedAsset = await readPetAsset(targetDirectory, 'imported');
  if (!importedAsset) return { ok: false, error: 'Imported pet could not be loaded' };
  return { ok: true, asset: importedAsset };
}

export function registerDesktopPetIpc(): void {
  ipcMain.handle('pet:list-assets', () => listDesktopPetAssets());
  ipcMain.handle('pet:resolve-asset', (_event, manifestPath?: string) => resolveDesktopPetAsset(manifestPath));
  ipcMain.handle('pet:import-asset', async (): Promise<DesktopPetImportResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Import desktop pet',
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    return importDesktopPetAsset(result.filePaths[0]);
  });
}
