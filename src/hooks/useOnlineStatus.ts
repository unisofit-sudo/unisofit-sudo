import { useState, useEffect, useCallback } from 'react';
import {
  getPendingVoos,
  syncPendingVoos,
  OFFLINE_EVENTS,
  PendingVoo,
  SyncResult,
} from '../utils/offlineStore';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingVoos, setPendingVoos] = useState<PendingVoo[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    const list = await getPendingVoos();
    setPendingVoos(list);
  }, []);

  const triggerSync = useCallback(async (): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const result = await syncPendingVoos();
      if (result.syncedCount > 0) {
        setLastSyncMessage(
          `${result.syncedCount} ${
            result.syncedCount === 1 ? 'voo sincronizado' : 'voos sincronizados'
          } com sucesso!`
        );
      }
      await refreshPending();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    refreshPending();

    const handleOnline = () => {
      setIsOnline(true);
      void triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handlePendingChanged = () => {
      void refreshPending();
    };
    const handleSyncComplete = (e: Event) => {
      const custom = e as CustomEvent<SyncResult>;
      if (custom.detail?.syncedCount) {
        setLastSyncMessage(
          `${custom.detail.syncedCount} ${
            custom.detail.syncedCount === 1
              ? 'voo sincronizado'
              : 'voos sincronizados'
          } com sucesso!`
        );
      }
      void refreshPending();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_EVENTS.PENDING_CHANGED, handlePendingChanged);
    window.addEventListener(OFFLINE_EVENTS.SYNC_COMPLETE, handleSyncComplete);

    if (navigator.onLine) {
      void getPendingVoos().then((list) => {
        if (list.length > 0) {
          void triggerSync();
        }
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_EVENTS.PENDING_CHANGED, handlePendingChanged);
      window.removeEventListener(OFFLINE_EVENTS.SYNC_COMPLETE, handleSyncComplete);
    };
  }, [refreshPending, triggerSync]);

  useEffect(() => {
    if (!lastSyncMessage) return;
    const timer = window.setTimeout(() => setLastSyncMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [lastSyncMessage]);

  return {
    isOnline,
    pendingVoos,
    pendingCount: pendingVoos.length,
    isSyncing,
    lastSyncMessage,
    triggerSync,
    refreshPending,
  };
}
