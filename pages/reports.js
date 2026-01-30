import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/authContext';
import { useTheme } from '../lib/themeContext';
import { useLanguage } from '../lib/languageContext';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, where, limit, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { usePortfolioState } from '../lib/usePortfolioState';
import { FiArrowLeft, FiCalendar, FiDownload, FiTrendingUp, FiTrendingDown, FiActivity, FiInfo, FiCamera, FiCheck, FiX, FiFileText } from 'react-icons/fi';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { formatIDR, formatUSD, formatQuantity } from '../lib/utils';
import { format, subDays, parseISO, isWithinInterval } from 'date-fns';
import { id, enUS } from 'date-fns/locale';
import { secureLogger } from '../lib/security';
import Modal from '../components/Modal';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

/**
 * Helper: Calculate invested amount from portfolio snapshot, EXCLUDING cash/bank
 * This ensures consistency with Portfolio main page which doesn't count bank as invested capital
 * @param {Object} item - History snapshot item with portfolio data
 * @returns {number} Total invested in IDR (excluding cash)
 */
function calculateInvestedExcludingCash(item) {
    // If we have portfolio breakdown, calculate from the portfolio data (more accurate)
    if (item.portfolio) {
        const { stocks, crypto, gold } = item.portfolio;
        // Note: Cash is intentionally EXCLUDED from invested calculation
        const stocksInvested = (stocks || []).reduce((sum, s) => sum + (s.totalCostIDR || s.totalCost || 0), 0);
        const cryptoInvested = (crypto || []).reduce((sum, c) => sum + (c.totalCostIDR || c.totalCost || 0), 0);
        const goldInvested = (gold || []).reduce((sum, g) => sum + (g.totalCost || 0), 0);
        return stocksInvested + cryptoInvested + goldInvested;
    }

    // Fallback: Use stored totalInvestedIDR if no portfolio breakdown available
    // Note: This may include cash for old snapshots, but there's no way to fix without portfolio data
    return item.totalInvestedIDR || 0;
}

/**
 * Helper: Calculate portfolio VALUE excluding cash/bank (for P/L calculation)
 * P/L should only be calculated on investments (Stocks, Crypto, Gold), not on cash
 * @param {Object} item - History snapshot item with portfolio data
 * @returns {number} Total value in IDR (excluding cash)
 */
function calculateValueExcludingCash(item) {
    // If we have portfolio breakdown, calculate from the portfolio data
    if (item.portfolio) {
        const { stocks, crypto, gold } = item.portfolio;
        // Note: Cash is intentionally EXCLUDED from value for P/L calculation
        const stocksValue = (stocks || []).reduce((sum, s) => sum + (s.portoIDR || s.porto || 0), 0);
        const cryptoValue = (crypto || []).reduce((sum, c) => sum + (c.portoIDR || 0), 0);
        const goldValue = (gold || []).reduce((sum, g) => sum + (g.portoIDR || g.porto || 0), 0);
        return stocksValue + cryptoValue + goldValue;
    }

    // Fallback: Use stored totalValueIDR minus any cash we can calculate
    // This is less accurate but better than nothing
    if (item.portfolio?.cash) {
        const cashValue = (item.portfolio.cash || []).reduce((sum, c) => sum + (c.portoIDR || c.porto || c.amount || 0), 0);
        return (item.totalValueIDR || 0) - cashValue;
    }

    return item.totalValueIDR || 0;
}

export default function Reports() {
    const router = useRouter();
    const { user, loading: authLoading, getUserPortfolio } = useAuth();
    const { isDarkMode } = useTheme();
    const { t, language } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [historyData, setHistoryData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA'), // First day of current month (Local)
        end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString('en-CA') // Last day of current month (Local)
    });
    const [currency, setCurrency] = useState('IDR'); // IDR or USD view
    const [snapshotLoading, setSnapshotLoading] = useState(false);
    const [notification, setNotification] = useState(null);

    // Use Portfolio State to ensure consistency with Dashboard
    const { assets, initialize: initializePortfolio, updatePrices } = usePortfolioState();

    // Initialize Portfolio State (loads assets)
    useEffect(() => {
        const loadPortfolio = async () => {
            if (user && getUserPortfolio) {
                try {
                    const portfolio = await getUserPortfolio();
                    initializePortfolio(portfolio);
                } catch (err) {
                    console.error("Error initializing portfolio state:", err);
                }
            }
        };
        loadPortfolio();
    }, [user, getUserPortfolio, initializePortfolio]);

    // Fetch History Data
    useEffect(() => {
        const fetchHistory = async () => {
            if (!user) return;

            try {
                setLoading(true);
                const historyRef = collection(db, 'users', user.uid, 'history');
                const q = query(historyRef, orderBy('date', 'asc'));
                const snapshot = await getDocs(q);

                const data = snapshot.docs.map(doc => ({
                    ...doc.data(),
                    id: doc.id
                }));

                setHistoryData(data);
            } catch (error) {
                secureLogger.error("Error fetching history:", error);
            } finally {
                setLoading(false);
            }
        };

        if (!authLoading && user) {
            fetchHistory();
        } else if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    // Helper to clean undefined values for Firestore
    const cleanUndefinedValues = (obj) => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) {
            return obj.map(cleanUndefinedValues).filter(item => item !== undefined);
        }
        if (typeof obj === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(obj)) {
                if (value !== undefined) {
                    cleaned[key] = cleanUndefinedValues(value);
                }
            }
            return cleaned;
        }
        return obj;
    };

    // Capture Daily Snapshot - MATCHING DASHBOARD LOGIC
    const captureSnapshot = useCallback(async () => {
        if (!user) {
            setNotification({
                type: 'error',
                title: language === 'en' ? 'Error' : 'Gagal',
                message: language === 'en' ? 'Please login first' : 'Silakan login terlebih dahulu'
            });
            return;
        }

        setSnapshotLoading(true);

        try {
            // 1. Ensure we have Assets
            if (!assets) {
                throw new Error("Portfolio data not ready");
            }

            const stocks = assets.stocks || [];
            const crypto = assets.crypto || [];
            const gold = assets.gold || [];
            const cash = assets.cash || [];

            // 2. Fetch LIVE PRICES (Critical for accuracy)
            console.log('[MANUAL SNAPSHOT] Fetching live prices...');

            // Prepare Tickers
            const stockTickers = stocks.filter(stock => stock.ticker && stock.lots > 0).map(stock => {
                if (stock.market === 'US') return stock.ticker;
                const cleanTicker = stock.ticker.trim().toUpperCase();
                return cleanTicker.endsWith('.JK') ? cleanTicker : `${cleanTicker}.JK`;
            });

            const cryptoSymbols = crypto
                .filter(c => c.symbol && c.symbol.trim() && c.symbol.toUpperCase() !== 'INVALID')
                .map(c => c.symbol);

            let fetchedPrices = {};
            let fetchedExchangeRate = 16000;

            if (stockTickers.length > 0 || cryptoSymbols.length > 0) {
                const token = await user.getIdToken();
                const response = await fetch('/api/prices', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        stocks: stockTickers,
                        crypto: cryptoSymbols,
                        gold: gold.length > 0,
                        userId: user.uid
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    fetchedPrices = data.prices || {};
                    // Update local state primarily, but we use fetchedPrices variable for calculation to be safe
                    updatePrices(fetchedPrices);
                } else {
                    console.warn('[MANUAL SNAPSHOT] Failed to fetch prices, using stored/empty values');
                }
            }

            // Fetch Exchange Rate
            try {
                const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                if (rateRes.ok) {
                    const rateData = await rateRes.json();
                    fetchedExchangeRate = rateData.rates.IDR || 16000;
                }
            } catch (e) {
                console.error("Error fetching rate:", e);
            }

            const safeExchangeRate = fetchedExchangeRate;
            const prices = fetchedPrices;

            // 3. Calculate Values (EXACT DASHBOARD LOGIC)

            // Calculate STOCKS
            let stocksValueIDR = 0;
            let stocksValueUSD = 0;
            let stocksInvestedIDR = 0;
            const enrichedStocks = stocks.map(stock => {
                const priceKey = stock.market === 'US' ? stock.ticker : `${stock.ticker}.JK`;
                const realtimePrice = prices[priceKey];
                let currentPrice = stock.entryPrice || 0;
                if (realtimePrice && realtimePrice.price) {
                    currentPrice = realtimePrice.price;
                }

                const shareCount = stock.market === 'US' ? (stock.lots || 0) : (stock.lots || 0) * 100;
                const avgPrice = stock.avgPrice || stock.entryPrice || 0;

                let portoIDR, portoUSD, totalCostIDR;
                if (stock.market === 'US') {
                    const valueUSD = currentPrice * shareCount;
                    portoUSD = valueUSD;
                    portoIDR = valueUSD * safeExchangeRate;
                    totalCostIDR = avgPrice * shareCount * safeExchangeRate;
                } else {
                    const valueIDR = currentPrice * shareCount;
                    portoIDR = valueIDR;
                    portoUSD = valueIDR / safeExchangeRate;
                    totalCostIDR = avgPrice * shareCount;
                }

                // Add to totals
                if (stock.market === 'US') {
                    stocksValueUSD += portoUSD;
                    stocksValueIDR += portoIDR;
                    stocksInvestedIDR += totalCostIDR;
                } else {
                    stocksValueIDR += portoIDR;
                    stocksValueUSD += portoUSD;
                    stocksInvestedIDR += totalCostIDR;
                }

                return {
                    ...stock,
                    currentPrice,
                    porto: portoIDR,
                    portoIDR: Math.round(portoIDR),
                    portoUSD: Math.round(portoUSD * 100) / 100,
                    totalCost: totalCostIDR,
                    totalCostIDR: Math.round(totalCostIDR)
                };
            });

            // Calculate CRYPTO
            let cryptoValueIDR = 0;
            let cryptoValueUSD = 0;
            let cryptoInvestedIDR = 0;
            const enrichedCrypto = crypto.map(c => {
                let price;
                if ((c.useManualPrice || c.isManual) && (c.manualPrice || c.price || c.avgPrice)) {
                    price = c.manualPrice || c.price || c.avgPrice;
                } else {
                    price = prices[c.symbol]?.price || c.currentPrice || 0;
                }

                const amount = parseFloat(c.amount) || 0;
                const avgPrice = c.avgPrice || c.entryPrice || 0;

                const valUSD = price * amount;
                const portoIDR = valUSD * safeExchangeRate;
                const totalCostIDR = avgPrice * amount * safeExchangeRate;

                cryptoValueUSD += valUSD;
                cryptoValueIDR += portoIDR;
                cryptoInvestedIDR += totalCostIDR;

                return {
                    ...c,
                    currentPrice: price,
                    porto: valUSD,
                    portoUSD: Math.round(valUSD * 100) / 100,
                    portoIDR: Math.round(portoIDR),
                    totalCost: avgPrice * amount,
                    totalCostIDR: Math.round(totalCostIDR)
                };
            });

            // Calculate GOLD
            let goldValueIDR = 0;
            let goldValueUSD = 0;
            let goldInvestedIDR = 0;
            const enrichedGold = gold.map(g => {
                const price = g.currentPrice || 0;
                const amount = parseFloat(g.weight) || 0;
                const avgPrice = g.avgPrice || g.entryPrice || 0;

                const valIDR = price * amount;
                const totalCostIDR = avgPrice * amount;

                goldValueIDR += valIDR;
                goldValueUSD += valIDR / safeExchangeRate;
                goldInvestedIDR += totalCostIDR;

                return {
                    ...g,
                    porto: valIDR,
                    portoIDR: Math.round(valIDR),
                    portoUSD: Math.round((valIDR / safeExchangeRate) * 100) / 100,
                    totalCost: totalCostIDR,
                    totalCostIDR: Math.round(totalCostIDR)
                };
            });

            // Calculate CASH
            let cashValueIDR = 0;
            let cashValueUSD = 0;
            const enrichedCash = cash.map(c => {
                const amount = parseFloat(c.amount) || 0;
                let portoIDR, portoUSD;
                if (c.currency === 'USD') {
                    portoUSD = amount;
                    portoIDR = amount * safeExchangeRate;
                    cashValueUSD += portoUSD;
                    cashValueIDR += portoIDR;
                } else {
                    portoIDR = amount;
                    portoUSD = amount / safeExchangeRate;
                    cashValueIDR += portoIDR;
                    cashValueUSD += portoUSD;
                }
                return {
                    ...c,
                    porto: portoIDR,
                    portoIDR: Math.round(portoIDR),
                    portoUSD: Math.round(portoUSD * 100) / 100
                };
            });

            // Total Sums
            const totalValueIDR = stocksValueIDR + cryptoValueIDR + goldValueIDR + cashValueIDR;
            const totalValueUSD = stocksValueUSD + cryptoValueUSD + goldValueUSD + cashValueUSD;
            const totalInvestedIDR = stocksInvestedIDR + cryptoInvestedIDR + goldInvestedIDR;

            const enrichedPortfolio = {
                stocks: enrichedStocks,
                crypto: enrichedCrypto,
                gold: enrichedGold,
                cash: enrichedCash
            };

            // 4. Save to Firestore
            const today = new Date().toLocaleDateString('en-CA');
            const snapshotRef = doc(db, 'users', user.uid, 'history', today);

            const snapshotData = {
                date: today,
                totalValueIDR: Math.round(totalValueIDR),
                totalValueUSD: totalValueUSD,
                totalInvestedIDR: Math.round(totalInvestedIDR),
                timestamp: serverTimestamp(),
                portfolio: cleanUndefinedValues(enrichedPortfolio)
            };

            await setDoc(snapshotRef, snapshotData);

            // Refresh history list
            const historyRef = collection(db, 'users', user.uid, 'history');
            const q = query(historyRef, orderBy('date', 'asc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
            setHistoryData(data);

            setNotification({
                type: 'success',
                title: language === 'en' ? 'Success' : 'Berhasil',
                message: language === 'en' ? 'Snapshot saved successfully!' : 'Snapshot berhasil disimpan!'
            });

        } catch (error) {
            console.error('Error capturing snapshot:', error);
            setNotification({
                type: 'error',
                title: language === 'en' ? 'Error' : 'Gagal',
                message: (language === 'en' ? 'Failed to save snapshot: ' : 'Gagal menyimpan snapshot: ') + error.message
            });
        } finally {
            setSnapshotLoading(false);
        }
    }, [user, language, assets, updatePrices]);

    // Filter Data based on Range
    useEffect(() => {
        if (historyData.length > 0) {
            const filtered = historyData.filter(item => {
                return item.date >= dateRange.start && item.date <= dateRange.end;
            });
            setFilteredData(filtered);
        }
    }, [historyData, dateRange]);

    // Chart Data
    const chartData = useMemo(() => {
        const labels = filteredData.map(item => {
            const date = parseISO(item.date);
            return format(date, 'd MMM', { locale: language === 'en' ? enUS : id });
        });

        const values = filteredData.map(item => currency === 'IDR' ? item.totalValueIDR : item.totalValueUSD);

        return {
            labels,
            datasets: [
                {
                    label: currency === 'IDR' ? 'Total Value (IDR)' : 'Total Value (USD)',
                    data: values,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
                        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
                        return gradient;
                    },
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }
            ]
        };
    }, [filteredData, currency, language]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += currency === 'IDR' ? formatIDR(context.parsed.y) : formatUSD(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    color: isDarkMode ? '#9ca3af' : '#4b5563'
                }
            },
            y: {
                grid: {
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                    borderDash: [5, 5]
                },
                ticks: {
                    color: isDarkMode ? '#9ca3af' : '#4b5563',
                    callback: function (value) {
                        if (currency === 'IDR') {
                            // Shorten IDR (e.g. 1M, 10M)
                            if (value >= 1000000000) return (value / 1000000000).toFixed(1) + 'M';
                            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'Jt';
                            return value;
                        }
                        return value;
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    }), [currency, isDarkMode]);

    // Download History Log - CSV format, asset recap per date only
    const downloadCSV = () => {
        if (!filteredData || filteredData.length === 0) return;

        const csvRows = [];
        const escape = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;
        const fmtIDR = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const fmtQty = (n) => parseFloat(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 7 });

        // Header
        csvRows.push(['Date', 'Day', 'Total Value', 'Invested', 'Net Profit', 'P/L %', 'Type', 'Name', 'Platform', 'Quantity', 'Value']);

        [...filteredData].reverse().forEach(item => {
            const dateObj = parseISO(item.date);
            const dateStr = format(dateObj, 'd MMM yyyy');
            const dayStr = format(dateObj, 'EEEE', { locale: language === 'en' ? enUS : id });

            const invested = calculateInvestedExcludingCash(item);
            const valueExcl = calculateValueExcludingCash(item);
            const profit = valueExcl - invested;
            const pct = invested > 0 ? ((profit / invested) * 100).toFixed(1) + '%' : '0%';

            // Summary row
            csvRows.push([dateStr, dayStr, fmtIDR(item.totalValueIDR), fmtIDR(invested), (profit >= 0 ? '+' : '') + fmtIDR(profit), pct, '', '', '', '', '']);

            // Asset rows
            const addAssets = (assets, type) => {
                if (!assets?.length) return;
                assets.forEach(a => {
                    const name = type === 'stock' ? a.ticker : type === 'crypto' ? a.symbol : type === 'gold' ? (a.ticker || a.name) : (a.ticker || a.name);
                    const platform = a.broker || a.exchange || a.platform || '-';
                    const qty = type === 'stock' ? `${fmtQty(a.lots)} lot` : type === 'crypto' ? `${fmtQty(a.amount)} unit` : type === 'gold' ? `${fmtQty(a.amount || a.weight)}g` : fmtIDR(a.amount);
                    csvRows.push(['', '', '', '', '', '', type.toUpperCase(), name, platform, qty, fmtIDR(a.portoIDR)]);
                });
            };

            if (item.portfolio) {
                addAssets(item.portfolio.stocks, 'stock');
                addAssets(item.portfolio.crypto, 'crypto');
                addAssets(item.portfolio.gold, 'gold');
                addAssets(item.portfolio.cash, 'cash');
            }
        });

        const BOM = '\uFEFF';
        const csv = BOM + csvRows.map(r => r.map(escape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PortSyncro_History_${dateRange.start}_${dateRange.end}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Download Stats Summary CSV (Log button)
    const downloadTransactionsCSV = () => {
        if (!filteredData || filteredData.length === 0) {
            setNotification({
                type: 'info',
                title: language === 'en' ? 'No Data' : 'Tidak Ada Data',
                message: language === 'en' ? 'No snapshots in this date range.' : 'Tidak ada snapshot dalam rentang tanggal ini.'
            });
            return;
        }

        const fmtIDR = (n) => 'Rp' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const escape = (str) => `"${String(str ?? '').replace(/"/g, '""')}"`;

        // Calculate stats
        const values = filteredData.map(d => currency === 'IDR' ? d.totalValueIDR : d.totalValueUSD);
        const startVal = values[0] || 0;
        const endVal = values[values.length - 1] || 0;
        const netChange = endVal - startVal;
        const netChangePct = startVal > 0 ? (netChange / startVal) * 100 : 0;

        const latest = filteredData[filteredData.length - 1];
        const invested = calculateInvestedExcludingCash(latest);
        const valueExcl = calculateValueExcludingCash(latest);
        const totalProfit = valueExcl - invested;
        const totalProfitPct = invested > 0 ? (totalProfit / invested) * 100 : 0;

        const high = Math.max(...values);
        const low = Math.min(...values);

        const csvRows = [];
        csvRows.push(['PORTFOLIO STATS SUMMARY']);
        csvRows.push(['Date Range', `${dateRange.start} to ${dateRange.end}`]);
        csvRows.push(['Snapshots', filteredData.length]);
        csvRows.push([]);
        csvRows.push(['Metric', 'Value', 'Percentage']);
        csvRows.push(['Net Change', (netChange >= 0 ? '+' : '') + fmtIDR(netChange), (netChange >= 0 ? '+' : '') + netChangePct.toFixed(1) + '%']);
        csvRows.push(['Total Profit', (totalProfit >= 0 ? '+' : '') + fmtIDR(totalProfit), totalProfitPct.toFixed(1) + '%']);
        csvRows.push(['Highest (ATH)', fmtIDR(high), '🏆']);
        csvRows.push(['Lowest (ATL)', fmtIDR(low), '📉']);

        const BOM = '\uFEFF';
        const csv = BOM + csvRows.map(r => r.map(escape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `PortSyncro_Stats_${dateRange.start}_${dateRange.end}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Stats Calculation - EXCLUDE cash from BOTH value and invested for P/L (matches Portfolio main)
    const stats = useMemo(() => {
        if (filteredData.length === 0) return null;

        if (filteredData.length === 1) {
            const item = filteredData[0];
            const val = currency === 'IDR' ? item.totalValueIDR : item.totalValueUSD;

            // Calculate invested and value for single item - Exclude cash for P/L calculation
            const investedIDR = calculateInvestedExcludingCash(item);
            const valueExclCashIDR = calculateValueExcludingCash(item);

            let invested = 0;
            let valueForPL = 0;
            if (currency === 'IDR') {
                invested = investedIDR;
                valueForPL = valueExclCashIDR;
            } else {
                const implicitRate = (item.totalValueIDR > 0 && item.totalValueUSD > 0)
                    ? (item.totalValueIDR / item.totalValueUSD)
                    : 16000;
                invested = investedIDR > 0 ? (investedIDR / implicitRate) : 0;
                valueForPL = valueExclCashIDR > 0 ? (valueExclCashIDR / implicitRate) : 0;
            }

            // P/L = (Value without cash) - (Invested without cash)
            const grossChange = valueForPL - invested;
            const grossChangePct = invested > 0 ? (grossChange / invested) * 100 : 0;

            return {
                change: 0,
                changePct: 0,
                grossChange,
                grossChangePct,
                high: val,
                low: val
            };
        }

        const startVal = currency === 'IDR' ? filteredData[0].totalValueIDR : filteredData[0].totalValueUSD;
        const endVal = currency === 'IDR' ? filteredData[filteredData.length - 1].totalValueIDR : filteredData[filteredData.length - 1].totalValueUSD;
        const change = endVal - startVal;
        const changePct = startVal > 0 ? (change / startVal) * 100 : 0;

        // Find High/Low
        const values = filteredData.map(d => currency === 'IDR' ? d.totalValueIDR : d.totalValueUSD);
        const high = Math.max(...values);
        const low = Math.min(...values);

        // Gross Growth (Total Profit/Loss based on latest snapshot in range)
        // EXCLUDE cash from BOTH value and invested for P/L calculation
        const latest = filteredData[filteredData.length - 1];

        // Calculate latest invested and value - Exclude cash
        const latestInvestedIDR = calculateInvestedExcludingCash(latest);
        const latestValueExclCashIDR = calculateValueExcludingCash(latest);

        let latestInvested = 0;
        let latestValueForPL = 0;
        if (currency === 'IDR') {
            latestInvested = latestInvestedIDR;
            latestValueForPL = latestValueExclCashIDR;
        } else {
            // USD conversion
            const implicitRate = (latest.totalValueIDR > 0 && latest.totalValueUSD > 0)
                ? (latest.totalValueIDR / latest.totalValueUSD)
                : 16000;
            latestInvested = latestInvestedIDR > 0 ? (latestInvestedIDR / implicitRate) : 0;
            latestValueForPL = latestValueExclCashIDR > 0 ? (latestValueExclCashIDR / implicitRate) : 0;
        }

        // P/L = (Value without cash) - (Invested without cash)
        const grossChange = latestValueForPL - latestInvested;
        const grossChangePct = latestInvested > 0 ? (grossChange / latestInvested) * 100 : 0;

        return {
            change,
            changePct,
            grossChange,
            grossChangePct,
            high,
            low
        };
    }, [filteredData, currency]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-white font-sans">
            <Head>
                <title>{`${language === 'en' ? 'Portfolio Reports' : 'Laporan Portfolio'} | PortSyncro`}</title>
            </Head>

            {/* Header - Mobile Optimized */}
            <header className="sticky top-0 z-40 w-full bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 safe-area-padding">
                <div className="container mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 sm:gap-4">
                        <button
                            onClick={() => router.push('/')}
                            className="p-2.5 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors touch-target"
                            aria-label={language === 'en' ? 'Go back' : 'Kembali'}
                        >
                            <FiArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <div>
                            <h1 className="text-base sm:text-xl font-bold tracking-tight leading-tight">{language === 'en' ? 'Reports' : 'Laporan'}</h1>
                            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 hidden xs:block">{language === 'en' ? 'History & Analytics' : 'Riwayat & Analitik'}</p>
                        </div>
                    </div>

                    {/* Currency Toggle - Mobile Optimized */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 shadow-inner">
                        <button
                            onClick={() => setCurrency('IDR')}
                            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 ${currency === 'IDR'
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/25'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            IDR
                        </button>
                        <button
                            onClick={() => setCurrency('USD')}
                            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 ${currency === 'USD'
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/25'
                                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            USD
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-24 sm:pb-20">
                {/* Controls - Mobile Optimized */}
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 rounded-xl text-white shadow-md shadow-blue-500/25">
                                <FiCalendar className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <h2 className="font-bold text-sm sm:text-base">{language === 'en' ? 'Date Range' : 'Rentang Tanggal'}</h2>
                        </div>

                        {/* All Time Button - Desktop */}
                        <button
                            onClick={() => {
                                if (historyData.length > 0) {
                                    const earliest = historyData[0].date;
                                    const today = new Date().toISOString().split('T')[0];
                                    setDateRange({ start: earliest, end: today });
                                }
                            }}
                            className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all hover:scale-105 active:scale-95"
                        >
                            <FiCalendar className="w-4 h-4" />
                            All Time
                        </button>
                    </div>

                    {/* Date Inputs Row - Better mobile spacing */}
                    <div className="flex items-center gap-3 sm:gap-4 mb-4">
                        <div className="flex-1">
                            <label className="block text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                                {language === 'en' ? 'From' : 'Dari'}
                            </label>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                                className="w-full px-3 py-3 sm:py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium transition-all min-h-[48px] sm:min-h-[44px]"
                            />
                        </div>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 mt-5 flex-shrink-0">
                            <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
                                {language === 'en' ? 'To' : 'Sampai'}
                            </label>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                                className="w-full px-3 py-3 sm:py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-medium transition-all min-h-[48px] sm:min-h-[44px]"
                            />
                        </div>
                    </div>

                    {/* Action Buttons Row - Improved mobile grid */}
                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                        {/* All Time - Mobile Only */}
                        <button
                            onClick={() => {
                                if (historyData.length > 0) {
                                    const earliest = historyData[0].date;
                                    const today = new Date().toISOString().split('T')[0];
                                    setDateRange({ start: earliest, end: today });
                                }
                            }}
                            className="sm:hidden flex flex-col items-center justify-center gap-1 py-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all active:scale-95 min-h-[56px]"
                        >
                            <FiCalendar className="w-4 h-4" />
                            <span>All</span>
                        </button>

                        {/* Download History CSV */}
                        <button
                            onClick={downloadCSV}
                            disabled={!filteredData.length}
                            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2.5 sm:px-4 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] sm:text-xs font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px] sm:min-h-[44px]"
                            title="Download Portfolio History"
                        >
                            <FiDownload className="w-4 h-4" />
                            <span>History</span>
                        </button>

                        {/* Download Transactions CSV */}
                        <button
                            onClick={downloadTransactionsCSV}
                            disabled={snapshotLoading}
                            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2.5 sm:px-4 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl text-[10px] sm:text-xs font-semibold hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px] sm:min-h-[44px]"
                            title="Download Transaction Log"
                        >
                            <FiFileText className="w-4 h-4" />
                            <span>Log</span>
                        </button>

                        {/* Capture Snapshot */}
                        <button
                            onClick={captureSnapshot}
                            disabled={snapshotLoading}
                            className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-3 sm:py-2.5 sm:px-4 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[10px] sm:text-xs font-semibold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px] sm:min-h-[44px]"
                            title={language === 'en' ? 'Capture Snapshot' : 'Ambil Snapshot'}
                        >
                            {snapshotLoading ? (
                                <div className="w-4 h-4 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <FiCamera className="w-4 h-4" />
                            )}
                            <span>{language === 'en' ? 'Snap' : 'Snap'}</span>
                        </button>
                    </div>
                </div>

                {/* Stats Grid - Professional Design with improved mobile layout */}
                {stats && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {/* Net Change Card */}
                        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                <div className={`p-1.5 sm:p-2 rounded-lg ${stats.change >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                    {stats.change >= 0 ? (
                                        <FiTrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400" />
                                    ) : (
                                        <FiTrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400" />
                                    )}
                                </div>
                                <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                                    {language === 'en' ? 'Net Change' : 'Perubahan'}
                                </span>
                            </div>

                            <p className={`text-lg sm:text-xl lg:text-2xl font-bold truncate leading-tight ${stats.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {stats.change >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(stats.change, 0) : formatUSD(stats.change)}
                            </p>

                            <div className="mt-2 sm:mt-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold ${stats.changePct >= 0
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    }`}>
                                    {stats.changePct >= 0 ? '↑' : '↓'} {Math.abs(stats.changePct).toFixed(1)}%
                                </span>
                            </div>
                        </div>

                        {/* Total Profit Card */}
                        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                    <FiActivity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                                    {language === 'en' ? 'Total Profit' : 'Total Profit'}
                                </span>
                            </div>

                            <p className={`text-lg sm:text-xl lg:text-2xl font-bold truncate leading-tight ${stats.grossChange >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                {stats.grossChange >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(stats.grossChange, 0) : formatUSD(stats.grossChange)}
                            </p>

                            <div className="mt-2 sm:mt-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold ${stats.grossChangePct >= 0
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                    }`}>
                                    <FiActivity className="w-2.5 h-2.5" /> {Math.abs(stats.grossChangePct).toFixed(1)}%
                                </span>
                            </div>
                        </div>

                        {/* Highest Value Card */}
                        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                                    <FiTrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                                    {language === 'en' ? 'Highest' : 'Tertinggi'}
                                </span>
                            </div>

                            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white truncate leading-tight">
                                {currency === 'IDR' ? formatIDR(stats.high, 0) : formatUSD(stats.high)}
                            </p>

                            <div className="mt-2 sm:mt-3">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    🏆 ATH
                                </span>
                            </div>
                        </div>

                        {/* Lowest Value Card */}
                        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 transition-all hover:shadow-md">
                            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                <div className="p-1.5 sm:p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                                    <FiTrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400" />
                                </div>
                                <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                                    {language === 'en' ? 'Lowest' : 'Terendah'}
                                </span>
                            </div>

                            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white truncate leading-tight">
                                {currency === 'IDR' ? formatIDR(stats.low, 0) : formatUSD(stats.low)}
                            </p>

                            <div className="mt-2 sm:mt-3">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    📉 ATL
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Chart Section - Professional Design */}
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4 sm:mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                        <h3 className="text-sm sm:text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                            <div className="p-1.5 sm:p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400">
                                <FiActivity className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            {language === 'en' ? 'Portfolio Growth' : 'Pertumbuhan Portfolio'}
                        </h3>

                        {filteredData.length > 0 && (
                            <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                                {filteredData.length} {language === 'en' ? 'days' : 'hari'}
                            </span>
                        )}
                    </div>

                    <div className="h-[220px] sm:h-[350px] w-full">
                        {filteredData.length > 0 ? (
                            <Line data={chartData} options={chartOptions} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-4">
                                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <FiActivity className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                                </div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center">
                                    {language === 'en' ? 'No data available' : 'Tidak ada data'}
                                </p>
                                <p className="text-xs sm:text-sm mt-2 text-center max-w-[240px] sm:max-w-xs text-gray-500 dark:text-gray-500">
                                    {language === 'en' ? 'Capture a snapshot to start tracking.' : 'Ambil snapshot untuk mulai melacak.'}
                                </p>
                                <button
                                    onClick={captureSnapshot}
                                    disabled={snapshotLoading}
                                    className="mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs sm:text-sm font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all disabled:opacity-50"
                                >
                                    {snapshotLoading ? 'Loading...' : (language === 'en' ? 'Capture Now' : 'Ambil Sekarang')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* History Section - Professional Design */}
                <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <h3 className="text-sm sm:text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                            <div className="p-1.5 sm:p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                                <FiCalendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400" />
                            </div>
                            {language === 'en' ? 'History Log' : 'Riwayat Harian'}
                        </h3>
                        {filteredData.length > 0 && (
                            <span className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                                {filteredData.length} {language === 'en' ? 'snapshots' : 'snapshot'}
                            </span>
                        )}
                    </div>

                    {/* Mobile Card View - Hidden on sm and up */}
                    <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredData.length > 0 ? (
                            [...filteredData].reverse().map((item) => (
                                <MobileHistoryCard
                                    key={item.id}
                                    item={item}
                                    currency={currency}
                                    language={language}
                                />
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center text-gray-500">
                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <FiCalendar className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                                </div>
                                <p className="text-sm">{language === 'en' ? 'No history found' : 'Tidak ada riwayat'}</p>
                            </div>
                        )}
                    </div>

                    {/* Desktop Table View - Professional Design */}
                    <div className="hidden sm:block overflow-x-auto relative">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 w-12"></th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                            {language === 'en' ? 'Date' : 'Tanggal'}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                            {language === 'en' ? 'Total Value' : 'Total Nilai'}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                            {language === 'en' ? 'Invested' : 'Investasi'}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                                {filteredData.length > 0 ? (
                                    [...filteredData].reverse().map((item) => (
                                        <HistoryRow
                                            key={item.id}
                                            item={item}
                                            currency={currency}
                                            language={language}
                                            isDarkMode={isDarkMode}
                                        />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12">
                                            <div className="text-center">
                                                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center shadow-inner">
                                                    <FiCalendar className="w-10 h-10 text-gray-300 dark:text-gray-500" />
                                                </div>
                                                <p className="text-base font-semibold text-gray-600 dark:text-gray-400">
                                                    {language === 'en' ? 'No history found' : 'Tidak ada riwayat'}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                                                    {language === 'en' ? 'Capture your first snapshot to start tracking.' : 'Ambil snapshot pertama untuk mulai melacak.'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal Notification */}
            <Modal
                isOpen={!!notification}
                onClose={() => setNotification(null)}
                title="" // Hide default title since we do custom layout
            >
                {notification?.type === 'success' ? (
                    <div className="flex flex-col items-center justify-center p-2">
                        <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mb-4">
                            <FiCheck className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-xl font-bold text-green-500 mb-2">
                            {notification.title || 'Success'}
                        </h3>
                        <p className="text-gray-500 text-center mb-6">
                            {notification.message}
                        </p>
                        <button
                            onClick={() => setNotification(null)}
                            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-600/20 transition-all"
                        >
                            OK
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-2">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${notification?.type === 'error' ? 'bg-red-500/10' : 'bg-blue-500/10'
                            }`}>
                            {notification?.type === 'error' ? (
                                <FiX className="w-8 h-8 text-red-500" />
                            ) : (
                                <FiInfo className="w-8 h-8 text-blue-500" />
                            )}
                        </div>
                        <h3 className={`text-xl font-bold mb-2 ${notification?.type === 'error' ? 'text-red-500' : 'text-blue-500'
                            }`}>
                            {notification?.title}
                        </h3>
                        <p className="text-gray-500 text-center mb-6">
                            {notification?.message}
                        </p>
                        <button
                            onClick={() => setNotification(null)}
                            className={`w-full py-3 font-bold rounded-xl shadow-lg transition-all ${notification?.type === 'error'
                                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
                                }`}
                        >
                            OK
                        </button>
                    </div>
                )}
            </Modal>
        </div>
    );
}

// Mobile Card Component for History - Professional Design
function MobileHistoryCard({ item, currency, language }) {
    const [expanded, setExpanded] = useState(false);

    // Calculate profit/loss - EXCLUDE cash from BOTH value and invested (matches Portfolio main P/L)
    // P/L = (Stocks+Crypto+Gold Value) - (Stocks+Crypto+Gold Invested)
    const valueExclCashIDR = calculateValueExcludingCash(item);
    const investedIDR = calculateInvestedExcludingCash(item);

    // For display, we show totalValue (including cash), but P/L is calculated without cash
    const totalValue = currency === 'IDR' ? item.totalValueIDR : item.totalValueUSD;
    const invested = currency === 'IDR' ? investedIDR :
        (investedIDR > 0 ? investedIDR / (item.totalValueIDR > 0 && item.totalValueUSD > 0 ? (item.totalValueIDR / item.totalValueUSD) : 16000) : 0);

    // P/L uses value excluding cash
    const valueForPL = currency === 'IDR' ? valueExclCashIDR :
        (valueExclCashIDR > 0 ? valueExclCashIDR / (item.totalValueIDR > 0 && item.totalValueUSD > 0 ? (item.totalValueIDR / item.totalValueUSD) : 16000) : 0);
    const profit = valueForPL - invested;
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

    // Render individual asset item (Mobile)
    const renderAssetItem = (asset, type, index, tickerCount = {}, getAssetKey = null) => {
        const name = type === 'stock' ? asset.ticker :
            type === 'crypto' ? asset.symbol :
                type === 'gold' ? (asset.ticker || asset.name || 'Gold') :
                    asset.ticker;

        const quantity = type === 'stock' ?
            (asset.market === 'US' ? `${formatQuantity(asset.lots)} shr` : `${formatQuantity(asset.lots)} lot`) :
            type === 'crypto' ? `${formatQuantity(asset.amount)}` :
                type === 'gold' ? `${formatQuantity(asset.amount || asset.weight)}g` :
                    formatIDR(asset.amount, 0);

        const value = currency === 'IDR'
            ? formatIDR(asset.portoIDR || asset.totalValueIDR || 0, 0)
            : formatUSD(asset.portoUSD || asset.totalValueUSD || 0);

        const assetProfit = (asset.portoIDR || 0) - (asset.totalCostIDR || asset.totalCost || 0);
        const assetProfitPct = (asset.totalCostIDR || asset.totalCost) > 0
            ? (assetProfit / (asset.totalCostIDR || asset.totalCost)) * 100
            : 0;

        // Get broker/exchange name for mobile display
        const brokerName = asset.broker || asset.exchange || asset.platform || '-';

        // Check if this asset has duplicates
        const assetKey = getAssetKey ? getAssetKey(asset) : name;
        const duplicateCount = tickerCount[assetKey] || 1;
        const isDuplicate = duplicateCount > 1;

        // Professional Clean Colors
        const typeColor = type === 'stock' ? 'text-blue-600 dark:text-blue-400'
            : type === 'crypto' ? 'text-orange-600 dark:text-orange-400'
                : type === 'gold' ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-emerald-600 dark:text-emerald-400';

        const borderColor = type === 'stock' ? 'border-l-blue-500'
            : type === 'crypto' ? 'border-l-orange-500'
                : type === 'gold' ? 'border-l-yellow-500'
                    : 'border-l-emerald-500';

        return (
            <div
                key={`${type}-${index}`}
                className={`flex items-center justify-between p-3 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 ${borderColor} border-l-2 ${isDuplicate ? 'ring-1 ring-blue-200 dark:ring-blue-800' : ''}`}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <p className={`text-xs font-bold ${typeColor} truncate`}>{name}</p>
                            {isDuplicate && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded font-medium flex-shrink-0">
                                    {duplicateCount}x
                                </span>
                            )}
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">•</span>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">{quantity}</p>
                        </div>
                        {/* Show broker/exchange on mobile */}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{brokerName}</p>
                    </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-200">{value}</p>
                    <p className={`text-[10px] ${assetProfitPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {assetProfitPct >= 0 ? '+' : ''}{assetProfitPct.toFixed(1)}%
                    </p>
                </div>
            </div>
        );
    };

    // Render asset section
    const renderAssetSection = (title, assets, type) => {
        if (!assets || assets.length === 0) return null;

        // Get unique ticker/symbol count
        const getAssetKey = (asset) => {
            if (type === 'stock') return asset.ticker;
            if (type === 'crypto') return asset.symbol;
            if (type === 'gold') return asset.ticker || asset.name || (asset.subtype === 'digital' ? 'digital' : 'physical');
            return asset.ticker || asset.name;
        };
        const uniqueAssets = new Set(assets.map(getAssetKey));
        const uniqueCount = uniqueAssets.size;

        // Count occurrences of each ticker/symbol
        const tickerCount = {};
        assets.forEach(a => {
            const key = getAssetKey(a);
            tickerCount[key] = (tickerCount[key] || 0) + 1;
        });

        // Sort: assets with multiple brokers first (duplicates), then alphabetically
        const sortedAssets = [...assets].sort((a, b) => {
            const keyA = getAssetKey(a);
            const keyB = getAssetKey(b);
            const countA = tickerCount[keyA];
            const countB = tickerCount[keyB];
            // Sort by count descending (duplicates first)
            if (countB !== countA) return countB - countA;
            // Then alphabetically
            return keyA.localeCompare(keyB);
        });

        const totalSectionValue = assets.reduce((sum, a) => sum + (currency === 'IDR' ? (a.portoIDR || 0) : (a.portoUSD || 0)), 0);

        return (
            <div className="mb-4 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title} ({uniqueCount})</span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {currency === 'IDR' ? formatIDR(totalSectionValue, 0) : formatUSD(totalSectionValue)}
                    </span>
                </div>
                <div className="space-y-2">
                    {sortedAssets.map((asset, idx) => renderAssetItem(asset, type, idx, tickerCount, getAssetKey))}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
            {/* Main Card Header */}
            <div
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                {/* Clean Date Layout */}
                <div className="flex flex-col items-center justify-center w-12 text-center flex-shrink-0">
                    <span className="text-lg font-bold text-gray-900 dark:text-white leading-none">{format(parseISO(item.date), 'd')}</span>
                    <span className="text-[10px] uppercase font-medium text-gray-500 dark:text-gray-400 mt-0.5">{format(parseISO(item.date), 'MMM', { locale: language === 'en' ? enUS : id })}</span>
                </div>

                {/* Value Info */}
                <div className="flex-1 min-w-0 border-l border-gray-100 dark:border-gray-800 pl-4">
                    <p className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {currency === 'IDR' ? formatIDR(totalValue, 0) : formatUSD(totalValue)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium ${profit >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                            }`}>
                            {profit >= 0 ? '+' : ''}{Math.abs(profitPct).toFixed(1)}%
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {profit >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(profit, 0) : formatUSD(profit)}
                        </span>
                    </div>
                </div>

                {/* Expand Chevron */}
                <div className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>

            {/* Expanded Content - Professional Details */}
            {expanded && (
                <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700 animate-fadeIn">
                    {item.portfolio ? (
                        <>
                            {/* Stats Summary - Clean Grid */}
                            <div className="grid grid-cols-3 gap-2 mb-6">
                                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">{language === 'en' ? 'Invested' : 'Modal'}</p>
                                    <p className="text-xs font-semibold text-gray-900 dark:text-white mt-1">
                                        {currency === 'IDR' ? formatIDR(item.totalInvestedIDR || 0, 0) : formatUSD(invested)}
                                    </p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">{language === 'en' ? 'Value' : 'Nilai'}</p>
                                    <p className="text-xs font-semibold text-gray-900 dark:text-white mt-1">
                                        {currency === 'IDR' ? formatIDR(totalValue, 0) : formatUSD(totalValue)}
                                    </p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-center">
                                    <p className="text-[10px] text-gray-500 uppercase">{language === 'en' ? 'P/L' : 'P/L'}</p>
                                    <p className={`text-xs font-semibold mt-1 ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {profit >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(profit, 0) : formatUSD(profit)}
                                    </p>
                                </div>
                            </div>

                            {/* Asset Sections */}
                            <div className="space-y-4">
                                {renderAssetSection(language === 'en' ? 'Stocks' : 'Saham', item.portfolio.stocks, 'stock')}
                                {renderAssetSection('Crypto', item.portfolio.crypto, 'crypto')}
                                {renderAssetSection(language === 'en' ? 'Gold' : 'Emas', item.portfolio.gold, 'gold')}
                                {renderAssetSection(language === 'en' ? 'Cash' : 'Kas', item.portfolio.cash, 'cash')}
                            </div>

                            {(!item.portfolio.stocks?.length && !item.portfolio.crypto?.length && !item.portfolio.gold?.length && !item.portfolio.cash?.length) && (
                                <div className="text-center py-4 text-gray-400">
                                    <p className="text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded inline-block">{language === 'en' ? 'No asset details' : 'Detail aset tidak tersedia'}</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-4 text-gray-400">
                            <p className="text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded inline-block">{language === 'en' ? 'No data' : 'Tidak ada data'}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Sub-component for Desktop Row - Professional Design
function HistoryRow({ item, currency, language, isDarkMode }) {
    const [expanded, setExpanded] = useState(false);

    // Calculate profit for this row - EXCLUDE cash from BOTH value and invested (matches Portfolio main P/L)
    // P/L = (Stocks+Crypto+Gold Value) - (Stocks+Crypto+Gold Invested)
    const valueExclCashIDR = calculateValueExcludingCash(item);
    const investedIDR = calculateInvestedExcludingCash(item);

    // For display, we show totalValue (including cash), but P/L is calculated without cash
    const totalValue = currency === 'IDR' ? item.totalValueIDR : item.totalValueUSD;
    const invested = currency === 'IDR' ? investedIDR :
        (investedIDR > 0 ? investedIDR / (item.totalValueIDR > 0 && item.totalValueUSD > 0 ? (item.totalValueIDR / item.totalValueUSD) : 16000) : 0);

    // P/L uses value excluding cash
    const valueForPL = currency === 'IDR' ? valueExclCashIDR :
        (valueExclCashIDR > 0 ? valueExclCashIDR / (item.totalValueIDR > 0 && item.totalValueUSD > 0 ? (item.totalValueIDR / item.totalValueUSD) : 16000) : 0);
    const profit = valueForPL - invested;
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

    // Helper to render asset list with professional design
    const renderAssetList = (title, assets, type) => {
        if (!assets || assets.length === 0) return null;

        const colorScheme = type === 'stock' ? 'border-l-blue-500'
            : type === 'crypto' ? 'border-l-orange-500'
                : type === 'gold' ? 'border-l-yellow-500'
                    : 'border-l-emerald-500';

        const sectionTotal = assets.reduce((sum, a) => sum + (currency === 'IDR' ? (a.portoIDR || 0) : (a.portoUSD || 0)), 0);

        // Get unique ticker/symbol count
        const getAssetKey = (asset) => {
            if (type === 'stock') return asset.ticker;
            if (type === 'crypto') return asset.symbol;
            if (type === 'gold') return asset.ticker || asset.name || (asset.subtype === 'digital' ? 'digital' : 'physical');
            return asset.ticker || asset.name;
        };
        const uniqueAssets = new Set(assets.map(getAssetKey));
        const uniqueCount = uniqueAssets.size;

        // Count occurrences of each ticker/symbol
        const tickerCount = {};
        assets.forEach(a => {
            const key = getAssetKey(a);
            tickerCount[key] = (tickerCount[key] || 0) + 1;
        });

        // Sort: assets with multiple brokers first (duplicates), then alphabetically
        const sortedAssets = [...assets].sort((a, b) => {
            const keyA = getAssetKey(a);
            const keyB = getAssetKey(b);
            const countA = tickerCount[keyA];
            const countB = tickerCount[keyB];
            // Sort by count descending (duplicates first)
            if (countB !== countA) return countB - countA;
            // Then alphabetically
            return keyA.localeCompare(keyB);
        });

        return (
            <div className="mb-6 last:mb-0">
                {/* Clean Headline - Show unique count */}
                <div className="flex items-end justify-between mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">
                    <h5 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${type === 'stock' ? 'bg-blue-500' : type === 'crypto' ? 'bg-orange-500' : type === 'gold' ? 'bg-yellow-500' : 'bg-emerald-500'}`}></span>
                        {title}
                        <span className="text-gray-300 dark:text-gray-600 font-normal ml-1">({uniqueCount})</span>
                    </h5>
                    <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">
                        {currency === 'IDR' ? formatIDR(sectionTotal, 0) : formatUSD(sectionTotal)}
                    </span>
                </div>

                {/* Professional Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {sortedAssets.map((asset, idx) => {
                        const assetName = type === 'stock' ? asset.ticker :
                            type === 'crypto' ? asset.symbol :
                                type === 'gold' ? (asset.ticker || asset.name || (asset.subtype === 'digital' ? 'Gold Digital' : 'Gold Antam')) :
                                    asset.ticker;

                        const assetValue = currency === 'IDR'
                            ? formatIDR(asset.portoIDR || asset.totalValueIDR || 0, 0)
                            : formatUSD(asset.portoUSD || asset.totalValueUSD || 0);

                        const assetQuantity = type === 'stock'
                            ? (asset.market === 'US' ? `${formatQuantity(asset.lots)} shr` : `${formatQuantity(asset.lots)} lot`)
                            : type === 'crypto' ? `${formatQuantity(asset.amount)} unit`
                                : type === 'gold' ? `${formatQuantity(asset.amount || asset.weight)}g`
                                    : formatIDR(asset.amount, 0);

                        const brokerName = asset.broker || asset.exchange || asset.platform || '-';
                        const isDuplicate = tickerCount[getAssetKey(asset)] > 1;

                        return (
                            <div
                                key={idx}
                                className={`p-3 bg-white dark:bg-gray-800 border border-t-0 border-r-0 border-b-0 border-l-2 ${colorScheme} shadow-sm rounded-r-md hover:shadow-md transition-shadow ${isDuplicate ? 'ring-1 ring-blue-200 dark:ring-blue-800' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                            {assetName}
                                        </span>
                                        {isDuplicate && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded font-medium">
                                                {tickerCount[getAssetKey(asset)]}x
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-semibold text-sm text-gray-900 dark:text-white whitespace-nowrap">
                                        {assetValue}
                                    </span>
                                </div>
                                <div className="flex justify-between items-end text-xs text-gray-500 dark:text-gray-400">
                                    <span className="truncate pr-2 max-w-[60%]">
                                        {brokerName}
                                    </span>
                                    <span>
                                        {assetQuantity}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <>
            <tr
                onClick={() => setExpanded(!expanded)}
                className={`group cursor-pointer transition-colors duration-200 border-b border-gray-50 dark:border-gray-800 last:border-0 ${expanded
                    ? 'bg-blue-50/50 dark:bg-blue-900/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                    }`}
            >
                <td className="px-6 py-4 w-12 text-center text-gray-400">
                    <div className={`transition-transform duration-200 ${expanded ? 'rotate-90 text-blue-500' : ''}`}>
                        <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor">
                            <path d="M2.5 1L1.4925 2.0075L7.4775 8L1.4925 13.9925L2.5 15L9.5 8L2.5 1Z" />
                        </svg>
                    </div>
                </td>
                <td className="px-6 py-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {format(parseISO(item.date), 'dd MMM yyyy', { locale: language === 'en' ? enUS : id })}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {format(parseISO(item.date), 'EEEE', { locale: language === 'en' ? enUS : id })}
                        </span>
                    </div>
                </td>
                <td className="px-6 py-4">
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {currency === 'IDR' ? formatIDR(item.totalValueIDR, 0) : formatUSD(item.totalValueUSD)}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-xs font-medium ${profitPct >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                                }`}>
                                {profitPct >= 0 ? '+' : ''}{Math.abs(profitPct).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </td>
                <td className="px-6 py-4 font-mono text-sm text-gray-600 dark:text-gray-400">
                    {currency === 'IDR' ? (
                        item.totalInvestedIDR > 0 ? formatIDR(item.totalInvestedIDR, 0) : '-'
                    ) : (
                        item.totalInvestedIDR > 0
                            ? formatUSD(item.totalInvestedIDR / (item.totalValueIDR > 0 && item.totalValueUSD > 0 ? (item.totalValueIDR / item.totalValueUSD) : 16000))
                            : '-'
                    )}
                </td>
            </tr>
            {expanded && (
                <tr className="bg-gray-50/30 dark:bg-gray-900/20">
                    <td colSpan="4" className="px-0 py-0">
                        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 animate-fadeIn relative">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>

                            {/* Summary Bar */}
                            <div className="flex border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
                                <div className="pr-8 mr-8 border-r border-gray-200 dark:border-gray-700">
                                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{language === 'en' ? 'Total Invested' : 'Total Modal'}</span>
                                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                                        {currency === 'IDR' ? formatIDR(item.totalInvestedIDR || 0, 0) : formatUSD(invested)}
                                    </span>
                                </div>
                                <div className="pr-8 mr-8 border-r border-gray-200 dark:border-gray-700">
                                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{language === 'en' ? 'Net Profit' : 'Profit Bersih'}</span>
                                    <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {profit >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(profit, 0) : formatUSD(profit)}
                                    </span>
                                </div>
                            </div>

                            {/* Assets Grid */}
                            {item.portfolio ? (
                                <>
                                    {renderAssetList(language === 'en' ? 'Stocks' : 'Saham', item.portfolio.stocks, 'stock')}
                                    {renderAssetList(language === 'en' ? 'Crypto' : 'Kripto', item.portfolio.crypto, 'crypto')}
                                    {renderAssetList(language === 'en' ? 'Gold' : 'Emas', item.portfolio.gold, 'gold')}
                                    {renderAssetList(language === 'en' ? 'Cash' : 'Kas', item.portfolio.cash, 'cash')}

                                    {(!item.portfolio.stocks?.length && !item.portfolio.crypto?.length && !item.portfolio.gold?.length && !item.portfolio.cash?.length) && (
                                        <div className="py-4 text-center ">
                                            <p className="text-gray-400 text-sm">
                                                {language === 'en' ? 'No detailed assets recorded.' : 'Tidak ada detail aset tercatat.'}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="py-4 text-center">
                                    <p className="text-gray-400 text-sm">
                                        {language === 'en' ? 'Portfolio breakdown not available.' : 'Rincian portfolio tidak tersedia.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
