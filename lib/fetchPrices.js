import { secureLogger } from './security';
import { load } from 'cheerio';

// Constants for Gold Calculation (Approximate Pegadaian Spreads)
const OZ_TO_GRAM = 31.1035;
const PEGADAIAN_DIGITAL_BUY_SPREAD = 0.035;
const PEGADAIAN_DIGITAL_SELL_SPREAD = -0.002;
const PEGADAIAN_PHYSICAL_ANTAM_SPREAD = 0.045;
const PEGADAIAN_PHYSICAL_UBS_SPREAD = 0.040;
const PEGADAIAN_PHYSICAL_GALERI24_SPREAD = 0.038;

// --- HYBRID PARALLEL FETCH STOCK PRICES ---
export async function fetchStockPrices(tickers) {
  secureLogger.log('fetchStockPrices (Hybrid Parallel) called with tickers:', tickers);

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
          if (!yahooSymbol.endsWith('.JK')) return null;
          try {
            const cleanSymbol = yahooSymbol.replace('.JK', '');
            const googleUrl = `https://www.google.com/finance/quote/${cleanSymbol}:IDX`;
            const res = await fetch(googleUrl, {
              headers: { 'User-Agent': randomUA }
            });
            if (!res.ok) return null;
            const html = await res.text();
            const $ = load(html);
            // Price Scraping
            const priceText = $('.YMlKec.fxKbKc').first().text();
            if (!priceText) return null;
            const price = parseFloat(priceText.replace(/[^\d.-]/g, ''));
            if (isNaN(price)) return null;

            // Prev Close Scraping
            let prevClose = null;
            let prevText = '';
            const label = $('div').filter((i, el) => $(el).text() === 'Previous close').first();
            if (label.length) prevText = label.next().text() || label.parent().next().text();
            if (!prevText) prevText = $('.P6K39c').first().text();
            if (prevText) prevClose = parseFloat(prevText.replace(/[^\d.-]/g, ''));

            return { price, currency: 'IDR', prevClose, source: 'Google' };
          } catch (e) { return null; }
        })();

        const yahooPromise = (async () => {
          try {
            const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}&crumb=`;
            const res = await fetchWithRetry(`${quoteUrl}&_=${timestamp}`, {
              cache: 'no-store',
              headers: { 'User-Agent': randomUA }
            });
            if (!res.ok) return null;
            const data = await res.json();
            const q = data.quoteResponse?.result?.[0];
            if (!q) return null;
            return {
              price: q.regularMarketPrice,
              change: q.regularMarketChangePercent,
              currency: q.currency,
              source: 'Yahoo'
            };
          } catch (e) { return null; }
        })();

        const [googleRes, yahooRes] = await Promise.allSettled([googlePromise, yahooPromise]);
        const googleData = googleRes.status === 'fulfilled' ? googleRes.value : null;
        const yahooData = yahooRes.status === 'fulfilled' ? yahooRes.value : null;

        let finalPrice = null;
        let finalChange = 0;
        let finalCurrency = 'IDR';
        let sourceTags = [];

        // 1. Price Priority: Google (IDX Realtime) > Yahoo
        if (googleData && googleData.price) {
          finalPrice = googleData.price;
          finalCurrency = googleData.currency;
          sourceTags.push('GooglePrice');
        } else if (yahooData && yahooData.price) {
          finalPrice = yahooData.price;
          finalCurrency = yahooData.currency || 'IDR';
          sourceTags.push('YahooPrice');
        }

        // 2. Change Priority: Yahoo (Accurate) > Google Calc
        if (yahooData && typeof yahooData.change === 'number') {
          finalChange = yahooData.change;
          sourceTags.push('YahooChange');
        } else if (googleData && googleData.price && googleData.prevClose) {
          finalChange = ((googleData.price - googleData.prevClose) / googleData.prevClose) * 100;
          sourceTags.push('GoogleCalcChange');
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
  secureLogger.log('fetchCryptoPrices called with:', symbols);
  if (!symbols || symbols.length === 0) return {};

  try {
    const result = {};
    const uniqueSymbols = [...new Set(symbols.map(s => s.toUpperCase().trim()))];
    const symbolsStr = uniqueSymbols.join(',');
    // Endpoint pricemultifull returns price AND change
    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbolsStr}&tsyms=USD`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.RAW) {
        uniqueSymbols.forEach(sym => {
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
            secureLogger.log(`Crypto Success ${sym}: ${usdData.PRICE} (${usdData.CHANGEPCT24HOUR}%)`);
          }
        });
      }
    }
    return result;
  } catch (error) {
    secureLogger.error('Error fetching crypto prices:', error);
    return {};
  }
}

// --- EXCHANGE RATE ---
export async function fetchExchangeRate() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal, cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Gagal mengambil data kurs: ${response.status}`);
    const data = await response.json();
    let rate = null;
    if (data.conversion_rates && data.conversion_rates.IDR) rate = data.conversion_rates.IDR;
    else if (data.rates && data.rates.IDR) rate = data.rates.IDR;
    else if (data.IDR) rate = data.IDR;
    else throw new Error('Data kurs USD/IDR tidak ditemukan');
    if (isNaN(rate)) throw new Error('Format kurs tidak valid');
    return { rate, source: 'Exchange Rate API', timestamp: new Date().toISOString() };
  } catch (error) {
    secureLogger.error('Error fetching exchange rate:', error);
    return { rate: 16500, source: 'Fallback (Offline)', timestamp: new Date().toISOString() };
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
    if (buyMatch && sellMatch) {
      const buyPrice = parseInt(buyMatch[1].replace(/,/g, ''), 10);
      const sellPrice = parseInt(sellMatch[1].replace(/,/g, ''), 10);
      const pegadaianBuy = Math.round(buyPrice * 1.0025);
      const pegadaianSell = Math.round(sellPrice * 0.99);
      const timestamp = new Date().toISOString();
      let globalChange = null;
      try {
        // Fetch GLD for change proxy (will use the new Hybrid fetchStockPrices)
        const globalData = await fetchStockPrices(['GLD']);
        if (globalData && globalData['GLD'] && globalData['GLD'].change !== undefined) globalChange = globalData['GLD'].change;
      } catch (e) { secureLogger.warn('Failed to fetch Global Gold Change (GLD) for proxy:', e); }
      const physicalGaleri24 = pegadaianBuy + 100000;
      const physicalAntam = pegadaianBuy + 160000;
      const physicalUBS = pegadaianBuy + 130000;
      return {
        spot: { price: pegadaianBuy, currency: 'IDR', change: globalChange },
        digital: { price: pegadaianBuy, sellPrice: pegadaianSell, change: globalChange, lastUpdate: timestamp },
        physical: { antam: { price: physicalAntam }, ubs: { price: physicalUBS }, galeri24: { price: physicalGaleri24 }, lastUpdate: timestamp },
        source: 'Pegadaian (Real-Time)', lastUpdate: timestamp
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
  const indoGoldData = await fetchIndoGoldPrices();
  if (indoGoldData) return indoGoldData;
  secureLogger.error('Failed to fetch Real-Time Gold prices. Fallback is disabled.');
  return {
    spot: { price: 0, currency: 'IDR' },
    digital: { price: 0, sellPrice: 0, change: null, lastUpdate: new Date().toISOString() },
    physical: { antam: { price: 0 }, ubs: { price: 0 }, galeri24: { price: 0 }, lastUpdate: new Date().toISOString() },
    source: 'Error: Data Unavailable', lastUpdate: new Date().toISOString()
  };
}