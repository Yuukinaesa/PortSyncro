// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices } from '../../lib/fetchPrices';
import { secureLogger } from '../../lib/securityMonitoring';
import { enhancedSecurityMonitor } from '../../lib/enhancedSecurity';

// Enhanced rate limiting with user-based tracking
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Reduced from 100 to 30 requests per minute for better protection

function checkRateLimit(identifier) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }

  const requests = rateLimitMap.get(identifier);
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Record rate limit violation
    enhancedSecurityMonitor.recordSuspiciousPattern('RATE_LIMIT_EXCEEDED', {
      identifier,
      endpoint: '/api/prices',
      requests: validRequests.length
    });
    return false;
  }

  validRequests.push(now);
  rateLimitMap.set(identifier, validRequests);
  return true;
}

// Clean up old entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  for (const [identifier, requests] of rateLimitMap.entries()) {
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    if (validRequests.length === 0) {
      rateLimitMap.delete(identifier);
    } else {
      rateLimitMap.set(identifier, validRequests);
    }
  }
}, 60000); // Clean up every minute

export default async function handler(req, res) {
  secureLogger.log('API /prices called with method:', req.method);

  if (req.method !== 'POST') {
    secureLogger.warn('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Enhanced rate limiting - prefer user ID over IP for better isolation
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';

  // Try to get user ID from request body or headers
  const { stocks, crypto, exchangeRate, userId } = req.body;
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Create a unique identifier: prefer user ID, fallback to IP + user agent
  const rateLimitIdentifier = userId ? `user_${userId}` : `ip_${clientIP}_${userAgent.substring(0, 50)}`;

  if (!checkRateLimit(rateLimitIdentifier)) {
    secureLogger.warn(`Rate limit exceeded for: ${rateLimitIdentifier}`);
    return res.status(429).json({
      message: 'Too many requests. Please try again later.',
      retryAfter: 60,
      error: 'RATE_LIMIT_EXCEEDED',
      identifier: rateLimitIdentifier
    });
  }

  secureLogger.log('Processing request with:', { stocks, crypto, exchangeRate });

  try {
    // Validate input
    if (!stocks && !crypto) {
      return res.status(400).json({
        message: 'No stocks or crypto symbols provided',
        prices: {},
        timestamp: new Date().toISOString()
      });
    }

    // SECURITY: Limit array size to prevent DoS (Resource Exhaustion)
    const MAX_ITEMS = 50;
    if ((stocks && stocks.length > MAX_ITEMS) || (crypto && crypto.length > MAX_ITEMS)) {
      secureLogger.warn(`Request exceeded max items limit. Stocks: ${stocks?.length}, Crypto: ${crypto?.length}`);
      return res.status(400).json({
        message: `Too many items. Maximum ${MAX_ITEMS} items allowed per category.`,
        error: 'LIMIT_EXCEEDED'
      });
    }

    // Security: Ensure inputs are arrays if provided
    if ((stocks && !Array.isArray(stocks)) || (crypto && !Array.isArray(crypto))) {
      return res.status(400).json({ message: 'Invalid input format. Stocks and crypto must be arrays.' });
    }


    // Buat Promise untuk fetch data secara parallel dengan error handling
    const stockPromise = stocks && stocks.length > 0
      ? fetchStockPrices(stocks).catch(error => {
        secureLogger.error('Error fetching stock prices:', error);
        return {}; // Return empty object on error
      })
      : Promise.resolve({});

    const cryptoPromise = crypto && crypto.length > 0
      ? fetchCryptoPrices(crypto).catch(error => {
        secureLogger.error('Error fetching crypto prices:', error);
        return {}; // Return empty object on error
      })
      : Promise.resolve({});

    secureLogger.log('Starting parallel fetch for stocks:', stocks, 'crypto:', crypto);

    // Fetch data secara parallel untuk kecepatan dengan proper error handling
    const [stockPrices, cryptoPrices] = await Promise.allSettled([
      stockPromise,
      cryptoPromise
    ]);

    // Extract results from Promise.allSettled
    const stockResult = stockPrices.status === 'fulfilled' ? stockPrices.value : {};
    const cryptoResult = cryptoPrices.status === 'fulfilled' ? cryptoPrices.value : {};

    secureLogger.log('Fetch completed. Stock prices:', stockResult, 'Crypto prices:', cryptoResult);

    // Gabungkan semua data harga
    const prices = {
      ...stockResult,
      ...cryptoResult
    };

    secureLogger.log('Combined prices:', prices);

    // Buat response
    const response = {
      prices,
      timestamp: new Date().toISOString(),
      statusMessage: 'Berhasil mengambil data terbaru'
    };

    secureLogger.log('Sending response:', response);
    res.status(200).json(response);
  } catch (error) {
    secureLogger.error('Error in /api/prices:', error);
    // Remove error.stack from production response for security
    secureLogger.error('Request body:', req.body);

    res.status(500).json({
      message: 'Gagal mengambil data harga',
      prices: {},
      timestamp: new Date().toISOString()
    });
  }
}