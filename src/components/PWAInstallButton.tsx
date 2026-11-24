import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { canInstallNatively, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;
  if (!canInstallNatively && !isIOS) return null;

  const handleClick = async () => {
    if (canInstallNatively) {
      await promptInstall();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-[11px] font-bold text-sky-300 transition-all cursor-pointer shadow-sm"
        title="Instalar o LOGGY como aplicativo no dispositivo"
      >
        <Download className="w-3.5 h-3.5 text-sky-400" />
        <span>Instalar App</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-white text-sm">
                    Instalar LOGGY no iPhone / iPad
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Acesse o Diário de Bordo direto da tela inicial
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-sky-400">1.</span>
                <span>
                  Toque no botão{' '}
                  <strong className="text-white inline-flex items-center gap-1">
                    Compartilhar <Share className="w-3.5 h-3.5 text-sky-400" />
                  </strong>{' '}
                  na barra do Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-sky-400">2.</span>
                <span>
                  Role e selecione{' '}
                  <strong className="text-white inline-flex items-center gap-1">
                    Adicionar à Tela de Início{' '}
                    <PlusSquare className="w-3.5 h-3.5 text-sky-400" />
                  </strong>
                  .
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="font-mono font-bold text-sky-400">3.</span>
                <span>
                  Confirme tocando em <strong className="text-white">Adicionar</strong> para
                  usar o aplicativo inclusive offline.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
