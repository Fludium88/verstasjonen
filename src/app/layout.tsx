import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

const isProduction = process.env.NODE_ENV === 'production';

const serviceWorkerScript = isProduction
  ? `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(function(error) {
          console.warn('Service worker registration failed:', error);
        });
      }
    `
  : `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          registrations.forEach(function(registration) {
            if (registration.scope.startsWith(window.location.origin)) registration.unregister();
          });
        });
      }
      if ('caches' in window) {
        caches.keys().then(function(names) {
          names.filter(function(name) { return name.startsWith('vaerstasjonen-static-'); })
            .forEach(function(name) { caches.delete(name); });
        });
      }
    `;

export const metadata: Metadata = {
  title: 'Værstasjonen – Digital Værstasjon & Telemetri',
  description:
    'Værprognoser, tilgjengelige målinger, historikk, radar, sol og måne samt MET-farevarsler for valgte steder.',
  manifest: '/manifest.json',
  applicationName: 'Værstasjonen',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Værstasjonen',
  },
  icons: {
    icon: '/icons/icon.svg',
    shortcut: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#070b16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Værstasjonen" />
        <meta name="theme-color" content="#070b16" />
      </head>
      <body className="bg-[#070b16] text-slate-100 min-h-screen selection:bg-sky-500 selection:text-white antialiased overflow-x-hidden">
        {children}
        <Script id="register-service-worker" strategy="afterInteractive">
          {serviceWorkerScript}
        </Script>
      </body>
    </html>
  );
}
