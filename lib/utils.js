import { secureLogger } from './security.js';
// lib/utils.js

// Helper function to normalize number input (accept both comma and dot as decimal separators)
export function normalizeNumberInput(value) {
  if (!value) return value;

  // Remove all spaces
  let normalized = value.replace(/\s/g, '');

  // If there are both dots and commas, treat comma as thousands separator
  if (normalized.includes('.') && normalized.includes(',')) {
    // Remove all commas (thousands separators)
    normalized = normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) {
    // Only commas - check if it's likely a thousands separator
    const commaIndex = normalized.indexOf(',');
    const digitsAfterComma = normalized.length - commaIndex - 1;

    // If there are exactly 3 digits after comma, it's likely thousands separator
    if (digitsAfterComma === 3 && commaIndex > 0) {
      // Remove the comma (thousands separator)
      normalized = normalized.replace(',', '');
    } else {
      // Treat as decimal separator
      normalized = normalized.replace(',', '.');
    }
  }

  return normalized;
}

// Custom number formatting function for IDR
// Format: 1.234.567,89 (Indonesian format - dots for thousands, comma for decimal)
export function formatNumber(number, decimals = 0) {
  if (number === null || number === undefined || isNaN(number)) {
    return '0';
  }

  // Convert to number if it's a string
  const num = typeof number === 'string' ? parseFloat(number) : number;

  // Split into integer and decimal parts
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  // Add dots for thousands separator (Indonesian format)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // Combine with decimal part if exists (use comma for decimal separator in Indonesian format)
  if (decimalPart && decimals > 0) {
    return `${formattedInteger},${decimalPart}`;
  }

  return formattedInteger;
}

// Format quantity for assets - handles fractional shares and crypto amounts
// This function preserves decimal places for values < 1 or with significant decimals
// Format quantity for assets - handles fractional shares and crypto amounts
// Uses Intl.NumberFormat to preserve precision up to 8 decimal places
export function formatQuantity(number, forceDecimals = null) {
  if (number === null || number === undefined || isNaN(number)) {
    return '0';
  }

  const num = typeof number === 'string' ? parseFloat(number) : number;

  if (num === 0) return '0';

  // If specific decimals requested, use toFixed then trim
  if (forceDecimals !== null) {
    const formatted = num.toFixed(forceDecimals);
    return formatted.replace('.', ','); // ID format
  }

  // Use Intl.NumberFormat for smart formatting (up to 8 decimals for crypto precision)
  // This avoids manually guessing decimal places and incorrectly rounding values like 0.029134
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
    useGrouping: true
  }).format(num);
}

// Format currency for IDR (Indonesian format with dots and comma)
export function formatIDR(amount, decimals = 0) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp.0';
  }

  const formatted = formatNumber(amount, decimals);
  return `Rp.${formatted}`;
}

// Format number for USD display (US format with comma as thousands separator and period as decimal)
export function formatNumberUSD(number, decimals = 2) {
  if (number === null || number === undefined || isNaN(number)) {
    return '0.00';
  }

  // Convert to number if it's a string
  const num = typeof number === 'string' ? parseFloat(number) : number;

  // Split into integer and decimal parts
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  // Add commas for thousands separator (US format)
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Combine with decimal part if exists (use period for decimal separator in US format)
  if (decimalPart && decimals > 0) {
    return `${formattedInteger}.${decimalPart}`;
  }

  return formattedInteger;
}

// Format currency for USD (US format with comma as thousands separator and period as decimal)
export function formatUSD(amount, decimals = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }

  const formatted = formatNumberUSD(amount, decimals);
  return `$${formatted}`;
}

// Helper function to validate exchange rate
export const validateExchangeRate = (exchangeRate) => {
  if (!exchangeRate || isNaN(exchangeRate) || exchangeRate < 0) {
    throw new Error('Invalid exchange rate');
  }
};

// Helper function to calculate portfolio value with proper currency conversion
export const calculatePortfolioValue = (assets, prices, exchangeRate) => {
  let totalValueIDR = 0;
  let totalValueUSD = 0;

  // Validate exchange rate for cross-currency conversion
  if (!exchangeRate || exchangeRate <= 0) {
    secureLogger.warn('Exchange rate not available for cross-currency conversion');
  }

  // Calculate stocks value (all in IDR)
  assets.stocks.forEach(stock => {
    // Determine symbol key based on market
    const symbolKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
    const price = prices[symbolKey] || prices[stock.ticker]; // Fallback for safety

    if (price) {
      // Determine share count based on market
      // For IDX stocks: 1 lot = 100 shares
      // For US stocks: lots field contains raw shares (as per pages/index.js logic)
      let shareCount;
      if (stock.market === 'US') {
        shareCount = stock.lots;
      } else {
        shareCount = stock.lots * 100;
      }

      if (price.currency === 'IDR') {
        const stockValueIDR = price.price * shareCount;
        totalValueIDR += stockValueIDR;

        // Convert IDR to USD for total USD calculation
        if (exchangeRate && exchangeRate > 0) {
          totalValueUSD += Math.round((stockValueIDR / exchangeRate) * 100) / 100;
        }
      } else {
        // Handle US stocks in USD
        // Price is in USD
        const stockValueUSD = price.price * shareCount;
        totalValueUSD += stockValueUSD;

        // Convert USD to IDR
        if (exchangeRate && exchangeRate > 0) {
          totalValueIDR += Math.round(stockValueUSD * exchangeRate);
        }
      }
    }
  });

  // Calculate crypto value (all in USD)
  assets.crypto.forEach(crypto => {
    const price = prices[crypto.symbol];
    if (price) {
      // Crypto prices are always in USD from API
      const cryptoValueUSD = price.price * crypto.amount;
      totalValueUSD += cryptoValueUSD;

      // Convert USD to IDR using exchange rate
      if (exchangeRate && exchangeRate > 0) {
        totalValueIDR += Math.round(cryptoValueUSD * exchangeRate);
      } else {
        secureLogger.warn(`Exchange rate not available for ${crypto.symbol} conversion`);
      }
    }
  });

  return {
    totalValueIDR: Math.round(totalValueIDR),
    totalValueUSD: Math.round(totalValueUSD * 100) / 100
  };
};

// Helper function to validate transaction data
export const validateTransaction = (transaction) => {
  const requiredFields = ['type', 'assetType', 'amount'];
  const missingFields = requiredFields.filter(field => !transaction[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  if (transaction.amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  return true;
};

// Helper function to check if price data is available
export const isPriceDataAvailable = (prices, symbol) => {
  return prices && prices[symbol] && prices[symbol].price > 0;
};

// Helper function to get real price data
export const getRealPriceData = (prices, symbol, amount, exchangeRate) => {
  const price = prices[symbol];
  if (!price) {
    throw new Error(`Price data not available for ${symbol}`);
  }

  // Crypto prices are always in USD from API
  const valueUSD = price.price * amount;

  // Convert USD to IDR using exchange rate
  let valueIDR = 0;
  if (exchangeRate && exchangeRate > 0) {
    valueIDR = valueUSD * exchangeRate;
  } else {
    secureLogger.warn(`Exchange rate not available for ${symbol} conversion`);
  }

  return {
    valueIDR,
    valueUSD,
    price: price.price
  };
};

/**
 * Hitung posisi portofolio (jumlah, avg price, gain, porto) dari daftar transaksi
 * @param {Array} transactions - Daftar transaksi (buy/sell) untuk satu aset
 * @param {number} currentPrice - Harga pasar saat ini
 * @param {number} exchangeRate - Exchange rate untuk konversi currency (optional)
 * @returns {Object} { amount, avgPrice, totalCost, gain, porto, portoIDR, portoUSD }
 */
export function calculatePositionFromTransactions(transactions, currentPrice, exchangeRate = null) {
  let totalAmount = 0;
  let totalCost = 0;
  let totalCostIDR = 0;
  let totalCostUSD = 0;
  let entryPrice = null;
  let isDeleted = false; // Track if asset has been deleted
  let lastDeleteTimestamp = null; // Track when the last delete happened

  // secureLogger.log('Calculating position from transactions:', transactions.length, 'transactions');

  // Sort transactions by timestamp to process in chronological order
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sortedTransactions.forEach(tx => {
    // secureLogger.log(`Transaction: ${tx.type} ${tx.assetType} ${tx.ticker || tx.symbol} amount: ${tx.amount} price: ${tx.price} (ID: ${tx.id})`);

    // If asset has been deleted and this transaction is before the delete, skip it
    if (isDeleted && lastDeleteTimestamp && new Date(tx.timestamp) <= new Date(lastDeleteTimestamp)) {
      secureLogger.log(`Skipping transaction - asset was deleted at ${lastDeleteTimestamp}`);
      return;
    }

    if (tx.type === 'buy') {
      // For buy transactions, add to total cost and amount
      const previousTotal = totalAmount;
      totalCost += tx.price * tx.amount;
      totalAmount += tx.amount;
      // secureLogger.log(`  Buy: Added ${tx.amount} to total. Previous: ${previousTotal}, New: ${totalAmount}`);

      // Track costs in both currencies
      // Track costs in both currencies based on asset market/type
      const market = tx.market || 'IDX';
      if (tx.assetType === 'stock') {
        if (market === 'US') {
          // For US stocks, native currency is USD
          // tx.valueUSD should be reliable. If not calculate from price * amount
          const txValueUSD = tx.valueUSD || (tx.price * tx.amount);
          totalCostUSD += txValueUSD;
          // Calculate IDR from USD using exchange rate at that time (if available in tx) or skip?
          // tx.valueIDR should have been calculated at transaction time.
          if (tx.valueIDR) totalCostIDR += tx.valueIDR;
        } else {
          // IDX Stocks
          // Native is IDR
          const txValueIDR = tx.valueIDR || (tx.price * tx.amount);
          totalCostIDR += txValueIDR;
          if (tx.valueUSD) totalCostUSD += tx.valueUSD;
        }
      } else {
        // Crypto (USD native) or others
        if (tx.valueIDR) totalCostIDR += tx.valueIDR;
        if (tx.valueUSD) totalCostUSD += tx.valueUSD;
      }

      // Store entry price if provided (use the latest one)
      if (tx.entry) {
        entryPrice = tx.entry;
      }

      // secureLogger.log(`After buy: totalAmount = ${totalAmount}, totalCost = ${totalCost}, entryPrice = ${entryPrice}`);
    } else if (tx.type === 'update') {
      // For update transactions, update the average price without changing amount
      if (totalAmount > 0) {
        // Recalculate total cost with new average price
        // For stocks: totalAmount is in shares, need to convert to shares for cost calculation
        const assetType = tx.assetType || 'stock';

        // Update amount if provided in transaction
        if (tx.amount && tx.amount > 0) {
          totalAmount = tx.amount;
        }

        const totalShares = assetType === 'stock' ? totalAmount : totalAmount;
        totalCost = tx.price * totalShares;
        totalCostIDR = tx.valueIDR || totalCostIDR;
        totalCostUSD = tx.valueUSD || totalCostUSD;

        // Update entry price if provided
        if (tx.entry) {
          entryPrice = tx.entry;
        }

        // secureLogger.log(`After update transaction: totalAmount = ${totalAmount}, totalCost = ${totalCost}, new avgPrice = ${tx.price}, assetType = ${assetType}`);
      } else {
        // If no previous position exists, treat update as a buy transaction
        secureLogger.log(`No previous position found, treating update as buy transaction`);
        const previousTotal = totalAmount;
        totalCost += tx.price * tx.amount;
        totalAmount += tx.amount;
        secureLogger.log(`  Update as Buy: Added ${tx.amount} to total. Previous: ${previousTotal}, New: ${totalAmount}`);

        // Track costs in both currencies
        if (tx.valueIDR) totalCostIDR += tx.valueIDR;
        if (tx.valueUSD) totalCostUSD += tx.valueUSD;

        // Store entry price if provided
        if (tx.entry) {
          entryPrice = tx.entry;
        }

        secureLogger.log(`After update as buy: totalAmount = ${totalAmount}, totalCost = ${totalCost}, entryPrice = ${entryPrice}`);
      }
    } else if (tx.type === 'sell') {
      // Untuk jual, average price tidak berubah, hanya jumlah berkurang, cost dikurangi proporsional
      if (totalAmount > 0 && totalCost > 0) {
        const avgPrice = totalCost / totalAmount;
        const costToReduce = avgPrice * tx.amount;

        // Calculate cost ratio BEFORE modifying totalCost
        const originalTotalCost = totalCost;
        const costRatio = tx.amount / totalAmount; // Proportion of holdings being sold

        totalCost -= costToReduce;
        totalAmount -= tx.amount;

        // Reduce costs proportionally based on amount ratio (not cost ratio)
        if (totalCostIDR > 0) {
          totalCostIDR -= totalCostIDR * costRatio;
        }
        if (totalCostUSD > 0) {
          totalCostUSD -= totalCostUSD * costRatio;
        }

        if (totalAmount <= 1e-9) { // Use epsilon for float comparison
          totalAmount = 0;
          totalCost = 0;
          totalCostIDR = 0;
          totalCostUSD = 0;
        }
        // secureLogger.log(`After sell: totalAmount = ${totalAmount}, totalCost = ${totalCost}`);
      }
    } else if (tx.type === 'delete') {
      // Untuk delete, hapus semua posisi (set ke 0) dan mark as deleted
      totalAmount = 0;
      totalCost = 0;
      totalCostIDR = 0;
      totalCostUSD = 0;
      entryPrice = null;
      isDeleted = true; // Mark as deleted to skip subsequent transactions
      lastDeleteTimestamp = tx.timestamp;
      // secureLogger.log(`After delete: totalAmount = ${totalAmount}, totalCost = ${totalCost}, asset marked as deleted at ${tx.timestamp}`);
    }
  });

  // Calculate average price
  // For stocks: average price should be per share, not per lot
  const firstTx = sortedTransactions.find(tx => tx.type === 'buy' || tx.type === 'update');
  const assetType = firstTx?.assetType || 'stock';

  let avgPrice = 0;
  if (totalAmount > 0) {
    if (assetType === 'stock') {
      // For stocks: totalAmount is now in shares, avgPrice should be per share
      avgPrice = totalCost / totalAmount;
    } else {
      // For crypto: totalCost is for total amount, avgPrice is per unit
      avgPrice = totalCost / totalAmount;
    }
  }

  // Calculate current portfolio value (porto) based on current price and amount
  let porto = 0;
  let portoIDR = 0;
  let portoUSD = 0;

  if (totalAmount > 0 && currentPrice > 0) {
    // Determine currency from first transaction
    const firstTx = sortedTransactions.find(tx => tx.type === 'buy' || tx.type === 'update');
    const currency = firstTx?.currency || 'IDR';
    const assetType = firstTx?.assetType || 'stock';

    // Calculate current portfolio value
    // Calculate current portfolio value
    if (assetType === 'stock') {
      const market = firstTx?.market || 'IDX';
      if (market === 'US') {
        // US Stocks: Price is in USD
        portoUSD = currentPrice * totalAmount;
        portoIDR = exchangeRate && exchangeRate > 0 ? portoUSD * exchangeRate : 0;
        porto = portoUSD; // Use USD as primary for US stocks
      } else {
        // IDX Stocks: Price is in IDR
        portoIDR = currentPrice * totalAmount;
        portoUSD = exchangeRate && exchangeRate > 0 ? portoIDR / exchangeRate : 0;
        porto = portoIDR; // Use IDR as primary for IDX stocks
      }
    } else {
      // For crypto/gold/cash
      if (assetType === 'gold' || assetType === 'cash') {
        // Gold/Cash: IDR Native
        portoIDR = currentPrice * totalAmount;
        portoUSD = exchangeRate && exchangeRate > 0 ? portoIDR / exchangeRate : 0;
        porto = portoIDR;
      } else {
        // Crypto: USD Native
        portoUSD = currentPrice * totalAmount;
        portoIDR = exchangeRate && exchangeRate > 0 ? portoUSD * exchangeRate : 0;
        porto = portoUSD;
      }
    }
  }

  // Calculate gain/loss using the correct cost basis
  let gain = 0;
  let gainIDR = 0;
  let gainUSD = 0;

  if (totalAmount > 0) {
    // Calculate gain/loss based on current market value vs cost basis
    if (assetType === 'stock') {
      // For stocks: calculate based on shares, with market awareness
      const currentValue = currentPrice * totalAmount;
      const costBasis = avgPrice * totalAmount;
      const firstTx = sortedTransactions.find(tx => tx.type === 'buy' || tx.type === 'update');
      const market = firstTx?.market || 'IDX';

      if (market === 'US') {
        // US Stocks: Price is in USD, so gain is USD native
        gainUSD = currentValue - costBasis;
        gainIDR = exchangeRate && exchangeRate > 0 ? gainUSD * exchangeRate : 0;
        gain = gainUSD; // Use USD as primary for US stocks
      } else {
        // IDX Stocks: Price is in IDR, so gain is IDR native
        gainIDR = currentValue - costBasis;
        gainUSD = exchangeRate && exchangeRate > 0 ? gainIDR / exchangeRate : 0;
        gain = gainIDR; // Use IDR as primary for IDX stocks
      }
    } else {
      // For crypto: calculate based on amount
      const currentValue = currentPrice * totalAmount;
      const costBasis = avgPrice * totalAmount;

      if (assetType === 'gold' || assetType === 'cash') {
        // Gold and Cash are IDR native
        gainIDR = currentValue - costBasis;
        gainUSD = exchangeRate && exchangeRate > 0 ? gainIDR / exchangeRate : 0;
        gain = gainIDR;
      } else {
        // Crypto is USD native
        gainUSD = currentValue - costBasis;
        gainIDR = exchangeRate && exchangeRate > 0 ? gainUSD * exchangeRate : 0;
        gain = gainUSD;
      }
    }
  } else {
    // If amount is 0, ensure everything is 0
    totalCost = 0;
    totalCostIDR = 0;
    totalCostUSD = 0;
    avgPrice = 0;
    gain = 0;
    gainIDR = 0;
    gainUSD = 0;
    porto = 0;
    portoIDR = 0;
    portoUSD = 0;
  }

  // secureLogger.log(`Final position: amount = ${totalAmount}, avgPrice = ${avgPrice}, totalCost = ${totalCost}, gain = ${gain}, porto = ${porto}, portoIDR = ${portoIDR}, portoUSD = ${portoUSD}`);

  // Calculate gain percentage based on cost basis
  // Use the 'gain' variable which is already in the correct native currency
  let gainPercentage = 0;
  const costBasis = avgPrice * totalAmount;
  gainPercentage = costBasis > 0 ? (gain / costBasis) * 100 : 0;

  return {
    amount: totalAmount,
    avgPrice,
    totalCost,
    totalCostIDR,
    totalCostUSD,
    gain,
    gainIDR,
    gainUSD,
    porto,
    portoIDR,
    portoUSD,
    gainPercentage,
    entryPrice // Include entry price in the result
  };
}

// Tambahkan helper: getGainPercent(gain, totalCost)
export function getGainPercent(gain, totalCost) {
  if (!totalCost || totalCost === 0) return 0;
  return (gain / totalCost) * 100;
}

// Helper function to format percentage consistently
export function formatPercentage(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(decimals)}%`;
}

// Helper function to format price consistently based on currency
export function formatPriceConsistent(price, currency, decimals = 2) {
  if (currency === 'USD') {
    return formatNumberUSD(price, decimals);
  } else {
    return formatNumber(price, decimals);
  }
}

// Tambahkan helper untuk ekspor portofolio ke CSV
export function exportPortfolioToCSV(assets, language = 'id') {
  // Language-aware headers
  const headers = language === 'id'
    ? ['Aset', 'Tipe', 'Qty', 'Avg Price', 'Porto', 'Gain']
    : ['Asset', 'Type', 'Qty', 'Avg Price', 'Portfolio', 'Gain'];

  let csv = headers.join(';') + '\n';
  [...assets.stocks, ...assets.crypto].forEach(a => {
    // Format numbers for CSV export with proper formatting
    let avgPrice, porto, gain;

    if (a.currency === 'USD' || a.type === 'crypto') {
      // For USD/crypto, format with $ prefix and comma as thousands separator
      avgPrice = '$' + (a.avgPrice || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      porto = '$' + (a.porto || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      gain = '$' + (a.gain || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else {
      // For IDR/stocks, format with Rp. prefix and dot as thousands separator
      const roundedAvgPrice = Math.round(a.avgPrice || 0);
      const roundedPorto = Math.round(a.porto || 0);
      const roundedGain = Math.round(a.gain || 0);

      avgPrice = 'Rp.' + roundedAvgPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      porto = 'Rp.' + roundedPorto.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      gain = 'Rp.' + roundedGain.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    csv += `"${a.ticker || a.symbol}";"${a.type}";"${a.type === 'stock' ? (a.lots || 0) : (a.amount || 0)}";${avgPrice};${porto};${gain}\n`;
  });
  return csv;
}

/**
 * Check if demo account credentials are configured
 * @returns {boolean} True if demo account is available
 */
export const isDemoAccountAvailable = () => {
  const hasEmail = !!process.env.NEXT_PUBLIC_DEMO_EMAIL;
  const hasPassword = !!process.env.NEXT_PUBLIC_DEMO_PASSWORD;

  secureLogger.log('Demo account availability check:', {
    hasEmail,
    hasPassword,
    emailValue: process.env.NEXT_PUBLIC_DEMO_EMAIL ? 'Set' : 'Not set',
    passwordValue: process.env.NEXT_PUBLIC_DEMO_PASSWORD ? 'Set' : 'Not set'
  });

  return !!(hasEmail && hasPassword);
};

// Validate IDX stock lots (must be whole numbers)
export const validateIDXLots = (lots) => {
  const lotsNum = parseFloat(lots);
  if (isNaN(lotsNum) || lotsNum <= 0) {
    throw new Error('Lot amount must be greater than 0');
  }

  if (!Number.isInteger(lotsNum)) {
    throw new Error('IDX stock lots must be whole numbers (no decimals). 1 lot = 100 shares.');
  }

  return lotsNum;
};

// Clean up fractional lots to whole lots (for data migration)
export const cleanFractionalLots = (lots) => {
  const lotsNum = parseFloat(lots);
  if (isNaN(lotsNum) || lotsNum <= 0) {
    return 0;
  }

  // Round down to nearest whole lot
  return Math.floor(lotsNum);
};

/**
 * Get the current price for a gold asset based on its ticker, subtype, and brand.
 * This centralized function ensures consistent gold price lookup across the app.
 * 
 * @param {Object} goldPrices - The gold prices object from API: { digital: {...}, physical: {...} }
 * @param {Object} options - Options for price lookup
 * @param {string} options.ticker - Gold ticker (e.g., 'GOLD-DIGITAL', 'GOLD-ANTAM', 'GOLD-UBS', 'GOLD-GALERI24')
 * @param {string} options.subtype - Gold subtype: 'digital' or 'physical' (optional if ticker provided)
 * @param {string} options.brand - Brand for physical gold: 'antam', 'ubs', 'galeri24' (optional if ticker provided)
 * @returns {Object} { price: number, isPhysical: boolean, brand: string, source: string }
 */
export function getGoldPrice(goldPrices, options = {}) {
  const { ticker = '', subtype: inputSubtype, brand: inputBrand } = options;

  if (!goldPrices) {
    return { price: 0, isPhysical: false, brand: '', source: 'none' };
  }

  // Extract brand from ticker if not provided (e.g., GOLD-ANTAM -> antam)
  let brand = (inputBrand || '').toLowerCase();
  if (ticker && ticker.includes('-')) {
    const extractedBrand = ticker.split('-')[1]?.toLowerCase();
    if (['antam', 'ubs', 'galeri24'].includes(extractedBrand)) {
      brand = extractedBrand;
    }
  }

  // Auto-detect subtype from ticker
  let subtype = inputSubtype || 'digital';
  if (ticker) {
    const tickerUpper = ticker.toUpperCase();
    if (tickerUpper === 'GOLD-DIGITAL') {
      subtype = 'digital';
    } else if (ticker.includes('-') && ['ANTAM', 'UBS', 'GALERI24'].includes(tickerUpper.split('-')[1])) {
      subtype = 'physical';
    }
  }

  // Get price based on subtype
  if (subtype === 'digital') {
    const price = goldPrices.digital?.sellPrice || goldPrices.digital?.price || 0;
    return {
      price,
      isPhysical: false,
      brand: 'pegadaian',
      source: goldPrices.digital?.sellPrice ? 'digital-sellPrice' : 'digital-price'
    };
  } else {
    // Physical gold
    if (goldPrices.physical && goldPrices.physical[brand]) {
      return {
        price: goldPrices.physical[brand].price || 0,
        isPhysical: true,
        brand,
        source: `physical-${brand}`
      };
    } else if (goldPrices.digital?.sellPrice) {
      // Fallback to digital sellPrice if physical brand not found
      secureLogger.warn(`getGoldPrice: Physical brand '${brand}' not found, using digital sellPrice fallback`);
      return {
        price: goldPrices.digital.sellPrice,
        isPhysical: true,
        brand,
        source: 'digital-sellPrice-fallback'
      };
    }
  }

  return { price: 0, isPhysical: subtype === 'physical', brand, source: 'none' };
}

/**
 * Get available physical gold brands
 */
export const GOLD_BRANDS = ['antam', 'ubs', 'galeri24'];

/**
 * Check if a ticker is a valid gold ticker
 */
export function isGoldTicker(ticker) {
  if (!ticker) return false;
  const tickerUpper = ticker.toUpperCase();
  return tickerUpper === 'GOLD-DIGITAL' ||
    tickerUpper === 'GOLD-ANTAM' ||
    tickerUpper === 'GOLD-UBS' ||
    tickerUpper === 'GOLD-GALERI24';
}

/**
 * Parse gold ticker to extract info
 */
export function parseGoldTicker(ticker) {
  if (!ticker || !ticker.toUpperCase().startsWith('GOLD-')) {
    return { isValid: false, type: null, brand: null };
  }

  const tickerUpper = ticker.toUpperCase();
  const brand = tickerUpper.split('-')[1]?.toLowerCase();

  if (tickerUpper === 'GOLD-DIGITAL') {
    return { isValid: true, type: 'digital', brand: 'pegadaian' };
  } else if (['antam', 'ubs', 'galeri24'].includes(brand)) {
    return { isValid: true, type: 'physical', brand };
  }

  return { isValid: false, type: null, brand: null };
} 