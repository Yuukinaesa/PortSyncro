import { secureLogger } from './security';

let clientCachedRate = null;
let lastClientFetchTime = 0;
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache on client

/**
 * Fetch USD/IDR exchange rate.
 * - Browser: fetches via internal Next.js API `/api/exchange-rate` to guarantee ZERO CORS errors.
 * - Server: fetches directly from official external rate providers.
 */
export async function fetchExchangeRate() {
  const now = Date.now();
  if (clientCachedRate && (now - lastClientFetchTime) < CLIENT_CACHE_TTL_MS) {
    return {
      rate: clientCachedRate,
      source: 'Client Cache',
      timestamp: new Date(lastClientFetchTime).toISOString()
    };
  }

  // 1. Browser-side: Use internal API proxy to prevent CORS restrictions and origin blocking
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(`/api/exchange-rate?_t=${now}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        const rate = parseFloat(data?.rate);
        if (rate && !isNaN(rate) && rate >= 5000 && rate <= 30000) {
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
      secureLogger.warn('Fetch from internal /api/exchange-rate failed, using client fallback:', e?.message || e);
    }

    // Never make illegal cross-origin browser calls. Fall back to cached or default rate cleanly.
    const fallbackRate = clientCachedRate || 16850;
    return {
      rate: fallbackRate,
      source: clientCachedRate ? 'Stale Client Cache' : 'Offline Fallback',
      timestamp: new Date().toISOString(),
      isFallback: true
    };
  }

  // 2. Server-side (Node.js / Telegram bot / serverless): Call external APIs directly
  return await fetchExchangeRateServerSide();
}

/**
 * Server-side exchange rate fetcher (No CORS limitations in Node.js runtime).
 */
export async function fetchExchangeRateServerSide() {
  // 1. Primary: Frankfurter API
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.rates?.IDR);
      if (rate && !isNaN(rate) && rate >= 5000 && rate <= 30000) {
        return {
          rate,
          source: 'Frankfurter API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Server-side Frankfurter API failed:', error?.message || error);
  }

  // 2. Secondary: Exchange Rate API v4
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = parseFloat(data?.conversion_rates?.IDR || data?.rates?.IDR || data?.IDR);
      if (rate && !isNaN(rate) && rate >= 5000 && rate <= 30000) {
        return {
          rate,
          source: 'Exchange Rate API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Server-side Exchange Rate API failed:', error?.message || error);
  }

  // 3. Fallback
  return {
    rate: 16850,
    source: 'Fallback Rate',
    timestamp: new Date().toISOString(),
    isFallback: true
  };
}
