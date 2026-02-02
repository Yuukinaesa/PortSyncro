import { secureLogger } from './security'; // Ensure this matches existing import or file structure
import { load } from 'cheerio'; // For Google Finance scraping
// lib/fetchPrices.js

// Constants for Gold Calculation (Approximate Pegadaian Spreads)
const OZ_TO_GRAM = 31.1035;
const PEGADAIAN_DIGITAL_BUY_SPREAD = 0.035; // +3.5% (Kita Beli dari Pegadaian)
const PEGADAIAN_DIGITAL_SELL_SPREAD = -0.002; // -0.2% (Kita Jual ke Pegadaian - Buyback)

const PEGADAIAN_PHYSICAL_ANTAM_SPREAD = 0.045; // +4.5%
const PEGADAIAN_PHYSICAL_UBS_SPREAD = 0.040; // +4.0%
const PEGADAIAN_PHYSICAL_GALERI24_SPREAD = 0.038; // +3.8%

export async function fetchStockPrices(tickers) {
  secureLogger.log('fetchStockPrices (Hybrid) called with tickers:', tickers);

  if (!tickers || tickers.length === 0) return {};

  try {
    const result = {};

    // Helper: Delay
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper: Retry with short timeout
    const fetchWithRetry = async (url, options, maxRetries = 1) => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout per request
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.status === 429) {
            if (attempt < maxRetries) {
              await delay(500 * (attempt + 1));
              continue;
            }
          }
          if (response.ok || attempt === maxRetries) return response;
        } catch (error) {
          if (attempt === maxRetries) throw error;
          await delay(200);
        }
      }
      throw new Error('Fetch failed after retries');
    };

    const uniqueTickers = [...new Set(tickers.filter(t => t).map(t => t.trim()))];

    // Parallel processing
    await Promise.all(uniqueTickers.map(async (ticker) => {
      try {
        const tickerUpper = ticker.toUpperCase();
        let symbol = ticker;
        let exchange = '';
        // Detect format SYMBOL:EXCHANGE or SYMBOL.EXCHANGE
        if (ticker.includes(':')) [symbol, exchange] = ticker.split(':');
        else if (ticker.includes('.')) [symbol, exchange] = ticker.split('.');

        const normalizedSymbol = symbol.toUpperCase();
        // Determine Yahoo Symbol (add .JK for IDX)
        const yahooSymbol = (exchange === 'JK' || tickerUpper.endsWith('.JK'))
          ? `${normalizedSymbol}.JK`
          : normalizedSymbol;

        // Randomized User Agents
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
        ];
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        const timestamp = Date.now();

        let price = null;
        let currency = 'IDR';
        let change = 0;
        let changeTime = '24h';
        let successSource = '';

        // STRATEGY 0: Google Finance Scraping (Primary for IDX)
        if (yahooSymbol.endsWith('.JK')) {
          const cleanSymbol = yahooSymbol.replace('.JK', '');
          const googleSymbol = `${cleanSymbol}:IDX`;
          const googleUrl = `https://www.google.com/finance/quote/${googleSymbol}`;

          try {
            // Using standard browser UA for scraping
            const res = await fetch(googleUrl, {
              headers: {
                'User-Agent': randomUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            });

            if (res.ok) {
              const html = await res.text();
              const $ = load(html);
              // Google Finance Class Selector (Current as of 2024/2025)
              // .YMlKec.fxKbKc is the main price
              const priceElement = $('.YMlKec.fxKbKc').first();
              const priceText = priceElement.text(); // e.g. "Rp615"

              if (priceText) {
                const cleanPrice = priceText.replace(/[^\d.-]/g, '');
                const parsedPrice = parseFloat(cleanPrice);

                if (!isNaN(parsedPrice) && parsedPrice > 0) {
                  price = parsedPrice;
                  currency = 'IDR';
                  successSource = 'GoogleFinance';

                  // Alternative Strategy: Scrape "Previous Close" and calculate change manually
                  // This is more robust than finding the percentage text which changes classes often
                  try {
                    // Fallback: search for P6K39c class (common for Key Stats values in Google Finance)
                    // or look for text "Previous close"
                    let prevCloseText = '';

                    const label = $('div').filter((i, el) => $(el).text() === 'Previous close').first();
                    if (label.length) {
                      // Value is usually in the next element or parent's sibling
                      prevCloseText = label.next().text() || label.parent().next().text();
                    }

                    if (!prevCloseText) {
                      prevCloseText = $('.P6K39c').first().text();
                    }

                    if (prevCloseText) {
                      const cleanPrev = prevCloseText.replace(/[^\d.-]/g, '');
                      const prevClose = parseFloat(cleanPrev);
                      if (!isNaN(prevClose) && prevClose > 0) {
                        change = ((price - prevClose) / prevClose) * 100;
                        secureLogger.log(`Calculated Change from PrevClose ${prevClose}: ${change}%`);
                      }
                    }

                    // Fallback: If calculation failed (change still 0), try the old regex method
                    if (change === 0) {
                      const pctText = priceElement.parent().parent().text();
                      const match = pctText.match(/([+\-\u2212]?\d+[.,]?\d*)%/);
                      if (match) {
                        let valStr = match[1].replace(',', '.').replace('\u2212', '-');
                        change = parseFloat(valStr);
                        if ((pctText.includes('-') || pctText.includes('\u2212')) && change > 0 && !valStr.includes('-')) {
                          change = -change;
                        }
                      }
                    }
                  } catch (calcErr) {
                    secureLogger.log(`Previous Close calculation failed: ${calcErr.message}`);
                  }
                  secureLogger.log(`Google Finance Success ${ticker}: ${price} (${change}%)`);
                }
              }
            }
          } catch (e) {
            secureLogger.log(`Google Finance failed for ${ticker}: ${e.message}`);
          }
        }

        // STRATEGY 1: Yahoo Quote API v7 (Fallback/Primary for US)
        if (!price) {
          const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&crumb=`;
          try {
            const res = await fetchWithRetry(`${quoteUrl}&_=${timestamp}`, {
              cache: 'no-store',
              headers: {
                'User-Agent': randomUA,
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
              }
            });

            if (res.ok) {
              const data = await res.json();
              const q = data.quoteResponse?.result?.[0];
              if (q && q.regularMarketPrice) {
                price = q.regularMarketPrice;
                currency = q.currency || 'IDR';
                change = q.regularMarketChangePercent || 0;
                successSource = 'YahooQuoteV7';
                secureLogger.log(`Quote V7 Success ${ticker}: ${price}`);
              }
            }
          } catch (e) {
            secureLogger.log(`Quote V7 failed for ${ticker}: ${e.message}`);
          }
        }

        // STRATEGY 2: Yahoo Chart API v8 (Last Resort)
        if (!price) {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
          try {
            const res = await fetchWithRetry(`${chartUrl}&_=${timestamp}`, {
              cache: 'no-store',
              headers: { 'User-Agent': randomUA, 'Accept': 'application/json' }
            });
            if (res.ok) {
              const data = await res.json();
              const meta = data.chart?.result?.[0]?.meta;
              if (meta?.regularMarketPrice) {
                price = meta.regularMarketPrice;
                currency = meta.currency || 'IDR';
                if (meta.previousClose) {
                  change = ((price - meta.previousClose) / meta.previousClose) * 100;
                }
                successSource = 'YahooChartV8';
                secureLogger.log(`Chart V8 Success ${ticker}: ${price}`);
              }
            }
          } catch (e) {
            secureLogger.log(`Chart V8 failed for ${ticker}: ${e.message}`);
          }
        }

        if (price) {
          result[ticker] = {
            price,
            currency,
            change: parseFloat(change.toFixed(2)),
            changeTime,
            lastUpdate: new Date().toLocaleString(),
            source: successSource
          };
        } else {
          secureLogger.warn(`Failed to fetch ${ticker} from all sources`);
        }

      } catch (err) {
        secureLogger.error(`Error processing ticker ${ticker}:`, err);
      }
    }));

    secureLogger.log('Stock fetch completed, result:', result);
    return result;

  } catch (error) {
    secureLogger.error('FetchStockPrices Fatal:', error);
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