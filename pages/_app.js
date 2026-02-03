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
    if (typeof window !== 'undefined') {
      // 1. CHUNK ERROR HANDLER (Auto-Reload on new deployment)
      const handleChunkError = (e) => {
        // Detect chunk loading errors (404s on old scripts)
        const isChunkError = e.message && (e.message.includes('Loading chunk') || e.message.includes('Loading CSS chunk'));
        // Detect script resource 404s (which don't always throw simple messages but trigger error event on link/script tags)
        const isResourceError = e.target && (e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK') && e.target.src && e.target.src.includes("_next/static/");

        if (isChunkError || isResourceError) {
          secureLogger.warn('Chunk load error detected (New Deployment?), forcing reload...');

          // Prevent infinite reload loop
          const lastReload = sessionStorage.getItem('chunk_reload_ts');
          const now = Date.now();

          // Only reload if we haven't reloaded in the last 10 seconds
          if (!lastReload || (now - parseInt(lastReload)) > 10000) {
            sessionStorage.setItem('chunk_reload_ts', String(now));
            window.location.reload(true);
          }
        }
      };

      window.addEventListener('error', handleChunkError, true); // Capture phase is essential for resource errors

      // 2. SW CLEANUP
      if (process.env.NODE_ENV === 'production') {
        // Version tag - UPDATED to fix 03 Feb issues
        const SW_VERSION = 'v4-fix-404-chunks-2026-02-03';

        checkAndCleanupSW(SW_VERSION).then(cleanupPerformed => {
          if (cleanupPerformed) {
            secureLogger.log('[APP] SW cleanup completed - page will reload with fresh service worker');
          } else {
            secureLogger.log('[APP] SW version is current - no cleanup needed');
          }
        });
      }

      return () => {
        window.removeEventListener('error', handleChunkError, true);
      };
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