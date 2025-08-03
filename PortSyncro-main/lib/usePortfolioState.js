// lib/usePortfolioState.js
// Custom hook for portfolio state management

import { useState, useEffect, useCallback, useRef } from 'react';
import portfolioStateManager from './portfolioStateManager';

export function usePortfolioState() {
  const [state, setState] = useState(portfolioStateManager.getState());
  const [isLoading, setIsLoading] = useState(false);
  const unsubscribeRef = useRef(null);

  // Subscribe to portfolio state changes
  useEffect(() => {
    unsubscribeRef.current = portfolioStateManager.subscribe((newState) => {
      setState(newState);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Initialize portfolio
  const initialize = useCallback((initialAssets, initialTransactions) => {
    setIsLoading(true);
    try {
      portfolioStateManager.initialize(initialAssets, initialTransactions);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update transactions
  const updateTransactions = useCallback((transactions) => {
    portfolioStateManager.updateTransactions(transactions);
  }, []);

  // Update prices
  const updatePrices = useCallback((prices) => {
    portfolioStateManager.updatePrices(prices);
  }, []);

  // Update exchange rate
  const updateExchangeRate = useCallback((rate) => {
    portfolioStateManager.updateExchangeRate(rate);
  }, []);

  // Add transaction
  const addTransaction = useCallback(async (transaction) => {
    setIsLoading(true);
    try {
      await portfolioStateManager.addTransaction(transaction);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete asset
  const deleteAsset = useCallback((assetType, symbol) => {
    setIsLoading(true);
    try {
      portfolioStateManager.deleteAsset(assetType, symbol);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get asset
  const getAsset = useCallback((assetType, symbol) => {
    return portfolioStateManager.getAsset(assetType, symbol);
  }, []);

  // Get portfolio summary
  const getPortfolioSummary = useCallback(() => {
    return portfolioStateManager.getPortfolioSummary();
  }, []);

  // Reset portfolio
  const reset = useCallback(() => {
    setIsLoading(true);
    try {
      portfolioStateManager.reset();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rebuild portfolio
  const rebuildPortfolio = useCallback(() => {
    setIsLoading(true);
    try {
      portfolioStateManager.rebuildPortfolio();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Expose portfolioStateManager to window for debugging and direct access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.portfolioStateManager = portfolioStateManager;
    }
  }, []);

  return {
    // State
    assets: state.assets,
    transactions: state.transactions,
    prices: state.prices,
    exchangeRate: state.exchangeRate,
    lastUpdate: state.lastUpdate,
    isInitialized: state.isInitialized,
    
    // Loading state
    isLoading,
    
    // Functions
    initialize,
    updateTransactions,
    updatePrices,
    updateExchangeRate,
    addTransaction,
    deleteAsset,
    getAsset,
    getPortfolioSummary,
    reset,
    rebuildPortfolio
  };
} 