import { useState } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput } from '../lib/utils';
import { secureLogger } from './../lib/security';

export default function CryptoInput({ onAdd, onComplete, exchangeRate }) {
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [avgPrice, setAvgPrice] = useState(''); // New Average Price field (USD)
  const [avgPriceIDR, setAvgPriceIDR] = useState(''); // New Average Price field (IDR)
  const [exchangeName, setExchangeName] = useState('');
  const [useManualCurrentPrice, setUseManualCurrentPrice] = useState(false);
  const [manualCurrentPrice, setManualCurrentPrice] = useState('');
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
          throw new Error(t('rateLimitExceeded'));
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.prices && data.prices[symbol] && data.prices[symbol].price) {
        return data.prices[symbol].price;
      }

      throw new Error(t('noPriceDataAvailable'));
    } catch (error) {
      secureLogger.error('Error fetching crypto price:', error);
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
        throw new Error(t('invalidCryptoSymbolFormat'));
      }

      // Check for common invalid patterns
      const invalidPatterns = ['TEST', 'DEMO', 'NULL', 'NONE', 'INVALID', 'FAKE', 'DUMMY'];
      if (invalidPatterns.includes(normalizedSymbol)) {
        throw new Error(t('invalidCryptoSymbol'));
      }

      // Check for suspicious patterns (too many numbers)
      const numberCount = (normalizedSymbol.match(/[0-9]/g) || []).length;
      if (numberCount > 5) {
        throw new Error(t('cryptoSymbolTooManyNumbers'));
      }

      // Fetch current price
      let price = 0;
      let isManualAsset = false;

      try {
        price = await fetchCryptoPrice(symbol.toUpperCase());
      } catch (e) {
        secureLogger.warn('Could not fetch crypto price, using 0 or manual', e);
      }

      let manualAvgPrice = avgPrice ? parseFloat(normalizeNumberInput(avgPrice)) : 0;

      // If avgPriceIDR is provided and valid, calculate manualAvgPrice (USD)
      if (!manualAvgPrice && avgPriceIDR && exchangeRate && exchangeRate > 0) {
        const idrPrice = parseFloat(normalizeNumberInput(avgPriceIDR));
        if (!isNaN(idrPrice) && idrPrice > 0) {
          manualAvgPrice = idrPrice / exchangeRate;
        }
      }

      // Logic for Manual Asset fallback
      if (!price || price === 0) {
        const manualCurr = useManualCurrentPrice && manualCurrentPrice
          ? parseFloat(normalizeNumberInput(manualCurrentPrice))
          : 0;

        if (manualCurr > 0) {
          price = manualCurr;
          isManualAsset = true;
          secureLogger.log('Using manual CURRENT price for crypto:', price);
        } else if (manualAvgPrice > 0) {
          price = manualAvgPrice; // Use manual price as current price
          isManualAsset = true;
          secureLogger.log('Using manual AVG price for crypto:', price);
        } else {
          // No API price and no manual price -> Error
          throw new Error(t('coinNotFoundManualRequired'));
        }
      }

      // Create crypto object with current price
      const crypto = {
        symbol: symbol.toUpperCase(),
        amount: amountValue,
        price: price, // Current Price
        avgPrice: manualAvgPrice || price, // Avg Price (Cost Basis)
        currentPrice: price,
        currency: 'USD',
        type: 'crypto',
        exchange: exchangeName.trim(), // Include Exchange
        isManual: isManualAsset, // Flag for manual assets
        addedAt: new Date().toISOString(),
        useManualPrice: useManualCurrentPrice,
        manualPrice: useManualCurrentPrice && manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : null,
      };

      secureLogger.log('Adding crypto with current price:', crypto);
      onAdd(crypto);

      setSymbol('');
      setAmount('');

      // Opsional: pindah ke tab portfolio setelah tambah
      if (onComplete) onComplete();

    } catch (err) {
      secureLogger.error('Error in handleSubmit:', err);
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
        <label htmlFor="symbol" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
          {t('cryptoSymbol')} *
        </label>
        <div className="relative group">
          <input
            type="text"
            id="symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder={t('cryptoSymbolPlaceholder')}
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
            required
            aria-label={t('cryptoSymbol') || 'Crypto Symbol'}
            aria-required="true"
            aria-describedby="symbol-help"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 ml-1">
          {t('cryptoSymbolHelp')}
        </p>
      </div>

      {/* Amount Input */}
      <div>
        <label htmlFor="amount" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
          {t('amount')} *
        </label>
        <div className="relative group">
          <input
            type="text"
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('amountPlaceholder')}
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
            required
            aria-label={t('amount') || 'Amount'}
            aria-required="true"
            aria-describedby="amount-help"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 ml-1">
          {t('amountHelp')}
        </p>
      </div>

      {/* Avg Price Input */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="avgPrice" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            {t('averagePrice') || 'Harga Beli Rata-rata'} (USD)
          </label>
          <div className="relative group">
            <input
              type="text"
              id="avgPrice"
              value={avgPrice}
              onChange={(e) => {
                const val = e.target.value;
                setAvgPrice(val);

                // Auto-convert to IDR if exchange rate exists
                if (!val || !exchangeRate) {
                  if (!val) setAvgPriceIDR('');
                  return;
                }

                const numVal = parseFloat(normalizeNumberInput(val));
                if (!isNaN(numVal)) {
                  const idrVal = Math.round(numVal * exchangeRate);
                  setAvgPriceIDR(idrVal.toString());
                }
              }}
              placeholder="Contoh: 1500.50"
              className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-1">
            {t('optional')}.
          </p>
        </div>
        <div>
          <label htmlFor="avgPriceIDR" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
            {t('averagePrice') || 'Harga Beli Rata-rata'} (IDR)
          </label>
          <div className="relative group">
            <input
              type="text"
              id="avgPriceIDR"
              value={avgPriceIDR}
              onChange={(e) => {
                const val = e.target.value;
                setAvgPriceIDR(val);

                // Auto-convert to USD if exchange rate exists
                if (!val || !exchangeRate) {
                  if (!val) setAvgPrice('');
                  return;
                }

                const numVal = parseFloat(normalizeNumberInput(val));
                if (!isNaN(numVal)) {
                  const usdVal = numVal / exchangeRate;
                  setAvgPrice(usdVal.toFixed(2));
                }
              }}
              placeholder="Contoh: 15000000"
              className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-1">
            {t('optional')}. {t('avgPriceHelp') || 'Otomatis terkonversi (Realtime).'}
          </p>
        </div>
      </div>

      {/* Exchange/Wallet Input (Optional) */}
      <div>
        <label htmlFor="exchangeName" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
          Exchange / Wallet <span className="text-gray-500 font-normal normal-case">({t('optional')})</span>
        </label>
        <div className="relative group">
          <input
            type="text"
            id="exchangeName"
            value={exchangeName}
            onChange={(e) => setExchangeName(e.target.value)}
            placeholder="Contoh: Binance, Pintu, Tokocrypto"
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
          />
        </div>
      </div>


      {/* Manual Current Price Option */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            id="useManualPriceCrypto"
            checked={useManualCurrentPrice}
            onChange={(e) => {
              setUseManualCurrentPrice(e.target.checked);
              if (!e.target.checked) setManualCurrentPrice('');
            }}
            className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label htmlFor="useManualPriceCrypto" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
            {t('useManualCurrentPrice') || 'Input Harga Saat Ini Manual'}
          </label>
        </div>

        {useManualCurrentPrice && (
          <div className="animate-fade-in-down">
            <label htmlFor="manualCurrentPriceCrypto" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
              {t('manualCurrentPrice') || 'Harga Saat Ini'} (USD)
            </label>
            <div className="relative group">
              <input
                type="text"
                id="manualCurrentPriceCrypto"
                value={manualCurrentPrice}
                onChange={(e) => setManualCurrentPrice(e.target.value)}
                placeholder="Contoh: 60000"
                className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-purple-300 dark:border-purple-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 transition-all font-medium"
                required={useManualCurrentPrice}
              />
            </div>
            <p className="text-xs text-purple-500 mt-2 ml-1">
              {t('manualPriceWarning') || 'Harga ini akan digunakan sebagai harga saat ini dan tidak akan update otomatis.'}
            </p>
          </div>
        )}
      </div>

      {/* Error Display */}
      {
        error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3 animate-shake">
            <svg className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-700 dark:text-red-200 font-medium">
              {error}
            </p>
          </div>
        )
      }

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 px-4 py-3.5 border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-[#0d1117] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-[#161b22] transition-all duration-200 text-sm font-bold"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-4 py-3.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all duration-200 text-sm font-bold shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-purple-900/40 active:scale-[0.98]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>{t('adding')}...</span>
            </div>
          ) : (
            t('addCrypto')
          )}
        </button>
      </div>
    </form >
  );
}