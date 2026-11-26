import {
  Aeronave,
  Caderneta,
  Cliente,
  ComponenteControlado,
  HistoricoVoo,
  InspecaoPeriodica,
  RevisaoLaudo,
} from '../types';

export interface PendingVoo extends HistoricoVoo {
  pendingSync: true;
  queuedAt: string;
  syncError?: string;
}

export interface AircraftDetailSnapshot {
  componentes: ComponenteControlado[];
  inspecoes: InspecaoPeriodica[];
  voos: HistoricoVoo[];
  revisoes: RevisaoLaudo[];
  cadernetas?: Caderneta[];
  updatedAt: string;
}

export interface SyncResult {
  syncedCount: number;
  remainingCount: number;
  lastError: string | null;
}

export const OFFLINE_EVENTS = {
  PENDING_CHANGED: 'loggy:pending-changed',
  SYNC_COMPLETE: 'loggy:sync-complete',
} as const;

const DB_NAME = 'loggy_offline_db';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const STORE_PENDING_VOOS = 'pending_voos';

let syncInFlight: Promise<SyncResult> | null = null;

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_VOOS)) {
        db.createObjectStore(STORE_PENDING_VOOS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Erro ao abrir IndexedDB'));
  });
}

async function putSnapshot<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORE_SNAPSHOTS);
      store.put({ key, value, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Falha ao salvar cache offline:', key, err);
  }
}

async function getSnapshot<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDB();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
      const store = tx.objectStore(STORE_SNAPSHOTS);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? (req.result.value as T) : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function saveClientesCache(clientes: Cliente[]): Promise<void> {
  await putSnapshot('clientes', clientes);
}

export async function getClientesCache(): Promise<Cliente[]> {
  return (await getSnapshot<Cliente[]>('clientes')) || [];
}

export async function saveAeronavesCache(aeronaves: Aeronave[]): Promise<void> {
  await putSnapshot('aeronaves', aeronaves);
}

export async function getAeronavesCache(): Promise<Aeronave[]> {
  return (await getSnapshot<Aeronave[]>('aeronaves')) || [];
}

export async function saveAeronaveDetailCache(
  aeronaveId: string,
  detail: Omit<AircraftDetailSnapshot, 'updatedAt'>
): Promise<void> {
  await putSnapshot<AircraftDetailSnapshot>(`detail_${aeronaveId}`, {
    ...detail,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAeronaveDetailCache(
  aeronaveId: string
): Promise<AircraftDetailSnapshot | null> {
  return await getSnapshot<AircraftDetailSnapshot>(`detail_${aeronaveId}`);
}

function emitEvent(name: string, detail?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export async function queuePendingVoo(voo: HistoricoVoo): Promise<PendingVoo> {
  const item: PendingVoo = {
    ...voo,
    pendingSync: true,
    queuedAt: voo.queuedAt || new Date().toISOString(),
    syncError: undefined,
  };
  const db = await openOfflineDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PENDING_VOOS, 'readwrite');
    tx.objectStore(STORE_PENDING_VOOS).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
  emitEvent(OFFLINE_EVENTS.PENDING_CHANGED);
  return item;
}

export async function getPendingVoos(aeronaveId?: string): Promise<PendingVoo[]> {
  try {
    const db = await openOfflineDB();
    const list = await new Promise<PendingVoo[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING_VOOS, 'readonly');
      const req = tx.objectStore(STORE_PENDING_VOOS).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as PendingVoo[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
    const filtered = aeronaveId ? list.filter((v) => v.aeronaveId === aeronaveId) : list;
    return filtered.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}

export async function removePendingVoo(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING_VOOS, 'readwrite');
      tx.objectStore(STORE_PENDING_VOOS).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
    emitEvent(OFFLINE_EVENTS.PENDING_CHANGED);
  } catch (err) {
    console.warn('Erro ao remover voo pendente:', err);
  }
}

async function updatePendingVooError(item: PendingVoo, errorMsg: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PENDING_VOOS, 'readwrite');
      tx.objectStore(STORE_PENDING_VOOS).put({ ...item, syncError: errorMsg });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

/**
 * Aplica as horas pendentes (Partida -> Corte) igualmente para Célula, Motor e Hélice,
 * permitindo que o Mapa de Controle & Alertas e Inspeções Periódicas sejam recalculados offline.
 */
export function applyPendingVoosToAeronave(
  aeronave: Aeronave,
  pendingVoos: PendingVoo[]
): Aeronave {
  const delta = pendingVoos
    .filter((v) => v.aeronaveId === aeronave.id)
    .reduce((acc, v) => acc + Number(v.horasVoo || 0), 0);

  if (delta <= 0) return aeronave;

  return {
    ...aeronave,
    horasTotais: Number(((aeronave.horasTotais || 0) + delta).toFixed(2)),
    horasMotor: Number(((aeronave.horasMotor || 0) + delta).toFixed(2)),
    horasHelice: Number(((aeronave.horasHelice || 0) + delta).toFixed(2)),
  };
}

export function applyPendingVoosToAeronavesList(
  aeronaves: Aeronave[],
  pendingVoos: PendingVoo[]
): Aeronave[] {
  if (pendingVoos.length === 0) return aeronaves;
  return aeronaves.map((aero) => applyPendingVoosToAeronave(aero, pendingVoos));
}

export async function syncPendingVoos(): Promise<SyncResult> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    const queue = await getPendingVoos();
    if (queue.length === 0) {
      return { syncedCount: 0, remainingCount: 0, lastError: null };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        syncedCount: 0,
        remainingCount: queue.length,
        lastError: 'Dispositivo sem conexão.',
      };
    }

    let syncedCount = 0;
    let lastError: string | null = null;

    for (const item of queue) {
      try {
        const { pendingSync: _ps, queuedAt: _qa, syncError: _se, ...payload } = item;
        const response = await fetch('/api/historico', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          lastError = `Erro ${response.status} ao sincronizar voo.`;
          await updatePendingVooError(item, errText || lastError);
          break;
        }

        await removePendingVoo(item.id);
        syncedCount += 1;
      } catch (err: any) {
        lastError = err?.message || 'Falha de rede durante sincronização.';
        await updatePendingVooError(item, lastError);
        break;
      }
    }

    const remaining = await getPendingVoos();
    const result: SyncResult = {
      syncedCount,
      remainingCount: remaining.length,
      lastError,
    };

    emitEvent(OFFLINE_EVENTS.PENDING_CHANGED);
    if (syncedCount > 0) {
      emitEvent(OFFLINE_EVENTS.SYNC_COMPLETE, result);
    }

    return result;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
