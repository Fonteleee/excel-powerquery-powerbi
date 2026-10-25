import { Sheet } from '../types/spreadsheet';
import { RelationEdge } from '../types/relations';
import { createEmptySheet } from '../data/sampleDatasets';
import {
  FLOW_GRAPH_BACKUP_KEY,
  FLOW_GRAPH_STORAGE_KEY,
  FLOW_VIEW_STORAGE_KEY,
} from '../features/relations/model/persistence';

/**
 * O sistema SEMPRE abre vazio: sem planilha de exemplo e sem dados de sessões anteriores.
 * Para trabalhar, o usuário importa arquivos ou cria tabelas; para guardar, exporta.
 * Mude para `false` apenas se a persistência automática no navegador voltar a ser desejada.
 */
export const START_EMPTY_WORKSPACE = true;

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
  if (START_EMPTY_WORKSPACE) return createBlankWorkspace();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_SHEETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Could not read sheets from localStorage:', err);
  }

  return createBlankWorkspace();
}

/**
 * Apaga tudo que uma sessão anterior deixou no navegador (planilhas, fluxo, relações antigas),
 * para que o sistema abra realmente vazio. Preferências de interface (zoom, grade) são mantidas.
 * Seguro de chamar várias vezes.
 */
export function resetWorkspaceStorage(): void {
  if (!START_EMPTY_WORKSPACE) return;
  try {
    if (typeof localStorage !== 'undefined') {
      for (const key of [
        LOCAL_STORAGE_SHEETS_KEY,
        LOCAL_STORAGE_ACTIVE_SHEET_KEY,
        LOCAL_STORAGE_STARRED_KEY,
        LOCAL_STORAGE_EDGES_KEY,
        FLOW_GRAPH_STORAGE_KEY,
        FLOW_GRAPH_BACKUP_KEY,
        FLOW_VIEW_STORAGE_KEY,
      ]) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // storage indisponível: nada a limpar
  }
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // sem IndexedDB: nada a limpar
  }
}

/**
 * Asynchronously loads the complete sheets dataset from IndexedDB (with localStorage fallback)
 */
export async function loadSheetsFromStorageAsync(): Promise<Sheet[]> {
  if (START_EMPTY_WORKSPACE) return createBlankWorkspace();
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('current_sheets');
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result) && req.result.length > 0) {
          resolve(req.result);
        } else {
          resolve(loadInitialSheetsSync());
        }
      };
      req.onerror = () => resolve(loadInitialSheetsSync());
    });
  } catch {
    return loadInitialSheetsSync();
  }
}

/**
 * Persists sheets dataset into both IndexedDB (full size) and localStorage (fast snapshot)
 */
export async function saveSheetsToStorage(sheets: Sheet[]): Promise<void> {
  if (START_EMPTY_WORKSPACE) return; // o sistema abre sempre vazio: nada é guardado entre sessões
  if (!sheets || sheets.length === 0) return;

  // 1. Fast snapshot in localStorage for instantaneous boot
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_SHEETS_KEY, JSON.stringify(sheets));
    }
  } catch {
    // If quota exceeded in localStorage, IndexedDB will handle large files
  }

  // 2. Full unlimited persistence in IndexedDB
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(sheets, 'current_sheets');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
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
