// lib/connectionUtils.js
// Utility functions for handling connection issues and safe data operations

/**
 * Check if the browser is online
 * @returns {boolean}
 */
export const isOnline = () => {
    if (typeof window === 'undefined') return true;
    return navigator.onLine;
};

/**
 * Check connection quality by pinging a lightweight endpoint
 * @returns {Promise<'good' | 'slow' | 'offline'>}
 */
export const checkConnectionQuality = async () => {
    if (!isOnline()) return 'offline';

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch('/api/health', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store'
        });
        clearTimeout(timeoutId);

        if (!response.ok) return 'slow';

        const latency = Date.now() - startTime;
        return latency > 5000 ? 'slow' : 'good';
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') return 'slow';
        return 'offline';
    }
};

/**
 * Safe wrapper for Firestore operations with retry logic
 * @template T
 * @param {() => Promise<T>} operation - The Firestore operation to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.retryDelay=1000] - Initial delay between retries in ms
 * @param {boolean} [options.exponentialBackoff=true] - Use exponential backoff
 * @param {(error: Error, attempt: number) => void} [options.onRetry] - Callback on retry
 * @returns {Promise<{success: boolean, data?: T, error?: Error}>}
 */
export const safeFirestoreOperation = async (operation, options = {}) => {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        exponentialBackoff = true,
        onRetry
    } = options;

    // Check if online before attempting
    if (!isOnline()) {
        return {
            success: false,
            error: new Error('OFFLINE'),
            errorType: 'offline'
        };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const data = await operation();
            return { success: true, data };
        } catch (error) {
            lastError = error;

            // Check if it's a network error
            const isNetworkError =
                error.code === 'unavailable' ||
                error.code === 'failed-precondition' ||
                error.message?.includes('network') ||
                error.message?.includes('offline') ||
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('Network request failed');

            // Don't retry for auth errors or permission issues
            const shouldNotRetry =
                error.code === 'permission-denied' ||
                error.code === 'unauthenticated' ||
                error.code === 'not-found';

            if (shouldNotRetry) {
                return {
                    success: false,
                    error: lastError,
                    errorType: error.code
                };
            }

            if (attempt < maxRetries) {
                const delay = exponentialBackoff
                    ? retryDelay * Math.pow(2, attempt - 1)
                    : retryDelay;

                if (onRetry) {
                    onRetry(error, attempt);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));

                // Re-check if still online
                if (!isOnline()) {
                    return {
                        success: false,
                        error: new Error('OFFLINE'),
                        errorType: 'offline'
                    };
                }
            }
        }
    }

    return {
        success: false,
        error: lastError,
        errorType: 'max_retries'
    };
};

/**
 * Queue for pending operations when offline
 */
class OfflineOperationQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.listeners = new Set();
    }

    /**
     * Add operation to queue
     * @param {Object} operation
     */
    add(operation) {
        this.queue.push({
            ...operation,
            timestamp: Date.now(),
            id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        this.notifyListeners();
    }

    /**
     * Get all queued operations
     * @returns {Array}
     */
    getQueue() {
        return [...this.queue];
    }

    /**
     * Clear the queue
     */
    clear() {
        this.queue = [];
        this.notifyListeners();
    }

    /**
     * Remove operation by id
     * @param {string} id
     */
    remove(id) {
        this.queue = this.queue.filter(op => op.id !== id);
        this.notifyListeners();
    }

    /**
     * Subscribe to queue changes
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of queue changes
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.queue);
            } catch (error) {
                console.error('Error in queue listener:', error);
            }
        });
    }

    /**
     * Get queue size
     * @returns {number}
     */
    size() {
        return this.queue.length;
    }
}

// Singleton instance
export const offlineQueue = new OfflineOperationQueue();

/**
 * Create a connection-safe fetch wrapper
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<{success: boolean, response?: Response, error?: Error}>}
 */
export const safeFetch = async (url, options = {}) => {
    if (!isOnline()) {
        return {
            success: false,
            error: new Error('OFFLINE'),
            errorType: 'offline'
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        return {
            success: true,
            response
        };
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            return {
                success: false,
                error: new Error('Request timed out'),
                errorType: 'timeout'
            };
        }

        return {
            success: false,
            error,
            errorType: 'network'
        };
    }
};

/**
 * Hook to monitor connection status (for use in React components)
 */
export const createConnectionMonitor = () => {
    let isConnected = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const listeners = new Set();

    const handleOnline = () => {
        isConnected = true;
        listeners.forEach(cb => cb(true));
    };

    const handleOffline = () => {
        isConnected = false;
        listeners.forEach(cb => cb(false));
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    }

    return {
        isConnected: () => isConnected,
        subscribe: (callback) => {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
        cleanup: () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            }
        }
    };
};
