import {
  AvatarPreviewSettings,
  DEFAULT_AVATAR_SETTINGS,
  StudioProjectRecord,
  StudioProjectSummary
} from '../types/studio';
import { DEFAULT_IMAGE_TRANSFORM, ImageTransform, TemplateType, UvIsland } from '../types/uv';
import { validateUvIslands } from './uvEngine';

const DB_NAME = 'heavenly_clothing_studio_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const AUTO_DRAFT_ID = '__auto_draft__';

export interface PortableOutfitSlotFile {
  originalDataUrl: string | null;
  workingDataUrl: string | null;
  transform: ImageTransform;
  projectName?: string;
}

export interface PortableProjectFile {
  format: 'heavenly-clothing-studio-project';
  version: 1 | 2;
  name: string;
  templateType: TemplateType;
  originalDataUrl: string | null;
  workingDataUrl: string | null;
  transform: ImageTransform;
  customShirtIslands?: UvIsland[];
  customPantsIslands?: UvIsland[];
  avatarSettings: AvatarPreviewSettings;
  isOutfitLookbook?: boolean;
  outfitSlots?: Partial<Record<TemplateType, PortableOutfitSlotFile>>;
  createdAt: number;
  updatedAt: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local project database.'));
  });
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Failed to encode canvas snapshot as PNG.'));
      else resolve(blob);
    }, 'image/png');
  });
}

export async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode saved PNG image data.'));
    };
    img.src = url;
  });
}

export async function saveProject(record: StudioProjectRecord): Promise<StudioProjectRecord> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve(record);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save project locally.'));
    };
  });
}

export async function loadProject(id: string): Promise<StudioProjectRecord | null> {
  if (!isIndexedDbAvailable()) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as StudioProjectRecord) || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to read project from local database.'));
    };
  });
}

export async function deleteProject(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to delete project.'));
    };
  });
}

export async function listProjects(): Promise<{
  projects: StudioProjectSummary[];
  hasAutoDraft: boolean;
  autoDraftUpdatedAt: number | null;
}> {
  if (!isIndexedDbAvailable()) {
    return { projects: [], hasAutoDraft: false, autoDraftUpdatedAt: null };
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as StudioProjectRecord[]) || [];
      let hasAutoDraft = false;
      let autoDraftUpdatedAt: number | null = null;
      const projects: StudioProjectSummary[] = [];

      for (const row of rows) {
        if (row.id === AUTO_DRAFT_ID || row.isAutoDraft) {
          hasAutoDraft = true;
          autoDraftUpdatedAt = row.updatedAt;
          continue;
        }
        const blob =
          row.workingBlob ||
          row.originalBlob ||
          row.outfitSlots?.shirt?.workingBlob ||
          row.outfitSlots?.pants?.workingBlob ||
          row.outfitSlots?.tshirt?.workingBlob ||
          null;
        const slotCount = row.outfitSlots
          ? Object.values(row.outfitSlots).filter((s) => Boolean(s?.workingBlob || s?.originalBlob))
              .length
          : 1;
        projects.push({
          id: row.id,
          name: row.name,
          templateType: row.templateType,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          isOutfitLookbook: Boolean(row.isOutfitLookbook),
          outfitSlotCount: slotCount,
          thumbnailUrl: blob ? URL.createObjectURL(blob) : undefined
        });
      }

      projects.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve({ projects, hasAutoDraft, autoDraftUpdatedAt });
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to list saved projects.'));
    };
  });
}

export async function saveAutoDraft(
  record: Omit<StudioProjectRecord, 'id' | 'isAutoDraft'>
): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    await saveProject({
      ...record,
      id: AUTO_DRAFT_ID,
      isAutoDraft: true
    });
  } catch {
    // Non-fatal if storage quota is restricted in private mode
  }
}

export async function loadAutoDraft(): Promise<StudioProjectRecord | null> {
  try {
    return await loadProject(AUTO_DRAFT_ID);
  } catch {
    return null;
  }
}

export async function clearAutoDraft(): Promise<void> {
  try {
    await deleteProject(AUTO_DRAFT_ID);
  } catch {
    // Ignore
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to serialize image blob.'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function serializeProjectToFile(record: StudioProjectRecord): Promise<string> {
  let portableOutfitSlots: Partial<Record<TemplateType, PortableOutfitSlotFile>> | undefined;
  if (record.outfitSlots) {
    portableOutfitSlots = {};
    for (const key of ['shirt', 'pants', 'tshirt'] as TemplateType[]) {
      const slot = record.outfitSlots[key];
      if (!slot) continue;
      portableOutfitSlots[key] = {
        originalDataUrl: slot.originalBlob ? await blobToDataUrl(slot.originalBlob) : null,
        workingDataUrl: slot.workingBlob ? await blobToDataUrl(slot.workingBlob) : null,
        transform: slot.transform || { ...DEFAULT_IMAGE_TRANSFORM },
        projectName: slot.projectName
      };
    }
  }

  const portable: PortableProjectFile = {
    format: 'heavenly-clothing-studio-project',
    version: record.isOutfitLookbook ? 2 : 1,
    name: record.name,
    templateType: record.templateType,
    originalDataUrl: record.originalBlob ? await blobToDataUrl(record.originalBlob) : null,
    workingDataUrl: record.workingBlob ? await blobToDataUrl(record.workingBlob) : null,
    transform: record.transform || { ...DEFAULT_IMAGE_TRANSFORM },
    customShirtIslands: record.customShirtIslands,
    customPantsIslands: record.customPantsIslands,
    avatarSettings: record.avatarSettings || { ...DEFAULT_AVATAR_SETTINGS },
    isOutfitLookbook: Boolean(record.isOutfitLookbook),
    outfitSlots: portableOutfitSlots,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  return JSON.stringify(portable, null, 2);
}

export async function parsePortableProjectFile(jsonText: string): Promise<StudioProjectRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid Heavenly Clothing Studio project file.');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== 'heavenly-clothing-studio-project') {
    throw new Error('Unrecognized project format. Expected a .hcs.json file.');
  }

  const templateType: TemplateType =
    obj.templateType === 'pants' || obj.templateType === 'tshirt' ? obj.templateType : 'shirt';

  const originalBlob =
    typeof obj.originalDataUrl === 'string' && obj.originalDataUrl.startsWith('data:image/')
      ? await dataUrlToBlob(obj.originalDataUrl)
      : null;

  const workingBlob =
    typeof obj.workingDataUrl === 'string' && obj.workingDataUrl.startsWith('data:image/')
      ? await dataUrlToBlob(obj.workingDataUrl)
      : originalBlob;

  const parseTransform = (raw: unknown): ImageTransform => {
    const t = raw as Partial<ImageTransform> | undefined;
    return {
      x: typeof t?.x === 'number' && Number.isFinite(t.x) ? t.x : 0,
      y: typeof t?.y === 'number' && Number.isFinite(t.y) ? t.y : 0,
      scale: typeof t?.scale === 'number' && Number.isFinite(t.scale) && t.scale > 0.1 ? t.scale : 1
    };
  };

  let outfitSlots: StudioProjectRecord['outfitSlots'];
  if (obj.outfitSlots && typeof obj.outfitSlots === 'object') {
    const rawSlots = obj.outfitSlots as Record<string, Partial<PortableOutfitSlotFile> | undefined>;
    outfitSlots = {};
    for (const key of ['shirt', 'pants', 'tshirt'] as TemplateType[]) {
      const s = rawSlots[key];
      if (!s) continue;
      const oBlob =
        typeof s.originalDataUrl === 'string' && s.originalDataUrl.startsWith('data:image/')
          ? await dataUrlToBlob(s.originalDataUrl)
          : null;
      const wBlob =
        typeof s.workingDataUrl === 'string' && s.workingDataUrl.startsWith('data:image/')
          ? await dataUrlToBlob(s.workingDataUrl)
          : oBlob;
      if (oBlob || wBlob) {
        outfitSlots[key] = {
          originalBlob: oBlob,
          workingBlob: wBlob,
          transform: parseTransform(s.transform),
          projectName: typeof s.projectName === 'string' ? s.projectName : undefined
        };
      }
    }
  }

  const now = Date.now();
  return {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported Project',
    templateType,
    originalBlob,
    workingBlob,
    transform: parseTransform(obj.transform),
    customShirtIslands: validateUvIslands(obj.customShirtIslands) || undefined,
    customPantsIslands: validateUvIslands(obj.customPantsIslands) || undefined,
    avatarSettings: {
      ...DEFAULT_AVATAR_SETTINGS,
      ...(typeof obj.avatarSettings === 'object' && obj.avatarSettings
        ? (obj.avatarSettings as Partial<AvatarPreviewSettings>)
        : {})
    },
    isOutfitLookbook: Boolean(obj.isOutfitLookbook && outfitSlots),
    outfitSlots,
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : now,
    updatedAt: now
  };
}
