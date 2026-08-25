'use client';

import React from 'react';
import { CheckCircle2, Download, Laptop, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '@/lib/pwaInstall';
import { useAccessibleDialog } from '../common/useAccessibleDialog';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstalled, platform, triggerInstall, hasNativePrompt } = usePwaInstall();
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const handleDirectInstall = async () => {
    if ((await triggerInstall()) === 'accepted') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pwa-dialog-title" tabIndex={-1} className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white"><Download className="h-5 w-5" /></div>
            <div>
              <h2 id="pwa-dialog-title" className="font-bold text-white">Installer Værstasjonen</h2>
              <p className="text-xs text-slate-400">Eget ikon og appvisning</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Lukk" className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          {isInstalled ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/50 p-4 text-sm text-emerald-200"><CheckCircle2 className="h-5 w-5 shrink-0" /> Appen er allerede installert.</div>
          ) : hasNativePrompt ? (
            <button type="button" onClick={handleDirectInstall} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 font-bold text-white hover:bg-sky-500"><Download className="h-5 w-5" /> Installer app</button>
          ) : platform.isIOS ? (
            <div className="space-y-3 text-sm text-slate-200">
              <p className="text-slate-300">Safari tillater ikke automatisk installasjon. Det tar to trykk:</p>
              <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-3"><Share className="h-5 w-5 text-sky-400" /><span><strong>1.</strong> Trykk Del i Safari.</span></div>
              <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-3"><PlusSquare className="h-5 w-5 text-emerald-400" /><span><strong>2.</strong> Velg «Legg til på Hjem-skjerm».</span></div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-slate-800 p-4 text-sm text-slate-200">
              {platform.isAndroid ? <Smartphone className="h-5 w-5 shrink-0 text-sky-400" /> : <Laptop className="h-5 w-5 shrink-0 text-sky-400" />}
              <p>Nettleseren har ikke gjort den direkte dialogen tilgjengelig ennå. Åpne siden i Chrome eller Edge og velg <strong>Installer app</strong> i nettlesermenyen.</p>
            </div>
          )}
          <p className="text-xs leading-relaxed text-slate-500">Nettleseren krever alltid at du bekrefter installasjonen. Appen kan ikke omgå denne sikkerhetsbekreftelsen.</p>
        </div>
      </div>
    </div>
  );
};
