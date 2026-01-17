import { useState, useEffect } from 'react';
import { FaDownload, FaApple, FaTimes, FaLaptop } from 'react-icons/fa';
import { usePWA } from '../lib/pwaContext';

const InstallPWA = ({ type = 'floating' }) => {
    const { isSupported, isIOS, isMacOS, isAndroid, isWindows, isLinux, installPWA } = usePWA();
    const [showIOSPrompt, setShowIOSPrompt] = useState(false);
    const [showMacOSPrompt, setShowMacOSPrompt] = useState(false);
    const [showManualPrompt, setShowManualPrompt] = useState(false);

    const onClick = async (evt) => {
        evt.preventDefault();
        const result = await installPWA();
        if (result === 'ios') {
            setShowIOSPrompt(true);
        } else if (result === 'macos') {
            setShowMacOSPrompt(true);
        } else if (result === 'manual') {
            setShowManualPrompt(true);
        }
    };

    // Check for HTTPS/Secure Context
    if (typeof window !== 'undefined' && !window.isSecureContext && !isIOS && !isMacOS && !isAndroid && !isWindows && !isLinux) {
        return null; // Don't show warning, just hide checks
    }

    // Force show in development for testing UI
    const isDev = process.env.NODE_ENV === 'development';

    // Visibility Logic:
    // Show if:
    // 1. Browser supports PWA (beforeinstallprompt fired) -> isSupported (Covers Android, Windows, Linux, ChromeOS)
    // 2. It's iOS -> isIOS (Manual instructions needed)
    // 3. It's MacOS (Safari likely) -> isMacOS (Manual instructions needed)
    // 4. Force show in Dev for UI testing, but handle fallback gracefully
    const shouldShow = isSupported || isIOS || isMacOS;

    if (!shouldShow) {
        return null;
    }

    // Render modals helper
    const renderModals = () => (
        <>
            {/* iOS Prompt Modal - Bottom Sheet style for mobile */}
            {showIOSPrompt && (
                <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-fadeIn">
                    <div
                        className="w-full bg-white dark:bg-[#1a1a1a] p-6 rounded-t-[2rem] sm:rounded-2xl shadow-2xl sm:max-w-sm relative animate-slideUp transform transition-all"
                        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag Handle for mobile look */}
                        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-6 sm:hidden" />

                        <button
                            onClick={() => setShowIOSPrompt(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2"
                        >
                            <FaTimes className="text-xl" />
                        </button>

                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                                    <img src="/img/mainlogo.png" alt="PortSyncro" className="w-10 h-10" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                                        Install PortSyncro
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        local app
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                                <ol className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
                                    <li className="flex items-start gap-4">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs mt-0.5 shrink-0">1</span>
                                        <span>Tap tombol <strong className="text-blue-600 dark:text-blue-400">Share</strong> <span className="inline-block mx-1 text-lg leading-none align-middle">⎋</span> di baris menu bawah browser.</span>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 font-bold text-xs mt-0.5 shrink-0">2</span>
                                        <span>Gulir ke bawah dan pilih <strong className="text-gray-900 dark:text-white font-semibold">Add to Home Screen</strong>.</span>
                                    </li>
                                </ol>
                            </div>

                            <button
                                onClick={() => setShowIOSPrompt(false)}
                                className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-semibold py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-blue-500/20"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MacOS Prompt Modal */}
            {showMacOSPrompt && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative animate-slideUp">
                        <button
                            onClick={() => setShowMacOSPrompt(false)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <FaTimes />
                        </button>

                        <div className="text-center space-y-4">
                            <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                                <img src="/img/mainlogo.png" alt="PortSyncro" className="w-12 h-12" />
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Install di Mac
                            </h3>

                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Tambahkan aplikasi ke Dock atau Desktop untuk akses cepat.
                            </p>

                            <ol className="text-left text-sm text-gray-600 dark:text-gray-300 space-y-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
                                    <span>Buka menu <strong className="text-blue-500">Share</strong> (atau File).</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
                                    <span>Pilih <strong className="text-gray-800 dark:text-gray-200">Add to Dock</strong> atau <strong className="text-gray-800 dark:text-gray-200">Add to Home Screen</strong>.</span>
                                </li>
                            </ol>

                            <button
                                onClick={() => setShowMacOSPrompt(false)}
                                className="w-full bg-[#0ea5e9] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0284c7] transition-colors"
                            >
                                Mengerti
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Install Prompt Modal (Windows/Linux/Android fallback) */}
            {showManualPrompt && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative animate-slideUp">
                        <button
                            onClick={() => setShowManualPrompt(false)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <FaTimes />
                        </button>

                        <div className="text-center space-y-4">
                            <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                                <img src="/img/mainlogo.png" alt="PortSyncro" className="w-12 h-12" />
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Install PortSyncro
                            </h3>

                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Untuk pengalaman terbaik, install aplikasi ini di perangkat Anda.
                            </p>

                            <ol className="text-left text-sm text-gray-600 dark:text-gray-300 space-y-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
                                    <span>Buka menu browser (ikon titik tiga &#8942; atau garis tiga &#9776;).</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
                                    <span>Pilih <strong className="text-gray-800 dark:text-gray-200">Install App</strong> atau <strong className="text-gray-800 dark:text-gray-200">Add to Home Screen</strong>.</span>
                                </li>
                            </ol>

                            <button
                                onClick={() => setShowManualPrompt(false)}
                                className="w-full bg-[#0ea5e9] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0284c7] transition-colors"
                            >
                                Mengerti
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (type === 'block') {
        return (
            <>
                <button
                    className="w-full mt-6 bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/20 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                    onClick={onClick}
                >
                    {isIOS || isMacOS ? <FaApple className="text-xl" /> : <FaDownload className="text-lg" />}
                    <span>Install App</span>
                </button>
                {renderModals()}
            </>
        );
    }

    return (
        <>
            {/* Install Button */}
            <button
                className="fixed bottom-20 md:bottom-4 right-4 bg-[#0ea5e9] hover:bg-[#0ea5e9]/90 text-white px-4 py-3 rounded-full shadow-xl z-[9999] flex items-center gap-2 font-medium transition-all transform hover:scale-105 active:scale-95 animate-bounce-slow"
                id="setup_button"
                aria-label="Install App"
                title="Install App"
                onClick={onClick}
            >
                {isIOS || isMacOS ? <FaApple className="text-xl" /> : <FaDownload className="text-lg" />}
                <span>Install App</span>
            </button>
            {renderModals()}
        </>
    );
};

export default InstallPWA;
