// AssetTable.js
import { useState } from 'react';
import { FiTrash2, FiArrowDown, FiArrowUp, FiTrendingUp, FiDollarSign } from 'react-icons/fi';
import Modal from './Modal';
import ErrorBoundary from './ErrorBoundary';

export default function AssetTable({ assets, prices, exchangeRate, type, onUpdate, onDelete, onSell = () => {}, loading = false }) {
  const [sellingIndex, setSellingIndex] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  
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
      const tickerKey = asset.currency === 'USD' ? `${asset.ticker}.US` : 
                       asset.currency === 'IDR' ? `${asset.ticker}.JK` : 
                       asset.ticker;
      price = prices[tickerKey];
    } else {
      price = prices[asset.symbol];
    }
    
    const isIDX = type === 'stock' && price && price.currency === 'IDR';
    
    if (isNaN(amountToSell) || amountToSell <= 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: 'Masukkan nilai yang valid',
        type: 'error'
      });
      return;
    }
    // Only allow integer lots for IDX stock
    if (isIDX && (!Number.isInteger(amountToSell) || String(sellAmount).includes(','))) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: 'Penjualan saham IDX hanya diperbolehkan dalam satuan lot bulat (tidak boleh desimal atau koma).',
        type: 'error'
      });
      return;
    }
    if (amountToSell > currentAmount) {
      setConfirmModal({
        isOpen: true,
        title: 'Peringatan',
        message: `Jumlah yang dijual tidak boleh melebihi jumlah yang dimiliki (${currentAmount})`,
        type: 'error'
      });
      return;
    }
    
    // Tampilkan konfirmasi penjualan
    const ticker = type === 'stock' ? asset.ticker : asset.symbol;
    let valueFormatted = '';
    
    if (price) {
      if (type === 'stock') {
        // For IDX stocks: 1 lot = 100 shares, for US stocks: fractional shares allowed
        if (price.currency === 'IDR') {
          const valueIDR = amountToSell * 100 * price.price;
          valueFormatted = valueIDR.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'});
        } else {
          const valueUSD = amountToSell * price.price;
          const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
          valueFormatted = valueIDR.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'});
        }
      } else {
        // For crypto: always show in IDR
        const valueUSD = amountToSell * price.price;
        const valueIDR = exchangeRate ? valueUSD * exchangeRate : 0;
        valueFormatted = valueIDR.toLocaleString('id-ID', {style: 'currency', currency: 'IDR'});
      }
    }
    
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Penjualan',
      message: `Anda akan menjual ${amountToSell} ${type === 'stock' ? 'lot' : ''} ${ticker} ${valueFormatted ? `dengan nilai sekitar ${valueFormatted}` : ''}. Lanjutkan penjualan?`,
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
  
  // Function to format price based on currency and exchange rate
  const formatPrice = (price, currency, inIDR = false) => {
    if (!price && price !== 0) return 'Tidak tersedia';
    
    if (currency === 'IDR' || inIDR) {
      return `Rp ${price.toLocaleString()}`;
    } else {
      return `$ ${price.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: currency === 'USD' ? 2 : 8
      })}`;
    }
  };
  
  const handleDeleteConfirm = (index, asset) => {
    const assetName = type === 'stock' ? asset.ticker : asset.symbol;
    
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Hapus',
      message: `Anda yakin ingin menghapus ${assetName} dari portfolio Anda?`,
      type: 'error',
      onConfirm: () => {
        onDelete(index);
        setConfirmModal(null);
      }
    });
  };
  
  const calculateAssetValue = (asset, currency, exchangeRate) => {
    if (asset.type === 'stock') {
      // Use the same ticker format as when fetching prices
      const tickerKey = asset.currency === 'USD' ? `${asset.ticker}.US` : 
                       asset.currency === 'IDR' ? `${asset.ticker}.JK` : 
                       asset.ticker;
      const price = prices[tickerKey];
      // For IDX stocks: 1 lot = 100 shares, for US stocks: fractional shares allowed
      const shareCount = price && price.currency === 'IDR' ? asset.lots * 100 : asset.lots;
      
      if (!price) {
        return {
          valueIDR: 0,
          valueUSD: 0,
          price: 0,
          error: 'Data harga tidak tersedia'
        };
      }
      
      if (price.currency === 'IDR') {
        const assetValue = price.price * shareCount;
        if (!exchangeRate || exchangeRate === 0) {
          return {
            valueIDR: assetValue,
            valueUSD: 0,
            price: price.price,
            error: 'Kurs tidak tersedia untuk konversi ke USD'
          };
        }
        const assetValueUSD = assetValue / exchangeRate;
        
        return {
          valueIDR: assetValue,
          valueUSD: assetValueUSD,
          price: price.price
        };
      } else if (price.currency === 'USD') {
        const assetValueUSD = price.price * shareCount;
        if (!exchangeRate) {
          return {
            valueIDR: 0,
            valueUSD: assetValueUSD,
            price: price.price,
            error: 'Kurs tidak tersedia untuk konversi ke IDR'
          };
        }
        const assetValue = assetValueUSD * exchangeRate;
        
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
          error: 'Data harga tidak tersedia'
        };
      }
      
      const assetValueUSD = price.price * asset.amount;
      if (!exchangeRate) {
        return {
          valueIDR: 0,
          valueUSD: assetValueUSD,
          price: price.price,
          error: 'Kurs tidak tersedia untuk konversi ke IDR'
        };
      }
      const assetValue = assetValueUSD * exchangeRate;
      
      return {
        valueIDR: assetValue,
        valueUSD: assetValueUSD,
        price: price.price
      };
    }
    
    return {
      valueIDR: 0,
      valueUSD: 0,
      price: 0,
      error: 'Tipe aset tidak dikenali'
    };
  };

  return (
    <ErrorBoundary>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {type === 'stock' ? 'Saham' : 'Kripto'}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Jumlah
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Harga
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nilai IDR
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Nilai USD
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {assets.map((asset, index) => {
              const assetValue = calculateAssetValue(asset, asset.currency, exchangeRate);
              const price = prices[type === 'stock' ? asset.ticker : asset.symbol];
              const change = price ? price.change : 0;
              
              return (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
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
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {sellingIndex === index ? (
                      <input
                        type="number"
                        value={sellAmount}
                        onChange={(e) => setSellAmount(e.target.value)}
                        className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        step={type === 'stock' ? '1' : '0.00000001'}
                        min="0"
                      />
                    ) : (
                      <span className="text-sm text-gray-900 dark:text-white">
                        {type === 'stock' ? asset.lots : asset.amount}
                      </span>
                    )}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {assetValue.price ? formatPrice(assetValue.price, asset.currency || 'IDR') : 'Tidak tersedia'}
                      </span>
                      {change !== 0 && (
                        <div className={`flex items-center text-xs ${
                          change > 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                        }`}>
                          {change > 0 ? <FiArrowUp className="w-3 h-3" /> : <FiArrowDown className="w-3 h-3" />}
                          {Math.abs(change).toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {assetValue.valueIDR ? formatPrice(assetValue.valueIDR, 'IDR', true) : 'Tidak tersedia'}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {assetValue.valueUSD ? formatPrice(assetValue.valueUSD, 'USD') : 'Tidak tersedia'}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {sellingIndex === index ? (
                      <div className="flex space-x-2 justify-center">
                        <button
                          onClick={() => handleSaveSell(index, asset)}
                          className="bg-green-600 p-1.5 rounded text-white hover:bg-green-700"
                        >
                          ✓
                        </button>
                        <button
                          onClick={handleCancelSell}
                          className="bg-gray-500 dark:bg-gray-600 p-1.5 rounded text-white hover:bg-gray-600 dark:hover:bg-gray-700"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2 justify-center">
                        <button
                          onClick={() => handleDeleteConfirm(index, asset)}
                          className="bg-red-100 dark:bg-red-600/40 p-1.5 rounded text-red-600 dark:text-white hover:bg-red-200 dark:hover:bg-red-600"
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleSellClick(index, asset)}
                          className="bg-amber-100 dark:bg-amber-600/40 px-2 py-1 rounded text-amber-600 dark:text-white hover:bg-amber-200 dark:hover:bg-amber-600 text-xs font-medium"
                        >
                          Jual
                        </button>
                      </div>
                    )}
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