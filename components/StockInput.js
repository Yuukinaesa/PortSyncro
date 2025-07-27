import { useState } from 'react';

export default function StockInput({ onAdd, onComplete, exchangeRate }) {
  const [ticker, setTicker] = useState('');
  const [lots, setLots] = useState('1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  
  const popularStocks = [
    { ticker: 'BBCA', name: 'Bank Central Asia Tbk' },
    { ticker: 'BBRI', name: 'Bank Rakyat Indonesia Tbk' },
    { ticker: 'ASII', name: 'Astra International Tbk' },
    { ticker: 'TLKM', name: 'Telkom Indonesia Tbk' },
    { ticker: 'ICBP', name: 'Indofood CBP Sukses Makmur Tbk' },
    { ticker: 'UNVR', name: 'Unilever Indonesia Tbk' },
    { ticker: 'PGAS', name: 'Perusahaan Gas Negara Tbk' },
    { ticker: 'KLBF', name: 'Kalbe Farma Tbk' }
  ];
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validate input
      if (!ticker || !lots) {
        throw new Error('Stock code and lot amount must be filled');
      }

      // Validate lots is a positive number
      const lotsNum = parseFloat(lots);
      if (isNaN(lotsNum) || lotsNum <= 0) {
        throw new Error('Lot amount must be greater than 0');
      }

      // Format tickers for IDX
      const tickersToTry = [`${ticker.trim().toUpperCase()}.JK`];
      console.log('Submitting tickers:', tickersToTry);

      // Debounce submit button
      setIsLoading(true);
      setTimeout(() => setIsLoading(false), 1500);

      // Fetch current stock price
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stocks: tickersToTry,
          crypto: [],
          exchangeRate: exchangeRate
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch stock price (HTTP ${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('API returned prices:', data.prices);
      let stockPrice = null;
      let usedTicker = null;
      // Try each ticker in order
      for (const t of tickersToTry) {
        if (data.prices[t] && data.prices[t].price) {
          stockPrice = data.prices[t];
          usedTicker = t;
          break;
        }
      }

      console.log('Used ticker for price:', usedTicker);
      if (!stockPrice) {
        throw new Error('Stock price data not found or API limit reached. Please check the code and try again later.');
      }

      // Calculate values based on real-time price
      const sharesPerLot = 100; // 1 lot = 100 saham
      const totalShares = lotsNum * sharesPerLot;
      
      let valueIDR, valueUSD;
      
      if (stockPrice.currency === 'IDR') {
        // Saham IDX tetap dalam IDR, tidak perlu konversi
        valueIDR = stockPrice.price * totalShares;
        valueUSD = 0; // Saham IDX tidak dalam USD
      } else {
        valueUSD = stockPrice.price * totalShares;
        // Hapus logika konversi USD ke IDR untuk saham (karena tidak ada saham US)
        valueIDR = 0;
      }

      // Create stock object with calculated values
      const stockData = {
        ticker: ticker.toUpperCase(),
        lots: lotsNum,
        valueIDR: valueIDR,
        valueUSD: valueUSD,
        currency: stockPrice.currency,
        price: stockPrice.price,
        shares: totalShares,
        type: 'stock',
        addedAt: new Date().toISOString(),

      };

      console.log('Submitting stock data:', stockData);
      await onAdd(stockData);
      
      // Reset form
      setTicker('');
      setLots('1');

      
      // Show success message
      setSuccess('Stock successfully added');
      setTimeout(() => setSuccess(null), 3000);
      
      // Call onComplete if provided
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleQuickAdd = (stock) => {
    setTicker(stock.ticker);
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
      <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-800 dark:text-white">Tambah Saham</h2>
      
      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-200 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-200 px-3 py-2 rounded-lg text-sm">
          {success}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Kode Saham</label>
          <input
            type="text"
            className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-gray-800 dark:text-white"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Contoh: BBCA, BBRI, ASII"
          />
        </div>
        

        
        <div className="mb-4">
          <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Lot</label>
          <input
            type="text"
            className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-gray-800 dark:text-white"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            placeholder="Contoh: 1, 0.5"
          />
        </div>
        

        
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 sm:py-3 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 touch-target"
          disabled={isLoading}
        >
          {isLoading ? 'Menambahkan...' : 'Tambah Saham'}
        </button>
      </form>
      
      <div className="mt-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Pilihan Cepat</p>
        <div className="flex flex-wrap gap-2">
          {popularStocks.map(stock => (
            <button
              key={stock.ticker}
              onClick={() => handleQuickAdd(stock)}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {stock.ticker}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}