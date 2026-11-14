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
      const idsReq = store.get(DB_IDS_KEY);
      const legacyReq = store.get('current_sheets');
      const stampReq = store.get('saved_at');
      let perSheet: IDBRequest[] = [];
      idsReq.onsuccess = () => {
        const ids = idsReq.result;
        if (Array.isArray(ids)) perSheet = ids.map((id: string) => store.get(DB_SHEET_PREFIX + id));
      };
      tx.oncomplete = () => {
        let stored: unknown = legacyReq.result;
        if (Array.isArray(idsReq.result)) {
          const list = perSheet.map(r => r.result as Sheet | undefined);
          stored = list.every(Boolean) ? list : null;
        }
        if (!Array.isArray(stored) || stored.length === 0) return resolve(null);
        const idbStamp = Number(stampReq.result) || 0;
        const lsStamp = readStamp(LOCAL_STORAGE_SNAPSHOT_AT_KEY);
        const legacy = idbStamp === 0 && lsStamp === 0; // gravado antes dos carimbos: o IndexedDB é a cópia completa
        if (idbStamp > lsStamp || legacy || !loadedFromSnapshot) {
          // O que veio do banco já está gravado: a próxima gravação só escreve o que mudar a partir daqui.
          defaultSaver.markSavedInDb(stored as Sheet[]);
          return resolve(stored as Sheet[]);
        }
        resolve(null);
      };
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let loadedFromSnapshot = false;

const DB_IDS_KEY = 'sheet_ids';
const DB_SHEET_PREFIX = 'sheet:';
/** Acima disso a cópia rápida do localStorage não vale o custo do JSON.stringify (e estoura a cota de ~5 MB). */
const LOCAL_SNAPSHOT_MAX_CELLS = 20000;

/** Há mais de `limit` células nas planilhas? Para de contar assim que passa. */
function cellCountExceeds(sheets: readonly Sheet[], limit: number): boolean {
  let n = 0;
  for (const sheet of sheets) {
    for (const key in sheet.data) if (key && ++n > limit) return true;
  }
  return false;
}

export interface SavePlan {
  /** Abas cuja referência mudou desde a última gravação bem-sucedida. */
  changed: Sheet[];
  /** A lista/ordem de abas mudou. */
  orderChanged: boolean;
}

/** O que precisa ser gravado: só as abas cuja referência mudou (o app troca o objeto da aba a cada edição). */
export function planSheetSave(saved: ReadonlyMap<string, Sheet>, sheets: readonly Sheet[]): SavePlan {
  const changed = sheets.filter(s => saved.get(s.id) !== s);
  const ids = [...saved.keys()];
  const orderChanged = ids.length !== sheets.length || sheets.some((s, i) => ids[i] !== s.id);
  return { changed, orderChanged };
}

export interface SaveBackend {
  /** Cópia rápida (localStorage). Retorna false se não coube. */
  writeSnapshot(sheets: Sheet[], stamp: string): boolean;
  dropSnapshot(): void;
  /** Banco completo (IndexedDB): grava só as abas informadas + a lista de ids. Lança em caso de falha. */
  writeDb(changed: Sheet[], ids: string[], stamp: number): Promise<void>;
}

export class SheetsSaver {
  private savedDb = new Map<string, Sheet>();
  private savedSnapshot = new Map<string, Sheet>();
  private pending: Sheet[] | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly backend: SaveBackend) {}

  /** Planilhas lidas do banco: já estão gravadas, não precisam ser escritas de novo. */
  markSavedInDb(sheets: readonly Sheet[]): void {
    this.savedDb = new Map(sheets.map(s => [s.id, s]));
  }

  reset(): void {
    this.savedDb.clear();
    this.savedSnapshot.clear();
  }

  /** Grava (em fila, sempre a versão mais recente). Aba inalterada desde a última gravação não é escrita de novo. */
  save(sheets: Sheet[]): Promise<void> {
    if (!sheets || sheets.length === 0) return Promise.resolve();
    this.pending = sheets;
    if (!this.running) {
      this.running = (async () => {
        try {
          while (this.pending) {
            const next = this.pending;
            this.pending = null;
            await this.run(next);
          }
        } finally {
          this.running = null;
        }
      })();
    }
    return this.running;
  }

  private async run(sheets: Sheet[]): Promise<void> {
    const dbPlan = planSheetSave(this.savedDb, sheets);
    const snapPlan = planSheetSave(this.savedSnapshot, sheets);
    const dbDirty = dbPlan.changed.length > 0 || dbPlan.orderChanged;
    const snapDirty = snapPlan.changed.length > 0 || snapPlan.orderChanged;
    if (!dbDirty && !snapDirty) return;
    const stamp = String(Date.now());
    const small = !cellCountExceeds(sheets, LOCAL_SNAPSHOT_MAX_CELLS);

    // Planilhas pequenas: cópia rápida primeiro (abre instantaneamente). Grandes: só o banco, e a cópia antiga some,
    // porque uma cópia velha nunca pode voltar no lugar da nova.
    if (small) {
      if (snapDirty && this.backend.writeSnapshot(sheets, stamp)) this.savedSnapshot = new Map(sheets.map(s => [s.id, s]));
    } else {
      this.backend.dropSnapshot();
      this.savedSnapshot.clear();
    }

    if (dbDirty) {
      try {
        await this.backend.writeDb(dbPlan.changed, sheets.map(s => s.id), Number(stamp));
        this.savedDb = new Map(sheets.map(s => [s.id, s]));
      } catch (err) {
        console.warn('Error persisting sheets to IndexedDB:', err);
        // Sem banco e sem cópia rápida (planilha grande): última tentativa no localStorage.
        if (!small && this.backend.writeSnapshot(sheets, stamp)) this.savedSnapshot = new Map(sheets.map(s => [s.id, s]));
      }
    }
  }
}

const browserBackend: SaveBackend = {
  writeSnapshot(sheets, stamp) {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem(LOCAL_STORAGE_LATEST_AT_KEY, stamp);
      try {
        localStorage.setItem(LOCAL_STORAGE_SHEETS_KEY, JSON.stringify(sheets));
        localStorage.setItem(LOCAL_STORAGE_SNAPSHOT_AT_KEY, stamp);
        return true;
      } catch {
        // Cota estourada: a cópia antiga é APAGADA (nunca pode voltar no lugar da nova).
        localStorage.removeItem(LOCAL_STORAGE_SHEETS_KEY);
        localStorage.removeItem(LOCAL_STORAGE_SNAPSHOT_AT_KEY);
        return false;
      }
    } catch {
      return false; // Sem localStorage: o IndexedDB guarda tudo.
    }
  },
  dropSnapshot() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(LOCAL_STORAGE_SHEETS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_SNAPSHOT_AT_KEY);
    } catch {
      // ignora
    }
  },
  async writeDb(changed, ids, stamp) {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const sheet of changed) store.put(sheet, DB_SHEET_PREFIX + sheet.id);
      store.put(ids, DB_IDS_KEY);
      store.put(stamp, 'saved_at');
      store.delete('current_sheets'); // formato antigo: nunca pode competir com o novo
      const keep = new Set(ids.map(id => DB_SHEET_PREFIX + id));
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        for (const key of keysReq.result) {
          if (typeof key === 'string' && key.startsWith(DB_SHEET_PREFIX) && !keep.has(key)) store.delete(key);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
};

const defaultSaver = new SheetsSaver(browserBackend);

/**
 * Grava as planilhas no IndexedDB (completo, por aba: só as abas alteradas) e, quando pequenas, numa cópia
 * rápida no localStorage. Se o localStorage estourar a cota, a cópia antiga é APAGADA: uma cópia velha nunca
 * pode voltar no lugar da nova.
 */
export function saveSheetsToStorage(sheets: Sheet[]): Promise<void> {
  return defaultSaver.save(sheets);
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
  defaultSaver.reset();
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
