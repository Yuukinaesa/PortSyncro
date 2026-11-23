import { secureLogger } from './security';

// In-memory cache to prevent redundant network fetches
let cachedRate = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export async function fetchExchangeRate() {
  const now = Date.now();
  if (cachedRate && (now - lastFetchTime) < CACHE_TTL_MS) {
    return {
      rate: cachedRate,
      source: 'Memory Cache',
      timestamp: new Date(lastFetchTime).toISOString()
    };
  }

  // 1. Primary: Frankfurter API (Free, open CORS, high availability, no API key needed)
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = data?.rates?.IDR;
      if (rate && !isNaN(rate) && rate >= 5000 && rate <= 30000) {
        cachedRate = parseFloat(rate);
        lastFetchTime = Date.now();
        secureLogger.log('Successfully fetched rate from Frankfurter API:', cachedRate);
        return {
          rate: cachedRate,
          source: 'Frankfurter API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Frankfurter API failed or timed out:', error?.message || error);
  }

  // 2. Secondary Fallback: Exchange Rate API v4 (Free, open CORS)
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const rate = data?.conversion_rates?.IDR || data?.rates?.IDR || data?.IDR;
      if (rate && !isNaN(rate) && rate >= 5000 && rate <= 30000) {
        cachedRate = parseFloat(rate);
        lastFetchTime = Date.now();
        secureLogger.log('Successfully fetched rate from Exchange Rate API:', cachedRate);
        return {
          rate: cachedRate,
          source: 'Exchange Rate API',
          timestamp: new Date().toISOString()
        };
      }
    }
  } catch (error) {
    secureLogger.warn('Exchange Rate API failed or timed out:', error?.message || error);
  }

  // 3. Fallback: Last known good cached rate or realistic fallback
  const fallbackRate = cachedRate || 16850;
  secureLogger.warn('Using fallback exchange rate:', fallbackRate);
  return {
    rate: fallbackRate,
    source: cachedRate ? 'Stale Cache' : 'Fallback Rate',
    timestamp: new Date().toISOString(),
    isFallback: true
  };
}
