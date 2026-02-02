import { secureLogger } from './security';

// ... (comments)

/**
 * Unregisters all active service workers
 * @returns {Promise<void>}
 */
export async function unregisterServiceWorker() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();

            secureLogger.log(`[SW CLEANUP] Found ${registrations.length} service worker(s)`);

            for (const registration of registrations) {
                const success = await registration.unregister();
                secureLogger.log(`[SW CLEANUP] Unregistered SW: ${registration.scope} - Success: ${success}`);
            }

            secureLogger.log('[SW CLEANUP] All service workers unregistered successfully');
            return true;
        } catch (error) {
            secureLogger.error('[SW CLEANUP] Error unregistering service workers:', error);
            return false;
        }
    } else {
        secureLogger.log('[SW CLEANUP] Service workers not supported or not in browser environment');
        return false;
    }
}

/**
 * Clears all browser caches
 * @returns {Promise<void>}
 */
export async function clearAllCaches() {
    if (typeof window !== 'undefined' && 'caches' in window) {
        try {
            const cacheNames = await caches.keys();

            secureLogger.log(`[CACHE CLEANUP] Found ${cacheNames.length} cache(s):`, cacheNames);

            for (const cacheName of cacheNames) {
                const success = await caches.delete(cacheName);
                secureLogger.log(`[CACHE CLEANUP] Deleted cache: ${cacheName} - Success: ${success}`);
            }

            secureLogger.log('[CACHE CLEANUP] All caches cleared successfully');
            return true;
        } catch (error) {
            secureLogger.error('[CACHE CLEANUP] Error clearing caches:', error);
            return false;
        }
    } else {
        secureLogger.log('[CACHE CLEANUP] Cache API not supported or not in browser environment');
        return false;
    }
}

/**
 * Performs full cleanup: unregister SW + clear caches + reload
 * @param {boolean} reload - Whether to reload page after cleanup
 * @returns {Promise<void>}
 */
export async function performFullCleanup(reload = false) {
    secureLogger.log('[FULL CLEANUP] Starting full cleanup process...');

    const swUnregistered = await unregisterServiceWorker();
    const cachesCleared = await clearAllCaches();

    if (swUnregistered || cachesCleared) {
        secureLogger.log('[FULL CLEANUP] Cleanup completed successfully');

        if (reload && typeof window !== 'undefined') {
            secureLogger.log('[FULL CLEANUP] Reloading page...');
            setTimeout(() => {
                window.location.reload(true); // Hard reload
            }, 1000);
        }
    } else {
        secureLogger.log('[FULL CLEANUP] No cleanup was necessary');
    }
}

/**
 * Checks current SW version and performs cleanup if needed
 * Should be called ONCE per deployment from _app.js
 * @param {string} currentVersion - Current SW version tag
 * @returns {Promise<boolean>} - Whether cleanup was performed
 */
export async function checkAndCleanupSW(currentVersion) {
    if (typeof window === 'undefined') return false;

    const STORAGE_KEY = 'sw-version';
    const lastVersion = localStorage.getItem(STORAGE_KEY);

    secureLogger.log(`[SW VERSION CHECK] Last: ${lastVersion}, Current: ${currentVersion}`);

    if (lastVersion !== currentVersion) {
        secureLogger.log('[SW VERSION CHECK] Version mismatch detected - performing cleanup...');

        await performFullCleanup(false); // Don't reload yet

        localStorage.setItem(STORAGE_KEY, currentVersion);
        secureLogger.log(`[SW VERSION CHECK] Version updated to: ${currentVersion}`);

        // Reload after a short delay to ensure cleanup completes
        setTimeout(() => {
            secureLogger.log('[SW VERSION CHECK] Reloading to apply changes...');
            window.location.reload(true);
        }, 1500);

        return true;
    } else {
        secureLogger.log('[SW VERSION CHECK] Version matches - no cleanup needed');
        return false;
    }
}
