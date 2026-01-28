import { useState, useEffect } from 'react';
import { useLanguage } from '../lib/languageContext';
import { normalizeNumberInput } from '../lib/utils';
import { secureLogger } from './../lib/security';

export default function GoldInput({ onAdd, onComplete }) {
    const [subtype, setSubtype] = useState('digital'); // 'digital' or 'physical'
    const [brand, setBrand] = useState('antam'); // 'antam', 'ubs', 'galeri24' (only for physical)
    const [weight, setWeight] = useState(''); // Grams
    const [avgPrice, setAvgPrice] = useState(''); // Manual average price (IDR)
    const [broker, setBroker] = useState(''); // Optional (e.g., Pegadaian, Pluang)
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fetchedPrice, setFetchedPrice] = useState(null);
    const [useManualCurrentPrice, setUseManualCurrentPrice] = useState(false);
    const [manualCurrentPrice, setManualCurrentPrice] = useState('');

    const { t } = useLanguage();

    // Fetch Gold Price on Mount or when Type changes
    useEffect(() => {
        const fetchPrice = async () => {
            try {
                const response = await fetch('/api/prices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gold: true })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.prices && data.prices.gold) {
                        setFetchedPrice(data.prices.gold);
                    }
                }
            } catch (e) {
                secureLogger.error('Failed to fetch gold price estimate:', e);
            }
        };

        fetchPrice();
    }, []);

    const getEstimatedPrice = () => {
        if (!fetchedPrice) return 0;

        if (subtype === 'digital') {
            return fetchedPrice.digital?.price || 0;
        } else {
            // Physical
            const b = brand.toLowerCase();
            if (fetchedPrice.physical && fetchedPrice.physical[b]) {
                return fetchedPrice.physical[b].price || 0;
            }
            return fetchedPrice.digital?.price || 0; // Fallback
        }
    };

    const currentEstimatedPrice = getEstimatedPrice();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            if (!weight) {
                throw new Error('Berat emas (gram) diperlukan');
            }

            const weightNum = parseFloat(normalizeNumberInput(weight));
            if (isNaN(weightNum) || weightNum <= 0) {
                throw new Error('Berat emas tidak valid');
            }

            // Determine price
            let finalPrice = 0;

            // Use manual price if provided
            if (avgPrice) {
                finalPrice = parseFloat(normalizeNumberInput(avgPrice));
            }

            // If no manual price, use fetched price
            if ((!finalPrice || finalPrice <= 0) && currentEstimatedPrice > 0) {
                finalPrice = currentEstimatedPrice;
            }

            if (finalPrice <= 0) {
                throw new Error('Harga beli tidak valid. Masukkan harga manual jika data tidak tersedia.');
            }

            // If Manual Current Price is used, use it for 'price' (Current Price)
            const manualCurr = useManualCurrentPrice && manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : 0;
            const currentPriceToSave = manualCurr > 0 ? manualCurr : finalPrice;

            const goldAsset = {
                ticker: subtype === 'digital' ? 'GOLD-DIGITAL' : `GOLD-${brand.toUpperCase()}`,
                name: subtype === 'digital' ? 'Tabungan Emas' : `Emas ${brand.toUpperCase()}`,
                weight: weightNum,
                subtype: subtype,
                brand: subtype === 'physical' ? brand : 'pegadaian', // Default digital to Pegadaian
                price: currentPriceToSave,
                avgPrice: finalPrice,
                currency: 'IDR',
                market: 'Gold',
                isManual: !!avgPrice,
                broker: broker || (subtype === 'digital' ? 'Pegadaian' : 'Toko Emas'),
                addedAt: new Date().toISOString(),
                useManualPrice: useManualCurrentPrice,
                manualPrice: useManualCurrentPrice && manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : null,
            };

            secureLogger.log('Adding gold:', goldAsset);
            onAdd(goldAsset);
            setIsLoading(false);
            onComplete();
        } catch (error) {
            secureLogger.error('Error adding gold:', error);
            setError(error.message);
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type Selector */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                    Tipe Emas
                </label>
                <div className="flex bg-gray-100 dark:bg-[#0d1117] rounded-xl p-1 border border-gray-200 dark:border-gray-800">
                    <button
                        type="button"
                        onClick={() => setSubtype('digital')}
                        className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 ${subtype === 'digital'
                            ? 'bg-white dark:bg-[#161b22] text-yellow-600 dark:text-yellow-400 shadow-sm border border-gray-200 dark:border-gray-700'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                    >
                        Tabungan Emas (Digital)
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubtype('physical')}
                        className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 ${subtype === 'physical'
                            ? 'bg-white dark:bg-[#161b22] text-yellow-600 dark:text-yellow-400 shadow-sm border border-gray-200 dark:border-gray-700'
                            : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                            }`}
                    >
                        Emas Batangan (Fisik)
                    </button>
                </div>
            </div>

            {/* Brand Selector (Physical Only) */}
            {subtype === 'physical' && (
                <div className="animate-fadeIn">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                        Merek (Brand)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {['antam', 'ubs', 'galeri24'].map((b) => (
                            <button
                                key={b}
                                type="button"
                                onClick={() => setBrand(b)}
                                className={`py-2 text-xs font-bold rounded-lg border transition-all duration-200 uppercase ${brand === b
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 text-yellow-700 dark:text-yellow-300'
                                    : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-gray-800 text-gray-500 hover:border-gray-300'
                                    }`}
                            >
                                {b}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Weight Input */}
            <div>
                <label htmlFor="weight" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                    Berat (Gram) *
                </label>
                <div className="relative group">
                    <input
                        type="text"
                        id="weight"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="Contoh: 1.5"
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all font-medium"
                        required
                        aria-label="Berat Emas (Gram)"
                        aria-required="true"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold pointer-events-none">
                        gram
                    </div>
                </div>
            </div>

            {/* Price Display & Input */}
            <div>
                <div className="flex justify-between items-center mb-2 ml-1">
                    <label htmlFor="avgPrice" className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Harga Beli (per Gram)
                    </label>
                    {currentEstimatedPrice > 0 && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                            Estimasi: Rp {currentEstimatedPrice.toLocaleString('id-ID')}
                        </span>
                    )}
                </div>

                <div className="relative group">
                    <input
                        type="text"
                        id="avgPrice"
                        value={avgPrice}
                        onChange={(e) => setAvgPrice(e.target.value)}
                        placeholder={currentEstimatedPrice > 0 ? `Rp ${currentEstimatedPrice.toLocaleString('id-ID')}` : "Contoh: 1300000"}
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all font-medium"
                    />
                </div>
                <p className="text-xs text-gray-500 mt-2 ml-1">
                    Kosongkan untuk menggunakan harga estimasi saat ini (Realtime Pegadaian/Market).
                </p>
            </div>

            <div>
                <label htmlFor="broker" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                    {t('broker') || 'Broker'} <span className="text-gray-500 font-normal normal-case">({t('optional') || 'Optional'})</span>
                </label>
                <div className="relative group">
                    <input
                        type="text"
                        id="broker"
                        value={broker}
                        onChange={(e) => setBroker(e.target.value)}
                        placeholder={subtype === 'digital' ? "Contoh: Pegadaian, Pluang" : "Contoh: Toko Emas, Brankas Pribadi"}
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all font-medium"
                    />
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3 animate-shake">
                    <svg className="h-5 w-5 text-red-600 dark:text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700 dark:text-red-200 font-medium">{error}</p>
                </div>
            )}

            {/* Manual Current Price Option */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center mb-4">
                    <input
                        type="checkbox"
                        id="useManualPriceGold"
                        checked={useManualCurrentPrice}
                        onChange={(e) => {
                            setUseManualCurrentPrice(e.target.checked);
                            if (!e.target.checked) setManualCurrentPrice('');
                        }}
                        className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500 dark:focus:ring-yellow-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label htmlFor="useManualPriceGold" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                        {t('useManualCurrentPrice') || 'Input Harga Saat Ini Manual'}
                    </label>
                </div>

                {useManualCurrentPrice && (
                    <div className="animate-fade-in-down">
                        <label htmlFor="manualCurrentPriceGold" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
                            {t('manualCurrentPrice') || 'Harga Saat Ini'} (IDR)
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                id="manualCurrentPriceGold"
                                value={manualCurrentPrice}
                                onChange={(e) => setManualCurrentPrice(e.target.value)}
                                placeholder="Contoh: 1400000"
                                className="w-full px-4 py-3.5 bg-white dark:bg-[#0d1117] border border-yellow-300 dark:border-yellow-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-yellow-600 transition-all font-medium"
                                required={useManualCurrentPrice}
                            />
                        </div>
                        <p className="text-xs text-yellow-500 mt-2 ml-1">
                            {t('manualPriceWarning') || 'Harga ini akan digunakan sebagai harga saat ini dan tidak akan update otomatis.'}
                        </p>
                    </div>
                )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onComplete}
                    className="flex-1 px-4 py-3.5 border border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-[#0d1117] text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-[#161b22] transition-all duration-200 text-sm font-bold"
                >
                    {t('cancel') || 'Batal'}
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 px-4 py-3.5 bg-yellow-500 hover:bg-yellow-400 text-white rounded-xl transition-all duration-200 text-sm font-bold shadow-lg shadow-yellow-900/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-yellow-900/40 active:scale-[0.98]"
                >
                    {isLoading ? 'Menambahkan...' : 'Simpan Emas'}
                </button>
            </div>
        </form>
    );
}
