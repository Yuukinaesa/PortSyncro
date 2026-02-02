import { secureLogger } from './security'; // Ensure this matches existing import or file structure
// lib/fetchPrices.js

// Constants for Gold Calculation (Approximate Pegadaian Spreads)
const OZ_TO_GRAM = 31.1035;
const PEGADAIAN_DIGITAL_BUY_SPREAD = 0.035; // +3.5% (Kita Beli dari Pegadaian)
const PEGADAIAN_DIGITAL_SELL_SPREAD = -0.002; // -0.2% (Kita Jual ke Pegadaian - Buyback)

const PEGADAIAN_PHYSICAL_ANTAM_SPREAD = 0.045; // +4.5%
const PEGADAIAN_PHYSICAL_UBS_SPREAD = 0.040; // +4.0%
const PEGADAIAN_PHYSICAL_GALERI24_SPREAD = 0.038; // +3.8%

export async function fetchStockPrices(tickers) {
  secureLogger.log('fetchStockPrices called with tickers:', tickers);

  if (!tickers || tickers.length === 0) {
    secureLogger.log('No tickers provided, returning empty object');
    return {};
  }

  try {
    const result = {};

    // Map untuk melacak ticker yang sudah diproses (case-insensitive)
    const processedTickers = new Map();
    // Simple in-memory cache for this request
    const fetchCache = {};

    secureLogger.log('Processing tickers:', tickers);

    // Deteksi region berdasarkan ticker
    for (const ticker of tickers) {
      try {
        secureLogger.log('Processing ticker:', ticker);

        // Skip jika sudah diproses (case-insensitive)
        const tickerUpper = ticker.toUpperCase();
        if (processedTickers.has(tickerUpper)) {
          secureLogger.log('Ticker already processed:', tickerUpper);
          continue;
        }
        processedTickers.set(tickerUpper, true);
        // Use cache if available
        if (fetchCache[tickerUpper]) {
          secureLogger.log('Using cached data for:', tickerUpper);
          result[ticker] = fetchCache[tickerUpper];
          continue;
        }

        let symbol = ticker;
        let exchange = '';
        let apiUrl = '';

        // Auto-detect exchange/region berdasarkan format
        // Format: SYMBOL:EXCHANGE atau SYMBOL.EXCHANGE
        if (ticker.includes(':')) {
          [symbol, exchange] = ticker.split(':');
        } else if (ticker.includes('.')) {
          [symbol, exchange] = ticker.split('.');
        }

        secureLogger.log('Parsed symbol:', symbol, 'exchange:', exchange);

        // Normalisasi simbol untuk menghindari masalah case-sensitivity
        const normalizedSymbol = symbol.toUpperCase();

        // Tentukan endpoint dan format symbol berdasarkan exchange
        if (exchange === 'JK' || (!exchange && normalizedSymbol.length <= 4 && normalizedSymbol === symbol.toUpperCase() && !/[0-9]/.test(normalizedSymbol) && normalizedSymbol !== 'GOOG' && normalizedSymbol !== 'GOOGL' && normalizedSymbol !== 'MSFT' && normalizedSymbol !== 'AAPL' && normalizedSymbol !== 'TSLA' && normalizedSymbol !== 'NVDA' && normalizedSymbol !== 'AMZN' && normalizedSymbol !== 'META')) {
          // Indonesia (IDX) - Keep heuristic but allow exception for known US tech giants if collision happens, 
          // or better yet, trust the input. 
          // Actually, let's just use the presence of .JK or explicit exchange.
          // BUT, to maintain backward compatibility for "BBCA" input, we keep the default to IDX 
          // UNLESS we are sure it's US. 
          // Implementation of StockInput will control whether it passes "BBCA.JK" or "AAPL".

          // Simplified Logic: 
          // If exchange is JK, use .JK
          // If no exchange, we need to decide. 
          // Previous logic forced .JK for length <= 4.
          // New logic: Check if we can just use the symbol as is?
          // Yahoo Finance requires .JK for IDX.
          // If I change this, I must ensure StockInput appends .JK for IDX.
          // StockInput DOES append .JK.
          // So I can just check if ticker ENDS with .JK

          if (exchange === 'JK' || ticker.toUpperCase().endsWith('.JK')) {
            apiUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}.JK?interval=1d`;
            secureLogger.log('Fetching IDX stock data from:', apiUrl);
          } else {
            // Treat as US/Global
            apiUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?interval=1d`;
            secureLogger.log('Fetching stock data (US/Global) from:', apiUrl);
          }
        } else {
          // Default to US/Global if it fell through (e.g. length > 4 and no extension)
          apiUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?interval=1d`;
          secureLogger.log('Fetching stock data (US/Global) from:', apiUrl);
        }

        secureLogger.log('Making API request to:', apiUrl);

        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(apiUrl, {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        clearTimeout(timeoutId);
        secureLogger.log('API response status:', response.status);

        if (!response.ok) {
          secureLogger.error(`Could not fetch data for ${ticker} from ${apiUrl} - status: ${response.status}`);
          continue;
        }

        const data = await response.json();
        secureLogger.log('API response data for', ticker, ':', data);

        // API call completed
        if (data.chart &&
          data.chart.result &&
          data.chart.result[0] &&
          data.chart.result[0].meta &&
          data.chart.result[0].meta.regularMarketPrice) {
          const price = data.chart.result[0].meta.regularMarketPrice;
          const currency = data.chart.result[0].meta.currency || 'USD';

          // Get price change if available - try multiple sources
          let change = 0;
          let changeTime = '24h';

          // Log all available data for debugging
          secureLogger.log(`Full meta data for ${ticker}:`, data.chart.result[0].meta);

          // Try chartPreviousClose first (this is what Yahoo Finance uses)
          if (data.chart.result[0].meta.chartPreviousClose && data.chart.result[0].meta.chartPreviousClose > 0) {
            const prevClose = data.chart.result[0].meta.chartPreviousClose;
            change = ((price - prevClose) / prevClose) * 100;
            changeTime = '24h';
            secureLogger.log(`Calculated change using chartPreviousClose for ${ticker}: ${prevClose} -> ${price} = ${change.toFixed(2)}% (24h)`);
          }
          // Try previousClose as fallback
          else if (data.chart.result[0].meta.previousClose && data.chart.result[0].meta.previousClose > 0) {
            const prevClose = data.chart.result[0].meta.previousClose;
            change = ((price - prevClose) / prevClose) * 100;
            changeTime = '24h';
            secureLogger.log(`Calculated change using previousClose for ${ticker}: ${prevClose} -> ${price} = ${change.toFixed(2)}% (24h)`);
          }
          // Try regularMarketChange if previousClose not available
          else if (data.chart.result[0].meta.regularMarketChange && data.chart.result[0].meta.regularMarketChangePercent) {
            change = data.chart.result[0].meta.regularMarketChangePercent;
            changeTime = '24h';
            secureLogger.log(`Using regularMarketChangePercent for ${ticker}: ${change.toFixed(2)}% (24h)`);
          }
          // Try chart data for intraday changes
          else if (data.chart.result[0].indicators &&
            data.chart.result[0].indicators.quote &&
            data.chart.result[0].indicators.quote[0] &&
            data.chart.result[0].indicators.quote[0].close) {
            const closeData = data.chart.result[0].indicators.quote[0].close;
            const validCloses = closeData.filter(c => c !== null && c !== undefined);
            if (validCloses.length >= 2) {
              const currentClose = validCloses[validCloses.length - 1];
              const previousClose = validCloses[validCloses.length - 2];
              if (previousClose > 0) {
                change = ((currentClose - previousClose) / previousClose) * 100;
                changeTime = '1d';
                secureLogger.log(`Calculated change from chart data for ${ticker}: ${previousClose} -> ${currentClose} = ${change.toFixed(2)}% (1d)`);
              }
            }
          } else {
            secureLogger.log(`No change data available for ${ticker}, change set to 0`);
          }

          // Always use the original ticker as the key
          result[ticker] = {
            price,
            currency,
            change: parseFloat(change.toFixed(2)), // Ensure it's a number with 2 decimal places
            changeTime, // Add time period information
            lastUpdate: new Date().toLocaleString()
          };
          secureLogger.log('Successfully processed ticker:', ticker, 'with price:', price, 'change:', change.toFixed(2) + '%', 'time:', changeTime);
          // result[ticker] sudah cukup untuk IDX stocks
        } else {
          secureLogger.warn('No valid price data found for ticker:', ticker);
        }
        // After successful fetch and result assignment:
        if (result[ticker]) {
          fetchCache[tickerUpper] = result[ticker];
        }
      } catch (tickerError) {
        secureLogger.error(`Error fetching data for ${ticker}:`, tickerError);
        // Continue with next ticker instead of failing completely
      }
    }
    // Stock fetch completed
    secureLogger.log('Stock fetch completed, result:', result);
    return result;
  } catch (error) {
    secureLogger.error('Error fetching stock prices:', error);
    return {};
  }
}

export async function fetchCryptoPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};

  try {
    const result = {};

    // Fetch all crypto prices in parallel
    const pricePromises = symbols.map(async (symbol) => {
      try {
        let priceData = null;

        // Try CryptoCompare first
        try {
          // Add timeout to prevent hanging requests
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

          const response = await fetch(
            `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${encodeURIComponent(symbol)}&tsyms=USD`,
            {
              signal: controller.signal,
              cache: 'no-store',
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            }
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();

            if (data.RAW && data.RAW[symbol] && data.RAW[symbol].USD) {
              priceData = data.RAW[symbol].USD;
            } else if (data.Response === "Error" && data.Message.includes("rate limit")) {
              secureLogger.warn(`CryptoCompare rate limited for ${symbol}, trying alternative...`);
            }
          } else {
            secureLogger.warn(`CryptoCompare HTTP error for ${symbol}: ${response.status}`);
          }
        } catch (error) {
          secureLogger.warn(`CryptoCompare failed for ${symbol}:`, error.message);
        }

        // If CryptoCompare failed, try simple price endpoint as fallback
        if (!priceData) {
          try {
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(
              `https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(symbol)}&tsyms=USD`,
              {
                signal: controller.signal,
                cache: 'no-store',
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              }
            );

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              secureLogger.log(`Simple price response for ${symbol}:`, data);

              if (data.USD) {
                priceData = {
                  PRICE: data.USD,
                  CHANGEPCT24HOUR: 0 // We don't have change data from simple endpoint
                };
              }
            }
          } catch (error) {
            secureLogger.warn(`Simple price failed for ${symbol}:`, error.message);
          }
        }

        if (priceData) {
          const change = priceData.CHANGEPCT24HOUR || 0;
          result[symbol] = {
            price: priceData.PRICE,
            currency: 'USD',
            change: parseFloat(change.toFixed(2)),
            changeTime: '24h',
            lastUpdate: new Date().toLocaleString()
          };

          secureLogger.log(`Successfully processed crypto ${symbol} with price: ${priceData.PRICE}, change: ${change.toFixed(2)}% (24h)`);
        } else {
          secureLogger.warn(`No price data available for ${symbol} from any source`);
        }
      } catch (error) {
        secureLogger.error(`Error fetching data for ${symbol}:`, error.message);
      }
    });

    // Wait for all promises to complete
    await Promise.all(pricePromises);

    secureLogger.log('Crypto fetch completed, result:', result);
    return result;
  } catch (error) {
    secureLogger.error('Error fetching crypto prices:', error);
    return {};
  }
}

export async function fetchExchangeRate() {
  try {
    // secureLogger.log('Attempting to fetch exchange rate...');

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Mengambil data kurs dari Exchange Rates API
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gagal mengambil data kurs: ${response.status}`);
    }

    const data = await response.json();
    // secureLogger.log('Exchange rate API response:', data);

    // Check for different possible response structures
    let rate = null;
    if (data.conversion_rates && data.conversion_rates.IDR) {
      rate = data.conversion_rates.IDR;
    } else if (data.rates && data.rates.IDR) {
      rate = data.rates.IDR;
    } else if (data.IDR) {
      rate = data.IDR;
    } else {
      secureLogger.error('Unexpected API response structure:', data);
      throw new Error('Data kurs USD/IDR tidak ditemukan');
    }

    if (isNaN(rate)) {
      throw new Error('Format kurs tidak valid');
    }

    // secureLogger.log('Berhasil mengambil kurs:', rate);
    return {
      rate,
      source: 'Exchange Rate API',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    secureLogger.error('Error fetching exchange rate:', error);
    // Fallback to approximate rate instead of failing completely
    secureLogger.warn('Using fallback exchange rate: 16500');
    return {
      rate: 16500, // Conservative estimate
      source: 'Fallback (Offline)',
      timestamp: new Date().toISOString()
    };
  }
}

export async function fetchIndoGoldPrices() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://www.indogold.id/harga-emas-hari-ini', {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('IndoGold response not ok');

    const text = await response.text();

    // Regex to extract prices
    // Example: "Harga Beli Rp. 1,234,567, Harga Jual/Buyback Rp. 1,100,000"
    const buyMatch = text.match(/Harga Beli Rp\.\s*([\d,]+)/);
    const sellMatch = text.match(/Harga Jual\/Buyback Rp\.\s*([\d,]+)/);

    if (buyMatch && sellMatch) {
      const buyPrice = parseInt(buyMatch[1].replace(/,/g, ''), 10);
      const sellPrice = parseInt(sellMatch[1].replace(/,/g, ''), 10);

      // Pegadaian Adjustment (Based on User Screenshots & Market Comparison)
      const pegadaianBuy = Math.round(buyPrice * 1.0025);
      const pegadaianSell = Math.round(sellPrice * 0.99);

      secureLogger.log(`IndoGold Scraped: Buy ${buyPrice}, Sell ${sellPrice}`);
      secureLogger.log(`Pegadaian Adjusted: Buy ${pegadaianBuy}, Sell ${pegadaianSell}`);

      const timestamp = new Date().toISOString();

      // Fetch Global Gold ETF (GLD) to use as proxy for change %
      // XAUUSD=X (Spot) returns 404 on some nodes, so we use GLD (SPDR Gold Shares) as a reliable proxy
      let globalChange = null;
      try {
        // Use GLD as proxy for gold trend
        const globalData = await fetchStockPrices(['GLD']);
        if (globalData && globalData['GLD'] && globalData['GLD'].change !== undefined) {
          globalChange = globalData['GLD'].change;
          secureLogger.log(`Using Global Gold Change (GLD): ${globalChange}%`);
        }
      } catch (e) {
        secureLogger.warn('Failed to fetch Global Gold Change (GLD) for proxy:', e);
      }

      // 2. Physical Gold Estimation (Emas Batangan)
      const physicalGaleri24 = pegadaianBuy + 100000;
      const physicalAntam = pegadaianBuy + 160000;
      const physicalUBS = pegadaianBuy + 130000;

      return {
        spot: {
          price: pegadaianBuy,
          currency: 'IDR',
          change: globalChange // Add change here too
        },
        digital: {
          price: pegadaianBuy, // Nasabah Buy
          sellPrice: pegadaianSell, // Nasabah Sell (Buyback)
          change: globalChange, // Use Global Change as Proxy
          lastUpdate: timestamp
        },
        physical: {
          antam: { price: physicalAntam },
          ubs: { price: physicalUBS },
          galeri24: { price: physicalGaleri24 },
          lastUpdate: timestamp
        },
        source: 'Pegadaian (Real-Time)',
        lastUpdate: timestamp
      };
    }

    throw new Error('Price patterns not found in IndoGold response');
  } catch (error) {
    secureLogger.error('Real-Time Gold fetch failed:', error);
    return null;
  }
}
export async function fetchGoldPrices() {
  secureLogger.log('Fetching gold prices...');

  // 1. Try Real IndoGold First
  const indoGoldData = await fetchIndoGoldPrices();
  if (indoGoldData) {
    return indoGoldData;
  }

  // 2. No Fallback allowed as per strictly user request
  secureLogger.error('Failed to fetch Real-Time Gold prices. Fallback is disabled.');
  return {
    spot: { price: 0, currency: 'IDR' },
    digital: { price: 0, sellPrice: 0, change: null, lastUpdate: new Date().toISOString() },
    physical: { antam: { price: 0 }, ubs: { price: 0 }, galeri24: { price: 0 }, lastUpdate: new Date().toISOString() },
    source: 'Error: Data Unavailable',
    lastUpdate: new Date().toISOString()
  };
}