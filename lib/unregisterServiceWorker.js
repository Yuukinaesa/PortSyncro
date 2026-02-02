// lib/unregisterServiceWorker.js
// Utility to force unregister all service workers
// Used for ONE-TIME cleanup when SW caching bug is fixed

/**
 * Unregisters all active service workers
 * @returns {Promise<void>}
 */
export async function unregisterServiceWorker() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();

            console.log(`[SW CLEANUP] Found ${registrations.length} service worker(s)`);

            for (const registration of registrations) {
                const success = await registration.unregister();
                console.log(`[SW CLEANUP] Unregistered SW: ${registration.scope} - Success: ${success}`);
            }

            console.log('[SW CLEANUP] All service workers unregistered successfully');
            return true;
        } catch (error) {
            console.error('[SW CLEANUP] Error unregistering service workers:', error);
            return false;
        }
    } else {
        console.log('[SW CLEANUP] Service workers not supported or not in browser environment');
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

            console.log(`[CACHE CLEANUP] Found ${cacheNames.length} cache(s):`, cacheNames);

            for (const cacheName of cacheNames) {
                const success = await caches.delete(cacheName);
                console.log(`[CACHE CLEANUP] Deleted cache: ${cacheName} - Success: ${success}`);
            }

            console.log('[CACHE CLEANUP] All caches cleared successfully');
            return true;
        } catch (error) {
            console.error('[CACHE CLEANUP] Error clearing caches:', error);
            return false;
        }
    } else {
        console.log('[CACHE CLEANUP] Cache API not supported or not in browser environment');
        return false;
    }
}

/**
 * Performs full cleanup: unregister SW + clear caches + reload
 * @param {boolean} reload - Whether to reload page after cleanup
 * @returns {Promise<void>}
 */
export async function performFullCleanup(reload = false) {
    console.log('[FULL CLEANUP] Starting full cleanup process...');

    const swUnregistered = await unregisterServiceWorker();
    const cachesCleared = await clearAllCaches();

    if (swUnregistered || cachesCleared) {
        console.log('[FULL CLEANUP] Cleanup completed successfully');

        if (reload && typeof window !== 'undefined') {
            console.log('[FULL CLEANUP] Reloading page...');
            setTimeout(() => {
                window.location.reload(true); // Hard reload
            }, 1000);
        }
    } else {
        console.log('[FULL CLEANUP] No cleanup was necessary');
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

    console.log(`[SW VERSION CHECK] Last: ${lastVersion}, Current: ${currentVersion}`);

    if (lastVersion !== currentVersion) {
        console.log('[SW VERSION CHECK] Version mismatch detected - performing cleanup...');

        await performFullCleanup(false); // Don't reload yet

        localStorage.setItem(STORAGE_KEY, currentVersion);
        console.log(`[SW VERSION CHECK] Version updated to: ${currentVersion}`);

        // Reload after a short delay to ensure cleanup completes
        setTimeout(() => {
            console.log('[SW VERSION CHECK] Reloading to apply changes...');
            window.location.reload(true);
        }, 1500);

        return true;
    } else {
        console.log('[SW VERSION CHECK] Version matches - no cleanup needed');
        return false;
    }
}
