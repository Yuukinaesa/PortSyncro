import { fetchExchangeRateServerSide } from '../../lib/fetchExchangeRate';
import { secureLogger } from '../../lib/security';

let cachedRate = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache on server

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Security & Cache headers
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  try {
    const now = Date.now();
    if (cachedRate && (now - lastFetchTime) < CACHE_TTL_MS) {
      return res.status(200).json({
        rate: cachedRate,
        source: 'Server Cache',
        timestamp: new Date(lastFetchTime).toISOString(),
        success: true
      });
    }

    const result = await fetchExchangeRateServerSide();
    if (result && result.rate && !result.isFallback) {
      cachedRate = result.rate;
      lastFetchTime = Date.now();
    }

    return res.status(200).json({
      rate: result.rate || cachedRate || 16850,
      source: result.source || 'Server Fallback',
      timestamp: result.timestamp || new Date().toISOString(),
      success: true
    });
  } catch (error) {
    secureLogger.error('Error in /api/exchange-rate:', error);
    return res.status(200).json({
      rate: cachedRate || 16850,
      source: 'Emergency Fallback',
      timestamp: new Date().toISOString(),
      success: false
    });
  }
}
