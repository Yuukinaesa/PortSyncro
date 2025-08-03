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

// Format currency for IDR (Indonesian format with dots and comma)
export function formatIDR(amount, decimals = 0) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp0';
  }
  
  const formatted = formatNumber(amount, decimals);
  return `Rp${formatted}`;
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
    console.warn('Exchange rate not available for cross-currency conversion');
  }

  // Calculate stocks value (all in IDR)
  assets.stocks.forEach(stock => {
    const price = prices[`${stock.ticker}.JK`];
    if (price) {
      // For IDX stocks: 1 lot = 100 shares
      const shareCount = stock.lots * 100;
      if (price.currency === 'IDR') {
        const stockValueIDR = price.price * shareCount;
        totalValueIDR += stockValueIDR;
        
        // Convert IDR to USD for total USD calculation
        if (exchangeRate && exchangeRate > 0) {
          totalValueUSD += Math.round((stockValueIDR / exchangeRate) * 100) / 100;
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
        console.warn(`Exchange rate not available for ${crypto.symbol} conversion`);
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
    console.warn(`Exchange rate not available for ${symbol} conversion`);
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

  console.log('Calculating position from transactions:', transactions.length, 'transactions');

  // Sort transactions by timestamp to process in chronological order
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sortedTransactions.forEach(tx => {
    console.log(`Transaction: ${tx.type} ${tx.assetType} ${tx.ticker || tx.symbol} amount: ${tx.amount} price: ${tx.price} (ID: ${tx.id})`);
    
    // If asset has been deleted, skip all subsequent transactions
    if (isDeleted) {
      console.log(`Skipping transaction - asset has been deleted`);
      return;
    }
    
    if (tx.type === 'buy') {
      // For buy transactions, add to total cost and amount
      const previousTotal = totalAmount;
      totalCost += tx.price * tx.amount;
      totalAmount += tx.amount;
      console.log(`  Buy: Added ${tx.amount} to total. Previous: ${previousTotal}, New: ${totalAmount}`);
      
      // Track costs in both currencies
      if (tx.valueIDR) totalCostIDR += tx.valueIDR;
      if (tx.valueUSD) totalCostUSD += tx.valueUSD;
      
      // Store entry price if provided (use the latest one)
      if (tx.entry) {
        entryPrice = tx.entry;
      }
      
      console.log(`After buy: totalAmount = ${totalAmount}, totalCost = ${totalCost}, entryPrice = ${entryPrice}`);
    } else if (tx.type === 'update') {
      // For update transactions, update the average price without changing amount
      if (totalAmount > 0) {
        // Recalculate total cost with new average price
        // For stocks: totalAmount is in shares, need to convert to shares for cost calculation
        const assetType = tx.assetType || 'stock';
        const totalShares = assetType === 'stock' ? totalAmount : totalAmount;
        totalCost = tx.price * totalShares;
        totalCostIDR = tx.valueIDR || totalCostIDR;
        totalCostUSD = tx.valueUSD || totalCostUSD;
        
        // Update entry price if provided
        if (tx.entry) {
          entryPrice = tx.entry;
        }
        
        console.log(`After update transaction: totalAmount = ${totalAmount}, totalCost = ${totalCost}, new avgPrice = ${tx.price}, assetType = ${assetType}`);
      } else {
        // If no previous position exists, treat update as a buy transaction
        console.log(`No previous position found, treating update as buy transaction`);
        const previousTotal = totalAmount;
        totalCost += tx.price * tx.amount;
        totalAmount += tx.amount;
        console.log(`  Update as Buy: Added ${tx.amount} to total. Previous: ${previousTotal}, New: ${totalAmount}`);
        
        // Track costs in both currencies
        if (tx.valueIDR) totalCostIDR += tx.valueIDR;
        if (tx.valueUSD) totalCostUSD += tx.valueUSD;
        
        // Store entry price if provided
        if (tx.entry) {
          entryPrice = tx.entry;
        }
        
        console.log(`After update as buy: totalAmount = ${totalAmount}, totalCost = ${totalCost}, entryPrice = ${entryPrice}`);
      }
    } else if (tx.type === 'sell') {
      // Untuk jual, average price tidak berubah, hanya jumlah berkurang, cost dikurangi proporsional
      if (totalAmount > 0) {
        const avgPrice = totalCost / totalAmount;
        const costToReduce = avgPrice * tx.amount;
        totalCost -= costToReduce;
        totalAmount -= tx.amount;
        
        // Reduce costs proportionally
        if (totalCostIDR > 0) {
          const costRatio = costToReduce / totalCost;
          totalCostIDR -= totalCostIDR * costRatio;
        }
        if (totalCostUSD > 0) {
          const costRatio = costToReduce / totalCost;
          totalCostUSD -= totalCostUSD * costRatio;
        }
        
        if (totalAmount < 0) {
          totalAmount = 0;
          totalCost = 0;
          totalCostIDR = 0;
          totalCostUSD = 0;
        }
        console.log(`After sell: totalAmount = ${totalAmount}, totalCost = ${totalCost}`);
      }
    } else if (tx.type === 'delete') {
      // Untuk delete, hapus semua posisi (set ke 0) dan mark as deleted
      totalAmount = 0;
      totalCost = 0;
      totalCostIDR = 0;
      totalCostUSD = 0;
      entryPrice = null;
      isDeleted = true; // Mark as deleted to skip subsequent transactions
      console.log(`After delete: totalAmount = ${totalAmount}, totalCost = ${totalCost}, asset marked as deleted`);
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
    if (assetType === 'stock') {
      // For stocks: totalAmount is now in shares
      portoIDR = currentPrice * totalAmount; // Stocks are always in IDR
      portoUSD = exchangeRate && exchangeRate > 0 ? portoIDR / exchangeRate : 0;
      porto = portoIDR; // Use IDR as primary for stocks
    } else {
      // For crypto: totalAmount is in units, prices are in USD
      portoUSD = currentPrice * totalAmount; // Crypto prices are in USD
      portoIDR = exchangeRate && exchangeRate > 0 ? portoUSD * exchangeRate : 0;
      porto = portoUSD; // Use USD as primary for crypto
    }
  }
  
  // Calculate gain/loss using the correct cost basis
  let gain = 0;
  let gainIDR = 0;
  let gainUSD = 0;
  
  if (totalAmount > 0) {
    // Calculate gain/loss based on current market value vs cost basis
    if (assetType === 'stock') {
      // For stocks: calculate based on shares
      const currentValue = currentPrice * totalAmount;
      const costBasis = avgPrice * totalAmount;
      
      gainIDR = currentValue - costBasis;
      gainUSD = exchangeRate && exchangeRate > 0 ? gainIDR / exchangeRate : 0;
      gain = gainIDR; // Use IDR as primary for stocks
    } else {
      // For crypto: calculate based on amount
      const currentValue = currentPrice * totalAmount;
      const costBasis = avgPrice * totalAmount;
      
      gainUSD = currentValue - costBasis;
      gainIDR = exchangeRate && exchangeRate > 0 ? gainUSD * exchangeRate : 0;
      gain = gainUSD; // Use USD as primary for crypto
    }
  }

  console.log(`Final position: amount = ${totalAmount}, avgPrice = ${avgPrice}, totalCost = ${totalCost}, gain = ${gain}, porto = ${porto}, portoIDR = ${portoIDR}, portoUSD = ${portoUSD}`);

  // Calculate gain percentage based on cost basis
  let gainPercentage = 0;
  if (assetType === 'stock') {
    const costBasis = avgPrice * totalAmount;
    gainPercentage = costBasis > 0 ? (gainIDR / costBasis) * 100 : 0;
  } else {
    const costBasis = avgPrice * totalAmount;
    gainPercentage = costBasis > 0 ? (gainUSD / costBasis) * 100 : 0;
  }

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
      // For USD/crypto, format with comma as thousands separator and 2 decimal places
      avgPrice = (a.avgPrice || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      porto = (a.porto || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      gain = (a.gain || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else {
      // For IDR/stocks, format with dot as thousands separator
      const roundedAvgPrice = Math.round(a.avgPrice || 0);
      const roundedPorto = Math.round(a.porto || 0);
      const roundedGain = Math.round(a.gain || 0);
      
      avgPrice = roundedAvgPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      porto = roundedPorto.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      gain = roundedGain.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
  
  console.log('Demo account availability check:', {
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