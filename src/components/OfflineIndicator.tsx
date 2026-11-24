import React from 'react';
import { WifiOff, RefreshCw, CheckCircle2, CloudUpload } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing, lastSyncMessage, triggerSync } =
    useOnlineStatus();

  if (isOnline && pendingCount === 0 && !lastSyncMessage) {
    return null;
  }

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3">
      {!isOnline ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-950/40 border border-amber-500/35 text-amber-200 rounded-xl px-4 py-2.5 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong className="text-amber-300">Modo Offline ativo:</strong> consultas em
              cache liberadas e novos voos do Diário de Bordo serão salvos localmente para
              envio automático ao reconectar.
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="font-mono font-bold text-amber-300 whitespace-nowrap">
              {pendingCount} {pendingCount === 1 ? 'voo na fila' : 'voos na fila'}
            </span>
          )}
        </div>
      ) : pendingCount > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-sky-950/45 border border-sky-500/35 text-sky-100 rounded-xl px-4 py-2.5 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <CloudUpload className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>
              <strong className="text-sky-300">
                {pendingCount}{' '}
                {pendingCount === 1
                  ? 'voo registrado offline aguardando envio'
                  : 'voos registrados offline aguardando envio'}
              </strong>{' '}
              para o banco de dados.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white font-bold text-[11px] transition-colors cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
          </button>
        </div>
      ) : lastSyncMessage ? (
        <div className="flex items-center gap-2.5 bg-emerald-950/45 border border-emerald-500/35 text-emerald-200 rounded-xl px-4 py-2.5 text-xs shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{lastSyncMessage}</span>
        </div>
      ) : null}
    </div>
  );
}
