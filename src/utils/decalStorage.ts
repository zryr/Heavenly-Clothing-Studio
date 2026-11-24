import { SavedDecalPreset } from '../types/studio';

const DB_NAME = 'heavenly_decal_presets_v1';
const DB_VERSION = 1;
const STORE_NAME = 'decal_presets';
const FALLBACK_KEY = 'heavenly_decal_presets_fallback_v1';

function openDecalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open Decal DB'));
  });
}

function readFallback(): SavedDecalPreset[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback(items: SavedDecalPreset[]): void {
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota errors on fallback
  }
}

export async function listDecalPresets(): Promise<SavedDecalPreset[]> {
  try {
    const db = await openDecalDb();
    return await new Promise<SavedDecalPreset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const items = (req.result as SavedDecalPreset[]) || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return readFallback().sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function saveDecalPreset(preset: SavedDecalPreset): Promise<void> {
  try {
    const db = await openDecalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(preset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = readFallback().filter((p) => p.id !== preset.id);
    writeFallback([preset, ...existing]);
  }
}

export async function deleteDecalPreset(id: string): Promise<void> {
  try {
    const db = await openDecalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    writeFallback(readFallback().filter((p) => p.id !== id));
  }
}
