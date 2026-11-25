import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiInfo, FiHelpCircle, FiShield, FiTrendingUp, FiDollarSign } from 'react-icons/fi';
import { useLanguage } from '../lib/languageContext';

export default function MetricsGuideModal({ isOpen, onClose }) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.paddingRight = '';
      document.body.style.overflow = 'unset';
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FiInfo className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {t('metricsGuideTitle') || (isEn ? 'Portfolio Metrics & Calculation Guide' : 'Panduan Metrik & Hitungan Portofolio')}
              </h3>
              <p className="text-xs text-gray-500">
                {isEn ? 'Understand your capital, cash, and returns' : 'Transparansi modal, kas, dan performa investasi'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          
          {/* Card 1: Modal Awal + Kas */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/50">
            <div className="font-bold text-emerald-800 dark:text-emerald-300 text-sm mb-1.5">
              <h4>{t('guideInitialPortoTitle') || (isEn ? '🌱 Initial Capital + Cash (Pre-P/L)' : '🌱 Modal Awal + Kas (Porto Utuh)')}</h4>
            </div>
            <p className="leading-relaxed">
              {isEn
                ? 'Your total money before any market gains or losses. It is calculated from: Capital spent to buy assets (Stocks + Crypto + Gold) + Cash remaining in your accounts (Bank & E-Wallet).'
                : 'Total seluruh uang Anda saat masih utuh sebelum mengalami keuntungan atau kerugian pasar. Dihitung dari: Modal Beli Aset (Saham + Kripto + Emas) + Saldo Kas (Bank & E-Wallet).'}
            </p>
            <div className="mt-2.5 pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
              <span className="font-sans font-medium">{isEn ? 'Golden Formula:' : 'Rumus Matematis:'}</span>
              <span className="font-semibold">{isEn ? 'Current Portfolio − Initial Capital = Gain/Loss' : 'Porto Sekarang − Modal Awal = Untung/Rugi'}</span>
            </div>
          </div>

          {/* Card 2: Tanpa Stablecoin vs Total */}
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/50">
            <div className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1.5">
              <h4>{t('guideStableTitle') || (isEn ? '⚖️ Why is there an "Excl. Stable" Option?' : '⚖️ Kenapa Ada Pilihan "Tanpa Stable"?')}</h4>
            </div>
            <p className="mb-2 leading-relaxed">
              {isEn
                ? 'Stablecoins (such as USDT & USDC) stay fixed at $1.00 USD and serve as DIGITAL CASH or standby dry powder on crypto exchanges (not speculative volatile assets).'
                : 'Stablecoin (seperti USDT & USDC) nilainya stabil $1.00 USD dan berfungsi sebagai KAS DOLAR atau dana siap pakai di bursa kripto (bukan aset yang naik-turun).'}
            </p>
            <div className="space-y-2 text-[11px] pl-3 border-l-2 border-blue-400 dark:border-blue-600">
              <p>
                <strong className="text-gray-900 dark:text-gray-100">{isEn ? 'Total Portfolio Mode:' : 'Mode Total:'}</strong>{' '}
                {isEn ? 'Your net worth is always 100% intact, counting Bank cash and Stablecoins.' : 'Uang Anda selalu 100% utuh, termasuk tabungan Bank dan Stablecoin.'}
              </p>
              <p>
                <strong className="text-gray-900 dark:text-gray-100">{isEn ? 'Excl. Stable Mode:' : 'Mode Tanpa Stable:'}</strong>{' '}
                {isEn
                  ? 'Measures pure ROI only from assets taking real market risk (Stocks, Volatile Crypto, Gold) without dilution from idle dollar cash reserves.'
                  : 'Melihat persentase untung/rugi murni dari modal yang benar-benar berisiko di pasar (Saham, Kripto fluktuatif, Emas) tanpa terbias oleh saldo dolar yang cuma mengendap.'}
              </p>
            </div>
          </div>

          {/* Card 3: Modal vs Nilai */}
          <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/50">
            <div className="font-bold text-purple-800 dark:text-purple-300 text-sm mb-1.5">
              <h4>{t('guideCostVsValueTitle') || (isEn ? '📦 Invested Cost vs Current Value' : '📦 Modal Beli vs Nilai Sekarang')}</h4>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-[11px] mt-2">
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-gray-900/50 border border-purple-100/50 dark:border-purple-900/30">
                <p className="font-bold text-gray-900 dark:text-gray-100 mb-0.5">{isEn ? 'Invested Cost' : 'Modal Beli'}</p>
                <p className="text-gray-600 dark:text-gray-300">{isEn ? 'Actual money spent to purchase assets.' : 'Uang asli yang Anda keluarkan saat membeli aset.'}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-gray-900/50 border border-purple-100/50 dark:border-purple-900/30">
                <p className="font-bold text-gray-900 dark:text-gray-100 mb-0.5">{isEn ? 'Current Value' : 'Nilai Sekarang'}</p>
                <p className="text-gray-600 dark:text-gray-300">{isEn ? 'Worth of those assets at current market prices.' : 'Harga aset tersebut di pasar saat ini setelah naik/turun.'}</p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-[#0d1117] border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            {isEn ? 'Understood' : 'Mengerti'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
