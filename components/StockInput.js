import { useState } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput } from '../lib/utils';

export default function StockInput({ onAdd, onComplete, exchangeRate }) {
  const [ticker, setTicker] = useState('');
  const [lots, setLots] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLanguage();

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
      const normalizedLots = normalizeNumberInput(lots);
      const lotsNum = parseFloat(normalizedLots);
      if (isNaN(lotsNum) || lotsNum <= 0) {
        throw new Error('Lot amount must be greater than 0');
      }

      // Validate ticker format for IDX (should be 2-4 characters, letters only)
      const normalizedTicker = ticker.trim().toUpperCase();
      
      if (!/^[A-Z]{2,4}$/.test(normalizedTicker)) {
        throw new Error(t('invalidStockFormat'));
      }

      // Format tickers for IDX
      const tickersToTry = [`${normalizedTicker}.JK`];
      console.log('Submitting tickers:', tickersToTry);

      // Set loading state
      setIsLoading(true);

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
        // Check if the API returned any data but no valid stock price
        const hasAnyData = Object.keys(data.prices).length > 0;
        if (hasAnyData) {
          // API returned data but no valid price - likely not an IDX stock
          throw new Error(t('invalidIdxStock', { ticker: normalizedTicker }));
        } else {
          // No data returned - network or API issue
          throw new Error(t('stockNotFound', { ticker: normalizedTicker }));
        }
      }

      // Create stock object
      const stock = {
        ticker: normalizedTicker,
        lots: lotsNum,
        avgPrice: stockPrice.price,
        currentPrice: stockPrice.price,
        price: stockPrice.price,
        currency: stockPrice.currency || 'IDR',
        change: stockPrice.change || 0,
        changePercent: stockPrice.changePercent || 0,
        lastUpdate: new Date().toISOString(),
        addedAt: new Date().toISOString()
      };

      console.log('Adding stock:', stock);
      onAdd(stock);
      setIsLoading(false);
      onComplete();
    } catch (error) {
      console.error('Error adding stock:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Stock Code Input */}
      <div>
        <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('stockCode')} *
        </label>
        <input
          type="text"
          id="ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder={t('stockCodePlaceholder')}
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          maxLength={4}
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('stockCodeHelp')}
        </p>
      </div>

      {/* Lot Amount Input */}
      <div>
        <label htmlFor="lots" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('lotAmount')} *
        </label>
        <input
          type="text"
          id="lots"
          value={lots}
          onChange={(e) => setLots(e.target.value)}
          placeholder={t('lotAmountPlaceholder')}
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('lotAmountHelp')}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 text-sm font-medium"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 text-sm font-medium disabled:opacity-50"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              {t('adding')}...
            </div>
          ) : (
            t('addStock')
          )}
        </button>
      </div>
    </form>
  );
}