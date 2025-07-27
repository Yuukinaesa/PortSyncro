// AssetTable.js
import { useState } from 'react';
import { FiArrowDown, FiArrowUp, FiTrendingUp, FiDollarSign, FiPercent, FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import Modal from './Modal';
import ErrorBoundary from './ErrorBoundary';
import { formatNumber, formatIDR, formatUSD } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';

export default function AssetTable({ assets, prices, exchangeRate, type, onUpdate, onSell = () => {}, loading = false }) {
  const [sellingIndex, setSellingIndex] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const [editingAvgPrice, setEditingAvgPrice] = useState(null);
  const [newAvgPrice, setNewAvgPrice] = useState('');
  const { t } = useLanguage();
  
  if (assets.length === 0) {
    return null;
  }
  
  const handleSellClick = (index, asset) => {
    setSellingIndex(index);
    // Default to half of current amount
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    let defaultValue;
    if (type === 'stock') {
      defaultValue = Math.floor(currentAmount / 2); // Hanya bilangan bulat
    } else {
      defaultValue = (currentAmount / 2).toString();
    }
    setSellAmount(defaultValue.toString());
  };

  const handleSaveSell = (index, asset) => {
    const amountToSell = parseFloat(sellAmount);
    const currentAmount = type === 'stock' ? asset.lots : asset.amount;
    
    // Use the same ticker format as calculateAssetValue
    let price;
    if (type === 'stock') {
      const tickerKey = `${asset.ticker}.JK`;
      price = prices[tickerKey];
    } else {
      price = prices[asset.symbol];
    }
    
    const isIDX = type === 'stock' && price && price.currency === 'IDR';
    
    if (isNaN(amountToSell) || amountToSell <= 0) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('invalidValue'),
        type: 'error'
      });
      return;
    }
    // Only allow integer lots for IDX stock
    if (isIDX && (!Number.isInteger(amountToSell) || String(sellAmount).includes(','))) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('invalidLotAmount'),
        type: 'error'
      });
      return;
    }
    if (amountToSell > currentAmount) {
      setConfirmModal({
        isOpen: true,
        title: t('warning'),
        message: t('amountExceeds', { amount: currentAmount }),
        type: 'error'
      });
      return;
    }
    
    // Tampilkan konfirmasi penjualan
    const ticker = type === 'stock' ? asset.ticker : asset.symbol;
    let valueFormatted = '';
    
    if (price) {
      if (type === 'stock') {
        // For IDX stocks: 1 lot = 100 shares
        if (price.currency === 'IDR') {
          const valueIDR = amountToSell * 100 * price.price;
          valueFormatted = formatIDR(valueIDR);
        } else {
          // Hapus logika konversi USD ke IDR untuk saham (karena tidak ada saham US)
          valueFormatted = t('valueNotAvailable');
        }
      } else {
        // For crypto: always show in IDR
        const valueUSD = amountToSell * price.price;
        const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
        valueFormatted = formatIDR(valueIDR);
      }
    }
    
    const message = price 
      ? t('saleConfirmation', { 
          amount: amountToSell, 
          unit: type === 'stock' ? 'lot' : '', 
          symbol: ticker, 
          value: valueFormatted ? `with value around ${valueFormatted}` : '' 
        })
      : t('saleConfirmationNoPrice', { 
          amount: amountToSell, 
          unit: type === 'stock' ? 'lot' : '', 
          symbol: ticker 
        });
    
    setConfirmModal({
      isOpen: true,
      title: t('confirmSale'),
      message: message,
      type: 'warning',
      onConfirm: () => {
        onSell(index, asset, amountToSell);
        setSellingIndex(null);
        setConfirmModal(null);
      }
    });
  };
  
  const handleCancelSell = () => {
    setSellingIndex(null);
  };

  const handleEditAvgPrice = (index, asset) => {
    setEditingAvgPrice(index);
    setNewAvgPrice(asset.avgPrice ? asset.avgPrice.toString() : '');
  };

  const handleSaveAvgPrice = (index, asset) => {
    const price = parseFloat(newAvgPrice);
    if (isNaN(price) || price < 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: 'Masukkan harga yang valid (lebih dari 0)',
        type: 'error'
      });
      return;
    }

    // Update the asset with new average price
    const updatedAsset = {
      ...asset,
      avgPrice: price,
      // Recalculate gain/loss based on new average price
      totalCost: price * (type === 'stock' ? asset.lots : asset.amount),
      gain: (asset.porto || 0) - (price * (type === 'stock' ? asset.lots : asset.amount))
    };

    if (onUpdate) {
      onUpdate(index, updatedAsset);
    }
    
    setEditingAvgPrice(null);
    setNewAvgPrice('');
  };

  const handleCancelEditAvgPrice = () => {
    setEditingAvgPrice(null);
    setNewAvgPrice('');
  };
  
  // Function to format price based on currency and exchange rate
  const formatPrice = (price, currency, inIDR = false) => {
    if (!price && price !== 0) return t('notAvailable');
    
    if (currency === 'IDR' || inIDR) {
      return formatIDR(price);
    } else {
      return formatUSD(price, currency === 'USD' ? 2 : 8);
    }
  };

  // Function to calculate gain/loss percentage
  const calculateGainPercentage = (gain, totalCost) => {
    if (!totalCost || totalCost === 0) return 0;
    return (gain / totalCost) * 100;
  };

  // Function to get gain/loss color
  const getGainColor = (gain) => {
    if (!gain && gain !== 0) return 'text-gray-500 dark:text-gray-400';
    if (gain === 0) return 'text-blue-600 dark:text-blue-400'; // Break even - warna biru
    return gain > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };
  
  const calculateAssetValue = (asset, currency, exchangeRate) => {
    if (asset.type === 'stock') {
      // Use the same ticker format as when fetching prices
      const tickerKey = `${asset.ticker}.JK`;
      const price = prices[tickerKey];
      // For IDX stocks: 1 lot = 100 shares
      const shareCount = price && price.currency === 'IDR' ? asset.lots * 100 : asset.lots;
      
      if (!price) {
        return {
          valueIDR: 0,
          valueUSD: 0,
          price: 0,
          error: t('priceDataUnavailable')
        };
      }
      
      if (price.currency === 'IDR') {
        const assetValue = price.price * shareCount;
        const assetValueUSD = exchangeRate && exchangeRate > 0 ? assetValue / exchangeRate : 0;
        
        return {
          valueIDR: assetValue,
          valueUSD: assetValueUSD,
          price: price.price
        };
      }
    } else if (asset.type === 'crypto') {
      const price = prices[asset.symbol];
      
      if (!price) {
        return {
          valueIDR: 0,
          valueUSD: 0,
          price: 0,
          error: t('cryptoPriceUnavailable')
        };
      }
      
      const assetValueUSD = price.price * asset.amount;
      const assetValueIDR = exchangeRate && exchangeRate > 0 ? assetValueUSD * exchangeRate : 0;
      
      return {
        valueIDR: assetValueIDR,
        valueUSD: assetValueUSD,
        price: price.price
      };
    }
    
    return {
      valueIDR: 0,
      valueUSD: 0,
      price: 0,
      error: t('unknownAssetType')
    };
  };

  return (
    <ErrorBoundary>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {type === 'stock' ? t('stock') : t('crypto')}
              </th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('amount')}
              </th>
              <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('currentPrice')}
              </th>
              <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('idrValue')}
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('usdValue')}
              </th>
              <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('action')}
              </th>
              <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('avgPrice')}
              </th>
              <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('gainLoss')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {assets.map((asset, index) => {
              const assetValue = calculateAssetValue(asset, asset.currency, exchangeRate);
              const price = prices[type === 'stock' ? `${asset.ticker}.JK` : asset.symbol];
              const change = price ? price.change : 0;
              

              
              // Recalculate gain/loss using real-time price and current portfolio value
              let realTimeGain = 0;
              let realTimeGainUSD = 0;
              let realTimeGainPercentage = 0;
              
              if (assetValue.price) {
                // Calculate current portfolio value using real-time price
                const currentPortfolioValue = assetValue.price * (type === 'stock' ? asset.lots * 100 : asset.amount);
                
                if (type === 'stock') {
                  // For stocks: gain/loss in IDR
                  // Use avgPrice * total shares for correct total cost calculation
                  const totalShares = asset.lots * 100; // 1 lot = 100 shares
                  const correctTotalCost = asset.avgPrice * totalShares;
                  realTimeGain = currentPortfolioValue - correctTotalCost;
                  realTimeGainUSD = exchangeRate && exchangeRate > 0 ? realTimeGain / exchangeRate : 0;
                  realTimeGainPercentage = calculateGainPercentage(realTimeGain, correctTotalCost);
                } else {
                  // For crypto: gain/loss in USD, convert to IDR for display
                  const costBasis = asset.totalCost || (asset.avgPrice * asset.amount);
                  realTimeGainUSD = currentPortfolioValue - costBasis;
                  realTimeGain = exchangeRate && exchangeRate > 0 ? realTimeGainUSD * exchangeRate : realTimeGainUSD;
                  // For percentage calculation, use USD values
                  realTimeGainPercentage = calculateGainPercentage(realTimeGainUSD, costBasis);
                }
              }
              

              

              
              return (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 h-8 w-8 rounded-md flex items-center justify-center ${
                        type === 'stock' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                      }`}>
                        <span className="text-sm font-bold">
                          {(type === 'stock' ? asset.ticker : asset.symbol).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {type === 'stock' ? asset.ticker : asset.symbol}
                        </span>
                        {assetValue.error && (
                          <span className="text-xs text-red-500 dark:text-red-400 block">
                            {assetValue.error}
                          </span>
                        )}
                        {/* Show price on mobile */}
                        <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400">
                          {assetValue.price ? formatPrice(assetValue.price, asset.currency || 'IDR') : t('notAvailable')}
                          {/* Show IDR price for crypto on mobile */}
                          {type === 'crypto' && assetValue.price && exchangeRate && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {formatIDR(assetValue.price * exchangeRate)}
                            </div>
                          )}
                          {change !== undefined && change !== null && (
                            <div className={`flex items-center text-xs mt-1 ${
                              change > 0 ? 'text-green-500 dark:text-green-400' : change < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {change > 0 ? <FiArrowUp className="w-2 h-2" /> : change < 0 ? <FiArrowDown className="w-2 h-2" /> : null}
                              {change > 0 ? '+' : ''}{change.toFixed(2)}%
                            </div>
                          )}
                          {/* Show gain/loss on mobile */}
                          {realTimeGain !== undefined && realTimeGain !== null && (
                            <div className="mt-1">
                              <div className={`text-xs ${getGainColor(realTimeGain)}`}>
                                {realTimeGain === 0 ? 'Rp 0' : formatPrice(realTimeGain, asset.currency || 'IDR', true)}
                              </div>
                              {exchangeRate && (
                                <div className={`text-xs ${getGainColor(realTimeGain)}`}>
                                  {realTimeGain === 0 ? '$ 0' : formatPrice(realTimeGainUSD, 'USD')}
                                </div>
                              )}
                              {realTimeGainPercentage !== undefined && realTimeGainPercentage !== null && asset.totalCost && asset.totalCost > 0 && (
                                <div className={`flex items-center text-xs ${getGainColor(realTimeGain)}`}>
                                  <FiPercent className="w-2 h-2 mr-1" />
                                  {realTimeGainPercentage > 0 ? '+' : realTimeGainPercentage < 0 ? '' : ''}{Math.abs(realTimeGainPercentage).toFixed(2)}%
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right">
                    {sellingIndex === index ? (
                      <input
                        type="number"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value)}
                        className="w-16 sm:w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        step={type === 'stock' ? '1' : '0.00000001'}
                        min="0"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 dark:text-white">
                        {type === 'stock' ? asset.lots : asset.amount}
                      </span>
                    )}
                  </td>
                  
                  <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {assetValue.price ? formatPrice(assetValue.price, asset.currency || 'IDR') : t('notAvailable')}
                      </span>
                      {/* Show IDR price for crypto */}
                      {type === 'crypto' && assetValue.price && exchangeRate && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatIDR(assetValue.price * exchangeRate)}
                        </span>
                      )}
                      {change !== undefined && change !== null && (
                        <div className={`flex items-center text-xs ${
                          change > 0 ? 'text-green-500 dark:text-green-400' : change < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {change > 0 ? <FiArrowUp className="w-3 h-3" /> : change < 0 ? <FiArrowDown className="w-3 h-3" /> : null}
                          {change > 0 ? '+' : ''}{change.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {assetValue.valueIDR ? formatPrice(assetValue.valueIDR, 'IDR', true) : t('notAvailable')}
                    </span>
                  </td>
                  
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {assetValue.valueUSD ? formatPrice(assetValue.valueUSD, 'USD') : t('notAvailable')}
                    </span>
                  </td>
                  
                  <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                    {sellingIndex === index ? (
                      <div className="flex space-x-1 sm:space-x-2 justify-center">
                        <button
                          onClick={() => handleSaveSell(index, asset)}
                          className="bg-green-600 p-1 sm:p-1.5 rounded text-white hover:bg-green-700 text-xs sm:text-sm"
                        >
                          ✓
                        </button>
                        <button
                          onClick={handleCancelSell}
                          className="bg-gray-500 dark:bg-gray-600 p-1 sm:p-1.5 rounded text-white hover:bg-gray-600 dark:hover:bg-gray-700 text-xs sm:text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleSellClick(index, asset)}
                          className="px-2 py-1 rounded text-xs font-medium transition-colors bg-red-100 dark:bg-red-600/40 text-red-600 dark:text-white hover:bg-red-200 dark:hover:bg-red-600"
                          title="Jual aset"
                        >
                          Jual
                        </button>
                      </div>
                    )}
                  </td>
                  
                  <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-right">
                    {editingAvgPrice === index ? (
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          value={newAvgPrice}
                          onChange={(e) => setNewAvgPrice(e.target.value)}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          step="any"
                          min="0"
                        />
                        <button
                          onClick={() => handleSaveAvgPrice(index, asset)}
                          className="bg-green-600 p-1 rounded text-white hover:bg-green-700 text-xs"
                          title="Simpan"
                        >
                          <FiCheck className="w-3 h-3" />
                        </button>
                        <button
                          onClick={handleCancelEditAvgPrice}
                          className="bg-gray-500 dark:bg-gray-600 p-1 rounded text-white hover:bg-gray-600 dark:hover:bg-gray-700 text-xs"
                          title="Batal"
                        >
                          <FiX className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-sm text-gray-900 dark:text-white">
                          {asset.avgPrice ? formatPrice(asset.avgPrice, asset.currency || 'IDR') : '-'}
                        </span>
                        <button
                          onClick={() => handleEditAvgPrice(index, asset)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
                          title="Edit Average Price"
                        >
                          <FiEdit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  
                  <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex flex-col items-end">
                      {/* IDR Gain/Loss */}
                      <span className={`text-sm font-medium ${getGainColor(realTimeGain)}`}>
                        {realTimeGain !== undefined && realTimeGain !== null ? (realTimeGain === 0 ? 'Rp 0' : formatPrice(realTimeGain, asset.currency || 'IDR', true)) : '-'}
                      </span>
                      {/* USD Gain/Loss */}
                      {type === 'stock' && realTimeGain !== undefined && realTimeGain !== null && exchangeRate && (
                        <span className={`text-xs ${getGainColor(realTimeGain)}`}>
                          {realTimeGain === 0 ? '$ 0' : formatPrice(realTimeGainUSD, 'USD')}
                        </span>
                      )}
                      {type === 'crypto' && realTimeGain !== undefined && realTimeGain !== null && (
                        <span className={`text-xs ${getGainColor(realTimeGain)}`}>
                          {realTimeGain === 0 ? '$ 0' : formatPrice(realTimeGainUSD, 'USD')}
                        </span>
                      )}
                      {/* Percentage */}
                      {realTimeGain !== undefined && realTimeGain !== null && asset.totalCost && asset.totalCost > 0 && (
                        <div className={`flex items-center text-xs ${getGainColor(realTimeGain)}`}>
                          <FiPercent className="w-3 h-3 mr-1" />
                          {realTimeGainPercentage > 0 ? '+' : realTimeGainPercentage < 0 ? '' : ''}{Math.abs(realTimeGainPercentage).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Confirmation Modal */}
        {confirmModal && (
          <Modal
            isOpen={confirmModal.isOpen}
            onClose={() => setConfirmModal(null)}
            title={confirmModal.title}
            type={confirmModal.type}
          >
            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-200">{confirmModal.message}</p>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2">
              {confirmModal.onCancel && (
                <button
                  onClick={confirmModal.onCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {confirmModal.cancelText || 'Batal'}
                </button>
              )}
              {confirmModal.onConfirm && (
                <button
                  onClick={confirmModal.onConfirm}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
                    confirmModal.type === 'error' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {confirmModal.confirmText || 'Konfirmasi'}
                </button>
              )}
            </div>
          </Modal>
        )}
      </div>
    </ErrorBoundary>
  );
}