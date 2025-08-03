import { useState } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput } from '../lib/utils';

export default function CryptoInput({ onAdd, onComplete, exchangeRate }) {
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLanguage();
  
  const fetchCryptoPrice = async (symbol) => {
    try {
      // Use the same API endpoint as the main price fetching system
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stocks: [],
          crypto: [symbol],
          exchangeRate: exchangeRate
        }),
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.prices && data.prices[symbol] && data.prices[symbol].price) {
        return data.prices[symbol].price;
      }
      
      throw new Error('No price data available');
    } catch (error) {
      console.error('Error fetching crypto price:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      if (!symbol) {
        throw new Error(t('enterCryptoSymbol'));
      }
      
      // Validasi jumlah
      const normalizedAmount = normalizeNumberInput(amount);
      const amountValue = parseFloat(normalizedAmount);
      if (isNaN(amountValue) || amountValue <= 0) {
        throw new Error(t('enterValidAmount'));
      }
      
            // Enhanced validation for crypto symbol
      const normalizedSymbol = symbol.trim().toUpperCase();
      
      // More strict validation for crypto symbols
      if (!/^[A-Z0-9]{1,10}$/.test(normalizedSymbol)) {
        throw new Error('Invalid crypto symbol format');
      }
      
      // Check for common invalid patterns
      const invalidPatterns = ['TEST', 'DEMO', 'NULL', 'NONE', 'INVALID', 'FAKE', 'DUMMY'];
      if (invalidPatterns.includes(normalizedSymbol)) {
        throw new Error('Invalid crypto symbol');
      }
      
      // Check for suspicious patterns (too many numbers)
      const numberCount = (normalizedSymbol.match(/[0-9]/g) || []).length;
      if (numberCount > 5) {
        throw new Error('Crypto symbol contains too many numbers');
      }
      
      // Fetch current price
      const price = await fetchCryptoPrice(symbol.toUpperCase());
      
      // Create crypto object with current price
      const crypto = {
        symbol: symbol.toUpperCase(),
        amount: amountValue,
        price: price, // Use current API price
        avgPrice: price, // Set average price to current price
        currentPrice: price,
        currency: 'USD',
        type: 'crypto',
        addedAt: new Date().toISOString()
      };
      
      console.log('Adding crypto with current price:', crypto);
      onAdd(crypto);
      
      setSymbol('');
      setAmount('');
      
      // Opsional: pindah ke tab portfolio setelah tambah
      if (onComplete) onComplete();
      
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(t('failedToAddCrypto', { error: err.message }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Crypto Symbol Input */}
      <div>
        <label htmlFor="symbol" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('cryptoSymbol')} *
        </label>
        <input
          type="text"
          id="symbol"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder={t('cryptoSymbolPlaceholder')}
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('cryptoSymbolHelp')}
        </p>
      </div>

      {/* Amount Input */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('amount')} *
        </label>
        <input
          type="text"
          id="amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('amountPlaceholder')}
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          required
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('amountHelp')}
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
            t('addCrypto')
          )}
        </button>
      </div>
    </form>
  );
} 