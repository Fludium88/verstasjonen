'use client';

import React from 'react';
import {
  X,
  Download,
  Share,
  PlusSquare,
  Smartphone,
  CheckCircle2,
  Wifi,
  Bell,
  Sparkles,
  ExternalLink,
  Laptop,
  Tablet,
} from 'lucide-react';
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
    const outcome = await triggerInstall();
    if (outcome === 'accepted') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-dialog-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-900/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 id="pwa-dialog-title" className="text-base font-bold text-white tracking-tight">
                Installer Værstasjonen som App (PWA)
              </h2>
              <p className="text-[11px] text-sky-400 font-mono">Mobil · Nettbrett · PC</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk installasjonsveiledningen"
            className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* App Preview Card */}
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/70 rounded-2xl p-4 flex items-center gap-4 shadow-lg">
            <div className="w-14 h-14 rounded-2xl bg-[#080e1e] border border-sky-500/40 flex items-center justify-center shrink-0 shadow-md">
              <img src="/icons/icon.svg" alt="Værstasjonen ikon" className="w-10 h-10 drop-shadow" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Værstasjonen</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                  INSTALLERBAR
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Virtuell meteorologisk værstasjon med oppdaterte værdata, radar og sol/måne.
              </p>
            </div>
          </div>

          {/* Benefits Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-2.5 space-y-1">
              <Sparkles className="w-4 h-4 text-amber-400 mx-auto" />
              <p className="text-[11px] font-bold text-white">Appvisning</p>
              <p className="text-[10px] text-slate-400 leading-tight">Åpnes fra hjemskjermen uten vanlig nettlesergrensesnitt</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-2.5 space-y-1">
              <Wifi className="w-4 h-4 text-sky-400 mx-auto" />
              <p className="text-[11px] font-bold text-white">Nett kreves</p>
              <p className="text-[10px] text-slate-400 leading-tight">Appside og oppdaterte værdata krever nettforbindelse</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-2.5 space-y-1">
              <Bell className="w-4 h-4 text-emerald-400 mx-auto" />
              <p className="text-[11px] font-bold text-white">Nettleservarsler</p>
              <p className="text-[10px] text-slate-400 leading-tight">Varsler kan vises mens appen er åpen</p>
            </div>
          </div>

          {/* Already installed state */}
          {isInstalled ? (
            <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-4 text-emerald-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Appen er allerede installert!</p>
                <p className="text-[11px] text-emerald-300/90">
                  Værstasjonen kjører i fullskjerm-appmodus på denne enheten.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Native Prompt Trigger (Android / Desktop Chrome / Edge) */}
              {hasNativePrompt && (
                <button
                  type="button"
                  onClick={handleDirectInstall}
                  className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-sm font-bold shadow-lg shadow-sky-950/60 transition active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Installer Værstasjonen nå (1-klikk)</span>
                </button>
              )}

              {/* Platform Specific Instruction Guide */}
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  {platform.isIOS
                    ? 'Installasjonsveiledning for iOS (iPhone & iPad)'
                    : platform.isAndroid
                    ? 'Installasjonsveiledning for Android'
                    : 'Installasjonsveiledning for PC & Mac'}
                </h3>

                {/* iOS Instructions */}
                {platform.isIOS ? (
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3 text-xs text-slate-200">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold font-mono shrink-0">
                        1
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-white flex items-center gap-1.5">
                          Trykk på Del-knappen <Share className="w-4 h-4 text-sky-400 inline" />
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Knappen finnes i bunnlinjen i Safari på iPhone (eller øverst på iPad).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 border-t border-slate-700/50 pt-2.5">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold font-mono shrink-0">
                        2
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-white flex items-center gap-1.5">
                          Rull ned og velg «Legg til på Hjem-skjerm» <PlusSquare className="w-4 h-4 text-emerald-400 inline" />
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Dette legger til app-ikonet direkte på hjemskjermen din.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 border-t border-slate-700/50 pt-2.5">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold font-mono shrink-0">
                        3
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-white">Trykk «Legg til» øverst til høyre</p>
                        <p className="text-[11px] text-slate-400">
                          Appen åpnes heretter i fullskjerm uten nettleserlinjer.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : platform.isAndroid ? (
                  /* Android Instructions */
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-3 text-xs text-slate-200">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold font-mono shrink-0">
                        1
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-white">Åpne nettlesermenyen (⋮)</p>
                        <p className="text-[11px] text-slate-400">Trykk på de tre prikkene øverst til høyre i Chrome/Samsung Internet.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 border-t border-slate-700/50 pt-2.5">
                      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/40 flex items-center justify-center font-bold font-mono shrink-0">
                        2
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-white flex items-center gap-1.5">
                          Velg «Installer app» eller «Legg til på startskjerm»
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Godkjenn installasjonen for å få eget ikon i appskuffen.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Desktop (PC / Mac) */
                  <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2.5 text-xs text-slate-200">
                    <p className="font-semibold text-white flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-sky-400" /> Installer i Chrome / Edge på PC / Mac:
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Trykk på installeringsikonet (
                      <span className="inline-block px-1.5 py-0.5 bg-slate-700 rounded text-sky-300 font-mono text-[10px]">
                        ⊕ Installer
                      </span>
                      ) på høyre side i adressefeltet, eller åpne nettlesermenyen og velg «Installer Værstasjonen».
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Progressive Web App (PWA) standard</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
};
