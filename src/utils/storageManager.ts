import { Sheet } from '../types/spreadsheet';
import { RelationEdge } from '../types/relations';
import { createEmptySheet } from '../data/sampleDatasets';

/**
 * Primeira abertura: o sistema vem vazio (sem planilha de exemplo). Daí em diante o trabalho do usuário
 * é guardado no navegador e volta ao atualizar a página.
 */
export const EMPTY_SHEET_ID = 'sheet-1';
export const EMPTY_SHEET_NAME = 'Tabela 1';

/** Planilha em branco (sem nenhum dado) usada como ponto de partida. */
export function createBlankWorkspace(): Sheet[] {
  return [createEmptySheet(EMPTY_SHEET_ID, EMPTY_SHEET_NAME)];
}

const DB_NAME = 'NocoDB_Excel_Storage_v2';
const DB_VERSION = 1;
const STORE_NAME = 'sheets_store';

const LOCAL_STORAGE_SHEETS_KEY = 'nocodb_persisted_sheets_v2';
const LOCAL_STORAGE_SNAPSHOT_AT_KEY = 'nocodb_persisted_sheets_at_v2';
const LOCAL_STORAGE_LATEST_AT_KEY = 'nocodb_latest_save_at_v2';
const LOCAL_STORAGE_ACTIVE_SHEET_KEY = 'nocodb_active_sheet_id_v2';
const LOCAL_STORAGE_STARRED_KEY = 'nocodb_starred_sheet_ids_v2';
const LOCAL_STORAGE_EDGES_KEY = 'nocodb_relations_edges_v2';
const LOCAL_STORAGE_PREFS_KEY = 'nocodb_user_prefs_v2';

export interface UserPreferences {
  showGridlines?: boolean;
  showFormulaBar?: boolean;
  zoomLevel?: number;
  isSidebarOpen?: boolean;
}

/**
 * Open or create native browser IndexedDB for unlimited, non-blocking storage
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Synchronous initial sheet loader for instantaneous initial paint without flickering
 */
export function loadInitialSheetsSync(): Sheet[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_SHEETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedFromSnapshot = true;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read sheets from localStorage:', err);
  }

  return createBlankWorkspace();
}

/** Carimbo de quando um conjunto de planilhas foi guardado: decide qual cópia (localStorage ou IndexedDB) é a mais nova. */
function readStamp(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Lê o IndexedDB e devolve as planilhas só se forem MAIS NOVAS que a cópia já carregada do localStorage.
 * Devolve null quando a cópia atual já é a mais recente (ou não há nada guardado).
 */
export async function loadSheetsFromStorageAsync(): Promise<Sheet[] | null> {
  try {
    const db = await openDB();
    return await new Promise<Sheet[] | null>(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const sheetsReq = store.get('current_sheets');
      const stampReq = store.get('saved_at');
      tx.oncomplete = () => {
        const stored = sheetsReq.result;
        if (!Array.isArray(stored) || stored.length === 0) return resolve(null);
        const idbStamp = Number(stampReq.result) || 0;
        const lsStamp = readStamp(LOCAL_STORAGE_SNAPSHOT_AT_KEY);
        const legacy = idbStamp === 0 && lsStamp === 0; // gravado antes dos carimbos: o IndexedDB é a cópia completa
        resolve(idbStamp > lsStamp || legacy || !loadedFromSnapshot ? stored : null);
      };
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let loadedFromSnapshot = false;

/**
 * Persists sheets dataset into both IndexedDB (full size) and localStorage (fast snapshot).
 * Se o localStorage estourar a cota, a cópia antiga é APAGADA: uma cópia velha nunca pode voltar no lugar da nova.
 */
export async function saveSheetsToStorage(sheets: Sheet[]): Promise<void> {
  if (!sheets || sheets.length === 0) return;
  const stamp = String(Date.now());

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_LATEST_AT_KEY, stamp);
      try {
        localStorage.setItem(LOCAL_STORAGE_SHEETS_KEY, JSON.stringify(sheets));
        localStorage.setItem(LOCAL_STORAGE_SNAPSHOT_AT_KEY, stamp);
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_SHEETS_KEY);
        localStorage.removeItem(LOCAL_STORAGE_SNAPSHOT_AT_KEY);
      }
    }
  } catch {
    // Sem localStorage: o IndexedDB guarda tudo.
  }

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(sheets, 'current_sheets');
      store.put(Number(stamp), 'saved_at');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Error persisting sheets to IndexedDB:', err);
  }
}

/**
 * Persist and load active sheet ID
 */
export function saveActiveSheetId(sheetId: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_SHEET_KEY, sheetId);
    }
  } catch {}
}

export function loadActiveSheetId(availableSheets: Sheet[]): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LOCAL_STORAGE_ACTIVE_SHEET_KEY);
      if (saved && availableSheets.some(s => s.id === saved)) {
        return saved;
      }
    }
  } catch {}
  return availableSheets[0]?.id || 'sheet-1';
}

/**
 * Persist and load Starred Sheet IDs
 */
export function saveStarredSheets(starred: Set<string>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_STARRED_KEY, JSON.stringify(Array.from(starred)));
    }
  } catch {}
}

export function loadStarredSheets(): Set<string> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_STARRED_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    }
  } catch {}
  return new Set();
}

/**
 * Persist and load Relation Edges (Node graph connections)
 */
export function saveRelationEdges(edges: RelationEdge[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_EDGES_KEY, JSON.stringify(edges));
    }
  } catch {}
}

export function loadRelationEdges(): RelationEdge[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_EDGES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    }
  } catch {}
  return [];
}

/**
 * Persist and load User View Preferences (Gridlines, Formula bar, Zoom, Sidebar)
 */
export function saveUserPreferences(prefs: UserPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_PREFS_KEY, JSON.stringify(prefs));
    }
  } catch {}
}

export function loadUserPreferences(): UserPreferences {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_PREFS_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch {}
  return {
    showGridlines: true,
    showFormulaBar: true,
    zoomLevel: 100,
    isSidebarOpen: true,
  };
}

/**
 * Clear all stored data and reset to default factory state
 */
export async function clearAllStoredData(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_SHEETS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_ACTIVE_SHEET_KEY);
      localStorage.removeItem(LOCAL_STORAGE_STARRED_KEY);
      localStorage.removeItem(LOCAL_STORAGE_EDGES_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PREFS_KEY);
    }
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {}
}
