import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/authContext';
import { useTheme } from '../lib/themeContext';
import { useLanguage } from '../lib/languageContext';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, where, limit } from 'firebase/firestore';
import { FiArrowLeft, FiCalendar, FiDownload, FiTrendingUp, FiTrendingDown, FiActivity } from 'react-icons/fi';
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

export default function Reports() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
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
                console.error("Error fetching history:", error);
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

    // Stats Calculation
    const stats = useMemo(() => {
        if (filteredData.length === 0) return null;

        if (filteredData.length === 1) {
            const val = currency === 'IDR' ? filteredData[0].totalValueIDR : filteredData[0].totalValueUSD;
            return {
                change: 0,
                changePct: 0,
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

        return {
            change,
            changePct,
            high,
            low
        };
    }, [filteredData, currency]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-white font-sans">
            <Head>
                <title>{language === 'en' ? 'Portfolio Reports' : 'Laporan Portfolio'} | PortSyncro</title>
            </Head>

            {/* Header */}
            <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0d1117]/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/')}
                            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <FiArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl font-bold tracking-tight">{language === 'en' ? 'Reports & History' : 'Laporan & Riwayat'}</h1>
                    </div>

                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button
                            onClick={() => setCurrency('IDR')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${currency === 'IDR' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            IDR
                        </button>
                        <button
                            onClick={() => setCurrency('USD')}
                            className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${currency === 'USD' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            USD
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6 space-y-6">
                {/* Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400">
                            <FiCalendar className="w-5 h-5" />
                        </div>
                        <h2 className="font-semibold">{language === 'en' ? 'Date Range' : 'Rentang Tanggal'}</h2>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                        <button
                            onClick={() => {
                                if (historyData.length > 0) {
                                    // Find earliest date
                                    const earliest = historyData[0].date;
                                    const today = new Date().toISOString().split('T')[0];
                                    setDateRange({ start: earliest, end: today });
                                }
                            }}
                            className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap"
                        >
                            All Time
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{language === 'en' ? 'Net Change' : 'Perubahan Bersih'}</p>
                            <div className="flex items-end gap-2">
                                <span className={`text-2xl font-bold ${stats.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {stats.change >= 0 ? '+' : ''}{currency === 'IDR' ? formatIDR(stats.change, 0) : formatUSD(stats.change)}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md text-xs font-bold mb-1 ${stats.changePct >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                    {stats.changePct >= 0 ? <FiTrendingUp className="inline mr-1" /> : <FiTrendingDown className="inline mr-1" />}
                                    {Math.abs(stats.changePct).toFixed(2)}%
                                </span>
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{language === 'en' ? 'Highest Value' : 'Nilai Tertinggi'}</p>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {currency === 'IDR' ? formatIDR(stats.high, 0) : formatUSD(stats.high)}
                            </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{language === 'en' ? 'Lowest Value' : 'Nilai Terendah'}</p>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {currency === 'IDR' ? formatIDR(stats.low, 0) : formatUSD(stats.low)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Chart Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <FiActivity className="text-blue-500" />
                        {language === 'en' ? 'Portfolio Growth' : 'Pertumbuhan Portfolio'}
                    </h3>

                    <div className="h-[350px] w-full">
                        {filteredData.length > 0 ? (
                            <Line data={chartData} options={chartOptions} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <p>{language === 'en' ? 'No data available for selected range' : 'Tidak ada data untuk rentang yang dipilih'}</p>
                                <p className="text-xs mt-2 text-center max-w-xs">{language === 'en' ? 'History is recorded daily when you visit the app. Check back tomorrow!' : 'Riwayat dicatat harian saat Anda membuka aplikasi. Cek lagi besok!'}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* History Table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-lg font-bold">{language === 'en' ? 'History Log' : 'Riwayat Harian'}</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-4 font-medium w-8"></th>
                                    <th className="px-6 py-4 font-medium">{language === 'en' ? 'Date' : 'Tanggal'}</th>
                                    <th className="px-6 py-4 font-medium">{language === 'en' ? 'Total Value' : 'Total Nilai'} ({currency})</th>
                                    <th className="px-6 py-4 font-medium">{language === 'en' ? 'Invested' : 'Investasi'} (IDR)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
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
                                        <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                            {language === 'en' ? 'No history found' : 'Tidak ada riwayat'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Sub-component for Row to handle expand state independently
function HistoryRow({ item, currency, language, isDarkMode }) {
    const [expanded, setExpanded] = useState(false);

    // Helper to render asset list
    const renderAssetList = (title, assets, type) => {
        if (!assets || assets.length === 0) return null;
        return (
            <div className="mb-4">
                <h5 className="font-bold text-xs uppercase text-gray-500 mb-2">{title}</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {assets.map((asset, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col gap-1">
                            {/* Top Row: Name & Value */}
                            <div className="flex justify-between items-start">
                                <span className="font-bold text-xs text-gray-800 dark:text-gray-200">
                                    {type === 'stock' ? asset.ticker :
                                        type === 'crypto' ? asset.symbol :
                                            type === 'gold' ? (asset.ticker || asset.name || (asset.subtype === 'digital' ? 'Gold Digital' : 'Gold Antam')) :
                                                asset.ticker}
                                </span>
                                <span className="font-bold font-mono text-xs text-gray-900 dark:text-gray-100">
                                    {currency === 'IDR'
                                        ? formatIDR(asset.portoIDR || asset.totalValueIDR || (asset.currentPrice * (asset.amount || asset.lots * 100) * (asset.currency === 'USD' ? 16000 : 1)))
                                        : formatUSD(asset.portoUSD || asset.totalValueUSD || (asset.currentPrice * (asset.amount || asset.lots * 100) / (asset.currency === 'IDR' ? 16000 : 1)))
                                    }
                                </span>
                            </div>

                            {/* Bottom Row: Broker & Quantity */}
                            <div className="flex justify-between items-center text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400">
                                <span>
                                    {asset.broker || asset.exchange || '-'}
                                </span>
                                <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                    {type === 'stock' ? (
                                        asset.market === 'US' ? `${formatQuantity(asset.lots)} Share` : `${formatQuantity(asset.lots)} Lot`
                                    ) : type === 'crypto' ? (
                                        `${formatQuantity(asset.amount)} Unit`
                                    ) : type === 'gold' ? (
                                        `${formatQuantity(asset.amount || asset.weight)} Gram`
                                    ) : null}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <>
            <tr
                onClick={() => setExpanded(!expanded)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
                <td className="px-6 py-4 text-gray-400">
                    <div className={`transform transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-200 font-medium">
                    {format(parseISO(item.date), 'dd MMMM yyyy', { locale: language === 'en' ? enUS : id })}
                </td>
                <td className="px-6 py-4 text-gray-900 dark:text-gray-200">
                    {currency === 'IDR' ? formatIDR(item.totalValueIDR, 0) : formatUSD(item.totalValueUSD)}
                </td>
                <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
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
                <tr className="bg-gray-50/50 dark:bg-gray-800/30">
                    <td colSpan="4" className="px-6 py-4">
                        <div className="pl-4 border-l-2 border-blue-500">
                            {item.portfolio ? (
                                <>
                                    {renderAssetList(language === 'en' ? 'Stocks' : 'Saham', item.portfolio.stocks, 'stock')}
                                    {renderAssetList(language === 'en' ? 'Crypto' : 'Kripto', item.portfolio.crypto, 'crypto')}
                                    {renderAssetList(language === 'en' ? 'Gold' : 'Emas', item.portfolio.gold, 'gold')}
                                    {renderAssetList(language === 'en' ? 'Cash' : 'Kas', item.portfolio.cash, 'cash')}

                                    {(!item.portfolio.stocks?.length && !item.portfolio.crypto?.length && !item.portfolio.gold?.length && !item.portfolio.cash?.length) && (
                                        <p className="text-gray-500 italic text-sm">
                                            {language === 'en' ? 'No detailed assets recorded for this date.' : 'Tidak ada detail aset tercatat untuk tanggal ini.'}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-gray-500 italic text-sm">
                                    {language === 'en' ? 'Portfolio breakdown not available for this snapshot.' : 'Rincian portfolio tidak tersedia untuk snapshot ini.'}
                                </p>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
