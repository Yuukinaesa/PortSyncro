import React, { useState } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';
import { useLanguage } from '../lib/languageContext';
import { formatIDR, formatUSD, formatNumber, normalizeNumberInput } from '../lib/utils';
import ErrorBoundary from './ErrorBoundary';

export default function AveragePriceCalculator({ isOpen, onClose }) {
  const { t, language } = useLanguage();
  const [assetType, setAssetType] = useState('stock');
  const [symbol, setSymbol] = useState('');

  // Helper function to get default currency based on asset type
  const getDefaultCurrency = (type) => type === 'crypto' ? 'USD' : 'IDR';

  const [purchases, setPurchases] = useState([
    { source: '', amount: '', price: '', currency: getDefaultCurrency('stock'), amountNormalized: '', priceNormalized: '' }
  ]);
  const [result, setResult] = useState(null);

  const addPurchase = () => {
    const defaultCurrency = purchases.length > 0 ? purchases[0].currency : getDefaultCurrency(assetType);
    setPurchases([...purchases, { source: '', amount: '', price: '', currency: defaultCurrency, amountNormalized: '', priceNormalized: '' }]);
  };

  const removePurchase = (index) => {
    if (purchases.length > 1) {
      const newPurchases = purchases.filter((_, i) => i !== index);
      setPurchases(newPurchases);
    }
  };

  const updatePurchase = (index, field, value) => {
    const newPurchases = [...purchases];

    if (field === 'amount' || field === 'price') {
      const normalizedValue = normalizeNumberInput(value);
      newPurchases[index] = { ...newPurchases[index], [field]: value, [`${field}Normalized`]: normalizedValue };
    } else {
      newPurchases[index] = { ...newPurchases[index], [field]: value };
    }

    if (field === 'currency') {
      newPurchases.forEach((purchase, i) => {
        if (i !== index) {
          purchase.currency = value;
        }
      });
    }

    setPurchases(newPurchases);
  };

  const calculateAverage = () => {
    try {
      const validPurchases = purchases.filter(p => {
        const amount = p.amountNormalized || p.amount;
        const price = p.priceNormalized || p.price;
        return parseFloat(amount) > 0 && parseFloat(price) > 0;
      });

      if (validPurchases.length === 0) {
        setResult({ error: t('pleaseFillValidData') });
        return;
      }

      const currencies = [...new Set(validPurchases.map(p => p.currency))];
      if (currencies.length > 1) {
        setResult({ error: t('allPurchasesMustUseSameCurrency') });
        return;
      }

      const currency = currencies[0];
      let totalAmount = 0;
      let totalValue = 0;

      validPurchases.forEach(purchase => {
        const amount = parseFloat(purchase.amountNormalized || purchase.amount);
        const price = parseFloat(purchase.priceNormalized || purchase.price);

        if (assetType === 'stock') {
          const shares = amount * 100;
          const value = shares * price;
          totalAmount += amount;
          totalValue += value;
        } else {
          const value = amount * price;
          totalAmount += amount;
          totalValue += value;
        }
      });

      const averagePrice = totalValue / (assetType === 'stock' ? totalAmount * 100 : totalAmount);
      const totalShares = assetType === 'stock' ? totalAmount * 100 : totalAmount;

      setResult({
        averagePrice,
        totalAmount: totalShares,
        totalValue,
        currency,
        purchases: validPurchases
      });
    } catch (error) {
      setResult({ error: t('calculationError') });
    }
  };

  const resetForm = () => {
    setAssetType('stock');
    setSymbol('');
    setPurchases([{ source: '', amount: '', price: '', currency: getDefaultCurrency('stock'), amountNormalized: '', priceNormalized: '' }]);
    setResult(null);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#161b22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t('averagePriceCalculator')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#0d1117] transition-all duration-200"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          <ErrorBoundary>
            {/* Asset Type Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                {t('assetType')}
              </label>
              <div className="flex bg-gray-100 dark:bg-[#0d1117] rounded-xl p-1 border border-gray-200 dark:border-gray-800">
                <button
                  onClick={() => {
                    setAssetType('stock');
                    setPurchases(purchases.map(p => ({ ...p, currency: 'IDR' })));
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${assetType === 'stock'
                    ? 'bg-white dark:bg-[#1f2937] text-blue-600 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-600 dark:hover:text-gray-400'
                    }`}
                >
                  {t('stock')}
                </button>
                <button
                  onClick={() => {
                    setAssetType('crypto');
                    setPurchases(purchases.map(p => ({ ...p, currency: 'USD' })));
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${assetType === 'crypto'
                    ? 'bg-white dark:bg-[#1f2937] text-blue-600 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-600 dark:hover:text-gray-400'
                    }`}
                >
                  {t('crypto')}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="calc-symbol" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                {assetType === 'stock' ? t('stockCode') : t('cryptoSymbol')}
              </label>
              <input
                type="text"
                id="calc-symbol"
                name="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder={assetType === 'stock' ? 'BBCA' : 'BTC'}
                className="w-full px-4 py-3 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all font-medium"
              />
            </div>

            {/* Purchases Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t('purchases')}
                </h4>
                <button
                  onClick={addPurchase}
                  className="px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/20 rounded-lg transition-all text-xs font-bold flex items-center gap-2"
                >
                  <FiPlus className="w-3.5 h-3.5" />
                  {t('addPurchase')}
                </button>
              </div>

              <div className="space-y-3">
                {purchases.map((purchase, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl p-4 relative group hover:border-gray-300 dark:hover:border-gray-700 transition-all">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                      {/* Source */}
                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                          {assetType === 'stock' ? t('broker') : t('exchange')}
                        </label>
                        <input
                          type="text"
                          value={purchase.source}
                          onChange={(e) => updatePurchase(index, 'source', e.target.value)}
                          placeholder={assetType === 'stock' ? 'Stockbit' : 'Binance'}
                          className="w-full px-3 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none placeholder-gray-500"
                        />
                      </div>

                      {/* Amount */}
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                          {assetType === 'stock' ? t('lots') : t('amount')}
                        </label>
                        <input
                          type="text"
                          value={purchase.amount}
                          onChange={(e) => updatePurchase(index, 'amount', e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none font-mono placeholder-gray-500"
                        />
                      </div>

                      {/* Price & Currency */}
                      <div className="sm:col-span-5 flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {t('price')}
                          </label>
                          <input
                            type="text"
                            value={purchase.price}
                            onChange={(e) => updatePurchase(index, 'price', e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none font-mono placeholder-gray-500"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            {t('currency')}
                          </label>
                          <select
                            value={purchase.currency}
                            onChange={(e) => updatePurchase(index, 'currency', e.target.value)}
                            className="w-full px-2 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-bold focus:ring-1 focus:ring-blue-500 outline-none h-[38px]"
                          >
                            <option value="IDR">IDR</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Remove Button */}
                    {purchases.length > 1 && (
                      <button
                        onClick={() => removePurchase(index)}
                        className="absolute -top-2 -right-2 bg-white dark:bg-[#161b22] text-gray-400 hover:text-red-500 border border-gray-200 dark:border-gray-700 hover:border-red-500 rounded-full p-1 shadow-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculate Button */}
            <button
              onClick={calculateAverage}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
            >
              {t('calculateAverage')}
            </button>

            {/* Results */}
            {result && (
              <div className="animate-fade-in-up">
                {result.error ? (
                  <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-center gap-3">
                    <div className="shrink-0 text-red-500">
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-sm text-red-200 font-medium">{result.error}</p>
                  </div>
                ) : (

                  <div className="bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                    <div className="p-6 text-center border-b border-gray-200 dark:border-gray-800">
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">{t('averagePriceEstimate') || 'Estimasi Harga Rata-Rata'}</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {result.currency === 'IDR' ? formatIDR(result.averagePrice) : formatUSD(result.averagePrice)}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-mono">
                        {assetType === 'stock' ? t('perShare') : t('perUnit')}
                      </p>
                    </div>
                    <div className="p-4 bg-white dark:bg-[#161b22]">
                      <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1">{t('purchaseDetails')}</h5>
                      <div className="space-y-2">
                        {result.purchases.map((purchase, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                              {purchase.source || `#${index + 1}`}
                            </span>
                            <span className="text-sm font-mono text-gray-700 dark:text-gray-200">
                              {purchase.amount} <span className="text-gray-400 dark:text-gray-600">x</span> {purchase.currency === 'IDR' ? formatIDR(purchase.price) : formatUSD(purchase.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
            }
          </ErrorBoundary >
        </div >

        {/* Footer Actions */}
        < div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161b22] flex justify-between shrink-0" >
          <button
            onClick={resetForm}
            className="px-4 py-2.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-xs font-bold transition-colors"
          >
            {t('reset')}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-[#0d1117] dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs font-bold transition-all"
          >
            {t('close')}
          </button>
        </div >
      </div >
    </div >
  );
} 