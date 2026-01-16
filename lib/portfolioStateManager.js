// lib/portfolioStateManager.js
// Professional Portfolio State Manager - Similar to real trading platforms

import { calculatePositionFromTransactions, cleanFractionalLots } from './utils';
import { secureLogger } from './security';

class PortfolioStateManager {
  constructor() {
    this.state = {
      assets: { stocks: [], crypto: [], cash: [] },
      transactions: [],
      prices: {},
      exchangeRate: null,
      lastUpdate: null,
      isInitialized: false,
      pendingUpdates: new Set(),
      updateQueue: []
    };

    this.subscribers = new Set();
    this.updateInProgress = false;
    this.batchUpdates = [];
    this.lastTransactionHash = '';
  }

  // Subscribe to state changes
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Notify all subscribers
  notify() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.getState());
      } catch (error) {
        secureLogger.error('Error in portfolio state subscriber:', error);
      }
    });
  }

  // Get current state
  getState() {
    return {
      ...this.state,
      assets: { ...this.state.assets },
      transactions: [...this.state.transactions],
      prices: { ...this.state.prices }
    };
  }

  // Initialize portfolio
  initialize(initialAssets, initialTransactions = []) {
    this.state.assets = initialAssets || { stocks: [], crypto: [], cash: [] };
    this.state.transactions = initialTransactions;
    this.state.isInitialized = true;
    this.state.lastUpdate = new Date().toISOString();
    this.notify();
  }

  // Update transactions with batching and race condition handling
  updateTransactions(newTransactions) {
    if (!newTransactions || !Array.isArray(newTransactions)) return;

    // Create a hash to detect changes
    const transactionHash = newTransactions.map(tx => `${tx.id}-${tx.timestamp}`).join('|');

    // Check if transactions have actually changed
    if (this.lastTransactionHash === transactionHash) {
      secureLogger.log('No transaction changes detected, skipping update');
      return;
    }

    // Prevent race conditions by checking if update is in progress
    if (this.updateInProgress) {
      secureLogger.log('Update in progress, queuing transaction update');
      this.batchUpdates.push({ type: 'transactions', data: newTransactions });
      return;
    }

    this.lastTransactionHash = transactionHash;

    // Remove duplicates and ensure unique transactions
    const uniqueTransactions = newTransactions.filter((tx, index, self) =>
      index === self.findIndex(t => t.id === tx.id)
    );

    this.state.transactions = uniqueTransactions;

    secureLogger.log(`Updated transactions: ${uniqueTransactions.length} unique transactions`);

    // Rebuild portfolio from transactions
    this.rebuildPortfolio();
  }

  // Update prices with batching and race condition handling
  updatePrices(newPrices) {
    if (!newPrices || typeof newPrices !== 'object') return;

    const hasChanges = Object.keys(newPrices).some(key =>
      this.state.prices[key]?.price !== newPrices[key]?.price
    );

    if (!hasChanges) return;

    // Prevent race conditions by checking if update is in progress
    if (this.updateInProgress) {
      secureLogger.log('Update in progress, queuing price update');
      this.batchUpdates.push({ type: 'prices', data: newPrices });
      return;
    }

    this.state.prices = { ...this.state.prices, ...newPrices };
    this.state.lastUpdate = new Date().toISOString();

    // Update portfolio values without full rebuild
    this.updatePortfolioValues();
  }

  // Update exchange rate
  updateExchangeRate(rate) {
    // Handle case where rate might be an event object instead of a number
    const numericRate = typeof rate === 'number' ? rate : null;

    if (this.state.exchangeRate === numericRate) return;

    this.state.exchangeRate = numericRate;
    this.state.lastUpdate = new Date().toISOString();

    // Update portfolio values
    this.updatePortfolioValues();
  }

  // Rebuild portfolio from transactions (like real trading platforms)
  rebuildPortfolio() {
    if (!this.state.isInitialized || this.state.transactions.length === 0) {
      return;
    }

    secureLogger.log('PortfolioStateManager: Rebuilding portfolio from', this.state.transactions.length, 'transactions');

    const newAssets = this.buildAssetsFromTransactions(
      this.state.transactions,
      this.state.prices
    );

    this.state.assets = newAssets;
    this.state.lastUpdate = new Date().toISOString();
    this.notify();
  }

  // Build assets from transactions (optimized)
  buildAssetsFromTransactions(transactions, prices) {
    secureLogger.log('Building assets from transactions:', transactions.length, 'transactions');
    secureLogger.log('Available prices:', Object.keys(prices));

    const stocksMap = new Map();
    const cryptoMap = new Map();
    const cashMap = new Map();

    // For portfolio calculation, we include ALL transactions regardless of deletedFromHistory flag
    // The deletedFromHistory flag only affects the transaction history display, not portfolio calculation
    const validTransactions = transactions;
    secureLogger.log(`Processing ${validTransactions.length} transactions for portfolio calculation (including deleted from history)`);

    // Sort transactions by timestamp to ensure chronological processing
    const sortedTransactions = [...validTransactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    secureLogger.log(`Processing ${sortedTransactions.length} transactions chronologically...`);
    secureLogger.log('Transaction details:', sortedTransactions.map(tx => ({
      type: tx.type,
      assetType: tx.assetType,
      ticker: tx.ticker,
      symbol: tx.symbol,
      amount: tx.amount,
      timestamp: tx.timestamp
    })));

    // Process transactions chronologically
    // We need to handle the case where an asset is deleted and then bought again
    // So we'll process all transactions and let the position calculation handle the logic

    sortedTransactions.forEach(tx => {
      // secureLogger.log(`Processing transaction: ${tx.type} ${tx.assetType} ${tx.ticker || tx.symbol} amount: ${tx.amount} at ${tx.timestamp}`);


      if (tx.type === 'delete') {
        // For delete transactions, we'll add them to the maps but with special handling
        // This way, the position calculation can handle the deletion logic
        if (tx.assetType === 'stock' && tx.ticker) {
          const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
          const key = tx.ticker.toUpperCase() + brokerKey;
          if (!stocksMap.has(key)) stocksMap.set(key, []);
          stocksMap.get(key).push(tx);
          secureLogger.log(`Added delete transaction for stock ${key}`);
        } else if (tx.assetType === 'crypto' && tx.symbol) {
          const exchangeKey = tx.exchange ? `|${tx.exchange.trim().toUpperCase()}` : '';
          const key = tx.symbol.toUpperCase() + exchangeKey;
          if (!cryptoMap.has(key)) cryptoMap.set(key, []);
          cryptoMap.get(key).push(tx);
          secureLogger.log(`Added delete transaction for crypto ${key}`);
        } else if (tx.assetType === 'cash' && tx.ticker) {
          const key = tx.ticker.toUpperCase();
          if (!cashMap.has(key)) cashMap.set(key, []);
          cashMap.get(key).push(tx);
          secureLogger.log(`Added delete transaction for cash ${key}`);
        }
      } else {
        // Process all non-delete transactions normally
        if (tx.assetType === 'stock' && tx.ticker) {
          const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
          const key = tx.ticker.toUpperCase() + brokerKey;
          if (!stocksMap.has(key)) stocksMap.set(key, []);
          stocksMap.get(key).push(tx);
          secureLogger.log(`Added ${tx.type} transaction for stock ${key}: amount=${tx.amount}, price=${tx.price}`);
        } else if (tx.assetType === 'crypto' && tx.symbol) {
          const exchangeKey = tx.exchange ? `|${tx.exchange.trim().toUpperCase()}` : '';
          const key = tx.symbol.toUpperCase() + exchangeKey;
          if (!cryptoMap.has(key)) cryptoMap.set(key, []);
          cryptoMap.get(key).push(tx);
          secureLogger.log(`Added ${tx.type} transaction for crypto ${key}: amount=${tx.amount}, price=${tx.price}`);
        } else if (tx.assetType === 'cash' && tx.ticker) {
          const key = tx.ticker.toUpperCase();
          if (!cashMap.has(key)) cashMap.set(key, []);
          cashMap.get(key).push(tx);
          secureLogger.log(`Added ${tx.type} transaction for cash ${key}: amount=${tx.amount}`);
        }
      }
    });

    secureLogger.log(`Building assets from maps - Stocks: ${stocksMap.size}, Crypto: ${cryptoMap.size}, Cash: ${cashMap.size}`);

    // Build stocks
    const stocks = Array.from(stocksMap.entries())
      .map(([key, txs]) => { // Key is "TICKER" or "TICKER|BROKER"
        // Need to extract ticker from the key or transaction because key might contain broker
        const firstTx = txs.find(t => t.ticker) || txs[0];
        const ticker = firstTx ? firstTx.ticker.toUpperCase() : key.split('|')[0];
        const broker = firstTx ? firstTx.broker : (key.includes('|') ? key.split('|')[1] : undefined);

        secureLogger.log(`Processing stock ${ticker} (${broker || 'No Broker'}) with ${txs.length} transactions`);

        // Detect market from transactions
        const sampleTx = txs.find(t => t.market) || txs[0];
        let market = sampleTx?.market;

        // If market is not explicitly set, infer from currency or default to IDX
        if (!market) {
          if (sampleTx?.currency === 'USD') {
            market = 'US';
          } else {
            market = 'IDX';
          }
        }

        const priceData = prices[`${ticker}.JK`] || prices[ticker];
        let currentPrice = priceData?.price || 0;

        // Check if the latest transaction has manual price set
        const latestTx = txs[txs.length - 1];
        const useManualPrice = latestTx?.useManualPrice || false;
        const manualPrice = latestTx?.manualPrice || null;

        // If manual price is set, use it instead of market price
        if (useManualPrice && manualPrice !== null) {
          currentPrice = manualPrice;
          secureLogger.log(`Using manual price for ${ticker}: ${currentPrice}`);
        } else if (currentPrice === 0 && txs.length > 0) {
          // If no current price available and no manual price, use the latest transaction price as fallback
          currentPrice = latestTx.price || 0;
          secureLogger.log(`Using transaction price as fallback for ${ticker}: ${currentPrice}`);
        }

        const position = calculatePositionFromTransactions(txs, currentPrice, this.state.exchangeRate);

        if (position.amount <= 0) return null;

        // Debug logging for average price calculation
        secureLogger.log(`Building stock ${ticker}:`, {
          amount: position.amount,
          avgPrice: position.avgPrice,
          currentPrice: currentPrice,
          totalCost: position.totalCost,
          currency: market === 'US' ? 'USD' : 'IDR',
          market: market
        });

        const totalShares = position.amount;
        let wholeLots = 0;

        if (market === 'US') {
          // US Stocks: 1 unit is 1 share, displayed as "lots" property for consistency but represents shares
          wholeLots = totalShares;
        } else {
          // IDX Stocks: Ensure shares are always multiples of 100 (whole lots)
          const calculatedLots = totalShares / 100;
          wholeLots = cleanFractionalLots(calculatedLots);

          // If there are remaining shares that don't make a whole lot, log a warning
          const remainingShares = totalShares % 100;
          if (remainingShares > 0) {
            secureLogger.warn(`Stock ${ticker} has ${remainingShares} remaining shares that don't make a whole lot. Total shares: ${totalShares}, calculated lots: ${calculatedLots}, cleaned lots: ${wholeLots}`);
          }
        }

        return {
          ticker,
          lots: wholeLots, // Represents Lots for IDX, Shares for US
          market, // Store market info
          avgPrice: position.avgPrice,
          totalCost: position.totalCost,
          totalCostIDR: position.totalCostIDR,
          totalCostUSD: position.totalCostUSD,
          currentPrice,
          gain: position.gain,
          gainIDR: position.gainIDR,
          gainUSD: position.gainUSD,
          porto: position.porto,
          portoIDR: position.portoIDR,
          currentPrice,
          gain: position.gain,
          gainIDR: position.gainIDR,
          gainUSD: position.gainUSD,
          porto: position.porto,
          portoIDR: position.portoIDR,
          portoUSD: position.portoUSD,
          gainPercentage: position.gainPercentage,
          currency: market === 'US' ? 'USD' : 'IDR',
          assetType: 'stock',
          broker: broker, // Store broker for grouping
          useManualPrice: useManualPrice,
          manualPrice: manualPrice,
          lastUpdate: new Date().toISOString()
        };
      })
      .filter(Boolean);

    // Build crypto
    const crypto = Array.from(cryptoMap.entries())
      .map(([key, txs]) => {
        const firstTx = txs.find(t => t.symbol) || txs[0];
        const symbol = firstTx ? firstTx.symbol.toUpperCase() : key.split('|')[0];
        const exchange = firstTx ? firstTx.exchange : (key.includes('|') ? key.split('|')[1] : undefined);

        secureLogger.log(`Processing crypto ${symbol} (${exchange || 'No Exchange'}) with ${txs.length} transactions`);
        const priceData = prices[symbol];
        let currentPrice = priceData?.price || 0;

        // Check if the latest transaction has manual price set
        const latestTx = txs[txs.length - 1];
        const useManualPrice = latestTx?.useManualPrice || false;
        const manualPrice = latestTx?.manualPrice || null;

        // If manual price is set, use it instead of market price
        if (useManualPrice && manualPrice !== null) {
          currentPrice = manualPrice;
          secureLogger.log(`Using manual price for crypto ${symbol}: ${currentPrice}`);
        } else if (currentPrice === 0 && txs.length > 0) {
          // If no current price available and no manual price, use the latest transaction price as fallback
          currentPrice = latestTx.price || 0;
          secureLogger.log(`Using transaction price as fallback for crypto ${symbol}: ${currentPrice}`);
        }

        const position = calculatePositionFromTransactions(txs, currentPrice, this.state.exchangeRate);

        if (position.amount <= 0) {
          secureLogger.log(`Skipping ${symbol} - amount is 0 or negative`);
          return null;
        }

        secureLogger.log(`Built crypto asset ${symbol}:`, {
          amount: position.amount,
          avgPrice: position.avgPrice,
          currentPrice,
          gain: position.gain
        });

        return {
          symbol,
          amount: position.amount,
          avgPrice: position.avgPrice,
          totalCost: position.totalCost,
          totalCostIDR: position.totalCostIDR,
          totalCostUSD: position.totalCostUSD,
          currentPrice,
          gain: position.gain,
          gainIDR: position.gainIDR,
          gainUSD: position.gainUSD,
          porto: position.porto,
          portoIDR: position.portoIDR,
          portoUSD: position.portoUSD,
          gainPercentage: position.gainPercentage,
          currency: 'USD',
          assetType: 'crypto',
          exchange: exchange, // Store exchange for grouping
          useManualPrice: useManualPrice,
          manualPrice: manualPrice,
          lastUpdate: new Date().toISOString()
        };
      })
      .filter(Boolean);

    // Build cash
    const cash = Array.from(cashMap.entries())
      .map(([ticker, txs]) => {
        // For cash, price is always 1 (base currency value)
        const currentPrice = 1;
        const position = calculatePositionFromTransactions(txs, currentPrice, this.state.exchangeRate);

        if (position.amount <= 0) return null;

        return {
          ticker, // Bank Name
          amount: position.amount, // Total Balance
          avgPrice: 1,
          totalCost: position.amount, // Cost is same as amount for cash
          currentPrice: 1,
          gain: 0,
          porto: position.amount,
          portoIDR: position.amount,
          portoUSD: this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round((position.amount / this.state.exchangeRate) * 100) / 100 : 0,
          gainPercentage: 0,
          currency: 'IDR',
          type: 'cash',
          assetType: 'cash',
          lastUpdate: new Date().toISOString()
        };
      })
      .filter(Boolean);

    secureLogger.log(`Final portfolio - Stocks: ${stocks.length}, Crypto: ${crypto.length}, Cash: ${cash.length}`);
    return { stocks, crypto, cash };
  }

  // Update portfolio values without full rebuild
  updatePortfolioValues() {
    if (!this.state.isInitialized) return;

    secureLogger.log('Updating portfolio values with current prices');
    secureLogger.log('Current exchange rate:', this.state.exchangeRate);
    secureLogger.log('Available prices:', Object.keys(this.state.prices));

    // Update stocks portfolio values
    this.state.assets.stocks = this.state.assets.stocks.map(stock => {
      const priceData = this.state.prices[`${stock.ticker}.JK`] || this.state.prices[stock.ticker];
      const currentPrice = priceData?.price || stock.currentPrice || 0;

      if (currentPrice > 0) {
        // Recalculate portfolio value for stocks
        const totalShares = stock.lots * 100; // 1 lot = 100 shares for display
        const currentValue = currentPrice * totalShares;
        const costBasis = stock.avgPrice * totalShares;
        const gain = currentValue - costBasis;
        const gainUSD = this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round((gain / this.state.exchangeRate) * 100) / 100 : 0;
        const gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        secureLogger.log(`Updated stock ${stock.ticker}:`, {
          lots: stock.lots,
          currentPrice,
          currentValue,
          costBasis,
          gain,
          gainUSD,
          gainPercentage
        });

        return {
          ...stock,
          currentPrice,
          porto: currentValue,
          portoIDR: currentValue,
          portoUSD: this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round((currentValue / this.state.exchangeRate) * 100) / 100 : 0,
          gain,
          gainIDR: gain,
          gainUSD,
          gainPercentage,
          lastUpdate: new Date().toISOString()
        };
      }

      return stock;
    });

    // Update crypto portfolio values
    this.state.assets.crypto = this.state.assets.crypto.map(crypto => {
      const priceData = this.state.prices[crypto.symbol];
      const currentPrice = priceData?.price || crypto.currentPrice || 0;

      if (currentPrice > 0) {
        // Recalculate portfolio value for crypto
        const currentValue = currentPrice * crypto.amount;
        const costBasis = crypto.avgPrice * crypto.amount;
        const gain = currentValue - costBasis;
        const gainIDR = this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round(gain * this.state.exchangeRate) : 0;
        const gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        secureLogger.log(`Updated crypto ${crypto.symbol}:`, {
          amount: crypto.amount,
          currentPrice,
          currentValue,
          costBasis,
          gain,
          gainIDR,
          gainPercentage
        });

        return {
          ...crypto,
          currentPrice,
          porto: currentValue,
          portoUSD: currentValue,
          portoIDR: this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round(currentValue * this.state.exchangeRate) : 0,
          gain,
          gainUSD: gain,
          gainIDR,
          gainPercentage,
          lastUpdate: new Date().toISOString()
        };
      }

      return crypto;
    });

    // Update cash values (for USD conversion)
    this.state.assets.cash = this.state.assets.cash.map(cash => {
      // Cash value only changes with exchange rate for USD view
      const portoIDR = cash.amount;
      const portoUSD = this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round((portoIDR / this.state.exchangeRate) * 100) / 100 : 0;

      return {
        ...cash,
        porto: portoIDR,
        portoIDR: portoIDR,
        portoUSD: portoUSD,
        lastUpdate: new Date().toISOString()
      };
    });

    this.state.lastUpdate = new Date().toISOString();
    secureLogger.log('Portfolio values updated successfully');
    this.notify();
  }

  // Add transaction with proper state management
  async addTransaction(transaction) {
    const transactionId = transaction.id || Date.now().toString();

    // Check if transaction is already pending
    if (this.state.pendingUpdates.has(transactionId)) {
      secureLogger.log(`Transaction ${transactionId} already pending, skipping`);
      return;
    }

    // Check if transaction already exists in current transactions
    const existingTransaction = this.state.transactions.find(t => t.id === transactionId);
    if (existingTransaction) {
      secureLogger.log(`Transaction ${transactionId} already exists, skipping`);
      return;
    }

    // Add to pending updates
    this.state.pendingUpdates.add(transactionId);

    // Add to queue for batch processing
    this.batchUpdates.push(transaction);

    // Process batch if not already in progress
    if (!this.updateInProgress) {
      this.processBatchUpdates();
    }
  }

  // Process queued updates
  async processBatchUpdates() {
    if (this.updateInProgress || this.batchUpdates.length === 0) return;

    this.updateInProgress = true;

    try {
      secureLogger.log(`Processing ${this.batchUpdates.length} queued updates`);

      while (this.batchUpdates.length > 0) {
        const update = this.batchUpdates.shift();

        switch (update.type) {
          case 'transactions':
            this.state.transactions = update.data;
            this.rebuildPortfolio();
            break;
          case 'prices':
            this.state.prices = { ...this.state.prices, ...update.data };
            this.updatePortfolioValues();
            break;
          case 'delete':
            // Handle delete transaction - rebuild portfolio to reflect deletion
            this.rebuildPortfolio();
            break;
          default:
            secureLogger.warn('Unknown update type:', update.type);
        }
      }

      secureLogger.log('Batch updates processed successfully');
    } catch (error) {
      secureLogger.error('Error processing batch updates:', error);
      // Clear the queue on error to prevent infinite retries
      this.batchUpdates = [];
    } finally {
      // Always reset the flag, even if there was an error
      this.updateInProgress = false;
    }
  }

  // Delete asset with proper cleanup (and broker/exchange support)
  deleteAsset(assetType, symbol, additionalInfo = null) {
    const deleteTransaction = {
      id: `delete_${Date.now()}`,
      assetType,
      [assetType === 'stock' || assetType === 'cash' ? 'ticker' : 'symbol']: symbol.toUpperCase(),
      type: 'delete',
      amount: 0,
      price: 0,
      total: 0,
      timestamp: new Date().toISOString(),
      description: 'Asset deleted by user',
      source: 'portfolio'
    };

    // Add broker/exchange info if available
    if (assetType === 'stock' && additionalInfo) {
      deleteTransaction.broker = additionalInfo;
    } else if (assetType === 'crypto' && additionalInfo) {
      deleteTransaction.exchange = additionalInfo;
    }

    this.addTransaction(deleteTransaction);
  }

  // Get asset by symbol
  getAsset(assetType, symbol) {
    const mapType = assetType === 'stock' ? 'stocks' : (assetType === 'cash' ? 'cash' : 'crypto');
    const assets = this.state.assets[mapType];
    return assets.find(asset =>
      (assetType === 'stock' || assetType === 'cash' ? asset.ticker : asset.symbol).toUpperCase() === symbol.toUpperCase()
    );
  }

  // Get portfolio summary
  getPortfolioSummary() {
    const stocks = this.state.assets.stocks;
    const crypto = this.state.assets.crypto;
    const cash = this.state.assets.cash;

    const totalValue = stocks.reduce((sum, stock) => sum + (stock.porto || 0), 0) +
      crypto.reduce((sum, crypto) => sum + (crypto.porto || 0), 0) +
      cash.reduce((sum, c) => sum + (c.porto || 0), 0);

    const totalCost = stocks.reduce((sum, stock) => sum + (stock.totalCost || 0), 0) +
      crypto.reduce((sum, crypto) => sum + (crypto.totalCost || 0), 0) +
      cash.reduce((sum, c) => sum + (c.totalCost || 0), 0);

    const totalGain = totalValue - totalCost;
    const totalGainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      totalValue,
      totalCost,
      totalGain,
      assetCount: stocks.length + crypto.length + cash.length,
      lastUpdate: this.state.lastUpdate
    };
  }

  // Reset state
  reset() {
    this.state = {
      assets: { stocks: [], crypto: [], cash: [] },
      transactions: [],
      prices: {},
      exchangeRate: null,
      lastUpdate: null,
      isInitialized: false,
      pendingUpdates: new Set(),
      updateQueue: []
    };
    this.lastTransactionHash = '';
    this.updateInProgress = false;
    this.batchUpdates = [];
    this.notify();
  }
}

// Create singleton instance
const portfolioStateManager = new PortfolioStateManager();

export default portfolioStateManager; 