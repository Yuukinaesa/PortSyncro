import { useLanguage } from '../lib/languageContext';

export default function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      onClick={toggleLanguage}
      className="group relative inline-flex h-11 items-center justify-center px-4 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 transition-all duration-200 hover:bg-gray-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700"
    >
      <span className="relative z-10 font-semibold">
        {language === 'en' ? 'ID' : 'EN'}
      </span>

      {/* Gradient background on hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-400/20 to-secondary-400/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
    </button>
  );
} 