// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices } from '../../lib/fetchPrices';

// Simple in-memory rate limiting (use Redis in production)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip);
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  validRequests.push(now);
  rateLimitMap.set(ip, validRequests);
  return true;
}

export default async function handler(req, res) {
  console.log('API /prices called with method:', req.method);
  console.log('Request body:', req.body);
  
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  // Rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ 
      message: 'Too many requests. Please try again later.',
      retryAfter: 60
    });
  }
  
  const { stocks, crypto, exchangeRate } = req.body;
  
  console.log('Processing request with:', { stocks, crypto, exchangeRate });
  
  // API called with stocks and crypto
  
  try {
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