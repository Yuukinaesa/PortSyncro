import React, { useEffect } from 'react';
import { FiX, FiInfo, FiHelpCircle, FiShield, FiTrendingUp, FiDollarSign } from 'react-icons/fi';
import { useLanguage } from '../lib/languageContext';

export default function MetricsGuideModal({ isOpen, onClose }) {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
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
          
          {/* Card 1: Porto Utuh */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/50">
            <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300 text-sm mb-1.5">
              <span>🌱</span>
              <h4>{t('guideInitialPortoTitle') || (isEn ? 'Pre-P/L Portfolio (Porto Utuh)' : 'Porto Utuh (Sebelum P/L)')}</h4>
            </div>
            <p>
              {isEn
                ? 'Your intact net worth before any market gains or losses. Calculated as: Invested Capital (Stocks + Crypto + Gold) + Cash Balance (Bank & E-Wallet).'
                : 'Total seluruh kekayaan Anda waktu uang masih utuh sebelum mengalami keuntungan atau kerugian pasar. Dihitung dari: Modal Investasi (Saham + Kripto + Emas) + Saldo Kas (Bank & E-Wallet).'}
            </p>
            <div className="mt-2 pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
              <span>{isEn ? 'Golden Formula:' : 'Rumus Matematis:'}</span>
              <span className="font-semibold">{isEn ? 'Current Porto − Pre-P/L Porto = Gain/Loss' : 'Porto Sekarang − Porto Utuh = Untung/Rugi'}</span>
            </div>
          </div>

          {/* Card 2: Tanpa Stablecoin vs Total */}
          <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/50">
            <div className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-300 text-sm mb-1.5">
              <span>⚖️</span>
              <h4>{t('guideStableTitle') || (isEn ? 'Why is there an "Excl. Stable" Mode?' : 'Kenapa Ada Mode "Tanpa Stable"?')}</h4>
            </div>
            <p className="mb-2">
              {isEn
                ? 'Stablecoins (USDT & USDC) are pegged to $1.00 USD and serve as DIGITAL CASH / STANDBY DRY POWDER on exchanges, not speculative volatile assets.'
                : 'Stablecoin (USDT & USDC) bernilai konstan $1.00 USD dan berfungsi sebagai KAS DIGITAL / DANA STANDBY di bursa kripto (bukan aset fluktuatif).'}
            </p>
            <div className="space-y-1.5 text-[11px] pl-2 border-l-2 border-blue-400 dark:border-blue-600">
              <p>
                <strong className="text-gray-800 dark:text-gray-200">{isEn ? 'Total Portfolio:' : 'Total Portofolio:'}</strong>{' '}
                {isEn ? 'Always 100% intact, including all Bank cash and Stablecoins.' : 'Uang Anda selalu 100% utuh, termasuk kas Bank dan Stablecoin.'}
              </p>
              <p>
                <strong className="text-gray-800 dark:text-gray-200">{isEn ? 'Excl. Stable (Active Capital):' : 'Tanpa Stable (Modal Aktif):'}</strong>{' '}
                {isEn
                  ? 'Measures pure ROI only from assets taking real market risk (Stocks, Volatile Crypto, Gold) without dilution from idle dollar cash reserves.'
                  : 'Mengukur persentase performa return murni dari modal yang benar-benar berisiko di pasar (Saham, Kripto aktif, Emas) agar tidak terencerkan oleh saldo dolar mengendap.'}
              </p>
            </div>
          </div>

          {/* Card 3: Modal vs Nilai */}
          <div className="p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/50">
            <div className="flex items-center gap-2 font-bold text-purple-800 dark:text-purple-300 text-sm mb-1.5">
              <span>📦</span>
              <h4>{t('guideCostVsValueTitle') || (isEn ? 'Cost vs Market Value' : 'Modal vs Nilai Pasar')}</h4>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-xl bg-white/60 dark:bg-gray-900/40">
                <p className="font-bold text-gray-800 dark:text-gray-200 mb-0.5">{isEn ? 'Cost / Invested' : 'Modal / Cost'}</p>
                <p>{isEn ? 'Total actual money spent to purchase assets.' : 'Uang pokok yang dikeluarkan untuk beli aset.'}</p>
              </div>
              <div className="p-2 rounded-xl bg-white/60 dark:bg-gray-900/40">
                <p className="font-bold text-gray-800 dark:text-gray-200 mb-0.5">{isEn ? 'Current Value' : 'Nilai Sekarang'}</p>
                <p>{isEn ? 'Worth of those assets at current live prices.' : 'Nilai pasar aset saat ini setelah pergerakan harga.'}</p>
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
    </div>
  );
}
