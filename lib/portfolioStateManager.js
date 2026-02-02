// lib/portfolioStateManager.js
// Professional Portfolio State Manager - Similar to real trading platforms

import { calculatePositionFromTransactions, cleanFractionalLots } from './utils';
import { secureLogger } from './security';

class PortfolioStateManager {
  constructor() {
    this.state = {
      assets: { stocks: [], crypto: [], gold: [], cash: [] },
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
    this.cachedSnapshot = null; // Memoize the public state
  }

  // Subscribe to state changes
  subscribe(callback) {
    this.subscribers.add(callback);
    // Send current state immediately upon subscription
    try {
      callback(this.getState());
    } catch (error) {
      secureLogger.error('Error in initial subscription callback:', error);
    }
    return () => this.subscribers.delete(callback);
  }

  // Notify all subscribers
  notify() {
    // Invalidate cache before notifying to ensure fresh state
    this.invalidateSnapshot();
    const snapshot = this.getState();

    this.subscribers.forEach(callback => {
      try {
        callback(snapshot);
      } catch (error) {
        secureLogger.error('Error in portfolio state subscriber:', error);
      }
    });
  }

  // Invalidate any cached snapshot
  invalidateSnapshot() {
    this.cachedSnapshot = null;
  }

  // Get current state (Memoized)
  getState() {
    if (this.cachedSnapshot) {
      return this.cachedSnapshot;
    }

    // Create new snapshot
    this.cachedSnapshot = {
      ...this.state,
      assets: this.state.assets, // Reference sharing is okay as long as we treat it immutable outside
      transactions: this.state.transactions,
      prices: this.state.prices
    };

    return this.cachedSnapshot;
  }

  // Initialize portfolio
  initialize(initialAssets, initialTransactions = []) {
    // Ensure all asset arrays exist with defaults, even if initialAssets is partial
    const defaultAssets = { stocks: [], crypto: [], cash: [] };
    this.state.assets = {
      stocks: initialAssets?.stocks || defaultAssets.stocks,
      crypto: initialAssets?.crypto || defaultAssets.crypto,
      gold: initialAssets?.gold || [],
      cash: initialAssets?.cash || defaultAssets.cash
    };
    this.state.transactions = initialTransactions;
    this.state.isInitialized = true;
    this.state.lastUpdate = new Date().toISOString();
    this.notify(); // Will invalidate and notify
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
    // Allows rebuilding even if not fully initialized or if transactions are empty (to clear assets)
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
    // secureLogger.log('Building assets from transactions:', transactions.length, 'transactions');
    // secureLogger.log('Available prices:', Object.keys(prices));

    const stocksMap = new Map();
    const cryptoMap = new Map();
    const goldMap = new Map();
    const cashMap = new Map();

    // For portfolio calculation, we include ALL transactions regardless of deletedFromHistory flag
    // The deletedFromHistory flag only affects the transaction history display, not portfolio calculation
    const validTransactions = transactions;
    // secureLogger.log(`Processing ${validTransactions.length} transactions for portfolio calculation (including deleted from history)`);

    // Sort transactions by timestamp to ensure chronological processing
    const sortedTransactions = [...validTransactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    // secureLogger.log(`Processing ${sortedTransactions.length} transactions chronologically...`);
    /* secureLogger.log('Transaction details:', sortedTransactions.map(tx => ({
      type: tx.type,
      assetType: tx.assetType,
      ticker: tx.ticker,
      symbol: tx.symbol,
      amount: tx.amount,
      timestamp: tx.timestamp
    }))); */

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
        } else if (tx.assetType === 'gold' && tx.ticker) {
          const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
          const key = tx.ticker.toUpperCase() + brokerKey;
          if (!goldMap.has(key)) goldMap.set(key, []);
          goldMap.get(key).push(tx);
          secureLogger.log(`Added delete transaction for gold ${key}`);
        }
      } else {
        // Process all non-delete transactions normally
        if (tx.assetType === 'stock' && tx.ticker) {
          const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
          const key = tx.ticker.toUpperCase() + brokerKey;
          if (!stocksMap.has(key)) stocksMap.set(key, []);
          stocksMap.get(key).push(tx);
          // secureLogger.log(`Added ${tx.type} transaction for stock ${key}: amount=${tx.amount}, price=${tx.price}`);
        } else if (tx.assetType === 'crypto' && tx.symbol) {
          const exchangeKey = tx.exchange ? `|${tx.exchange.trim().toUpperCase()}` : '';
          const key = tx.symbol.toUpperCase() + exchangeKey;
          if (!cryptoMap.has(key)) cryptoMap.set(key, []);
          cryptoMap.get(key).push(tx);
          // secureLogger.log(`Added ${tx.type} transaction for crypto ${key}: amount=${tx.amount}, price=${tx.price}`);
        } else if (tx.assetType === 'cash' && tx.ticker) {
          const key = tx.ticker.toUpperCase();
          if (!cashMap.has(key)) cashMap.set(key, []);
          cashMap.get(key).push(tx);
          // secureLogger.log(`Added ${tx.type} transaction for cash ${key}: amount=${tx.amount}`);
        } else if (tx.assetType === 'gold' && tx.ticker) {
          const brokerKey = tx.broker ? `|${tx.broker.trim().toUpperCase()}` : '';
          const key = tx.ticker.toUpperCase() + brokerKey;
          if (!goldMap.has(key)) goldMap.set(key, []);
          goldMap.get(key).push(tx);
        }
      }
    });

    // secureLogger.log(`Building assets from maps - Stocks: ${stocksMap.size}, Crypto: ${cryptoMap.size}, Cash: ${cashMap.size}`);

    // Build stocks
    const stocks = Array.from(stocksMap.entries())
      .map(([key, txs]) => { // Key is "TICKER" or "TICKER|BROKER"
        // Need to extract ticker from the key or transaction because key might contain broker
        const firstTx = txs.find(t => t.ticker) || txs[0];
        const ticker = firstTx ? firstTx.ticker.toUpperCase() : key.split('|')[0];
        const broker = firstTx ? firstTx.broker : (key.includes('|') ? key.split('|')[1] : undefined);

        // secureLogger.log(`Processing stock ${ticker} (${broker || 'No Broker'}) with ${txs.length} transactions`);

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
        const isManual = latestTx?.isManual || false; // Also read isManual flag
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
        /* secureLogger.log(`Building stock ${ticker}:`, {
          amount: position.amount,
          avgPrice: position.avgPrice,
          currentPrice: currentPrice,
          totalCost: position.totalCost,
          currency: market === 'US' ? 'USD' : 'IDR',
          market: market
        }); */

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
          portoUSD: position.portoUSD,
          gainPercentage: position.gainPercentage,
          currency: market === 'US' ? 'USD' : 'IDR',
          assetType: 'stock',
          broker: broker, // Store broker for grouping
          useManualPrice: useManualPrice,
          isManual: isManual, // Store isManual from latest transaction
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

        // secureLogger.log(`Processing crypto ${symbol} (${exchange || 'No Exchange'}) with ${txs.length} transactions`);
        const priceData = prices[symbol];
        let currentPrice = priceData?.price || 0;

        // Check if the latest transaction has manual price set
        const latestTx = txs[txs.length - 1];
        const useManualPrice = latestTx?.useManualPrice || false;
        const isManual = latestTx?.isManual || false; // Also read isManual flag
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

        /* secureLogger.log(`Built crypto asset ${symbol}:`, {
          amount: position.amount,
          avgPrice: position.avgPrice,
          currentPrice,
          gain: position.gain
        }); */

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
          isManual: isManual, // Store isManual from latest transaction
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



    // Build gold
    const gold = Array.from(goldMap.entries())
      .map(([key, txs]) => { // Key is "TICKER" or "TICKER|BROKER"
        const goldPrices = prices.gold || {}; // Access nested gold prices structure if available
        let currentPrice = 0;

        const firstTx = txs.find(t => t.ticker) || txs[0];
        const ticker = firstTx ? firstTx.ticker.toUpperCase() : key.split('|')[0];
        const broker = firstTx ? firstTx.broker : (key.includes('|') ? key.split('|')[1] : undefined);

        const sampleTx = txs.find(t => t.type !== 'delete') || txs[0];
        const subtype = sampleTx.subtype || 'digital';
        let brand = sampleTx.brand || 'pegadaian';

        // Extract brand from ticker if not properly set (e.g., GOLD-ANTAM -> antam)
        if (ticker && ticker.includes('-')) {
          const extractedBrand = ticker.split('-')[1]?.toLowerCase();
          // If extracted brand is a known physical brand, use it
          if (['antam', 'ubs', 'galeri24'].includes(extractedBrand)) {
            brand = extractedBrand;
            secureLogger.log(`Extracted brand '${brand}' from ticker '${ticker}'`);
          }
        }

        // Auto-detect subtype from ticker if not explicitly set
        const effectiveSubtype = ticker?.toUpperCase() === 'GOLD-DIGITAL' ? 'digital' :
          (ticker?.includes('-') && ['ANTAM', 'UBS', 'GALERI24'].includes(ticker.split('-')[1]?.toUpperCase()) ? 'physical' : subtype);

        // Determine current price and change based on subtype/brand
        let currentChange = null;
        if (effectiveSubtype === 'digital') {
          // For digital, we use sellPrice (Buyback price) for valuation usually
          currentPrice = goldPrices.digital?.sellPrice || goldPrices.digital?.price || 0;
          currentChange = goldPrices.digital?.change !== undefined ? goldPrices.digital?.change : null;
          secureLogger.log(`Gold ${ticker}: Using digital price ${currentPrice}`);
        } else {
          // Normalize brand name for lookup (Antam, UBS, Galeri24)
          const b = (brand || '').toLowerCase().trim();

          if (goldPrices.physical && goldPrices.physical[b]) {
            currentPrice = goldPrices.physical[b].price || 0;
            // Use digital change (Global Proxy) for Physical Gold too
            currentChange = goldPrices.digital?.change !== undefined ? goldPrices.digital?.change : null;
            secureLogger.log(`Gold ${ticker}: Using physical price for brand '${b}': ${currentPrice}`);
          } else {
            // Try to find brand in physical keys blindly if exact match fails
            const physicalKeys = goldPrices.physical ? Object.keys(goldPrices.physical) : [];
            const matchingKey = physicalKeys.find(k => k.toLowerCase() === b.toLowerCase());

            if (matchingKey) {
              currentPrice = goldPrices.physical[matchingKey].price || 0;
              currentChange = goldPrices.digital?.change !== undefined ? goldPrices.digital?.change : null;
              secureLogger.log(`Gold ${ticker}: Found fuzzy match for brand '${b}' -> '${matchingKey}': ${currentPrice}`);
            } else if (goldPrices.digital?.sellPrice) {
              // Fallback to digital sell price if specific physical price not found
              currentPrice = goldPrices.digital.sellPrice;
              currentChange = goldPrices.digital?.change !== undefined ? goldPrices.digital?.change : null;
              secureLogger.warn(`Gold ${ticker}: Physical brand '${b}' not found in prices, using digital sellPrice: ${currentPrice}`);
            } else {
              // Only warn if we have some gold prices loaded but can't find this specific one
              if (goldPrices && (goldPrices.physical || goldPrices.digital)) {
                secureLogger.warn(`Gold ${ticker}: No gold prices available, effectiveSubtype=${effectiveSubtype}, brand='${b}', goldPrices=${JSON.stringify(goldPrices)}`);
              } else {
                // During initialization, prices might not be loaded yet - use debug log instead of warning
                secureLogger.log(`Gold ${ticker}: Price data pending initialization...`);
              }
            }
          }
        }

        // Check for manual price override
        const latestTx = txs[txs.length - 1];
        const useManualPrice = latestTx?.useManualPrice || false;
        const isManual = latestTx?.isManual || false; // Also read isManual flag
        const manualPrice = latestTx?.manualPrice || null;

        if (useManualPrice && manualPrice !== null) {
          currentPrice = manualPrice;
          currentChange = null; // Manual price has no market change
        } else if (currentPrice === 0 && txs.length > 0) {
          // Fallback: use currentPrice from transaction (live market price at time of add)
          // NOT tx.price which is now the purchase price
          currentPrice = latestTx.currentPrice || latestTx.price || 0;
          secureLogger.log(`Gold ${ticker}: Fallback to tx.currentPrice: ${currentPrice}`);
        }

        const pos = calculatePositionFromTransactions(txs, currentPrice, this.state.exchangeRate); // Gold is IDR based typically

        if (pos.amount <= 0) return null;

        return {
          ticker: ticker, // e.g. "GOLD-DIGITAL"
          name: sampleTx.name || ticker,
          weight: pos.amount, // Grams
          amount: pos.amount, // Generic amount field
          lots: pos.amount, // reuse lots
          avgPrice: pos.avgPrice,
          totalCost: pos.totalCost,
          currentPrice: currentPrice,
          change: currentChange, // Pass the change data
          gain: pos.gain,
          gainIDR: pos.gain, // Gold usually IDR
          gainUSD: this.state.exchangeRate ? pos.gain / this.state.exchangeRate : 0,
          porto: pos.porto,
          portoIDR: pos.porto,
          portoUSD: this.state.exchangeRate ? pos.porto / this.state.exchangeRate : 0,
          gainPercentage: pos.gainPercentage || 0,
          currency: 'IDR',
          market: 'Gold',
          type: 'gold',
          assetType: 'gold',
          subtype: subtype,
          brand: brand,
          broker: broker, // Store broker for grouping/display
          useManualPrice: useManualPrice,
          isManual: isManual, // Store isManual from latest transaction
          manualPrice: manualPrice,
          lastUpdate: new Date().toISOString()
        };
      })
      .filter(Boolean);

    secureLogger.log(`Final portfolio - Stocks: ${stocks.length}, Crypto: ${crypto.length}, Cash: ${cash.length}, Gold: ${gold.length}`);
    return { stocks, crypto, cash, gold };
  }

  // Update portfolio values without full rebuild
  updatePortfolioValues() {
    if (!this.state.isInitialized) return;

    // Ensure asset arrays exist before updating (defensive check)
    if (!this.state.assets) {
      this.state.assets = { stocks: [], crypto: [], cash: [] };
    }
    this.state.assets.stocks = this.state.assets.stocks || [];
    this.state.assets.crypto = this.state.assets.crypto || [];
    this.state.assets.gold = this.state.assets.gold || [];
    this.state.assets.cash = this.state.assets.cash || [];

    // secureLogger.log('Updating portfolio values with current prices');
    // secureLogger.log('Current exchange rate:', this.state.exchangeRate);
    // secureLogger.log('Available prices:', Object.keys(this.state.prices));

    // Update stocks portfolio values
    this.state.assets.stocks = this.state.assets.stocks.map(stock => {
      const priceData = this.state.prices[`${stock.ticker}.JK`] || this.state.prices[stock.ticker];
      // Check for manual price override
      let currentPrice = 0;
      if (stock.useManualPrice && stock.manualPrice > 0) {
        currentPrice = stock.manualPrice;
      } else {
        currentPrice = priceData?.price || stock.currentPrice || 0;
      }

      if (currentPrice > 0) {
        // Recalculate portfolio value for stocks
        const totalShares = stock.lots * 100; // 1 lot = 100 shares for display
        const currentValue = currentPrice * totalShares;
        const costBasis = stock.avgPrice * totalShares;
        const gain = currentValue - costBasis;
        const gainUSD = this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round((gain / this.state.exchangeRate) * 100) / 100 : 0;
        const gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        /* secureLogger.log(`Updated stock ${stock.ticker}:`, {
          lots: stock.lots,
          currentPrice,
          currentValue,
          costBasis,
          gain,
          gainUSD,
          gainPercentage
        }); */

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
      // Check for manual price override
      let currentPrice = 0;
      if (crypto.useManualPrice && crypto.manualPrice > 0) {
        currentPrice = crypto.manualPrice;
      } else {
        currentPrice = priceData?.price || crypto.currentPrice || 0;
      }

      if (currentPrice > 0) {
        // Recalculate portfolio value for crypto
        const currentValue = currentPrice * crypto.amount;
        const costBasis = crypto.avgPrice * crypto.amount;
        const gain = currentValue - costBasis;
        const gainIDR = this.state.exchangeRate && this.state.exchangeRate > 0 ? Math.round(gain * this.state.exchangeRate) : 0;
        const gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        /* secureLogger.log(`Updated crypto ${crypto.symbol}:`, {
          amount: crypto.amount,
          currentPrice,
          currentValue,
          costBasis,
          gain,
          gainIDR,
          gainPercentage
        }); */

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

    // Update gold values
    this.state.assets.gold = this.state.assets.gold.map(gold => {
      const goldPrices = this.state.prices.gold || {};
      let currentPrice = gold.currentPrice || 0;
      const ticker = gold.ticker || '';

      // Only skip live price lookup if useManualPrice is explicitly set
      // Note: isManual is for avgPrice (purchase price), NOT for currentPrice
      if (!gold.useManualPrice) {
        let subtype = gold.subtype || 'digital';
        let brand = (gold.brand || '').toLowerCase();

        // Extract brand from ticker if not properly set (e.g., GOLD-ANTAM -> antam)
        if (ticker && ticker.includes('-')) {
          const extractedBrand = ticker.split('-')[1]?.toLowerCase();
          if (['antam', 'ubs', 'galeri24'].includes(extractedBrand)) {
            brand = extractedBrand;
          }
        }

        // Auto-detect subtype from ticker
        const effectiveSubtype = ticker?.toUpperCase() === 'GOLD-DIGITAL' ? 'digital' :
          (ticker?.includes('-') && ['ANTAM', 'UBS', 'GALERI24'].includes(ticker.split('-')[1]?.toUpperCase()) ? 'physical' : subtype);

        secureLogger.log(`[GOLD UPDATE] ${ticker}: subtype=${effectiveSubtype}, brand=${brand}`);

        if (effectiveSubtype === 'digital') {
          const newPrice = goldPrices.digital?.sellPrice || goldPrices.digital?.price || currentPrice;
          secureLogger.log(`[GOLD UPDATE] ${ticker} (digital): old=${currentPrice}, new=${newPrice}`);
          currentPrice = newPrice;
        } else {
          // Normalize brand
          const b = brand.toLowerCase().trim();

          if (goldPrices.physical && goldPrices.physical[b]) {
            const newPrice = goldPrices.physical[b].price || currentPrice;
            secureLogger.log(`[GOLD UPDATE] ${ticker} (${b}): old=${currentPrice}, new=${newPrice}`);
            currentPrice = newPrice;
          } else {
            // Fuzzy match fallback
            const physicalKeys = goldPrices.physical ? Object.keys(goldPrices.physical) : [];
            const matchingKey = physicalKeys.find(k => k.toLowerCase() === b.toLowerCase());

            if (matchingKey) {
              const newPrice = goldPrices.physical[matchingKey].price || currentPrice;
              secureLogger.log(`[GOLD UPDATE] ${ticker} (${b} via fuzzy -> ${matchingKey}): old=${currentPrice}, new=${newPrice}`);
              currentPrice = newPrice;
            } else if (goldPrices.digital?.sellPrice) {
              const newPrice = goldPrices.digital.sellPrice;
              secureLogger.log(`[GOLD UPDATE] ${ticker} (fallback to digital): old=${currentPrice}, new=${newPrice}`);
              currentPrice = newPrice;
            } else {
              secureLogger.log(`[GOLD SKIPPED] ${ticker}: Price pending for brand='${b}'`);
            }
          }
        }
      } else {
        secureLogger.log(`[GOLD UPDATE] ${ticker}: Using manual price, no update`);
      }

      if (currentPrice > 0) {
        const currentValue = currentPrice * gold.amount;
        const costBasis = gold.avgPrice * gold.amount;
        const gain = currentValue - costBasis;

        const gainUSD = this.state.exchangeRate ? gain / this.state.exchangeRate : 0;
        const gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

        let change = gold.change;
        if (!gold.useManualPrice) {
          // Update change from latest prices
          change = goldPrices.digital?.change !== undefined ? goldPrices.digital?.change : null;
          secureLogger.log(`[GOLD CHANGE CHECK] ${ticker}: Detected change from API: ${change}%`);
        }

        return {
          ...gold,
          currentPrice,
          change, // Ensure change is updated
          porto: currentValue,
          portoIDR: currentValue,
          portoUSD: this.state.exchangeRate ? currentValue / this.state.exchangeRate : 0,
          gain,
          gainIDR: gain,
          gainUSD: gainUSD,
          gainPercentage: gainPercentage,
          lastUpdate: new Date().toISOString()
        };
      }
      return gold;
    });

    // CRITICAL FIX: Create NEW assets object to trigger React re-render
    // Previous code modified this.state.assets properties in place, preserving the object reference.
    // This caused React (memo/hooks) to think "assets" hadn't changed, preventing UI updates.
    this.state.assets = {
      ...this.state.assets,
      lastUpdate: new Date().toISOString() // Ensure timestamp update on the object itself
    };

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
            // Also append the delete marker to transactions list if not present
            {
              const existingIdx = this.state.transactions.findIndex(t => t.id === update.id);
              if (existingIdx === -1) {
                this.state.transactions.push(update);
              }
              this.rebuildPortfolio();
            }
            break;
          case 'buy':
          case 'sell':
          case 'update':
            // Handle single transaction update/add
            {
              const existingIdx = this.state.transactions.findIndex(t => t.id === update.id);
              if (existingIdx >= 0) {
                this.state.transactions[existingIdx] = update;
              } else {
                this.state.transactions.push(update);
              }
              this.rebuildPortfolio();
            }
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
    } else if (assetType === 'gold') {
      // Optional: add subtype/brand if passed in additionalInfo
    }

    this.addTransaction(deleteTransaction);
  }

  // Get asset by symbol
  getAsset(assetType, symbol) {
    const mapType = assetType === 'stock' ? 'stocks' : (assetType === 'cash' ? 'cash' : (assetType === 'gold' ? 'gold' : 'crypto'));
    const assets = this.state.assets[mapType] || [];
    return assets.find(asset =>
      (asset.ticker || asset.symbol || '').toUpperCase() === symbol.toUpperCase()
    );
  }

  // Get portfolio summary
  getPortfolioSummary() {
    const stocks = this.state.assets.stocks || [];
    const crypto = this.state.assets.crypto || [];
    const gold = this.state.assets.gold || [];
    const cash = this.state.assets.cash || [];

    const totalValue = stocks.reduce((sum, stock) => sum + (stock.porto || 0), 0) +
      crypto.reduce((sum, crypto) => sum + (crypto.porto || 0), 0) +
      gold.reduce((sum, g) => sum + (g.porto || 0), 0) +
      cash.reduce((sum, c) => sum + (c.porto || 0), 0);

    const totalCost = stocks.reduce((sum, stock) => sum + (stock.totalCost || 0), 0) +
      crypto.reduce((sum, crypto) => sum + (crypto.totalCost || 0), 0) +
      gold.reduce((sum, g) => sum + (g.totalCost || 0), 0) +
      cash.reduce((sum, c) => sum + (c.totalCost || 0), 0);

    const totalGain = totalValue - totalCost;
    const totalGainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      totalValue,
      totalCost,
      totalGain,
      totalGainPercentage,
      assetCount: stocks.length + crypto.length + gold.length + cash.length,
      lastUpdate: this.state.lastUpdate
    };
  }

  // Reset state
  reset() {
    this.state = {
      assets: { stocks: [], crypto: [], gold: [], cash: [] },
      transactions: [],
      prices: {},
      exchangeRate: null,
      lastUpdate: null,
      isInitialized: true,
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