// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices } from '../../lib/fetchPrices';
import { RateLimiter, validateInput, sanitizeInput, secureLogger, secureErrorHandler } from '../../lib/security';
import { securityMonitoring, SECURITY_EVENTS } from '../../lib/securityMonitoring';
import { encryptData, decryptData } from '../../lib/encryption';

// Enhanced rate limiting with improved security
const rateLimiter = new RateLimiter(60000, 25); // 25 requests per minute for better security

// Clean up old entries periodically to prevent memory leaks
setInterval(() => {
  rateLimiter.cleanup();
}, 60000); // Clean up every minute

// Main handler with optional CSRF protection
export default async function handler(req, res) {
  secureLogger.log('API /prices called with method:', req.method);
  
  if (req.method !== 'POST') {
    secureLogger.warn('Method not allowed:', req.method);
    return res.status(405).json({ 
      message: 'Method Not Allowed',
      error: 'METHOD_NOT_ALLOWED'
    });
  }
  
  // Enhanced rate limiting with better identifier
  const clientIP = req.headers['x-forwarded-for'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress || 
                   'unknown';
  
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Security monitoring - check for suspicious activity
  if (securityMonitoring.isSuspiciousIP(clientIP)) {
    securityMonitoring.logSuspiciousActivity({
      ip: clientIP,
      userAgent,
      endpoint: '/api/prices',
      reason: 'Suspicious IP detected'
    });
    
    return res.status(403).json({
      message: 'Access denied',
      error: 'SUSPICIOUS_ACTIVITY'
    });
  }
  
  // Sanitize and validate request body
  const { stocks, crypto, exchangeRate, userId } = req.body || {};
  
  // Create a unique identifier: prefer user ID, fallback to IP + user agent
  const rateLimitIdentifier = userId ? `user_${userId}` : `ip_${clientIP}_${userAgent.substring(0, 50)}`;
  
  if (!rateLimiter.isAllowed(rateLimitIdentifier)) {
    securityMonitoring.logRateLimitExceeded({
      ip: clientIP,
      userAgent,
      userId,
      identifier: rateLimitIdentifier,
      endpoint: '/api/prices'
    });
    
    secureLogger.warn(`Rate limit exceeded for: ${rateLimitIdentifier}`);
    return res.status(429).json({ 
      message: 'Too many requests. Please try again later.',
      retryAfter: 60,
      error: 'RATE_LIMIT_EXCEEDED'
    });
  }
  
  try {
    // Validate and sanitize input
    const sanitizedStocks = Array.isArray(stocks) 
      ? stocks.filter(symbol => validateInput.stockSymbol(symbol))
      : [];
      
    const sanitizedCrypto = Array.isArray(crypto)
      ? crypto.filter(symbol => validateInput.cryptoSymbol(symbol))
      : [];
    
    // Log invalid input attempts
    if (Array.isArray(stocks) && stocks.length !== sanitizedStocks.length) {
      securityMonitoring.logInvalidInput({
        ip: clientIP,
        userAgent,
        userId,
        input: stocks,
        validInput: sanitizedStocks,
        type: 'stock_symbols'
      });
    }
    
    if (Array.isArray(crypto) && crypto.length !== sanitizedCrypto.length) {
      securityMonitoring.logInvalidInput({
        ip: clientIP,
        userAgent,
        userId,
        input: crypto,
        validInput: sanitizedCrypto,
        type: 'crypto_symbols'
      });
    }
    
    // Limit the number of symbols to prevent abuse
    const maxSymbols = 50;
    const limitedStocks = sanitizedStocks.slice(0, maxSymbols);
    const limitedCrypto = sanitizedCrypto.slice(0, maxSymbols);
    
    secureLogger.log('Processing request with:', { 
      stocks: limitedStocks.length, 
      crypto: limitedCrypto.length,
      exchangeRate: !!exchangeRate 
    });
    
    // Validate input
    if (limitedStocks.length === 0 && limitedCrypto.length === 0) {
      return res.status(400).json({ 
        message: 'No valid stocks or crypto symbols provided',
        prices: {},
        timestamp: new Date().toISOString(),
        error: 'INVALID_INPUT'
      });
    }
    
    // Create Promise for parallel data fetching with enhanced error handling
    const stockPromise = limitedStocks.length > 0 
      ? fetchStockPrices(limitedStocks).catch(error => {
          secureLogger.error('Error fetching stock prices:', error);
          return {}; // Return empty object on error
        })
      : Promise.resolve({});
      
    const cryptoPromise = limitedCrypto.length > 0 
      ? fetchCryptoPrices(limitedCrypto).catch(error => {
          secureLogger.error('Error fetching crypto prices:', error);
          return {}; // Return empty object on error
        })
      : Promise.resolve({});
    
    secureLogger.log('Starting parallel fetch for stocks:', limitedStocks.length, 'crypto:', limitedCrypto.length);
    
    // Fetch data in parallel with proper error handling
    const [stockPrices, cryptoPrices] = await Promise.allSettled([
      stockPromise,
      cryptoPromise
    ]);
    
    // Extract results from Promise.allSettled
    const stockResult = stockPrices.status === 'fulfilled' ? stockPrices.value : {};
    const cryptoResult = cryptoPrices.status === 'fulfilled' ? cryptoPrices.value : {};
    
    secureLogger.log('Fetch completed. Stock prices:', Object.keys(stockResult).length, 'Crypto prices:', Object.keys(cryptoResult).length);
    
    // Combine all price data
    const prices = {
      ...stockResult,
      ...cryptoResult
    };
    
    // Sanitize the response data
    const sanitizedPrices = sanitizeInput.object(prices);
    
    // Conditionally encrypt data based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    let responsePrices;
    let securityInfo;
    
    if (isProduction) {
      // Encrypt sensitive price data for transmission in production
      responsePrices = encryptData(sanitizedPrices);
      securityInfo = {
        encrypted: true,
        algorithm: 'aes-256-cbc',
        timestamp: new Date().toISOString()
      };
    } else {
      // Send unencrypted data in development for easier debugging
      responsePrices = sanitizedPrices;
      securityInfo = {
        encrypted: false,
        algorithm: 'none',
        timestamp: new Date().toISOString()
      };
    }
    
    // Create response with security headers
    const response = {
      prices: responsePrices,
      timestamp: new Date().toISOString(),
      statusMessage: 'Berhasil mengambil data terbaru',
      requestId: Math.random().toString(36).substring(2, 15),
      security: securityInfo
    };
    
    secureLogger.log('Sending encrypted response with', Object.keys(sanitizedPrices).length, 'price entries');
    
    // Set additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    res.status(200).json(response);
    
  } catch (error) {
    const errorResponse = secureErrorHandler.handle(error, 'API_PRICES');
    secureLogger.error('Error in /api/prices:', errorResponse);
    
    // Log security event for errors
    securityMonitoring.logCustomEvent('API_ERROR', {
      ip: clientIP,
      userAgent,
      userId,
      endpoint: '/api/prices',
      error: errorResponse.code
    }, 'MEDIUM');
    
    res.status(500).json({ 
      message: 'Gagal mengambil data harga',
      prices: {},
      timestamp: new Date().toISOString(),
      error: 'INTERNAL_ERROR'
    });
  }
}