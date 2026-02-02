// pages/_app.js
import { AuthProvider } from '../lib/authContext';
import { ThemeProvider } from '../lib/themeContext';
import { LanguageProvider } from '../lib/languageContext';
import { PWAProvider } from '../lib/pwaContext';
import ErrorBoundary from '../components/ErrorBoundary';
import ConnectionStatus from '../components/ConnectionStatus';
import { useEffect } from 'react';
import { checkAndCleanupSW } from '../lib/unregisterServiceWorker';
import Head from 'next/head';
import '../styles/globals.css';
import { secureLogger } from '../lib/security';

function MyApp({ Component, pageProps }) {
  // CRITICAL: One-time SW cleanup for this deployment
  // This forces users to get the new non-caching service worker
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      // Version tag - increment this on each deployment that fixes SW caching
      const SW_VERSION = 'v3-no-api-cache-2026-02-02';

      checkAndCleanupSW(SW_VERSION).then(cleanupPerformed => {
        if (cleanupPerformed) {
          secureLogger.log('[APP] SW cleanup completed - page will reload with fresh service worker');
        } else {
          secureLogger.log('[APP] SW version is current - no cleanup needed');
        }
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <PWAProvider>
              <Head>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
                <meta name="theme-color" content="#0ea5e9" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="format-detection" content="telephone=no" />
              </Head>
              <ConnectionStatus />
              <Component {...pageProps} />
            </PWAProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

// Handle Service Worker Registration
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'development') {
    // In development, force unregister any existing service workers to avoid caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (let registration of registrations) {
        registration.unregister();
        secureLogger.log('[DEV] Unregistered service worker:', registration.scope);
      }
    });
  } else {
    // In production, next-pwa handles registration (register: true in next.config.js)
    // The checkAndCleanupSW in useEffect will handle version cleanup
    secureLogger.log('[PROD] Service worker registration handled by next-pwa');
  }
}

export default MyApp;