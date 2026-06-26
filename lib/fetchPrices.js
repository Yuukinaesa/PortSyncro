import { secureLogger } from './security.js';
import { load } from 'cheerio';

// Constants for Gold Calculation
const OZ_TO_GRAM = 31.1035;
const PEGADAIAN_DIGITAL_BUY_SPREAD = 0.035;
const PEGADAIAN_DIGITAL_SELL_SPREAD = -0.002;
const PEGADAIAN_PHYSICAL_ANTAM_SPREAD = 0.045;
const PEGADAIAN_PHYSICAL_UBS_SPREAD = 0.040;
const PEGADAIAN_PHYSICAL_GALERI24_SPREAD = 0.038;

// Helper function to smart parse numbers (ID vs US format)
function smartParse(text) {
  if (!text) return null;
  let clean = text.replace(/[^\d.,-]/g, '');
  // If it looks like ID format (dot thousand separator OR comma decimal at end)
  if (clean.match(/,\d{2}$/) || clean.match(/\.\d{3},/)) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,/g, '');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

// --- HYBRID PARALLEL FETCH STOCK PRICES ---
export async function fetchStockPrices(tickers) {
  secureLogger.log('fetchStockPrices (Hybrid Parallel V2) called with tickers:', tickers);

  if (!tickers || tickers.length === 0) return {};

  try {
    const result = {};
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const fetchWithRetry = async (url, options, maxRetries = 1) => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
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

    await Promise.all(uniqueTickers.map(async (ticker) => {
      try {
        const tickerUpper = ticker.toUpperCase();
        let symbol = ticker;
        let exchange = '';
        if (ticker.includes(':')) [symbol, exchange] = ticker.split(':');
        else if (ticker.includes('.')) [symbol, exchange] = ticker.split('.');

        const normalizedSymbol = symbol.toUpperCase();
        const yahooSymbol = (exchange === 'JK' || tickerUpper.endsWith('.JK'))
          ? `${normalizedSymbol}.JK`
          : normalizedSymbol;

        const randomUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
        const timestamp = Date.now();

        const googlePromise = (async () => {
          try {
            // 1. Determine URL (US/Global Search vs IDX Direct)
            let googleUrl = '';
            if (yahooSymbol.endsWith('.JK')) {
              const cleanSymbol = yahooSymbol.replace('.JK', '');
              googleUrl = `https://www.google.com/finance/quote/${cleanSymbol}:IDX`;
            } else {
              googleUrl = `https://www.google.com/finance?q=${yahooSymbol}`;
            }

            const res = await fetch(googleUrl, {
              headers: { 'User-Agent': randomUA }
            });
            if (!res.ok) return null;
            const html = await res.text();
            const $ = load(html);

            // --- PRICE SCRAPING (2026 Updated Selectors) ---
            let priceText = null;
            let price = null;

            // Strategy 1: N6SYTe class (current Google Finance price container)
            priceText = $('.N6SYTe span[jsname="Pdsbrc"] span').first().text();
            // Strategy 2: Fallback to old classes
            if (!priceText) priceText = $('.YMlKec.fxKbKc').first().text();
            // Strategy 3: data-last-price attribute
            if (!priceText) priceText = $('[data-last-price]').attr('data-last-price');
            // Strategy 4: Regex from raw HTML for currency pattern
            if (!priceText) {
              const isIndo = yahooSymbol.endsWith('.JK') || yahooSymbol.endsWith(':IDX');
              const currencyRegex = isIndo
                ? /IDR\s+([\d,.]+)/
                : /\$([\d,.]+)/;
              const rawMatch = html.match(currencyRegex);
              if (rawMatch) priceText = rawMatch[1];
            }

            price = smartParse(priceText);
            if (price === null) return null;

            // --- CHANGE % SCRAPING (2026 Updated) ---
            let scrapeChange = null;
            let prevClose = null;

            // A. DAicsd class (change container with % and absolute change)
            const changeContainer = $('.DAicsd').first().text();
            if (changeContainer) {
              const pctMatch = changeContainer.match(/([+\-\u2212]?\d+[.,]?\d*)\s*%/);
              if (pctMatch) {
                let valStr = pctMatch[1].replace(',', '.').replace('\u2212', '-');
                scrapeChange = parseFloat(valStr);
                // Check for negative indicator
                if ((changeContainer.includes('arrow_downward') || changeContainer.includes('\u2212') || changeContainer.includes('-')) && scrapeChange > 0 && !valStr.startsWith('-') && !valStr.startsWith('+')) {
                  scrapeChange = -scrapeChange;
                }
              }
              // Extract absolute change to calculate prev close
              const absMatch = changeContainer.match(/([+\-\u2212]?[\d,.]+)\s*\)/);
              if (absMatch && price) {
                const absChange = smartParse(absMatch[1].replace('\u2212', '-'));
                if (absChange !== null) {
                  prevClose = price - absChange;
                }
              }
            }

            // B. Financial details with SwQK7/dO6ijd pattern (Open price as prev close proxy)
            if (prevClose === null) {
              const detailPairs = $('div.SwQK7');
              detailPairs.each((i, el) => {
                const label = $(el).text().trim().toLowerCase();
                if (label === 'previous close' || label === 'prev close' || label === 'penutupan sebelumnya') {
                  const val = $(el).next('.dO6ijd').text();
                  prevClose = smartParse(val);
                }
              });
            }

            // C. Fallback: Semantic Search (Text Scan)
            if (prevClose === null) {
              const labels = $('div').filter((i, el) => {
                const t = $(el).text().trim().toLowerCase();
                return t === 'previous close' || t === 'penutupan sebelumnya';
              });
              if (labels.length > 0) {
                const lbl = labels.first();
                let val = lbl.next().text() || lbl.parent().next().text();
                prevClose = smartParse(val);
              }
            }

            // D. Old class fallback
            if (prevClose === null) {
              prevClose = smartParse($('.P6K39c').first().text());
            }

            // E. Percentage Regex Fallback from full HTML (Last Resort)
            if (scrapeChange === null) {
              const pctMatch = html.match(/([+\-\u2212]\d+\.\d+)%\s*\(\s*([+\-\u2212]?[\d,.]+)\s*\)\s*Today/i);
              if (pctMatch) {
                let valStr = pctMatch[1].replace('\u2212', '-');
                scrapeChange = parseFloat(valStr);
              }
            }

            // F. Currency Detection
            const isIndo = yahooSymbol.endsWith('.JK') || yahooSymbol.endsWith(':IDX');
            const currency = isIndo ? 'IDR' : 'USD';

            return { price, currency: currency, prevClose, scrapeChange, source: 'Google' };
          } catch (e) { return null; }
        })();

        const yahooPromise = (async () => {
          // Try Chart v8 FIRST (more reliable, less rate limited, no auth needed)
          try {
            const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
            const res = await fetchWithRetry(`${chartUrl}&_=${timestamp}`, {
              cache: 'no-store',
              headers: { 'User-Agent': randomUA }
            });
            if (res.ok) {
              const data = await res.json();
              const meta = data.chart?.result?.[0]?.meta;
              if (meta) {
                let change = 0;
                const prevClose = meta.chartPreviousClose !== undefined ? meta.chartPreviousClose : meta.previousClose;
                if (prevClose) change = ((meta.regularMarketPrice - prevClose) / prevClose) * 100;
                return { price: meta.regularMarketPrice, change: change, currency: meta.currency, source: 'YahooV8' };
              }
            }
          } catch (e) { /* continue */ }

          // Fallback: Try v7 Quotes API (may require auth/crumb)
          try {
            const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&crumb=`;
            const res = await fetchWithRetry(`${quoteUrl}&_=${timestamp}`, {
              cache: 'no-store',
              headers: { 'User-Agent': randomUA }
            });
            if (res.ok) {
              const data = await res.json();
              const q = data.quoteResponse?.result?.[0];
              if (q) return { price: q.regularMarketPrice, change: q.regularMarketChangePercent, currency: q.currency, source: 'YahooV7' };
            }
          } catch (e) { /* continue */ }

          return null;
        })();

        const [googleRes, yahooRes] = await Promise.allSettled([googlePromise, yahooPromise]);
        const googleData = googleRes.status === 'fulfilled' ? googleRes.value : null;
        const yahooData = yahooRes.status === 'fulfilled' ? yahooRes.value : null;

        let finalPrice = null;
        let finalChange = 0;
        let finalCurrency = 'IDR';
        let sourceTags = [];

        if (googleData && googleData.price) {
          finalPrice = googleData.price;
          finalCurrency = googleData.currency;
          sourceTags.push('GooglePrice');
        } else if (yahooData && yahooData.price) {
          finalPrice = yahooData.price;
          // Use dynamic fallback based on ticker if currency is missing
          const defaultCurrency = (yahooSymbol.endsWith('.JK') || yahooSymbol.endsWith(':IDX')) ? 'IDR' : 'USD';
          finalCurrency = yahooData.currency || defaultCurrency;
          sourceTags.push('YahooPrice');
        }

        // CHANGE LOGIC PRIORITY: Yahoo > Google Calc > Google Scrape
        if (yahooData && typeof yahooData.change === 'number' && yahooData.change !== 0) {
          finalChange = yahooData.change;
          sourceTags.push('YahooChange');
        } else if (googleData && googleData.price && googleData.prevClose) {
          finalChange = ((googleData.price - googleData.prevClose) / googleData.prevClose) * 100;
          sourceTags.push('GoogleCalcChange');
        } else if (googleData && googleData.scrapeChange !== null) {
          finalChange = googleData.scrapeChange;
          sourceTags.push('GoogleScrapeChange');
        }

        if (finalPrice !== null) {
          result[ticker] = {
            price: finalPrice,
            currency: finalCurrency,
            change: parseFloat((finalChange || 0).toFixed(2)),
            changeTime: '24h',
            lastUpdate: new Date().toLocaleString(),
            source: sourceTags.join('+')
          };
          secureLogger.log(`Process Success ${ticker}: ${finalPrice} (${finalChange}%)`);
        } else {
          secureLogger.warn(`Failed to fetch ${ticker}`);
        }
      } catch (err) { secureLogger.error(`Error processing ticker ${ticker}:`, err); }
    }));
    secureLogger.log('Stock fetch completed, result:', result);
    return result;
  } catch (error) {
    secureLogger.error('FetchStockPrices Fatal:', error);
    return {};
  }
}

// --- FULL API CRYPTO PRICES ---
export async function fetchCryptoPrices(symbols) {
  secureLogger.log('fetchCryptoPrices (Hybrid Binance + CoinGecko + CryptoCompare) called with:', symbols);
  if (!symbols || symbols.length === 0) return {};

  const result = {};
  const uniqueSymbols = [...new Set(symbols.map(s => s.toUpperCase().trim()))];

  const stablecoinIds = {
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'DAI': 'dai',
    'BUSD': 'binance-usd',
    'FDUSD': 'first-digital-usd',
    'TUSD': 'true-usd',
    'USDD': 'usdd',
    'PYUSD': 'paypal-usd',
    'USDE': 'ethena-usde',
    'FRAX': 'frax',
    'LUSD': 'liquity-usd'
  };

  // 1. Try Binance first (No API key, high limits, reliable)
  // We exclude USDT from the Binance query because Binance doesn't trade USDT/USDT (which causes 400 Bad Request)
  const binanceQuerySymbols = uniqueSymbols.filter(sym => sym !== 'USDT');
  
  if (binanceQuerySymbols.length > 0) {
    try {
      const binanceSymbols = binanceQuerySymbols.map(sym => {
        if (sym.endsWith('USDT')) return sym;
        return `${sym}USDT`;
      });
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(binanceSymbols))}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          data.forEach(item => {
            const matchedSym = binanceQuerySymbols.find(sym => 
              item.symbol === sym || item.symbol === `${sym}USDT`
            );
            if (matchedSym) {
              result[matchedSym] = {
                price: parseFloat(item.lastPrice),
                currency: 'USD',
                change: parseFloat(parseFloat(item.priceChangePercent).toFixed(2)),
                changeTime: '24h',
                lastUpdate: new Date().toLocaleString(),
                source: 'Binance'
              };
            }
          });
        }
      }
    } catch (e) {
      secureLogger.warn('Binance API fetch failed, falling back to CoinGecko:', e);
    }
  }

  // 2. Fallback to CoinGecko for any missing symbols (free, no API key, already whitelisted in CSP)
  const missingSymbols = uniqueSymbols.filter(sym => !result[sym]);
  if (missingSymbols.length > 0) {
    try {
      // CoinGecko uses lowercase IDs, common mappings
      const coinGeckoIdMap = {
        'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin',
        'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin', 'DOT': 'polkadot',
        'AVAX': 'avalanche-2', 'MATIC': 'matic-network', 'LINK': 'chainlink',
        'UNI': 'uniswap', 'ATOM': 'cosmos', 'LTC': 'litecoin', 'NEAR': 'near',
        'FIL': 'filecoin', 'APT': 'aptos', 'ARB': 'arbitrum', 'OP': 'optimism',
        'PAXG': 'pax-gold', 'SHIB': 'shiba-inu', 'TRX': 'tron', 'PEPE': 'pepe',
        'SUI': 'sui', 'SEI': 'sei-network', 'INJ': 'injective-protocol',
        'TIA': 'celestia', 'JUP': 'jupiter-exchange-solana', 'WIF': 'dogwifcoin',
        'RENDER': 'render-token', 'FET': 'fetch-ai', 'JASMY': 'jasmycoin',
        ...stablecoinIds
      };
      const mappedIds = missingSymbols.map(s => coinGeckoIdMap[s] || s.toLowerCase()).filter(Boolean);
      if (mappedIds.length > 0) {
        const apiKey = process.env.COINGECKO_API_KEY || '';
        const isPro = process.env.COINGECKO_PRO_API === 'true';
        const host = isPro ? 'pro-api.coingecko.com' : 'api.coingecko.com';
        const headers = {
          'User-Agent': 'Mozilla/5.0',
          ...(apiKey && { [isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: apiKey })
        };
        const cgUrl = `https://${host}/api/v3/simple/price?ids=${mappedIds.join(',')}&vs_currencies=usd&include_24hr_change=true`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(cgUrl, { signal: controller.signal, headers });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          missingSymbols.forEach(sym => {
            const cgId = coinGeckoIdMap[sym] || sym.toLowerCase();
            if (data[cgId]) {
              result[sym] = {
                price: data[cgId].usd,
                currency: 'USD',
                change: parseFloat((data[cgId].usd_24h_change || 0).toFixed(2)),
                changeTime: '24h',
                lastUpdate: new Date().toLocaleString(),
                source: 'CoinGecko'
              };
            }
          });
        }
      }
    } catch (e) {
      secureLogger.warn('CoinGecko fallback failed, trying CryptoCompare:', e);
    }
  }

  // 3. Last resort: CryptoCompare (may require API key)
  const stillMissing = uniqueSymbols.filter(sym => !result[sym]);
  if (stillMissing.length > 0) {
    try {
      const symbolsStr = stillMissing.join(',');
      const apiKey = process.env.CRYPTOCOMPARE_API_KEY || '';
      const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbolsStr}&tsyms=USD${apiKey ? `&api_key=${apiKey}` : ''}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.RAW) {
          stillMissing.forEach(sym => {
            const rawData = data.RAW[sym];
            if (rawData && rawData.USD) {
              const usdData = rawData.USD;
              result[sym] = {
                price: usdData.PRICE,
                currency: 'USD',
                change: parseFloat(usdData.CHANGEPCT24HOUR.toFixed(2)),
                changeTime: '24h',
                lastUpdate: new Date().toLocaleString(),
                source: 'CryptoCompare'
              };
            }
          });
        }
      }
    } catch (e) {
      secureLogger.error('CryptoCompare last-resort fallback failed:', e);
    }
  }

  // 4. Safe fallback for stablecoins if all APIs fail (guarantees USDT/USDC can always load and be added)
  const stablecoinsList = Object.keys(stablecoinIds);
  stablecoinsList.forEach(stable => {
    if (uniqueSymbols.includes(stable) && !result[stable]) {
      result[stable] = {
        price: 1.0,
        currency: 'USD',
        change: 0.0,
        changeTime: '24h',
        lastUpdate: new Date().toLocaleString(),
        source: 'Static Fallback (Offline)'
      };
    }
  });

  return result;
}

// --- EXCHANGE RATE ---
export async function fetchExchangeRate() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s total timeout

  try {
    // 1. Try Frankfurter API (Free, Reliable, No Key)
    try {
      const frankRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (frankRes.ok) {
        const data = await frankRes.json();
        if (data.rates && data.rates.IDR) {
          clearTimeout(timeoutId);
          return {
            rate: data.rates.IDR,
            source: 'Frankfurter API',
            timestamp: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      secureLogger.warn('Frankfurter API failed, switching to fallback:', e);
    }

    // 2. Fallback: ExchangeRate-API
    const apiKey = process.env.NEXT_PUBLIC_EXCHANGE_RATE_API_KEY || process.env.EXCHANGE_RATE_API_KEY;
    const url = apiKey
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
      : 'https://api.exchangerate-api.com/v4/latest/USD';

    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Fallback API failed: ${response.status}`);

    const data = await response.json();
    let rate = null;
    if (data.conversion_rates && data.conversion_rates.IDR) rate = data.conversion_rates.IDR;
    else if (data.rates && data.rates.IDR) rate = data.rates.IDR;
    else if (data.IDR) rate = data.IDR;
    else throw new Error('Data kurs USD/IDR tidak ditemukan');

    if (isNaN(rate)) throw new Error('Format kurs tidak valid');

    return {
      rate,
      source: apiKey ? 'Exchange Rate API v6' : 'Exchange Rate API v4',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    clearTimeout(timeoutId);
    secureLogger.error('Error fetching exchange rate (All sources failed):', error);
    // Return hardcoded fallback if everything fails
    return { rate: 16850, source: 'Hardcoded Fallback (Offline)', timestamp: new Date().toISOString() };
  }
}

// --- GOLD PRICES ---
export async function fetchIndoGoldPrices() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://www.indogold.id/harga-emas-hari-ini', {
      signal: controller.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('IndoGold response not ok');
    const text = await response.text();
    const buyMatch = text.match(/Harga Beli Rp\.\s*([\d,]+)/);
    const sellMatch = text.match(/Harga Jual\/Buyback Rp\.\s*([\d,]+)/);

    let pegadaianBuy = 0;
    let pegadaianSell = 0;

    if (buyMatch && sellMatch) {
      const buyPrice = parseInt(buyMatch[1].replace(/,/g, ''), 10);
      const sellPrice = parseInt(sellMatch[1].replace(/,/g, ''), 10);
      pegadaianBuy = Math.round(buyPrice * 1.0025);
      pegadaianSell = Math.round(sellPrice * 0.99);
    } else {
      throw new Error('Price patterns not found in IndoGold response');
    }

    const timestamp = new Date().toISOString();
    let globalChange = null;
    try {
      // 1. Try GC=F (Gold Futures - Most Accurate, directly tracks gold)
      const futuresData = await fetchStockPrices(['GC=F']);
      let futuresChange = (futuresData && futuresData['GC=F']) ? futuresData['GC=F'].change : null;

      if (futuresChange !== null && futuresChange !== 0) {
        globalChange = futuresChange;
        secureLogger.log(`Global Gold Change (GC=F Futures): ${globalChange}%`);
      } else {
        // 2. Try PAXG (Pax Gold crypto token - reliable, tracks gold closely)
        secureLogger.log(`GC=F change is ${futuresChange}, checking PAXG...`);
        const globalData = await fetchCryptoPrices(['PAXG']);
        let paxgChange = (globalData && globalData['PAXG']) ? globalData['PAXG'].change : null;

        if (paxgChange !== null && paxgChange !== 0) {
          globalChange = paxgChange;
          secureLogger.log(`Global Gold Change (PAXG): ${globalChange}%`);
        } else {
          // 3. Try GLD (SPDR Gold ETF)
          secureLogger.log(`PAXG change is ${paxgChange}, checking GLD...`);
          const stockData = await fetchStockPrices(['GLD']);
          if (stockData && stockData['GLD'] && stockData['GLD'].change !== 0) {
            globalChange = stockData['GLD'].change;
            secureLogger.log(`Global Gold Change (GLD ETF): ${globalChange}%`);
          } else {
            // All zero or failed, default to best available or 0
            globalChange = futuresChange !== null ? futuresChange : (paxgChange !== null ? paxgChange : 0);
            secureLogger.log(`All Gold proxies flat/failed. Using: ${globalChange}%`);
          }
        }
      }
    } catch (e) { secureLogger.warn('Failed to fetch Global Gold Change proxy:', e); }

    const physicalGaleri24 = pegadaianBuy + 100000;
    const physicalAntam = pegadaianBuy + 160000;
    const physicalUBS = pegadaianBuy + 130000;

    return {
      spot: { price: pegadaianBuy, currency: 'IDR', change: globalChange },
      digital: { price: pegadaianBuy, sellPrice: pegadaianSell, change: globalChange, lastUpdate: timestamp },
      physical: { antam: { price: physicalAntam }, ubs: { price: physicalUBS }, galeri24: { price: physicalGaleri24 }, lastUpdate: timestamp },
      source: 'Pegadaian (Real-Time)', lastUpdate: timestamp
    };
  } catch (error) {
    secureLogger.error('Real-Time Gold fetch failed:', error);
    return null;
  }
}

export async function fetchGoldPrices() {
  secureLogger.log('Fetching gold prices...');
  const indoGoldData = await fetchIndoGoldPrices();
  if (indoGoldData) return indoGoldData;
  secureLogger.error('Failed to fetch Real-Time Gold prices. Returning default fallback structure.');

  const timestamp = new Date().toISOString();
  return {
    spot: { price: 0, currency: 'IDR' },
    digital: { price: 0, sellPrice: 0, change: null, lastUpdate: timestamp },
    physical: {
      antam: { price: 0 },
      ubs: { price: 0 },
      galeri24: { price: 0 },
      lastUpdate: timestamp
    },
    source: 'Error: Data Unavailable',
    lastUpdate: timestamp
  };
}