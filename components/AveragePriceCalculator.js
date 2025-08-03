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
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 ${isOpen ? 'block' : 'hidden'}`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', minHeight: '100vh' }} onClick={onClose}>
      
      {/* Subtle backdrop with gentle blur */}
      <div 
        className={`absolute inset-0 bg-white/10 dark:bg-black/10 backdrop-blur-sm transition-all duration-300 ${isOpen ? 'block' : 'hidden'}`}
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          width: '100%', 
          height: '100%'
        }}
      />
        
                {/* Modal */}
        <div 
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 animate-modal-in flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('averagePriceCalculator')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content - Scrollable */}
        <div 
          className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1"
          onClick={(e) => e.stopPropagation()}
        >
          <ErrorBoundary>
            {/* Asset Type Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('assetType')}
              </label>
              <div className="flex space-x-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssetType('stock');
                    // Update all purchase currencies to IDR when switching to stock
                    setPurchases(purchases.map(p => ({ ...p, currency: 'IDR' })));
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    assetType === 'stock'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('stock')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssetType('crypto');
                    // Update all purchase currencies to USD when switching to crypto
                    setPurchases(purchases.map(p => ({ ...p, currency: 'USD' })));
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    assetType === 'crypto'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {t('crypto')}
                </button>
              </div>
            </div>

            {/* Symbol Input */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {assetType === 'stock' ? t('stockCode') : t('cryptoSymbol')}
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onClick={(e) => e.stopPropagation()}
                placeholder={assetType === 'stock' ? 'BBCA' : 'BTC'}
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
              />
            </div>

            {/* Purchases Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                  {t('purchases')}
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addPurchase();
                  }}
                  className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium"
                >
                  <FiPlus className="w-4 h-4" />
                  {t('addPurchase')}
                </button>
              </div>

              <div className="space-y-4">
                {purchases.map((purchase, index) => (
                  <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Source */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {assetType === 'stock' ? t('broker') : t('exchange')}
                        </label>
                        <input
                          type="text"
                          value={purchase.source}
                          onChange={(e) => updatePurchase(index, 'source', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={assetType === 'stock' ? 'Stockbit' : 'Binance'}
                          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        />
                      </div>

                      {/* Amount */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {assetType === 'stock' ? t('lots') : t('amount')}
                        </label>
                        <input
                          type="text"
                          value={purchase.amount}
                          onChange={(e) => updatePurchase(index, 'amount', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder={assetType === 'stock' ? '10' : '0.5'}
                          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        />
                      </div>

                      {/* Price */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {t('price')}
                        </label>
                        <input
                          type="text"
                          value={purchase.price}
                          onChange={(e) => updatePurchase(index, 'price', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="1000"
                          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        />
                      </div>

                      {/* Currency */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          {t('currency')}
                        </label>
                        <select
                          value={purchase.currency}
                          onChange={(e) => updatePurchase(index, 'currency', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                        >
                          <option value="IDR">IDR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>

                    {/* Remove Button */}
                    {purchases.length > 1 && (
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePurchase(index);
                          }}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-200"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculate Button */}
            <div className="flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  calculateAverage();
                }}
                className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 text-lg font-medium"
              >
                {t('calculateAverage')}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                {result.error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-800 dark:text-red-200">
                          {result.error}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('calculationResults')}
                    </h4>
                    
                    {/* Average Price - Single Prominent Card */}
                    <div className="text-center p-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl shadow-lg">
                      <p className="text-sm text-blue-100 font-medium mb-2">
                        {t('averagePrice')}
                      </p>
                      <p className="text-3xl font-bold text-white">
                        {result.currency === 'IDR' ? formatIDR(result.averagePrice) : formatUSD(result.averagePrice)}
                      </p>
                      <p className="text-xs text-blue-200 mt-2">
                        {assetType === 'stock' ? t('perShare') : t('perUnit')}
                      </p>
                    </div>

                    {/* Purchase Details */}
                    <div>
                      <h5 className="text-md font-medium text-gray-900 dark:text-white mb-3">
                        {t('purchaseDetails')}
                      </h5>
                      <div className="space-y-2">
                        {result.purchases.map((purchase, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {purchase.source || `${t('purchase')} ${index + 1}`}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {purchase.amount} × {purchase.currency === 'IDR' ? formatIDR(purchase.price) : formatUSD(purchase.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ErrorBoundary>
        </div>

        {/* Action Buttons - Fixed at Bottom */}
        <div 
          className="flex justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetForm();
            }}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 text-sm font-medium"
          >
            {t('reset')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-200 text-sm font-medium"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
} 