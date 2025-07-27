// pages/api/prices.js
import { fetchStockPrices, fetchCryptoPrices } from '../../lib/fetchPrices';

export default async function handler(req, res) {
  console.log('API /prices called with method:', req.method);
  console.log('Request body:', req.body);
  
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  
  const { stocks, crypto, exchangeRate } = req.body;
  
  console.log('Processing request with:', { stocks, crypto, exchangeRate });
  
  // API called with stocks and crypto
  
  try {
    // Buat Promise untuk fetch data secara parallel
    const stockPromise = stocks && stocks.length > 0 
      ? fetchStockPrices(stocks) 
      : Promise.resolve({});
      
    const cryptoPromise = crypto && crypto.length > 0 
      ? fetchCryptoPrices(crypto) 
      : Promise.resolve({});
    
    console.log('Starting parallel fetch for stocks:', stocks, 'crypto:', crypto);
    
    // Fetch data secara parallel untuk kecepatan
    const [stockPrices, cryptoPrices] = await Promise.all([
      stockPromise,
      cryptoPromise
    ]);
    
    console.log('Fetch completed. Stock prices:', stockPrices, 'Crypto prices:', cryptoPrices);
    
    // Gabungkan semua data harga
    const prices = {
      ...stockPrices,
      ...cryptoPrices
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
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    
    res.status(500).json({ 
      message: 'Gagal mengambil data harga',
      error: error.message,
      stack: error.stack,
      prices: {},
      timestamp: new Date().toISOString()
    });
  }
}