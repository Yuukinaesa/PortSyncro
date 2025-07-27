import { useState, useEffect } from 'react';
import { FiClock, FiArrowUp, FiArrowDown, FiDownload } from 'react-icons/fi';
import Modal from './Modal';
import { db } from '../lib/firebase';
import React from 'react';
import PropTypes from 'prop-types';
import ErrorBoundary from './ErrorBoundary';

export default function TransactionHistory({ 
  transactions = [], 
  user, 
  onTransactionsUpdate,
  exchangeRate,
  assetKey // Tambahkan prop assetKey
}) {
  const [filteredTransactions, setFilteredTransactions] = useState(transactions);
  const [filter, setFilter] = useState('all'); // all, buy, sell
  const [assetTypeFilter, setAssetTypeFilter] = useState('all'); // all, stock, crypto
  const [confirmModal, setConfirmModal] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    exchangeRate: false,
    stockPrices: false,
    cryptoPrices: false,
    transactions: false
  });
  
  // Debug logging
  useEffect(() => {
    console.log('Received transactions:', transactions);
    console.log('User:', user);
    console.log('Exchange rate:', exchangeRate);
  }, [transactions, user, exchangeRate]);
  
  useEffect(() => {
    let filtered = [...transactions]; // Create a copy of transactions array
    
    // Jika ada prop assetKey, filter transactions hanya untuk assetKey (ticker/symbol)
    if (assetKey) {
      filtered = filtered.filter(tx => tx.ticker === assetKey || tx.symbol === assetKey);
    }

    // Apply type filter (buy/sell/delete)
    if (filter !== 'all') {
      filtered = filtered.filter(tx => tx.type === filter);
    }
    
    // Apply asset type filter
    if (assetTypeFilter !== 'all') {
      filtered = filtered.filter(tx => tx.assetType === assetTypeFilter);
    }
    
    // Sort by timestamp in descending order
    filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA;
    });
    
    console.log('Filtered transactions:', filtered);
    setFilteredTransactions(filtered);
  }, [filter, assetTypeFilter, transactions, assetKey]); // Tambahkan assetKey ke dependency
  
  // Format tanggal ke format lokal
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Invalid Date';
      }
      return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error, 'Date string:', dateString);
      return 'Invalid Date';
    }
  };

  // Format currency with better precision
  const formatCurrency = (value, currency) => {
    if (!value || isNaN(value)) {
      return currency === 'IDR' ? 'Rp 0' : '$ 0.00';
    }
    
    if (currency === 'IDR') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else {
      // For USD, show 1 decimal place for values < 1, and 2 for values >= 1
      const decimalPlaces = value >= 1 ? 2 : 1;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
      }).format(value);
    }
  };

  // Format number for CSV export (without currency symbol)
  const formatNumberForCSV = (value, currency) => {
    if (!value || isNaN(value)) return '0';
    
    if (currency === 'IDR') {
      return new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } else {
      const decimalPlaces = value >= 1 ? 2 : 1;
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
      }).format(value);
    }
  };
  
  const calculateValue = (transaction) => {
    if (transaction.assetType === 'stock') {
      if (transaction.currency === 'IDR') {
        const valueIDR = transaction.valueIDR || 0;
        const valueUSD = exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0;
        return { valueIDR, valueUSD };
      }
    } else if (transaction.assetType === 'crypto') {
      const valueUSD = transaction.valueUSD || 0;
      const valueIDR = exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0;
      return { valueIDR, valueUSD };
    }

    return { valueIDR: 0, valueUSD: 0 };
  };
  
  // Export to CSV with better formatting
  const exportToCSV = () => {
    try {
      // Add UTF-8 BOM to prevent Excel from showing warning
      const BOM = '\uFEFF';
      let csvContent = BOM + "Tanggal;Tipe;Aset;Symbol;Jumlah;Harga;Nilai IDR;Nilai USD\n";
      
      filteredTransactions.forEach(tx => {
        const values = calculateValue(tx);
        let typeText = '';
        let amountText = '';
        
        switch(tx.type) {
          case 'buy':
            typeText = 'Beli';
            amountText = tx.amount;
            break;
          case 'sell':
            typeText = 'Jual';
            amountText = tx.amount;
            break;
          case 'delete':
            typeText = 'Hapus';
            amountText = tx.amount;
            break;
          default:
            typeText = tx.type;
            amountText = tx.amount;
        }
        
        const row = [
          `"${formatDate(tx.timestamp)}"`,
          `"${typeText}"`,
          `"${tx.assetType === 'stock' ? 'Saham' : 'Kripto'}"`,
          `"${tx.ticker || tx.symbol}"`,
          `"${amountText}"`,
          formatNumberForCSV(tx.price, tx.currency === 'IDR' ? 'IDR' : 'USD'),
          formatNumberForCSV(values.valueIDR, 'IDR'),
          formatNumberForCSV(values.valueUSD, 'USD')
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Create blob with proper MIME type
      const blob = new Blob([csvContent], { 
        type: 'text/csv;charset=utf-8;'
      });
      
      // Create download link
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      // Set download attributes
      link.setAttribute('href', url);
      link.setAttribute('download', `transaksi_${new Date().toLocaleDateString('id-ID')}.csv`);
      
      // Append to body and trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      // Show success message
      setConfirmModal({
        isOpen: true,
        title: 'Sukses',
        message: 'Data transaksi berhasil diekspor ke CSV',
        type: 'success',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Gagal mengekspor data ke CSV: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };
  
  // Delete a single transaction

  
  // Format nilai mata uang
  const formatValue = (value, currency) => {
    if (currency === 'IDR') {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2
      }).format(value);
    } else {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      }).format(value);
    }
  };

  return (
    <ErrorBoundary>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
              <svg className="w-6 h-6 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Riwayat Transaksi</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center gap-2 transition-all duration-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>

          </div>
        </div>

        {/* Filter Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Transaction Type Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipe Transaksi</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  filter === 'all'
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setFilter('buy')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  filter === 'buy'
                    ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Beli
              </button>
              <button
                onClick={() => setFilter('sell')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  filter === 'sell'
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Jual
              </button>
            </div>
          </div>

          {/* Asset Type Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Jenis Aset</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssetTypeFilter('all')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'all'
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Semua Aset
              </button>
              <button
                onClick={() => setAssetTypeFilter('stock')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'stock'
                    ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Saham
              </button>
              <button
                onClick={() => setAssetTypeFilter('crypto')}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'crypto'
                    ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Kripto
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipe</th>
                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aset</th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jumlah</th>
                <th className="hidden sm:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Harga</th>
                <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nilai IDR</th>
                <th className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nilai USD</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTransactions.map((tx, index) => {
                const values = calculateValue(tx);
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(tx.timestamp)}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 sm:px-3 py-1 text-xs rounded-full font-medium ${
                        tx.type === 'buy'
                          ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : tx.type === 'sell'
                          ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-50 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {tx.type === 'buy' ? 'Beli' : 
                         tx.type === 'sell' ? 'Jual' : 
                         tx.type === 'delete' ? 'Hapus' : tx.type}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {tx.ticker || tx.symbol}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {tx.assetType === 'stock' ? 'Saham' : 'Kripto'}
                        </span>
                        {/* Show price on mobile */}
                        <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(tx.price, tx.currency === 'IDR' ? 'IDR' : 'USD')}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                      {tx.amount}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                      {formatCurrency(tx.price, tx.currency === 'IDR' ? 'IDR' : 'USD')}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                      {formatCurrency(values.valueIDR, 'IDR')}
                    </td>
                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                      {formatCurrency(values.valueUSD, 'USD')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Confirmation Modal */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/0">
            <div 
              className="w-full max-w-md mx-2 rounded-xl shadow-xl border p-4 bg-white dark:bg-gray-800 flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{confirmModal.title}</h3>
                <button 
                  onClick={confirmModal.onCancel}
                  className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-gray-700 dark:text-gray-200 mb-6">
                {confirmModal.message}
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                {confirmModal.cancelText && (
                  <button
                    onClick={confirmModal.onCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {confirmModal.cancelText}
                  </button>
                )}
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors bg-red-500 hover:bg-red-600"
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// PropTypes validation
TransactionHistory.propTypes = {
  transactions: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['buy', 'sell', 'delete']).isRequired,
    ticker: PropTypes.string,
    symbol: PropTypes.string,
    amount: PropTypes.number.isRequired,
    price: PropTypes.number.isRequired,
    timestamp: PropTypes.string.isRequired,
    isPending: PropTypes.bool
  })).isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  onTransactionsUpdate: PropTypes.func.isRequired,
  exchangeRate: PropTypes.number,
  assetKey: PropTypes.string // Tambahkan propTypes untuk assetKey
}; 