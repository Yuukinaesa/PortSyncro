// components/ConnectionStatus.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/languageContext';
import { FiWifiOff, FiRefreshCw, FiAlertTriangle, FiX, FiCloud, FiCloudOff } from 'react-icons/fi';

export default function ConnectionStatus() {
    const { t, language } = useLanguage();
    const [mounted, setMounted] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [connectionQuality, setConnectionQuality] = useState('good'); // good, slow, offline
    const [retrying, setRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const retryTimeoutRef = useRef(null);
    const lastOnlineRef = useRef(Date.now());
    const pingIntervalRef = useRef(null);

    useEffect(() => {
        setMounted(true);
        setIsOnline(navigator.onLine);

        return () => {
            setMounted(false);
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        };
    }, []);

    // Check connection quality by pinging a lightweight endpoint
    const checkConnectionQuality = useCallback(async () => {
        if (!navigator.onLine) {
            setConnectionQuality('offline');
            return 'offline';
        }

        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        try {
            const response = await fetch('/api/health', {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);

            const latency = Date.now() - startTime;

            if (!response.ok) {
                setConnectionQuality('slow');
                return 'slow';
            }

            // Classify connection quality based on latency
            if (latency > 5000) {
                setConnectionQuality('slow');
                return 'slow';
            } else {
                setConnectionQuality('good');
                return 'good';
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                setConnectionQuality('slow');
                return 'slow';
            }
            setConnectionQuality('offline');
            return 'offline';
        }
    }, []);

    // Handle online/offline events
    useEffect(() => {
        const handleOnline = async () => {
            setIsOnline(true);
            lastOnlineRef.current = Date.now();
            const quality = await checkConnectionQuality();

            if (quality === 'good') {
                // Connection is back and good
                setShowModal(false);
                setRetryCount(0);
            } else if (quality === 'slow') {
                // Connection is back but slow
                setShowModal(true);
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
            setConnectionQuality('offline');
            setShowModal(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        if (!navigator.onLine) {
            handleOffline();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [checkConnectionQuality]);

    // Periodic connection quality check (every 30 seconds)
    useEffect(() => {
        if (!mounted) return;

        pingIntervalRef.current = setInterval(async () => {
            if (navigator.onLine) {
                const quality = await checkConnectionQuality();
                if (quality === 'slow' && !showModal) {
                    setShowModal(true);
                } else if (quality === 'good' && showModal) {
                    setShowModal(false);
                    setRetryCount(0);
                }
            }
        }, 30000);

        return () => {
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }
        };
    }, [mounted, showModal, checkConnectionQuality]);

    // Auto-retry logic with exponential backoff
    const handleRetry = useCallback(async () => {
        setRetrying(true);

        const quality = await checkConnectionQuality();

        if (quality === 'good') {
            setShowModal(false);
            setRetryCount(0);
            setRetrying(false);
            return;
        }

        setRetryCount(prev => prev + 1);
        setRetrying(false);

        // Auto-retry with exponential backoff (max 60 seconds)
        if (retryCount < 5) {
            const delay = Math.min(5000 * Math.pow(2, retryCount), 60000);
            retryTimeoutRef.current = setTimeout(handleRetry, delay);
        }
    }, [checkConnectionQuality, retryCount]);

    // Close modal manually
    const handleClose = () => {
        setShowModal(false);
    };

    // Get status-specific content
    const getStatusContent = () => {
        if (connectionQuality === 'offline') {
            return {
                icon: FiWifiOff,
                iconBg: 'bg-gradient-to-br from-red-500 to-rose-600',
                iconColor: 'text-white',
                title: language === 'id' ? 'Tidak Ada Koneksi Internet' : 'No Internet Connection',
                message: language === 'id'
                    ? 'Aplikasi ini memerlukan koneksi internet untuk berfungsi. Pastikan Anda terhubung ke jaringan WiFi atau data seluler yang stabil.'
                    : 'This application requires an internet connection to function. Please ensure you are connected to a stable WiFi or mobile data network.',
                warning: language === 'id'
                    ? '⚠️ Semua operasi ditangguhkan untuk melindungi data Anda. Tidak ada perubahan yang akan hilang.'
                    : '⚠️ All operations are paused to protect your data. No changes will be lost.',
                retryText: language === 'id' ? 'Coba Lagi' : 'Retry',
                statusBadge: language === 'id' ? 'Offline' : 'Offline',
                badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30'
            };
        } else if (connectionQuality === 'slow') {
            return {
                icon: FiAlertTriangle,
                iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
                iconColor: 'text-white',
                title: language === 'id' ? 'Koneksi Internet Lambat' : 'Slow Internet Connection',
                message: language === 'id'
                    ? 'Koneksi internet Anda tampak lambat. Beberapa operasi mungkin membutuhkan waktu lebih lama. Harap bersabar dan jangan tutup aplikasi.'
                    : 'Your internet connection appears to be slow. Some operations may take longer. Please be patient and do not close the application.',
                warning: language === 'id'
                    ? '💾 Data Anda aman. Operasi akan dilanjutkan secara otomatis saat koneksi membaik.'
                    : '💾 Your data is safe. Operations will resume automatically when connection improves.',
                retryText: language === 'id' ? 'Periksa Ulang' : 'Check Again',
                statusBadge: language === 'id' ? 'Koneksi Lambat' : 'Slow Connection',
                badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            };
        }
        return null;
    };

    const content = getStatusContent();

    if (!mounted || !showModal || !content) return null;

    const IconComponent = content.icon;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            {/* Premium Backdrop with animated gradient */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-gray-900/95 to-slate-900/95 backdrop-blur-xl"
                onClick={handleClose}
            >
                {/* Animated background elements */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-red-500/5 to-transparent rounded-full animate-pulse" style={{ animationDuration: '4s' }} />
                    <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-orange-500/5 to-transparent rounded-full animate-pulse" style={{ animationDuration: '6s' }} />
                </div>
            </div>

            {/* Modal Container */}
            <div
                className="relative w-full max-w-md animate-modal-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glassmorphism Card */}
                <div className="relative overflow-hidden bg-gradient-to-br from-white/10 to-white/5 dark:from-gray-800/80 dark:to-gray-900/80 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-gray-700/50 shadow-2xl shadow-black/50">

                    {/* Top Gradient Bar */}
                    <div className={`h-1.5 w-full ${connectionQuality === 'offline' ? 'bg-gradient-to-r from-red-500 via-rose-500 to-red-600' : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'}`} />

                    {/* Close Button */}
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 z-10"
                        aria-label="Close"
                    >
                        <FiX className="h-5 w-5" />
                    </button>

                    {/* Content */}
                    <div className="p-8 text-center">
                        {/* Status Badge */}
                        <div className="flex justify-center mb-6">
                            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border ${content.badgeColor}`}>
                                <span className="relative flex h-2 w-2">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionQuality === 'offline' ? 'bg-red-400' : 'bg-amber-400'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${connectionQuality === 'offline' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                </span>
                                {content.statusBadge}
                            </span>
                        </div>

                        {/* Icon */}
                        <div className="flex justify-center mb-6">
                            <div className={`relative w-20 h-20 ${content.iconBg} rounded-2xl flex items-center justify-center shadow-2xl`}>
                                <IconComponent className={`h-10 w-10 ${content.iconColor}`} />
                                {/* Glow effect */}
                                <div className={`absolute inset-0 ${content.iconBg} rounded-2xl blur-xl opacity-50`} />
                            </div>
                        </div>

                        {/* Title */}
                        <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">
                            {content.title}
                        </h2>

                        {/* Message */}
                        <p className="text-gray-300 text-sm leading-relaxed mb-6">
                            {content.message}
                        </p>

                        {/* Warning Box */}
                        <div className={`p-4 rounded-2xl mb-6 border ${connectionQuality === 'offline' ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                            <p className={`text-sm font-medium ${connectionQuality === 'offline' ? 'text-red-300' : 'text-amber-300'}`}>
                                {content.warning}
                            </p>
                        </div>

                        {/* Connection Status Visual */}
                        <div className="flex items-center justify-center gap-4 mb-8">
                            <div className="flex flex-col items-center">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connectionQuality === 'offline' ? 'bg-gray-700' : 'bg-green-500/20'}`}>
                                    <FiCloud className={`h-5 w-5 ${connectionQuality === 'offline' ? 'text-gray-500' : 'text-green-400'}`} />
                                </div>
                                <span className="text-xs text-gray-500 mt-1">Server</span>
                            </div>

                            <div className="flex-1 flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${connectionQuality === 'offline'
                                                ? 'bg-gray-700'
                                                : connectionQuality === 'slow' && i < 2
                                                    ? 'bg-amber-500 animate-pulse'
                                                    : connectionQuality === 'good'
                                                        ? 'bg-green-500'
                                                        : 'bg-gray-700'
                                            }`}
                                        style={{ animationDelay: `${i * 150}ms` }}
                                    />
                                ))}
                            </div>

                            <div className="flex flex-col items-center">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connectionQuality === 'offline' ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                                    {connectionQuality === 'offline' ? (
                                        <FiCloudOff className="h-5 w-5 text-red-400" />
                                    ) : (
                                        <FiWifiOff className="h-5 w-5 text-amber-400" />
                                    )}
                                </div>
                                <span className="text-xs text-gray-500 mt-1">
                                    {language === 'id' ? 'Anda' : 'You'}
                                </span>
                            </div>
                        </div>

                        {/* Retry Button */}
                        <button
                            onClick={handleRetry}
                            disabled={retrying}
                            className={`w-full py-4 px-6 rounded-2xl font-bold text-white transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 shadow-xl ${connectionQuality === 'offline'
                                    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/25'
                                    : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/25'
                                }`}
                        >
                            <FiRefreshCw className={`h-5 w-5 ${retrying ? 'animate-spin' : ''}`} />
                            {retrying
                                ? (language === 'id' ? 'Memeriksa...' : 'Checking...')
                                : content.retryText}
                        </button>

                        {/* Retry Count Info */}
                        {retryCount > 0 && (
                            <p className="text-xs text-gray-500 mt-4">
                                {language === 'id'
                                    ? `Percobaan ke-${retryCount} dari 5`
                                    : `Attempt ${retryCount} of 5`}
                            </p>
                        )}

                        {/* Tips */}
                        <div className="mt-6 pt-6 border-t border-white/10">
                            <p className="text-xs text-gray-500">
                                {language === 'id'
                                    ? '💡 Tips: Coba pindah ke lokasi dengan sinyal lebih baik atau gunakan WiFi'
                                    : '💡 Tip: Try moving to an area with better signal or use WiFi'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
