import { useState } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput, validateIDXLots } from '../lib/utils';
import { secureLogger } from './../lib/security';

export default function StockInput({ onAdd, onComplete, exchangeRate }) {
  const [market, setMarket] = useState('IDX'); // 'IDX' or 'US'
  const [ticker, setTicker] = useState('');
  const [amount, setAmount] = useState(''); // Lots for IDX, Shares for US
  const [avgPrice, setAvgPrice] = useState(''); // New Average Price field
  const [avgPriceIDR, setAvgPriceIDR] = useState(''); // New Average Price field (IDR) for US stocks
  const [broker, setBroker] = useState(''); // New Broker field
  const [useManualCurrentPrice, setUseManualCurrentPrice] = useState(false);
  const [manualCurrentPrice, setManualCurrentPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Validate input
      if (!ticker || !amount) {
        throw new Error(t('stockCodeAndLotRequired') || 'Kode saham dan jumlah diperlukan');
      }

      const normalizedAmount = normalizeNumberInput(amount);
      const amountNum = parseFloat(normalizedAmount);

      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error(t('invalidAmount') || 'Jumlah tidak valid');
      }

      const normalizedTicker = ticker.trim().toUpperCase();

      // Market-specific validation and formatting
      let tickersToTry = [];
      let finalLots = 0;

      if (market === 'IDX') {
        // IDX Validation - Relaxed for Manual Support
        if (!/^[A-Z0-9-]{1,12}$/.test(normalizedTicker)) {
          throw new Error(t('invalidStockFormat'));
        }
        // No digit check to allow flexible manual inputs

        // Validate lots (must be integer for IDX usually, but utility handles it)
        try {
          finalLots = validateIDXLots(amountNum); // This ensures integer
        } catch (e) {
          throw new Error(t('invalidLotAmount'));
        }

        tickersToTry = [`${normalizedTicker}.JK`];
      } else {
        // US Validation
        // Allow 1-5 chars, maybe more for some ETFs
        if (!/^[A-Z0-9^.-]{1,12}$/.test(normalizedTicker)) {
          throw new Error(t('invalidUSTickerFormat'));
        }

        // For US, input is "Shares". System now treats US "lots" as shares directly.
        finalLots = amountNum;

        // Do NOT append suffix for US (Yahoo default)
        tickersToTry = [normalizedTicker];
      }

      // Check for common invalid patterns
      const invalidPatterns = ['TEST', 'DEMO', 'NULL', 'NONE', 'INVALID'];
      if (invalidPatterns.includes(normalizedTicker)) {
        throw new Error(t('invalidStockCodeFormat'));
      }

      secureLogger.log('Submitting tickers:', tickersToTry);

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
        if (response.status === 429) {
          throw new Error(t('rateLimitExceeded'));
        }
        const errorText = await response.text();
        throw new Error(t('failedToFetchStockPrice', { status: response.status, error: errorText }));
      }

      const data = await response.json();
      secureLogger.log('API returned prices:', data.prices);

      let stockPrice = null;
      let isManualAsset = false;

      // Try each ticker in order
      for (const t of tickersToTry) {
        if (data.prices[t]) {
          stockPrice = data.prices[t];
          break;
        }
      }

      // If price not found, use user input or 0
      let manualAvgPrice = avgPrice ? parseFloat(normalizeNumberInput(avgPrice)) : 0;

      // Handle IDR manual price for US Stocks
      if (market === 'US' && !manualAvgPrice && avgPriceIDR && exchangeRate && exchangeRate > 0) {
        const idrPrice = parseFloat(normalizeNumberInput(avgPriceIDR));
        if (!isNaN(idrPrice) && idrPrice > 0) {
          manualAvgPrice = idrPrice / exchangeRate;
        }
      }

      if (!stockPrice) {
        // Fallback object if API fails - Manual Entry Check
        if (manualAvgPrice > 0) {
          stockPrice = {
            price: manualAvgPrice,
            change: 0,
            changePercent: 0,
            currency: market === 'IDX' ? 'IDR' : 'USD'
          };
          isManualAsset = true;
          secureLogger.log('Using manual price for stock:', stockPrice);
        } else {
          throw new Error(t('stockNotFoundManualRequired'));
        }
      }

      // Create stock object
      const stock = {
        ticker: normalizedTicker,
        lots: finalLots,
        market: market, // Save market info!
        price: stockPrice.price || manualAvgPrice,
        avgPrice: manualAvgPrice || stockPrice.price, // Use manual input if available
        currentPrice: stockPrice.price || manualAvgPrice,
        currency: stockPrice.currency || (market === 'IDX' ? 'IDR' : 'USD'),
        change: stockPrice.change || 0,
        changePercent: stockPrice.changePercent || 0,
        lastUpdate: new Date().toISOString(),
        addedAt: new Date().toISOString(),
        broker: broker.trim(), // Include Broker
        isManual: isManualAsset, // Flag for manual assets
        useManualPrice: useManualCurrentPrice,
        manualPrice: useManualCurrentPrice && manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : null,
      };

      secureLogger.log('Adding stock:', stock);
      onAdd(stock);
      setIsLoading(false);
      onComplete();
    } catch (error) {
      secureLogger.error('Error adding stock:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Market Selector */}
      <div>
        <label className="block text-xs font-bold text-gray-500 font-bold uppercase tracking-wider mb-2 ml-1">
          Pasar (Market)
        </label>
        <div className="flex bg-gray-100 dark:bg-[#0d1117] rounded-xl p-1 border border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setMarket('IDX')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${market === 'IDX'
              ? 'bg-white dark:bg-[#161b22] text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-700'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
          >
            Indonesia (IDX)
          </button>
          <button
            type="button"
            onClick={() => setMarket('US')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${market === 'US'
              ? 'bg-white dark:bg-[#161b22] text-blue-600 dark:text-blue-400 shadow-sm border border-gray-200 dark:border-gray-700'
              : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
              }`}
          >
            Amerika (US/Global)
          </button>
        </div>
      </div>

      {/* Stock Code Input */}
      <div>
        <label htmlFor="ticker" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
          {market === 'IDX' ? (t('stockCode') || 'Kode Saham') : 'Simbol Ticker (ex: AAPL)'} *
        </label>
        <div className="relative group">
          <input
            type="text"
            id="ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={market === 'IDX' ? t('stockCodePlaceholder') : "AAPL"}
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
            maxLength={market === 'IDX' ? 4 : 8}
            required
            aria-label={market === 'IDX' ? (t('stockCode') || 'Stock Code') : 'Ticker Symbol'}
            aria-required="true"
            aria-describedby="ticker-help"
          />
        </div>
        {market === 'IDX' && (
          <p className="text-xs text-gray-500 mt-2 ml-1">
            {t('stockCodeHelp')}
          </p>
        )}
      </div>

      {/* Amount Input */}
      <div>
        <label htmlFor="amount" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
          {market === 'IDX' ? (t('lotAmount') || 'Jumlah Lot') : 'Jumlah Lembar (Shares)'} *
        </label>
        <div className="relative group">
          <input
            type="text"
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={market === 'IDX' ? t('lotAmountPlaceholder') : "1"}
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
            required
            aria-label={market === 'IDX' ? (t('lotAmount') || 'Lot Amount') : 'Share Amount'}
            aria-required="true"
            aria-describedby="amount-help"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 ml-1">
          {market === 'IDX' ? (t('lotAmountHelp') || '1 lot = 100 lembar') : 'Masukkan jumlah lembar saham yang dibeli'}
        </p>
      </div>

      {/* Avg Price Input */}
      {/* Avg Price Input */}
      {/* Avg Price Input */}
      {market === 'US' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="avgPrice" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
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
                placeholder="Contoh: 150.50"
                className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 ml-1">
              {t('optional')}.
            </p>
          </div>
          <div>
            <label htmlFor="avgPriceIDR" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
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
                placeholder="Contoh: 2300000"
                className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 ml-1">
              {t('optional')}. {t('avgPriceHelp') || 'Otomatis terkonversi (Realtime).'}
            </p>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="avgPrice" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
            {t('averagePrice') || 'Harga Beli Rata-rata'} <span className="text-gray-500 font-normal normal-case">({market === 'IDX' ? 'IDR' : 'USD'})</span>
          </label>
          <div className="relative group">
            <input
              type="text"
              id="avgPrice"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              placeholder={market === 'IDX' ? "Contoh: 4500" : "Contoh: 150.50"}
              className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 ml-1">
            {t('optional')}. {t('avgPriceHelp') || 'Kosongkan untuk menggunakan harga pasar saat ini.'}
          </p>
        </div>
      )}

      {/* Broker Input (Optional) */}
      <div>
        <label htmlFor="broker" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
          Sekuritas (Broker) <span className="text-gray-500 font-normal normal-case">({t('optional')})</span>
        </label>
        <div className="relative group">
          <input
            type="text"
            id="broker"
            value={broker}
            onChange={(e) => setBroker(e.target.value)}
            placeholder={market === 'IDX' ? "Contoh: Indo Premier, Stockbit, Ajaib" : "Contoh: GoTrade, Pluang, IBKR"}
            className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3 animate-shake">
          <svg className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-200 font-medium">
            {error}
          </p>
        </div>
      )}

      {/* Manual Current Price Option */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            id="useManualPrice"
            checked={useManualCurrentPrice}
            onChange={(e) => {
              setUseManualCurrentPrice(e.target.checked);
              if (!e.target.checked) setManualCurrentPrice('');
            }}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label htmlFor="useManualPrice" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
            {t('useManualCurrentPrice') || 'Input Harga Saat Ini Manual'}
          </label>
        </div>

        {useManualCurrentPrice && (
          <div className="animate-fade-in-down">
            <label htmlFor="manualCurrentPrice" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
              {t('manualCurrentPrice') || 'Harga Saat Ini'} ({market === 'IDX' ? 'IDR' : 'USD'})
            </label>
            <div className="relative group">
              <input
                type="text"
                id="manualCurrentPrice"
                value={manualCurrentPrice}
                onChange={(e) => setManualCurrentPrice(e.target.value)}
                placeholder="Contoh: 5000"
                className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-blue-300 dark:border-blue-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 transition-all font-medium"
                required={useManualCurrentPrice}
              />
            </div>
            <p className="text-xs text-blue-500 mt-2 ml-1">
              {t('manualPriceWarning') || 'Harga ini akan digunakan sebagai harga saat ini dan tidak akan update otomatis.'}
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onComplete}
          className="flex-1 px-4 py-3.5 border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-[#0d1117] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-[#161b22] transition-all duration-200 text-sm font-bold"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-4 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all duration-200 text-sm font-bold shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-blue-900/40 active:scale-[0.98]"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span>{t('adding')}...</span>
            </div>
          ) : (
            t('addStock')
          )}
        </button>
      </div>
    </form>
  );
}