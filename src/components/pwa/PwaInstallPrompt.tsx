'use client';

import React, { useState } from 'react';
import { Download, WifiOff, Sparkles } from 'lucide-react';
import { usePwaInstall } from '@/lib/pwaInstall';
import { PwaInstallModal } from './PwaInstallModal';

interface PwaInstallPromptProps {
  variant?: 'sidebar' | 'mobile-banner' | 'compact' | 'header-badge';
  onInstalled?: () => void;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  variant = 'sidebar',
  onInstalled,
}) => {
  const { isInstallable, isInstalled, isOffline, triggerInstall } = usePwaInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = async () => {
    const result = await triggerInstall();
    if (result === 'accepted') {
      onInstalled?.();
      return;
    }
    if (result === 'manual_guide') setIsModalOpen(true);
  };

  // If already installed, don't show install buttons
  if (isInstalled && !isOffline) {
    return null;
  }

  return (
    <>
      <div className="space-y-2">
        {/* Offline Banner indicator */}
        {isOffline && (
          <div role="status" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/80 border border-amber-600/60 text-amber-300 text-xs font-semibold shadow-lg">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Ingen nettforbindelse. Vist innhold kan være utdatert.</span>
          </div>
        )}

        {/* Sidebar Variant */}
        {variant === 'sidebar' && isInstallable && (
          <button
            type="button"
            onClick={handleClick}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-900/60 to-indigo-900/60 hover:from-sky-800/80 hover:to-indigo-800/80 border border-sky-600/40 text-xs text-white font-medium transition shadow-md group active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-sky-400 group-hover:scale-110 transition" />
              <span>Installér som app</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold">
              PWA
            </span>
          </button>
        )}

        {/* Compact Button Variant (e.g. for header / navbar) */}
        {variant === 'compact' && isInstallable && (
          <button
            type="button"
            onClick={handleClick}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-950/40 border border-sky-400/30 transition active:scale-95"
            title="Installer Værstasjonen som app"
            aria-label="Installer Værstasjonen som app"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Installer app</span>
          </button>
        )}

        {/* Mobile Banner Variant */}
        {variant === 'mobile-banner' && isInstallable && (
          <div className="bg-gradient-to-r from-sky-950/95 via-indigo-950/95 to-slate-900/95 border border-sky-600/40 rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-600/30 border border-sky-500/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Bruk Værstasjonen som app</p>
                <p className="text-[10px] text-slate-400">Eget ikon og appvisning. Oppdaterte værdata krever nett.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClick}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md transition shrink-0 active:scale-95"
            >
              Installer
            </button>
          </div>
        )}
      </div>

      {/* Install Instruction Modal */}
      <PwaInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
