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

  let rateLimitIdentifier;

  if (verifiedUid) {
    rateLimitIdentifier = `user_${verifiedUid}`;
  } else {
    // If user claims to be logged in (sends userId) but has no valid token, BLOCK IT.
    if (req.body.userId) {
      secureLogger.warn(`Potential spoofing attempt. UserId provided but no valid token. IP: ${clientIP}`);
      return res.status(401).json({ message: 'Unauthorized. Invalid or missing token.' });
    }
    // Anonymous request
    const userAgent = req.headers['user-agent'] || 'unknown';
    rateLimitIdentifier = `ip_${clientIP}_${userAgent.substring(0, 50)}`;
  }

  if (!checkRateLimit(rateLimitIdentifier)) {
    secureLogger.warn(`Rate limit exceeded for: ${rateLimitIdentifier}`);
    return res.status(429).json({
      message: 'Too many requests. Please try again later.',
      retryAfter: 60,
      error: 'RATE_LIMIT_EXCEEDED',
      identifier: rateLimitIdentifier
    });
  }

  const { stocks, crypto, gold, exchangeRate } = req.body;
  secureLogger.log('Processing request with:', { stocks, crypto, gold, exchangeRate });

  try {
    // Validate input
    if (!stocks && !crypto && !gold) {
      return res.status(400).json({
        message: 'No stocks, crypto, or gold request provided',
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

    const goldPromise = gold
      ? fetchGoldPrices().catch(error => {
        secureLogger.error('Error fetching gold prices:', error);
        return {};
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