import { useState, useEffect } from 'react';
import Modal from './Modal';
import { useLanguage } from '../lib/languageContext';
import { formatIDR, formatUSD, normalizeNumberInput } from '../lib/utils';
import { FiRefreshCw, FiDollarSign, FiActivity, FiTrendingUp } from 'react-icons/fi';

export default function EditAssetModal({ isOpen, onClose, asset, onSave, type, exchangeRate }) {
    const { t } = useLanguage();

    // Form State
    const [ticker, setTicker] = useState('');
    const [broker, setBroker] = useState('');
    const [market, setMarket] = useState('IDX');
    const [amount, setAmount] = useState('');
    const [avgPrice, setAvgPrice] = useState(''); // Native Avg Price
    const [avgPriceIDR, setAvgPriceIDR] = useState(''); // Calculated/Input IDR
    const [avgPriceUSD, setAvgPriceUSD] = useState(''); // Calculated/Input USD
    const [note, setNote] = useState('');
    const [currentPrice, setCurrentPrice] = useState(0);
    const [manualCurrentPrice, setManualCurrentPrice] = useState('');
    const [manualCurrentPriceIDR, setManualCurrentPriceIDR] = useState('');
    const [manualCurrentPriceUSD, setManualCurrentPriceUSD] = useState('');
    const [inputCurrency, setInputCurrency] = useState('NATIVE');

    // Derived State for Display
    const [totalValueIDR, setTotalValueIDR] = useState(0);

    // Initialize form when asset changes
    useEffect(() => {
        if (asset && isOpen) {
            setTicker((type === 'stock' || type === 'cash') ? asset.ticker : asset.symbol);
            setBroker(type === 'stock' ? (asset.broker || '') : (type === 'crypto' ? (asset.exchange || '') : ''));
            setMarket(asset.market || 'IDX');

            const qty = type === 'stock' ? asset.lots : asset.amount;
            setAmount(qty ? qty.toString() : '');

            // Initialize Avg Prices
            const price = parseFloat(asset.avgPrice) || 0;
            setAvgPrice(price.toString());

            // Determine Native Currency of Asset
            const isUSD = type === 'crypto' || (type === 'stock' && asset.market === 'US');

            if (isUSD) {
                setAvgPriceUSD(price.toString());
                setAvgPriceIDR((price * exchangeRate).toString());
            } else {
                setAvgPriceIDR(price.toString());
                setAvgPriceUSD(exchangeRate ? (price / exchangeRate).toString() : '0');
            }

            setCurrentPrice(asset.currentPrice || 0);

            // Load manual price if asset uses manual pricing
            if (asset.useManualPrice && asset.manualPrice) {
                setManualCurrentPrice(asset.manualPrice.toString());
                if (isUSD) {
                    setManualCurrentPriceUSD(asset.manualPrice.toString());
                    setManualCurrentPriceIDR(exchangeRate ? (asset.manualPrice * exchangeRate).toString() : '0');
                } else {
                    setManualCurrentPriceIDR(asset.manualPrice.toString());
                    setManualCurrentPriceUSD(exchangeRate ? (asset.manualPrice / exchangeRate).toString() : '0');
                }
            } else {
                setManualCurrentPrice('');
                setManualCurrentPriceIDR('');
                setManualCurrentPriceUSD('');
            }
            setNote(asset.note || '');
        }
    }, [asset, isOpen, type, exchangeRate]);

    // Handle Avg Price Changes
    const handleAvgPriceChange = (val, currency) => {
        const num = parseFloat(normalizeNumberInput(val));
        if (isNaN(num)) {
            if (currency === 'IDR') setAvgPriceIDR(val);
            else setAvgPriceUSD(val);
            return;
        }

        if (currency === 'IDR') {
            setAvgPriceIDR(val);
            // Auto-calc USD
            if (exchangeRate) setAvgPriceUSD((num / exchangeRate).toString());
            // If asset is IDR based, set main avgPrice
            if (market === 'IDX' && type === 'stock') setAvgPrice(val);
            // If asset is USD based, calculate back
            else if (exchangeRate) setAvgPrice((num / exchangeRate).toString());
        } else {
            setAvgPriceUSD(val);
            // Auto-calc IDR
            if (exchangeRate) setAvgPriceIDR((num * exchangeRate).toString());
            // If asset is USD based, set main avgPrice
            if (type === 'crypto' || market === 'US') setAvgPrice(val);
            // If asset is IDR based (rare for USD input), calculate back
            else if (exchangeRate) setAvgPrice((num * exchangeRate).toString());
        }
    };

    const handleManualPriceChange = (val, currency) => {
        const num = parseFloat(normalizeNumberInput(val));
        if (isNaN(num)) {
            if (currency === 'IDR') setManualCurrentPriceIDR(val);
            else setManualCurrentPriceUSD(val);
            return;
        }

        if (currency === 'IDR') {
            setManualCurrentPriceIDR(val);
            if (exchangeRate) setManualCurrentPriceUSD((num / exchangeRate).toString());
            // Set main state
            if (market === 'IDX' && type === 'stock') setManualCurrentPrice(val);
            else if (exchangeRate) setManualCurrentPrice((num / exchangeRate).toString());
        } else {
            setManualCurrentPriceUSD(val);
            if (exchangeRate) setManualCurrentPriceIDR((num * exchangeRate).toString());
            // Set main state
            if (type === 'crypto' || market === 'US') setManualCurrentPrice(val);
            else if (exchangeRate) setManualCurrentPrice((num * exchangeRate).toString());
        }
    };

    // Calculate Total Value whenever amount or price changes
    useEffect(() => {
        const qty = parseFloat(normalizeNumberInput(amount)) || 0;

        // Use Manual Price if set, else Live Price
        const activePrice = manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : currentPrice;

        let valIDR = 0;
        let shareCount = qty;

        if (type === 'stock') {
            shareCount = market === 'US' ? qty : qty * 100;
            if (asset?.currency === 'IDR' || (market === 'IDX')) {
                valIDR = shareCount * activePrice;
            } else {
                const valUSD = shareCount * activePrice;
                valIDR = exchangeRate ? valUSD * exchangeRate : 0;
            }
        } else if (type === 'cash') {
            valIDR = qty; // For cash, amount is value
        } else { // Crypto
            const valUSD = qty * activePrice;
            valIDR = exchangeRate ? valUSD * exchangeRate : 0;
        }

        setTotalValueIDR(valIDR);

    }, [amount, currentPrice, manualCurrentPrice, market, type, exchangeRate, asset]);

    const handleSave = () => {
        const newAmount = parseFloat(normalizeNumberInput(amount));
        let newAvgPrice = parseFloat(normalizeNumberInput(avgPrice));

        // Ensure we save the correct avgPrice based on market
        if (market === 'IDX' && type === 'stock') {
            newAvgPrice = parseFloat(normalizeNumberInput(avgPriceIDR));
        } else {
            newAvgPrice = parseFloat(normalizeNumberInput(avgPriceUSD));
        }

        if (isNaN(newAmount) || newAmount < 0) return;

        // Construct update object cleanly
        const updatedAsset = {
            ...asset,
            lots: type === 'stock' ? newAmount : (asset.lots || 0),
            amount: type === 'stock' ? (asset.amount || 0) : newAmount,
            avgPrice: type === 'cash' ? 1 : newAvgPrice,
            broker: type === 'stock' ? broker : undefined,
            exchange: type === 'crypto' ? broker : undefined,
            // Save manual price settings
            useManualPrice: manualCurrentPrice ? true : false,
            manualPrice: manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : null,
            currentPrice: manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : asset.currentPrice
        };

        // Clean up undefined/stock specific fields for crypto if strictly needed, 
        // but 'lots' being present in crypto usually doesn't hurt.
        // However, to be cleaner:
        if (type === 'crypto') delete updatedAsset.lots;
        if (type === 'stock') delete updatedAsset.amount;

        onSave(updatedAsset);
        onClose();
    };

    const handleResetToMarket = () => {
        setManualCurrentPrice('');
        setManualCurrentPriceIDR('');
        setManualCurrentPriceUSD('');
        // The actual reset will happen on save
    };



    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${type === 'cash' ? t('balance') : t('asset')}`} type="default">
            <div className="space-y-5 font-sans">

                {/* Type Indicator - Hidden for simplicity or static */}

                {/* Ticker Display */}
                <div className="bg-gray-100 dark:bg-[#0d1117] p-4 rounded-2xl border border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                            {type === 'cash' ? t('bankAndWalletShort') : t('asset')}
                        </label>
                        <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{ticker}</div>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${type === 'stock' ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : type === 'cash' ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'}`}>
                        {type === 'stock' ? <FiTrendingUp /> : type === 'cash' ? <FiDollarSign /> : <FiActivity />}
                    </div>
                </div>

                {type !== 'cash' && (
                    <>
                        {/* Broker/Exchange */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
                                {t('brokerExchange')}
                            </label>
                            <input
                                type="text"
                                name="broker"
                                id="asset-broker"
                                value={broker}
                                onChange={(e) => setBroker(e.target.value)}
                                className="w-full px-4 py-3 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder-gray-500 dark:placeholder-gray-700 font-medium"
                                placeholder={type === 'stock' ? t('brokerPlaceholderStock') : t('brokerPlaceholderCrypto')}
                            />
                        </div>

                        {/* Market Radio - REMOVED as per request */}
                    </>
                )}

                <div className="grid grid-cols-2 gap-4">
                    {/* Quantity / Saldo */}
                    <div className={type === 'cash' ? "col-span-2" : ""}>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
                            {type === 'cash' ? `${t('balance')} (IDR)` : (type === 'stock' && market === 'IDX' ? t('unitLot') : t('unit'))}
                        </label>
                        <input
                            type="text"
                            name="amount"
                            id="asset-amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-3 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-800 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all font-mono"
                        />
                    </div>

                    {/* Manual Price Override - Dual Currency */}
                    {type !== 'cash' && (
                        <div className="col-span-2 grid grid-cols-2 gap-4 bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-xl border border-yellow-200 dark:border-yellow-900/30">
                            <div className="col-span-2 flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-yellow-700 dark:text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                                    {t('manualPriceSettingOptional')}
                                </label>
                                {manualCurrentPrice && (
                                    <button
                                        type="button"
                                        onClick={handleResetToMarket}
                                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-500 font-medium flex items-center gap-1"
                                    >
                                        <FiRefreshCw className="w-3 h-3" /> {t('resetToMarket')}
                                    </button>
                                )}
                            </div>

                            {/* IDR Input */}
                            <div>
                                <label className="block text-[10px] text-gray-500 mb-1">{t('priceIDR')}</label>
                                <input
                                    type="text"
                                    name="manualPriceIDR"
                                    id="manual-price-idr"
                                    value={manualCurrentPriceIDR}
                                    onChange={(e) => handleManualPriceChange(e.target.value, 'IDR')}
                                    placeholder={market === 'IDX' && currentPrice ? formatIDR(currentPrice) : "0"}
                                    className="w-full px-3 py-2 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono focus:ring-1 focus:ring-yellow-500"
                                />
                            </div>

                            {/* USD Input */}
                            {(market === 'US' || type === 'crypto') && (
                                <div>
                                    <label className="block text-[10px] text-gray-500 mb-1">{t('priceUSD')}</label>
                                    <input
                                        type="text"
                                        name="manualPriceUSD"
                                        id="manual-price-usd"
                                        value={manualCurrentPriceUSD}
                                        onChange={(e) => handleManualPriceChange(e.target.value, 'USD')}
                                        placeholder={currentPrice ? formatUSD(currentPrice) : "0"}
                                        className="w-full px-3 py-2 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-mono focus:ring-1 focus:ring-yellow-500"
                                    />
                                </div>
                            )}

                            {asset?.useManualPrice && !manualCurrentPrice && (
                                <p className="col-span-2 text-[10px] text-yellow-600 dark:text-yellow-500 mt-1">
                                    {t('manualModeWarning')}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Avg Price Inputs - Separated columns */}
                {type !== 'cash' && (
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-[#0d1117] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                        {/* Avg Price IDR */}
                        <div className={(market === 'US' || type === 'crypto') ? "" : "col-span-2"}>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                {t('avgPrice')} (IDR)
                            </label>
                            <input
                                type="text"
                                name="avgPriceIDR"
                                id="avg-price-idr"
                                value={avgPriceIDR}
                                onChange={(e) => handleAvgPriceChange(e.target.value, 'IDR')}
                                className="w-full px-3 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                            {market === 'IDX' && type === 'stock' && (
                                <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500 italic">
                                    *Hanya tersedia dalam IDR untuk Saham Indonesia
                                </p>
                            )}
                        </div>

                        {/* Avg Price USD - Only for US/Crypto */}
                        {(market === 'US' || type === 'crypto') && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                                    {t('avgPrice')} (USD)
                                </label>
                                <input
                                    type="text"
                                    name="avgPriceUSD"
                                    id="avg-price-usd"
                                    value={avgPriceUSD}
                                    onChange={(e) => handleAvgPriceChange(e.target.value, 'USD')}
                                    className="w-full px-3 py-2 bg-white dark:bg-[#161b22] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Value Preview */}
                <div className="bg-gray-100 dark:bg-[#0d1117] rounded-2xl p-4 border border-gray-200 dark:border-gray-800 space-y-3">
                    {type !== 'cash' && (
                        <div className="flex justify-between items-center pb-3 border-b border-gray-200 dark:border-gray-800/50">
                            <span className="text-xs text-gray-500 font-medium">{t('usedPrice')}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                    {(market === 'US' || type === 'crypto')
                                        ? formatUSD(manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : currentPrice)
                                        : formatIDR(manualCurrentPrice ? parseFloat(normalizeNumberInput(manualCurrentPrice)) : currentPrice)
                                    }
                                </span>
                                {!manualCurrentPrice && <FiRefreshCw className="text-blue-500 w-3 h-3 animate-pulse" />}
                                {manualCurrentPrice && <span className="text-[10px] text-yellow-600 dark:text-yellow-500 font-bold bg-yellow-100 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">{t('manual')}</span>}
                            </div>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-xs text-gray-500 font-medium">{t('estTotalValue')}</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                            {formatIDR(totalValueIDR)}
                        </span>
                    </div>
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                    <FiDollarSign className="w-5 h-5" />
                    {t('saveChanges')}
                </button>

            </div>
        </Modal>
    );
}

function formatNumberForDisplay(value, currency) {
    if (value === undefined || value === null) return '0';
    if (currency === 'USD') return formatUSD(value);
    return formatIDR(value);
}
