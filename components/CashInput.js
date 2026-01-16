import { useState } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput } from '../lib/utils';
import { secureLogger } from './../lib/security';

export default function CashInput({ onAdd, onComplete }) {
    const [ticker, setTicker] = useState('');
    const [amount, setAmount] = useState('');
    const [error, setError] = useState(null);
    const { t } = useLanguage();

    const handleSubmit = (e) => {
        e.preventDefault();
        setError(null);
        try {
            if (!ticker || !amount) {
                throw new Error(t('allFieldsRequired') || 'Semua kolom harus diisi');
            }

            const normalizedAmount = normalizeNumberInput(amount);
            const amountNum = parseFloat(normalizedAmount);

            if (isNaN(amountNum) || amountNum < 0) {
                throw new Error(t('invalidAmount') || 'Jumlah tidak valid');
            }

            const cashAsset = {
                ticker: ticker.trim(),
                amount: amountNum,
                currency: 'IDR',
                type: 'cash',
                addedAt: new Date().toISOString()
            };

            onAdd(cashAsset);
            onComplete();

        } catch (error) {
            secureLogger.error('Error adding cash:', error);
            setError(error.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label htmlFor="bankName" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                    {t('bankName') || 'Nama Bank / E-Wallet'} *
                </label>
                <div className="relative group">
                    <input
                        type="text"
                        id="bankName"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        placeholder="Contoh: BCA, GoPay, OVO"
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-600/50 focus:border-green-600 transition-all font-medium"
                        required
                    />
                </div>
            </div>

            <div>
                <label htmlFor="amount" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">
                    {t('balance') || 'Saldo Awal'} *
                </label>
                <div className="relative group">
                    <input
                        type="text"
                        id="amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Rp 0"
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-600/50 focus:border-green-600 transition-all font-medium"
                        required
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3 animate-shake">
                    <svg className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700 dark:text-red-200 font-medium">{error}</p>
                </div>
            )}

            <div className="flex gap-3 pt-4">
                <button
                    type="button"
                    onClick={onComplete}
                    className="flex-1 px-4 py-3.5 border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-[#0d1117] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-[#161b22] transition-all duration-200 text-sm font-bold"
                >
                    {t('cancel')}
                </button>
                <button
                    type="submit"
                    className="flex-1 px-4 py-3.5 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all duration-200 text-sm font-bold shadow-lg shadow-green-900/20 hover:shadow-green-900/40 active:scale-[0.98]"
                >
                    {t('save') || 'Simpan'}
                </button>
            </div>
        </form>
    );
}
