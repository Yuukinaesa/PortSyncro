// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices, fetchGoldPrices } from '../../lib/fetchPrices';
import { secureLogger } from '../../lib/securityMonitoring';
import { enhancedSecurityMonitor } from '../../lib/enhancedSecurity';

// Enhanced rate limiting with user-based tracking
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Reduced from 100 to 30 requests per minute for better protection

function checkRateLimit(identifier) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Cleanup to prevent memory leaks in serverless (trigger randomly or if map gets too large)
  if (rateLimitMap.size > 10000 || Math.random() < 0.1) {
    for (const [id, reqs] of rateLimitMap.entries()) {
      const validReqs = reqs.filter(timestamp => timestamp > windowStart);
      if (validReqs.length === 0) {
        rateLimitMap.delete(id);
      } else {
        rateLimitMap.set(id, validReqs);
      }
    }
  }

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }

  const requests = rateLimitMap.get(identifier);
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - validRequests.length - 1);
  const resetTime = Math.ceil((windowStart + RATE_LIMIT_WINDOW) / 1000);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    enhancedSecurityMonitor.recordSuspiciousPattern('RATE_LIMIT_EXCEEDED', {
      identifier,
      endpoint: '/api/prices',
      requests: validRequests.length
    });
    return {
      allowed: false,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      reset: resetTime
    };
  }

  validRequests.push(now);
  rateLimitMap.set(identifier, validRequests);

  return {
    allowed: true,
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining: remaining,
    reset: resetTime
  };
}

export default async function handler(req, res) {
  // ═══════════════════════════════════════════════════════════════════════════════
  // CRITICAL: FORCE NO CACHE - DATA HARGA REAL-TIME HARUS SELALU FRESH!
  // ═══════════════════════════════════════════════════════════════════════════════
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Accel-Expires', '0');

  try {
    // Track API access for security monitoring
    const clientIP = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';

    secureLogger.log('API /prices called with method:', req.method, 'IP:', clientIP);

    if (req.method !== 'POST') {
      secureLogger.warn('Method not allowed:', req.method);
      return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // SECURITY: Request size limit to prevent DoS attacks
    const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_REQUEST_SIZE) {
      secureLogger.warn(`Request too large: ${contentLength} bytes from ${clientIP}`);
      return res.status(413).json({
        error: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size',
        maxSize: '1MB'
      });
    }

    // AUTHENTICATION VERIFICATION
    let verifiedUid = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      if (token && token !== 'null' && token !== 'undefined') {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';

          if (apiKey) {
            const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: token }),
              signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              if (verifyData.users && verifyData.users.length > 0) {
                verifiedUid = verifyData.users[0].localId;
              }
            } else {
              secureLogger.warn('Token verification failed:', verifyResponse.status);
            }
          }
        } catch (verifyErr) {
          secureLogger.error('Error verifying token:', verifyErr.name === 'AbortError' ? 'Timeout' : verifyErr);
        }
      }
    }

    // Rate Limiting Identifier
    const rateLimitIdentifier = verifiedUid ? `user_${verifiedUid}` : `ip_${clientIP}`;
    const rateLimitResult = checkRateLimit(rateLimitIdentifier);

    res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.reset);

    if (!rateLimitResult.allowed) {
      secureLogger.warn(`Rate limit exceeded for: ${rateLimitIdentifier}`);
      return res.status(429).json({
        message: 'Too many requests. Please try again later.',
        retryAfter: RATE_LIMIT_WINDOW / 1000,
        error: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // STRICT SECURITY MODE: Reject unauthenticated requests AFTER rate limit check
    if (!verifiedUid) {
      secureLogger.warn(`Blocked unauthenticated access attempt to /api/prices from IP: ${clientIP}`);
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }

    // Safe body parsing and destructuring
    const bodyObj = (req.body && typeof req.body === 'object') ? req.body : {};
    const { stocks = [], crypto = [], gold = false, exchangeRate = null } = bodyObj;

    // Validate input
    if ((!stocks || stocks.length === 0) && (!crypto || crypto.length === 0) && !gold) {
      return res.status(400).json({
        message: 'No stocks, crypto, or gold request provided',
        prices: {},
        timestamp: new Date().toISOString()
      });
    }

    // Limit array size to prevent DoS
    const MAX_ITEMS = 200;
    if ((stocks && stocks.length > MAX_ITEMS) || (crypto && crypto.length > MAX_ITEMS)) {
      secureLogger.warn(`Request exceeded max items limit. Stocks: ${stocks?.length}, Crypto: ${crypto?.length}`);
      return res.status(400).json({
        message: `Too many items. Maximum ${MAX_ITEMS} items allowed per category.`,
        error: 'LIMIT_EXCEEDED'
      });
    }

    if ((stocks && !Array.isArray(stocks)) || (crypto && !Array.isArray(crypto))) {
      return res.status(400).json({ message: 'Invalid input format. Stocks and crypto must be arrays.' });
    }

    // Parallel fetch with error boundaries
    const stockPromise = stocks && stocks.length > 0
      ? fetchStockPrices(stocks).catch(error => {
        secureLogger.error('Error fetching stock prices:', error);
        return {};
      })
      : Promise.resolve({});

    const cryptoPromise = crypto && crypto.length > 0
      ? fetchCryptoPrices(crypto).catch(error => {
        secureLogger.error('Error fetching crypto prices:', error);
        return {};
      })
      : Promise.resolve({});

    const goldPromise = gold
      ? fetchGoldPrices().catch(error => {
        secureLogger.error('Error fetching gold prices:', error);
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
          source: 'Error (Fallback)',
          lastUpdate: timestamp
        };
      })
      : Promise.resolve({});

    const [stockPrices, cryptoPrices, goldPrices] = await Promise.allSettled([
      stockPromise,
      cryptoPromise,
      goldPromise
    ]);

    const stockResult = (stockPrices.status === 'fulfilled' && stockPrices.value) ? stockPrices.value : {};
    const cryptoResult = (cryptoPrices.status === 'fulfilled' && cryptoPrices.value) ? cryptoPrices.value : {};
    const goldResult = (goldPrices.status === 'fulfilled' && goldPrices.value) ? goldPrices.value : {};

    const prices = {
      ...stockResult,
      ...cryptoResult,
      gold: goldResult
    };

    return res.status(200).json({
      prices,
      timestamp: new Date().toISOString(),
      statusMessage: 'Berhasil mengambil data terbaru'
    });
  } catch (error) {
    secureLogger.error('Error in /api/prices:', error);
    return res.status(500).json({
      message: 'Gagal mengambil data harga',
      prices: {},
      timestamp: new Date().toISOString()
    });
  }
}