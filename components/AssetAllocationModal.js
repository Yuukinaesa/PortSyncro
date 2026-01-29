import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { useLanguage } from '../lib/languageContext';
import { formatIDR, formatUSD } from '../lib/utils';
import { FiPieChart, FiTrendingUp, FiTarget, FiFilter } from 'react-icons/fi';

export default function AssetAllocationModal({ isOpen, onClose, assets, prices, exchangeRate, hideBalance }) {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState('all'); // all, stock, crypto, gold, cash
    const [calculationBasis, setCalculationBasis] = useState('total'); // 'total' or 'category'

    const getMasked = (val) => {
        if (hideBalance) return '•••••••';
        return val;
    };

    const allocationData = useMemo(() => {
        if (!assets) return { items: [], totalValue: 0 };

        let allItems = [];

        // Helper to process assets
        const processAsset = (asset, type) => {
            const isStock = type === 'stock';
            const isCash = type === 'cash';
            const isGold = type === 'gold';
            const market = asset.market || 'IDX';
            const symbol = isStock ? (market === 'US' ? asset.ticker : `${asset.ticker}.JK`) : (isGold ? (asset.ticker || 'GOLD') : asset.symbol);

            // Determine price
            let price = 0;
            if (isCash) {
                price = 1;
            } else if (isGold) {
                price = asset.currentPrice || 0;
            } else if (asset.useManualPrice || asset.isManual) {
                price = asset.manualPrice || asset.price || asset.avgPrice || 0;
            } else {
                const priceData = prices[symbol];
                price = priceData ? priceData.price : (asset.currentPrice || 0);
            }

            // Calculate Value in IDR
            let valueIDR = 0;
            const amount = isStock ? (market === 'US' ? parseFloat(asset.lots) : parseFloat(asset.lots) * 100) : parseFloat(asset.amount);

            if (isStock && market === 'US') {
                valueIDR = price * amount * (exchangeRate || 16000);
            } else if (type === 'crypto') {
                valueIDR = price * amount * (exchangeRate || 16000);
            } else {
                // IDR based (IDX Stock, Cash, Gold)
                valueIDR = price * amount;
            }

            // Identify Name
            let name = asset.ticker || asset.symbol;
            if (type === 'gold') name = asset.broker || asset.brand || name;

            return {
                name,
                type,
                ticker: asset.ticker || asset.symbol,
                valueIDR,
                amount
            };
        };

        // Process all types
        if (assets.stocks) assets.stocks.forEach(a => allItems.push(processAsset(a, 'stock')));
        if (assets.crypto) assets.crypto.forEach(a => allItems.push(processAsset(a, 'crypto')));
        if (assets.gold) assets.gold.forEach(a => allItems.push(processAsset(a, 'gold')));
        if (assets.cash) assets.cash.forEach(a => allItems.push(processAsset(a, 'cash')));

        // Calculate Total Portfolio Value
        const totalPortfolioValue = allItems.reduce((acc, item) => acc + item.valueIDR, 0);

        // Group by Ticker
        const grouped = {};
        allItems.forEach(item => {
            const key = `${item.type}-${item.ticker}`;
            if (!grouped[key]) {
                grouped[key] = { ...item };
            } else {
                grouped[key].valueIDR += item.valueIDR;
                grouped[key].amount += item.amount;
            }
        });

        // Convert to array
        let consolidatedItems = Object.values(grouped);

        // Sort by Value Descending
        consolidatedItems.sort((a, b) => b.valueIDR - a.valueIDR);

        return {
            items: consolidatedItems,
            totalValue: totalPortfolioValue
        };
    }, [assets, prices, exchangeRate]);

    const displayItems = useMemo(() => {
        let filtered = allocationData.items;

        if (activeTab !== 'all') {
            filtered = allocationData.items.filter(item => item.type === activeTab);
        }

        // Calculate denominator
        let denominator = allocationData.totalValue;
        if (activeTab !== 'all' && calculationBasis === 'category') {
            denominator = filtered.reduce((acc, item) => acc + item.valueIDR, 0);
        }

        // Re-calculate percentages based on the denominator
        return filtered.map(item => ({
            ...item,
            percentage: denominator > 0 ? (item.valueIDR / denominator) * 100 : 0
        }));

    }, [allocationData, activeTab, calculationBasis]);

    // For progress bar scaling
    const maxPercentage = useMemo(() => {
        if (!displayItems || displayItems.length === 0) return 0;
        return Math.max(...displayItems.map(i => i.percentage));
    }, [displayItems]);

    // Calculate current category total for display in header
    const currentCategoryTotal = useMemo(() => {
        if (activeTab === 'all') return allocationData.totalValue;
        return displayItems.reduce((acc, item) => acc + item.valueIDR, 0);
    }, [activeTab, allocationData.totalValue, displayItems]);

    if (!isOpen) return null;

    return (
        <Modal type="default" isOpen={isOpen} onClose={onClose} title="Alokasi Aset">
            <div className="space-y-6 font-sans">

                {/* Total Value Header */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-xs text-blue-600 dark:text-blue-300 font-bold uppercase tracking-wider">
                            {activeTab === 'all' ? 'Total Portfolio' : `Total ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`}
                        </p>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                            {getMasked(formatIDR(currentCategoryTotal))}
                        </h2>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-300">
                        <FiPieChart className="w-5 h-5" />
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col gap-4">
                    {/* Category Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {['all', 'stock', 'crypto', 'gold', 'cash'].map(type => (
                            <button
                                key={type}
                                onClick={() => {
                                    setActiveTab(type);
                                    // If switching to 'all', force calculation basis to 'total' as 'category' makes no sense
                                    if (type === 'all') setCalculationBasis('total');
                                }}
                                className={`
                                    px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all
                                    ${activeTab === type
                                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-md transform scale-105'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
                                `}
                            >
                                {type === 'all' ? 'Semua' : type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Calculation Basis Toggle - Only show if not 'all' */}
                    {activeTab !== 'all' && (
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                            <button
                                onClick={() => setCalculationBasis('total')}
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${calculationBasis === 'total'
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                            >
                                % dari Total Porto
                            </button>
                            <button
                                onClick={() => setCalculationBasis('category')}
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all ${calculationBasis === 'category'
                                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                            >
                                % dari Kategori
                            </button>
                        </div>
                    )}
                </div>

                {/* Allocation List */}
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {displayItems.map((item, idx) => (
                        <div key={idx} className="bg-white dark:bg-[#161b22] border border-gray-100 dark:border-gray-800 rounded-xl p-3 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                    <div className={`
                                        w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white
                                        ${item.type === 'stock' ? 'bg-blue-600' :
                                            item.type === 'crypto' ? 'bg-purple-600' :
                                                item.type === 'gold' ? 'bg-yellow-600' : 'bg-green-600'}
                                    `}>
                                        {(item.ticker || item.name).substring(0, 1)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">{item.ticker || item.name}</h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 uppercase font-semibold bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                {item.type}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-gray-900 dark:text-white text-sm">{getMasked(formatIDR(item.valueIDR))}</p>
                                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                        {item.percentage.toFixed(2)}%
                                    </p>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${item.type === 'stock' ? 'bg-blue-500' : item.type === 'crypto' ? 'bg-purple-500' : item.type === 'gold' ? 'bg-yellow-500' : 'bg-green-500'}`}
                                    style={{ width: `${(item.percentage / (calculationBasis === 'total' && activeTab === 'all' ? Math.max(1, allocationData.items[0]?.percentage) : maxPercentage)) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}

                    {displayItems.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                            <p>Tidak ada aset dalam kategori ini.</p>
                        </div>
                    )}
                </div>

            </div>
        </Modal>
    );
}
