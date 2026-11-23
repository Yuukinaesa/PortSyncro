import { fetchExchangeRateServerSide } from '../../lib/fetchExchangeRate.js';
import { secureLogger } from '../../lib/security.js';

let cachedRate = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache on server for real rate

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  try {
    const now = Date.now();
    if (cachedRate && (now - lastFetchTime) < CACHE_TTL_MS) {
      return res.status(200).json({
        rate: cachedRate,
        source: 'Server Memory (Real Cache)',
        timestamp: new Date(lastFetchTime).toISOString(),
        success: true
      });
    }

    const result = await fetchExchangeRateServerSide();
    if (result && typeof result.rate === 'number' && result.rate > 0) {
      cachedRate = result.rate;
      lastFetchTime = Date.now();
      return res.status(200).json({
        rate: result.rate,
        source: result.source,
        timestamp: result.timestamp || new Date().toISOString(),
        success: true
      });
    }

    // If fetchExchangeRateServerSide did not return a valid rate and no previous cache exists:
    if (cachedRate) {
      return res.status(200).json({
        rate: cachedRate,
        source: 'Previous Real Rate',
        timestamp: new Date(lastFetchTime).toISOString(),
        success: true
      });
    }

    // STRICT: NO DUMMY DATA. Return error if all providers genuinely failed.
    return res.status(502).json({
      error: 'Gagal mendapatkan kurs real-time dari provider resmi',
      success: false
    });

  } catch (error) {
    secureLogger.error('Error in /api/exchange-rate:', error);
    if (cachedRate) {
      return res.status(200).json({
        rate: cachedRate,
        source: 'Previous Real Rate',
        timestamp: new Date(lastFetchTime).toISOString(),
        success: true
      });
    }

    return res.status(502).json({
      error: 'Seluruh provider kurs real-time tidak dapat diakses',
      message: error?.message || 'Exchange rate fetch failed',
      success: false
    });
  }
}
