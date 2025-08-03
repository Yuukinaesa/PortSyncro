// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices } from '../../lib/fetchPrices';

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
  console.log('API /prices called with method:', req.method);
  
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
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
    console.log(`Rate limit exceeded for: ${rateLimitIdentifier}`);
    return res.status(429).json({ 
      message: 'Too many requests. Please try again later.',
      retryAfter: 60,
      error: 'RATE_LIMIT_EXCEEDED',
      identifier: rateLimitIdentifier
    });
  }
  
  console.log('Processing request with:', { stocks, crypto, exchangeRate });
  
  try {
    // Validate input
    if (!stocks && !crypto) {
      return res.status(400).json({ 
        message: 'No stocks or crypto symbols provided',
        prices: {},
        timestamp: new Date().toISOString()
      });
    }
    
    // Buat Promise untuk fetch data secara parallel dengan error handling
    const stockPromise = stocks && stocks.length > 0 
      ? fetchStockPrices(stocks).catch(error => {
          console.error('Error fetching stock prices:', error);
          return {}; // Return empty object on error
        })
      : Promise.resolve({});
      
    const cryptoPromise = crypto && crypto.length > 0 
      ? fetchCryptoPrices(crypto).catch(error => {
          console.error('Error fetching crypto prices:', error);
          return {}; // Return empty object on error
        })
      : Promise.resolve({});
    
    console.log('Starting parallel fetch for stocks:', stocks, 'crypto:', crypto);
    
    // Fetch data secara parallel untuk kecepatan dengan proper error handling
    const [stockPrices, cryptoPrices] = await Promise.allSettled([
      stockPromise,
      cryptoPromise
    ]);
    
    // Extract results from Promise.allSettled
    const stockResult = stockPrices.status === 'fulfilled' ? stockPrices.value : {};
    const cryptoResult = cryptoPrices.status === 'fulfilled' ? cryptoPrices.value : {};
    
    console.log('Fetch completed. Stock prices:', stockResult, 'Crypto prices:', cryptoResult);
    
    // Gabungkan semua data harga
    const prices = {
      ...stockResult,
      ...cryptoResult
    };
    
    console.log('Combined prices:', prices);
    
    // Buat response
    const response = {
      prices,
      timestamp: new Date().toISOString(),
      statusMessage: 'Berhasil mengambil data terbaru'
    };
    
    console.log('Sending response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Error in /api/prices:', error);
    // Remove error.stack from production response for security
    console.error('Request body:', req.body);
    
    res.status(500).json({ 
      message: 'Gagal mengambil data harga',
      prices: {},
      timestamp: new Date().toISOString()
    });
  }
}