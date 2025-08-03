import { secureLogger } from './security';
// lib/refreshOptimizer.js
// Professional Refresh Optimizer - Prevents excessive API calls

class RefreshOptimizer {
  constructor() {
    this.lastRefreshTime = 0;
    this.minRefreshInterval = 15000; // Increased from 10 seconds to 15 seconds to prevent excessive calls
    this.pendingRefresh = false;
    this.refreshQueue = [];
    this.isProcessing = false;
    this.rateLimitHit = false;
    this.rateLimitBackoff = 60000; // Increased from 30 seconds to 60 seconds backoff when rate limited
    this.maxQueueSize = 3; // Limit queue size to prevent memory issues
  }

  // Check if enough time has passed since last refresh
  canRefresh() {
    const now = Date.now();
    
    // If we hit rate limit, use longer backoff
    if (this.rateLimitHit) {
      return (now - this.lastRefreshTime) >= this.rateLimitBackoff;
    }
    
    return (now - this.lastRefreshTime) >= this.minRefreshInterval;
  }

  // Mark rate limit hit
  markRateLimitHit() {
    this.rateLimitHit = true;
    this.lastRefreshTime = Date.now();
    secureLogger.log('Rate limit hit, backing off for 30 seconds');
  }

  // Reset rate limit status
  resetRateLimit() {
    this.rateLimitHit = false;
  }

  // Trigger refresh with debouncing
  async triggerRefresh(refreshFunction) {
    secureLogger.log('Refresh optimizer triggered:', {
      canRefresh: this.canRefresh(),
      queueLength: this.refreshQueue.length,
      isProcessing: this.isProcessing,
      rateLimitHit: this.rateLimitHit
    });
    
    if (this.canRefresh()) {
      // Can refresh immediately
      this.lastRefreshTime = Date.now();
      this.isProcessing = true;
      
      try {
        await refreshFunction();
      } catch (error) {
        secureLogger.error('Error during refresh:', error);
      } finally {
        this.isProcessing = false;
        this.processQueue();
      }
    } else {
      // Queue the refresh
      secureLogger.log('Cannot refresh now, queuing request');
      this.queueRefresh(refreshFunction);
    }
  }

  // Queue a refresh for later
  queueRefresh(refreshFunction) {
    // Limit queue size to prevent memory issues
    if (this.refreshQueue.length >= this.maxQueueSize) {
      secureLogger.log('Queue full, dropping oldest refresh request');
      this.refreshQueue.shift(); // Remove oldest request
    }
    
    if (!this.refreshQueue.find(item => item.function === refreshFunction)) {
      this.refreshQueue.push({
        function: refreshFunction,
        timestamp: Date.now()
      });
    }
  }

  // Process queued refreshes
  async processQueue() {
    if (this.isProcessing || this.refreshQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.refreshQueue.length > 0 && this.canRefresh()) {
      const refreshItem = this.refreshQueue.shift();
      this.lastRefreshTime = Date.now();

      try {
        await refreshItem.function();
      } catch (error) {
        secureLogger.error('Error processing queued refresh:', error);
      }
    }

    this.isProcessing = false;
  }

  // Force immediate refresh (bypass debouncing)
  async forceRefresh(refreshFunction) {
    this.lastRefreshTime = Date.now();
    this.isProcessing = true;
    
    try {
      await refreshFunction();
    } catch (error) {
      secureLogger.error('Error during forced refresh:', error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  // Reset the optimizer
  reset() {
    this.lastRefreshTime = 0;
    this.pendingRefresh = false;
    this.refreshQueue = [];
    this.isProcessing = false;
  }

  // Get status
  getStatus() {
    return {
      lastRefreshTime: this.lastRefreshTime,
      canRefresh: this.canRefresh(),
      queueLength: this.refreshQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

// Create singleton instance
const refreshOptimizer = new RefreshOptimizer();

export default refreshOptimizer; 