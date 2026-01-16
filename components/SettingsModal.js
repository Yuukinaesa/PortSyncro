import Modal from './Modal';
import { useTheme } from '../lib/themeContext';
import { FiMoon, FiSun, FiEye, FiEyeOff, FiGlobe, FiActivity } from 'react-icons/fi';
import { useLanguage } from '../lib/languageContext';

export default function SettingsModal({ isOpen, onClose, hideBalance, onToggleHideBalance, onOpenCalculator }) {
    const { isDarkMode, toggleTheme } = useTheme();
    const { t, language, toggleLanguage } = useLanguage();

    if (!isOpen) return null;

    return (
        <Modal type="default" isOpen={isOpen} onClose={onClose} title={t('settings')}>
            <div className="space-y-4 font-sans">
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

                <div className="text-center pt-4">
                    <p className="text-[10px] text-gray-600 font-mono">PortSyncro v1.0.0 • by Arfan</p>
                </div>
            </div>
        </Modal>
    );
}
