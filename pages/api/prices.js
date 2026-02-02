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

  if (!rateLimitMap.has(identifier)) {
    rateLimitMap.set(identifier, []);
  }

  const requests = rateLimitMap.get(identifier);
  const validRequests = requests.filter(timestamp => timestamp > windowStart);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - validRequests.length - 1); // -1 because current request will count if allowed
  const resetTime = Math.ceil((windowStart + RATE_LIMIT_WINDOW) / 1000); // Unix timestamp in seconds

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Record rate limit violation
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
  // ═══════════════════════════════════════════════════════════════════════════════
  // CRITICAL: FORCE NO CACHE - DATA HARGA REAL-TIME HARUS SELALU FRESH!
  // Aplikasi ini untuk tracking portfolio real-time, jadi TIDAK BOLEH pakai cache
  // ═══════════════════════════════════════════════════════════════════════════════
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');  // Nginx/Varnish proxy
  res.setHeader('X-Accel-Expires', '0');            // Nginx specific


  // Track API access for security monitoring
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';


  // Use secureLogger instead of enhancedSecurityMonitor.recordApiAccess (which doesn't exist)
  secureLogger.log('API /prices Monitor:', {
    endpoint: '/api/prices',
    method: req.method,
    ip: clientIP,
    timestamp: new Date().toISOString()
  });

  secureLogger.log('API /prices called with method:', req.method);
  secureLogger.log('Client IP:', clientIP);
  secureLogger.log('Request Body:', typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 500) : req.body);

  if (req.method !== 'POST') {
    secureLogger.warn('Method not allowed:', req.method);
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  // Enhanced rate limiting - prefer user ID over IP for better isolation
  // clientIP already declared above for security monitoring

  // AUTHENTICATION VERIFICATION
  let verifiedUid = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      // Verify token via Google Identity Toolkit REST API
      // We use this because firebase-admin might not be available or configured with service account
      const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      });

      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        if (verifyData.users && verifyData.users.length > 0) {
          verifiedUid = verifyData.users[0].localId;
        }
      } else {
        secureLogger.warn('Token verification failed:', verifyResponse.status);
      }
    } catch (verifyErr) {
      secureLogger.error('Error verifying token:', verifyErr);
    }
  }

  // Enforce Auth for strict security (Zero Tolerance)
  // Allow unauthenticated requests ONLY if explicitly public endpoint? No, this is internal API.
  // Actually, we should allow it but use strict IP limiting if no auth.
  // But USER REQ: "Auth bypass -> CRITICAL". 
  // IF client sends userId in body but no token, that's spoofing.
  // STRATEGY: 
  // 1. If Token is valid -> Use verifiedUid. High Limit.
  // 2. If No Token -> Use IP. Low Limit.
  // 3. If Token Invalid -> Block.

  // Determine Rate Limit Identifier
  // Strategy: Use User ID if verified, otherwise falls back to Client IP
  // This allows us to rate limit unauthenticated spam BEFORE rejecting it with 401
  let rateLimitIdentifier = verifiedUid ? `user_${verifiedUid}` : `ip_${clientIP}`;

  const rateLimitResult = checkRateLimit(rateLimitIdentifier);

  // Set standard Rate Limit headers for ALL requests
  res.setHeader('X-RateLimit-Limit', rateLimitResult.limit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', rateLimitResult.reset);

  if (!rateLimitResult.allowed) {
    secureLogger.warn(`Rate limit exceeded for: ${rateLimitIdentifier}`);
    res.status(429).json({
      message: 'Too many requests. Please try again later.',
      retryAfter: RATE_LIMIT_WINDOW / 1000, // Seconds
      error: 'RATE_LIMIT_EXCEEDED',
      identifier: rateLimitIdentifier
    });
    return;
  }

  // STRICT SECURITY MODE: Reject unauthenticated requests AFTER rate limit check
  if (!verifiedUid) {
    secureLogger.warn(`Blocked unauthenticated access attempt to /api/prices from IP: ${clientIP}`);
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const { stocks, crypto, gold, exchangeRate } = req.body;
  secureLogger.log('Processing request with:', { stocks, crypto, gold, exchangeRate });

  try {
    // Validate input
    if (!stocks && !crypto && !gold) {
      res.status(400).json({
        message: 'No stocks, crypto, or gold request provided',
        prices: {},
        timestamp: new Date().toISOString()
      });
      return;
    }

    // SECURITY: Limit array size to prevent DoS (Resource Exhaustion)
    const MAX_ITEMS = 50;
    if ((stocks && stocks.length > MAX_ITEMS) || (crypto && crypto.length > MAX_ITEMS)) {
      secureLogger.warn(`Request exceeded max items limit. Stocks: ${stocks?.length}, Crypto: ${crypto?.length}`);
      res.status(400).json({
        message: `Too many items. Maximum ${MAX_ITEMS} items allowed per category.`,
        error: 'LIMIT_EXCEEDED'
      });
      return;
    }

    // Security: Ensure inputs are arrays if provided
    if ((stocks && !Array.isArray(stocks)) || (crypto && !Array.isArray(crypto))) {
      res.status(400).json({ message: 'Invalid input format. Stocks and crypto must be arrays.' });
      return;
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

    const goldPromise = gold
      ? fetchGoldPrices().catch(error => {
        secureLogger.error('Error fetching gold prices:', error);
        // Return valid fallback structure instead of empty object
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

    secureLogger.log('Starting parallel fetch for stocks:', stocks, 'crypto:', crypto, 'gold:', gold);

    // Fetch data secara parallel untuk kecepatan dengan proper error handling
    const [stockPrices, cryptoPrices, goldPrices] = await Promise.allSettled([
      stockPromise,
      cryptoPromise,
      goldPromise
    ]);

    // Extract results from Promise.allSettled
    const stockResult = stockPrices.status === 'fulfilled' ? stockPrices.value : {};
    const cryptoResult = cryptoPrices.status === 'fulfilled' ? cryptoPrices.value : {};
    const goldResult = goldPrices.status === 'fulfilled' ? goldPrices.value : {};

    secureLogger.log('Fetch completed. Stock prices:', stockResult, 'Crypto prices:', cryptoResult, 'Gold prices:', goldResult);

    // Gabungkan semua data harga
    const prices = {
      ...stockResult,
      ...cryptoResult,
      gold: goldResult // Store gold separately or flatten? Better separately as it's a structure
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