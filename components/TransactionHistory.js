import { useState, useEffect } from 'react';
import { FiClock, FiArrowUp, FiArrowDown, FiDownload, FiTrash2 } from 'react-icons/fi';
import Modal from './Modal';
import { db } from '../lib/firebase';
import React from 'react';
import PropTypes from 'prop-types';
import ErrorBoundary from './ErrorBoundary';
import { useLanguage } from '../lib/languageContext';
import { formatIDR, formatUSD, formatNumber, formatNumberUSD } from '../lib/utils';
import { doc, deleteDoc, collection } from 'firebase/firestore';

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
  const { t, language } = useLanguage();
  
  // Debug logging
  useEffect(() => {
    console.log('Received transactions:', transactions);
    console.log('User:', user);
    console.log('Exchange rate:', exchangeRate);
  }, [transactions, user, exchangeRate]);

  // Delete transaction function
  const deleteTransaction = async (transactionId) => {
    try {
      // Delete from Firebase - use correct path
      await deleteDoc(doc(db, 'users', user.uid, 'transactions', transactionId));
      
      // Update local state immediately for better UX
      setFilteredTransactions(prev => prev.filter(tx => tx.id !== transactionId));
      
      // Call the callback to refresh transactions
      if (onTransactionsUpdate) {
        onTransactionsUpdate();
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
      
      // Show error message
      setConfirmModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to delete transaction: ' + error.message,
        type: 'error',
        confirmText: 'OK',
        onConfirm: () => setConfirmModal(null)
      });
    }
  };



  const handleDeleteClick = (transaction) => {
    setConfirmModal({
      title: t('confirmDelete'),
      message: t('confirmDeleteTransaction', { 
        type: t(transaction.type), 
        asset: transaction.ticker || transaction.symbol,
        amount: transaction.amount 
      }),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      onConfirm: () => {
        deleteTransaction(transaction.id);
        setConfirmModal(null);
      },
      onCancel: () => setConfirmModal(null)
    });
  };


  
  useEffect(() => {
    if (!transactions || !Array.isArray(transactions)) {
      console.log('No transactions or invalid transactions array');
      setFilteredTransactions([]);
      return;
    }
    
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
      return currency === 'IDR' ? 'Rp0' : '$0.00';
    }
    
    if (currency === 'IDR') {
      // Use dot for thousands separator for IDR (Indonesian format)
      const formatted = formatIDR(value);
      return formatted;
    } else {
      // For USD, show 1 decimal place for values < 1, and 2 for values >= 1
      const decimalPlaces = value >= 1 ? 2 : 1;
      // Use dot for thousands separator for USD
      const formatted = formatUSD(value, decimalPlaces);
      return formatted;
    }
  };

  // Format number for CSV export (without currency symbol)
  const formatNumberForCSV = (value, currency) => {
    if (!value || isNaN(value)) return currency === 'USD' ? '0.00' : '0';
    
    if (currency === 'IDR') {
      // Use Indonesian format for IDR (dots for thousands, comma for decimal)
      return formatNumber(value, 0);
    } else {
      // Use US format for USD (comma for thousands, period for decimal) without dollar sign
      return formatNumberUSD(value, 2); // Always use 2 decimal places for USD
    }
  };
  


  // Calculate value based on transaction data
  const calculateValue = (transaction) => {
    if (transaction.assetType === 'stock') {
      // For stocks, always calculate both IDR and USD values
      const valueIDR = transaction.valueIDR || 0;
      const valueUSD = transaction.valueUSD || (exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0);
      
      // If we have USD value but no IDR value, calculate IDR from USD
      const finalValueIDR = valueIDR || (exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0);
      
      return { valueIDR: finalValueIDR, valueUSD };
    } else if (transaction.assetType === 'crypto') {
      // For crypto, always calculate both IDR and USD values
      const valueUSD = transaction.valueUSD || 0;
      const valueIDR = transaction.valueIDR || (exchangeRate && exchangeRate > 0 ? valueUSD * exchangeRate : 0);
      
      // If we have IDR value but no USD value, calculate USD from IDR
      const finalValueUSD = valueUSD || (exchangeRate && exchangeRate > 0 ? valueIDR / exchangeRate : 0);
      
      return { valueIDR, valueUSD: finalValueUSD };
    }

    return { valueIDR: 0, valueUSD: 0 };
  };
  
  // Export to CSV with better formatting
  const exportToCSV = () => {
    try {
      // Add UTF-8 BOM to prevent Excel from showing warning
      const BOM = '\uFEFF';
      
      // Language-aware CSV headers
      const headers = [
        t('date'),
        t('type'),
        t('asset'),
        'Symbol',
        t('amount'),
        t('price'),
        t('idrValue'),
        t('usdValue')
      ];
      
      let csvContent = BOM + headers.join(';') + '\n';
      
      filteredTransactions.forEach(tx => {
        const values = calculateValue(tx);
        let typeText = '';
        let amountText = '';
        
        switch(tx.type) {
          case 'buy':
            typeText = t('buy');
            amountText = tx.amount;
            break;
          case 'sell':
            typeText = t('sell');
            amountText = tx.amount;
            break;
          case 'delete':
            typeText = t('delete');
            amountText = tx.amount;
            break;
          default:
            typeText = tx.type;
            amountText = tx.amount;
        }
        
        const row = [
          `"${formatDate(tx.timestamp)}"`,
          `"${typeText}"`,
          `"${tx.assetType === 'stock' ? t('stock') : t('crypto')}"`,
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
      
      // Language-aware filename
      const currentDate = new Date().toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US');
      const filename = language === 'id' 
        ? `transaksi_${currentDate}.csv`
        : `transactions_${currentDate}.csv`;
      
      // Set download attributes
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      
      // Append to body and trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

    } catch (error) {
      console.error('Error exporting CSV:', error);
      setConfirmModal({
        isOpen: true,
        title: t('error'),
        message: t('exportFailed', { error: error.message }),
        type: 'error',
        confirmText: t('ok'),
        onConfirm: () => setConfirmModal(null)
      });
    }
  };
  
  // Delete a single transaction

  
  // Format nilai mata uang
  const formatValue = (value, currency) => {
    if (currency === 'IDR') {
      // Use dot for thousands separator for IDR (Indonesian format)
      return formatIDR(value, 2);
    } else {
      // Use dot for thousands separator for USD
      return formatUSD(value, 2);
    }
  };

  return (
    <ErrorBoundary>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        {/* Header Section - Minimalist */}
        <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center" aria-hidden="true">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('transactionHistory')}</h2>
          </div>
          <div className="flex justify-center sm:justify-end">
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl flex items-center gap-2 transition-all duration-200 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm font-medium"
              aria-label={t('exportCSV')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('exportCSV')}
            </button>
          </div>
        </div>

        {/* Filter Section - Minimalist */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transaction Type Filter */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('transactionType')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  filter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('all')}
              </button>
              <button
                onClick={() => setFilter('buy')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  filter === 'buy'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('buy')}
              </button>
              <button
                onClick={() => setFilter('sell')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  filter === 'sell'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('sell')}
              </button>
            </div>
          </div>

          {/* Asset Type Filter */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('assetType')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssetTypeFilter('all')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('allAssets')}
              </button>
              <button
                onClick={() => setAssetTypeFilter('stock')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'stock'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('stocks')}
              </button>
              <button
                onClick={() => setAssetTypeFilter('crypto')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  assetTypeFilter === 'crypto'
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {t('crypto')}
              </button>
            </div>
          </div>
        </div>

        {/* Transaction Table - Minimalist */}
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('date')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('type')}</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('asset')}</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('amount')}</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('price')}</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('idrValue')}</th>
                <th className="hidden lg:table-cell px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('usdValue')}</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <div className="text-gray-500 dark:text-gray-400">
                        <p className="text-lg font-medium">{t('noTransactions')}</p>
                        <p className="text-sm">{t('noTransactionsDesc')}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx, index) => {
                  const values = calculateValue(tx);
                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(tx.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                          tx.type === 'buy'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : tx.type === 'sell'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {tx.type === 'buy' ? t('buy') : 
                           tx.type === 'sell' ? t('sell') : 
                           tx.type === 'delete' ? t('delete') : tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {tx.ticker || tx.symbol}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {tx.assetType === 'stock' ? t('stock') : t('crypto')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                        {tx.amount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                        {formatCurrency(tx.price, tx.currency === 'IDR' ? 'IDR' : 'USD')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                        {formatCurrency(values.valueIDR, 'IDR')}
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                        {formatCurrency(values.valueUSD, 'USD')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-400">
                        <button
                          onClick={() => handleDeleteClick(tx)}
                          className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                          title={t('delete')}
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Confirmation Modal */}
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div 
              className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{confirmModal.title}</h3>
                <button 
                  onClick={confirmModal.onCancel}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="text-gray-700 dark:text-gray-300 mb-6">
                {confirmModal.message}
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                {confirmModal.cancelText && (
                  <button
                    onClick={confirmModal.onCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
                  >
                    {confirmModal.cancelText}
                  </button>
                )}
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all duration-200"
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