// lib/refreshOptimizer.js
// Professional Refresh Optimizer - Prevents excessive API calls

class RefreshOptimizer {
  constructor() {
    this.lastRefreshTime = 0;
    this.minRefreshInterval = 2000; // 2 seconds minimum between refreshes - more responsive
    this.pendingRefresh = false;
    this.refreshQueue = [];
    this.isProcessing = false;
  }

  // Check if enough time has passed since last refresh
  canRefresh() {
    const now = Date.now();
    return (now - this.lastRefreshTime) >= this.minRefreshInterval;
  }

  // Trigger refresh with debouncing
  async triggerRefresh(refreshFunction) {
    if (this.canRefresh()) {
      // Can refresh immediately
      this.lastRefreshTime = Date.now();
      this.isProcessing = true;
      
      try {
        await refreshFunction();
      } catch (error) {
        console.error('Error during refresh:', error);
      } finally {
        this.isProcessing = false;
        this.processQueue();
      }
    } else {
      // Queue the refresh
      this.queueRefresh(refreshFunction);
    }
  }

  // Queue a refresh for later
  queueRefresh(refreshFunction) {
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
        console.error('Error processing queued refresh:', error);
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
      console.error('Error during forced refresh:', error);
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