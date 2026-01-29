import Modal from './Modal';
import { useTheme } from '../lib/themeContext';
import { FiMoon, FiSun, FiEye, FiEyeOff, FiGlobe, FiActivity, FiTrash2, FiAlertTriangle, FiDownload, FiUpload, FiLogOut, FiPieChart } from 'react-icons/fi';
import { FaDownload, FaApple, FaTimes } from 'react-icons/fa';
import { useLanguage } from '../lib/languageContext';
import { usePWA } from '../lib/pwaContext';
import { useState } from 'react';

// Add progress prop
export default function SettingsModal({ isOpen, onClose, hideBalance, onToggleHideBalance, onOpenCalculator, onOpenAllocation, onOpenReports, onCaptureSnapshot, onResetPortfolio, onBackup, onRestore, onLogoutAllSessions, progress = 0, processingStatus = '' }) {
    // ... existing hooks ...
    const { isDarkMode, toggleTheme } = useTheme();
    const { t, language, toggleLanguage } = useLanguage();
    const { installPWA, isSupported, isIOS, isMacOS } = usePWA();
    const [showIOSPrompt, setShowIOSPrompt] = useState(false);
    const [showMacOSPrompt, setShowMacOSPrompt] = useState(false);
    const [showManualPrompt, setShowManualPrompt] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleInstallClick = async () => {
        const result = await installPWA();
        if (result === 'ios') {
            setShowIOSPrompt(true);
        } else if (result === 'macos') {
            setShowMacOSPrompt(true);
        } else if (result === 'manual') {
            setShowManualPrompt(true);
        }
    };

    // Processing Overlay
    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[10001] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
                <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl text-center space-y-6 border border-gray-100 dark:border-gray-700">
                    <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {processingStatus || 'Processing...'}
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400">
                            {t('pleaseWait') || 'Please wait, do not close this window.'}
                        </p>
                    </div>

                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                        <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out flex items-center justify-end px-2"
                            style={{ width: `${Math.max(5, progress)}%` }} // Min 5% so text fits or bar is visible
                        >
                        </div>
                    </div>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{Math.round(progress)}%</p>
                </div>
            </div>
        );
    }

    // ... existing generic showInstallButton check ...
    const showInstallButton = isSupported || isIOS || isMacOS;

    if (!isOpen) return null;

    return (
        <Modal type="default" isOpen={isOpen} onClose={onClose} title={t('settings')}>
            <div className="space-y-4 font-sans">
                {/* ... existing buttons ... */}
                {/* Install App Button */}
                {showInstallButton && (
                    <button
                        onClick={handleInstallClick}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-sky-600 dark:text-sky-400 group-hover:text-sky-500 dark:group-hover:text-sky-300 transition-colors shadow-sm">
                                {isIOS ? <FaApple className="w-5 h-5" /> : <FaDownload className="w-5 h-5" />}
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                    Install App
                                </span>
                                <span className="text-xs text-gray-500">
                                    {isIOS || isMacOS ? 'Tambahkan ke Home Screen/Dock' : 'Install ke Perangkat Anda'}
                                </span>
                            </div>
                        </div>
                    </button>
                )}

                {/* Hide Balance Toggle */}
                <button
                    onClick={onToggleHideBalance}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-blue-600 dark:text-blue-400 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-colors shadow-sm">
                            {hideBalance ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {hideBalance ? t('showBalance') : t('hideBalance')}
                            </span>
                            <span className="text-xs text-gray-500">
                                {hideBalance ? t('balanceHidden') : t('balanceVisible')}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-purple-600 dark:text-purple-400 group-hover:text-purple-500 dark:group-hover:text-purple-300 transition-colors shadow-sm">
                            {isDarkMode ? <FiSun className="w-5 h-5" /> : <FiMoon className="w-5 h-5" />}
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {isDarkMode ? t('lightMode') : t('darkMode')}
                            </span>
                            <span className="text-xs text-gray-500">
                                {isDarkMode ? t('switchToLightMode') : t('switchToDarkMode')}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Language Toggle */}
                <button
                    onClick={toggleLanguage}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-green-600 dark:text-green-400 group-hover:text-green-500 dark:group-hover:text-green-300 transition-colors shadow-sm">
                            <FiGlobe className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {language === 'en' ? 'Bahasa Indonesia' : 'English'}
                            </span>
                            <span className="text-xs text-gray-500">
                                {language === 'en' ? t('switchToIndonesian') : t('switchToEnglish')}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Calculator Button */}
                <button
                    onClick={() => {
                        if (onOpenCalculator) onOpenCalculator();
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-orange-600 dark:text-orange-400 group-hover:text-orange-500 dark:group-hover:text-orange-300 transition-colors shadow-sm">
                            <FiActivity className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {t('averagePriceCalculator')}
                            </span>
                            <span className="text-xs text-gray-500">
                                {t('calculateAveragePriceDesc')}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Asset Allocation Button */}
                <button
                    onClick={() => {
                        if (onOpenAllocation) onOpenAllocation();
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-teal-600 dark:text-teal-400 group-hover:text-teal-500 dark:group-hover:text-teal-300 transition-colors shadow-sm">
                            <FiPieChart className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {t('assetAllocation') || 'Alokasi Aset'}
                            </span>
                            <span className="text-xs text-gray-500">
                                {t('viewAssetAllocation') || 'Lihat alokasi per aset'}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Portfolio Reports Button */}
                <button
                    onClick={() => {
                        if (onOpenReports) onOpenReports();
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-300 transition-colors shadow-sm">
                            <FiActivity className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {language === 'en' ? 'Portfolio Reports' : 'Laporan Portfolio'}
                            </span>
                            <span className="text-xs text-gray-500">
                                {language === 'en' ? 'View daily progress and history' : 'Lihat progress harian dan riwayat'}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Capture Daily Snapshot Button (Manual Trigger) */}
                <button
                    onClick={() => {
                        if (onCaptureSnapshot) onCaptureSnapshot();
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-pink-600 dark:text-pink-400 group-hover:text-pink-500 dark:group-hover:text-pink-300 transition-colors shadow-sm">
                            <FiActivity className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                {language === 'en' ? 'Capture Daily Snapshot' : 'Ambil Snapshot Harian'}
                            </span>
                            <span className="text-xs text-gray-500">
                                {language === 'en' ? 'Force record today\'s portfolio state' : 'Rekam manual kondisi portfolio hari ini'}
                            </span>
                        </div>
                    </div>
                </button>

                {/* Backup & Restore Section */}
                <div className="pt-4 mt-2 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1">{language === 'en' ? 'Backup & Restore' : 'Backup & Restore'}</p>

                    {/* Backup Button */}
                    <button
                        onClick={onBackup}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group mb-2"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-500 dark:group-hover:text-emerald-300 transition-colors shadow-sm">
                                <FiDownload className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                    {language === 'en' ? 'Backup Portfolio' : 'Backup Portfolio'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {language === 'en' ? 'Export portfolio to JSON file' : 'Export portfolio ke file JSON'}
                                </span>
                            </div>
                        </div>
                    </button>

                    {/* Restore Button */}
                    <label className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#1f2937] hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 group cursor-pointer">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-blue-600 dark:text-blue-400 group-hover:text-blue-500 dark:group-hover:text-blue-300 transition-colors shadow-sm">
                                <FiUpload className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-gray-900 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white transition-colors">
                                    {language === 'en' ? 'Restore Portfolio' : 'Restore Portfolio'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {language === 'en' ? 'Import from JSON file (supports legacy format)' : 'Import dari file JSON (support format lama)'}
                                </span>
                            </div>
                        </div>
                        <input
                            type="file"
                            id="restore-file-input"
                            accept=".json"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file && onRestore) {
                                    onRestore(file);
                                    e.target.value = '';
                                }
                            }}
                            className="hidden"
                        />
                    </label>
                </div>

                {/* Security & Danger Zone */}
                <div className="pt-4 mt-2 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-xs font-bold text-red-500 uppercase mb-2 ml-1">{language === 'en' ? 'Security & Danger Zone' : 'Keamanan & Zona Berbahaya'}</p>

                    {/* Logout All Sessions */}
                    <button
                        onClick={onLogoutAllSessions}
                        className="w-full flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-all duration-200 group mb-2"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-amber-600 dark:text-amber-400 group-hover:text-amber-500 dark:group-hover:text-amber-300 transition-colors shadow-sm">
                                <FiLogOut className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                                    {language === 'en' ? 'Logout All Devices' : 'Logout Semua Perangkat'}
                                </span>
                                <span className="text-xs text-amber-500 dark:text-amber-500/70">
                                    {language === 'en' ? 'Sign out from all active sessions' : 'Keluar dari semua sesi aktif'}
                                </span>
                            </div>
                        </div>
                    </button>

                    {/* Reset Portfolio */}
                    <button
                        onClick={() => setShowResetConfirm(true)}
                        className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-200 group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white dark:bg-[#161b22] text-red-600 dark:text-red-400 group-hover:text-red-500 dark:group-hover:text-red-300 transition-colors shadow-sm">
                                <FiTrash2 className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <span className="block font-bold text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors">
                                    {language === 'en' ? 'Reset Portfolio' : 'Reset Portfolio'}
                                </span>
                                <span className="text-xs text-red-400 dark:text-red-500/70">
                                    {language === 'en' ? 'Delete all assets and start over' : 'Hapus semua aset dan mulai dari awal'}
                                </span>
                            </div>
                        </div>
                    </button>
                </div>

                <div className="text-center pt-4">
                    <p className="text-[10px] text-gray-600 font-mono">PortSyncro v1.0.0 • by Arfan</p>
                </div>
            </div>


            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative animate-slideUp border border-red-100 dark:border-red-900/30">
                        <button
                            onClick={() => {
                                setShowResetConfirm(false);
                                setResetInput('');
                            }}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <FaTimes />
                        </button>

                        <div className="text-center space-y-4">
                            <div className="bg-red-100 dark:bg-red-900/30 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-inner text-red-600 dark:text-red-400">
                                <FiAlertTriangle className="w-8 h-8" />
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                {t('resetPortfolio') || 'Reset Portfolio'}?
                            </h3>

                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {t('resetWarning') || 'This action cannot be undone. All your portfolio data will be permanently deleted.'}
                            </p>

                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl text-left">
                                <label htmlFor="reset-confirm-input" className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">
                                    {t('typeYesToConfirm') || 'Type "yes" to confirm'}
                                </label>
                                <input
                                    type="text"
                                    id="reset-confirm-input"
                                    name="resetConfirm"
                                    value={resetInput}
                                    onChange={(e) => setResetInput(e.target.value)}
                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all placeholder-gray-400"
                                    placeholder="yes"
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowResetConfirm(false);
                                        setResetInput('');
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (resetInput.toLowerCase() === 'yes') {
                                            setIsLoading(true);
                                            try {
                                                if (onResetPortfolio) await onResetPortfolio();
                                                setShowResetConfirm(false);
                                                setResetInput('');
                                                onClose();
                                            } catch (error) {
                                                console.error("Reset failed:", error);
                                            } finally {
                                                setIsLoading(false);
                                            }
                                        }
                                    }}
                                    disabled={resetInput.toLowerCase() !== 'yes' || isLoading}
                                    className="flex-1 px-4 py-2.5 bg-red-600 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20 flex justify-center items-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        'Reset'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* iOS Prompt Modal */}
            {showIOSPrompt && (
                <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full relative animate-slideUp">
                        <button
                            onClick={() => setShowIOSPrompt(false)}
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
                                Install aplikasi ini di iPhone/iPad Anda untuk pengalaman yang lebih baik.
                            </p>

                            <ol className="text-left text-sm text-gray-600 dark:text-gray-300 space-y-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
                                    <span>Tap tombol <strong className="text-blue-500">Share</strong> <span className="text-xl leading-none">⎋</span> di browser.</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
                                    <span>Pilih <strong className="text-gray-800 dark:text-gray-200">Add to Home Screen</strong>.</span>
                                </li>
                            </ol>

                            <button
                                onClick={() => setShowIOSPrompt(false)}
                                className="w-full bg-[#0ea5e9] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0284c7] transition-colors"
                            >
                                Mengerti
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
        </Modal>
    );
}
