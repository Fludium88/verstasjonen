'use client';

import { useState, useEffect, useCallback } from 'react';

export interface PwaPlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isChromium: boolean;
  isSafari: boolean;
  isSamsungBrowser: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface StandaloneNavigator extends Navigator {
  standalone?: boolean;
}

export function detectPwaPlatform(): PwaPlatformInfo {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      isChromium: false,
      isSafari: false,
      isSamsungBrowser: false,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const isSamsungBrowser = /samsungbrowser/.test(userAgent);
  const isChromium = /chrome|crios/.test(userAgent) && !/edg/.test(userAgent) && !isSamsungBrowser;
  const isSafari = /safari/.test(userAgent) && !/chrome|crios|samsungbrowser/.test(userAgent);

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as StandaloneNavigator).standalone === true ||
    document.referrer.includes('android-app://');

  return {
    isIOS,
    isAndroid,
    isStandalone,
    isChromium,
    isSafari,
    isSamsungBrowser,
  };
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [platform, setPlatform] = useState<PwaPlatformInfo>({
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    isChromium: false,
    isSafari: false,
    isSamsungBrowser: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const detected = detectPwaPlatform();
    setPlatform(detected);
    setIsInstalled(detected.isStandalone);
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // Re-check display-mode changes
    const matchMediaStandalone = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };
    if (matchMediaStandalone.addEventListener) {
      matchMediaStandalone.addEventListener('change', handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (matchMediaStandalone.removeEventListener) {
        matchMediaStandalone.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual_guide'> => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setIsInstallable(false);
        }
        setDeferredPrompt(null);
        return outcome;
      } catch (err) {
        console.error('PWA install prompt error:', err);
        return 'manual_guide';
      }
    }
    return 'manual_guide';
  }, [deferredPrompt]);

  return {
    isInstallable: isInstallable || (platform.isIOS && !isInstalled) || (platform.isAndroid && !isInstalled),
    hasNativePrompt: Boolean(deferredPrompt),
    isInstalled,
    isOffline,
    platform,
    triggerInstall,
  };
}
