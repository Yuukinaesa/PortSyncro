import { secureLogger } from './security.js';

let clientCachedRate = null;
let lastClientFetchTime = 0;
const CLIENT_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes real cache on client

/**
 * Fetch USD/IDR exchange rate.
 * - Browser: fetches via internal Next.js API `/api/exchange-rate` (same origin, zero CORS).
 * - Server: cascades across 4 real official providers (Frankfurter, ExchangeRate-API, Yahoo Finance, CoinGecko).
 * - STRICT POLICY: NO DUMMY DATA. NO HARDCODED FALLBACK PRICES.
 */
export async function fetchExchangeRate() {
  const now = Date.now();
  if (clientCachedRate && (now - lastClientFetchTime) < CLIENT_CACHE_TTL_MS) {
    return {
      rate: clientCachedRate,
      source: 'Client Real Cache',
      timestamp: new Date(lastClientFetchTime).toISOString()
    };
  }

  // 1. Browser-side: Use internal API proxy
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/exchange-rate?_t=${now}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        const rate = parseFloat(data?.rate);
        if (rate && !isNaN(rate) && rate > 0) {
          clientCachedRate = rate;
          lastClientFetchTime = Date.now();
          return {
            rate: clientCachedRate,
            source: data?.source || 'Server API',
            timestamp: data?.timestamp || new Date().toISOString()
          };
        }
      }
    } catch (e) {
      secureLogger.warn('Fetch from internal /api/exchange-rate failed:', e?.message || e);
    }

    // If client had a previous real rate, reuse it. NEVER inject fake numbers!
    if (clientCachedRate) {
      return {
        rate: clientCachedRate,
        source: 'Previous Real Rate',
        timestamp: new Date(lastClientFetchTime).toISOString()
      };
    }

    throw new Error('Gagal mengambil kurs real-time dari server');
  }

  // 2. Server-side: Cascade 4 real providers
  return await fetchExchangeRateServerSide();
}

/**
 * Server-side exchange rate fetcher cascading 4 real providers:
 * 1. Frankfurter API (Free ECB official feed)
 * 2. Exchange Rate API v4 (Open market feed)
 * 3. Yahoo Finance (USDIDR=X direct market quote)
 * 4. CoinGecko (USDT/IDR crypto on-chain market feed)
 * ZERO DUMMY DATA. ZERO HARDCODED RATES.
 */
export async function fetchExchangeRateServerSide() {
  // 1. Primary: Frankfurter API
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.rates?.IDR);
      if (rate && !isNaN(rate) && rate > 0) {
        return {
          rate,
          source: 'Frankfurter API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Frankfurter API failed, trying ExchangeRate-API:', error?.message || error);
  }

  // 2. Secondary: Exchange Rate API v4
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.rates?.IDR || data?.conversion_rates?.IDR || data?.IDR);
      if (rate && !isNaN(rate) && rate > 0) {
        return {
          rate,
          source: 'Exchange Rate API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Exchange Rate API failed, trying Yahoo Finance:', error?.message || error);
  }

  // 3. Tertiary: Yahoo Finance (USDIDR=X)
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDIDR=X?interval=1d&range=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const rate = parseFloat(price);
      if (rate && !isNaN(rate) && rate > 0) {
        return {
          rate,
          source: 'Yahoo Finance (USDIDR=X)',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Yahoo Finance USDIDR=X failed, trying CoinGecko:', error?.message || error);
  }

  // 4. Quaternary: CoinGecko USDT/IDR
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.tether?.idr);
      if (rate && !isNaN(rate) && rate > 0) {
        return {
          rate,
          source: 'CoinGecko USDT/IDR',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('CoinGecko failed:', error?.message || error);
  }

  // STRICT: NO DUMMY DATA.
  throw new Error('Semua provider kurs real-time resmi (Frankfurter, ExchangeRate-API, Yahoo Finance, CoinGecko) gagal dihubungi.');
}
