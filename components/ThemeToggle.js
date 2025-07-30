// components/ThemeToggle.js
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../lib/themeContext';
import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        aria-label="Toggle theme"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-all duration-200 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700"
      >
        <FiSun className="h-5 w-5" />
      </button>
    );
  }

  return (
    <button
      aria-label="Toggle theme"
      onClick={toggleTheme}
      className="group relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition-all duration-300 hover:bg-gray-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700 dark:hover:shadow-glow"
    >
      <div className="relative">
        <FiSun 
          className={`h-5 w-5 transition-all duration-300 ${
            isDarkMode 
              ? 'rotate-0 opacity-100' 
              : 'rotate-90 opacity-0'
          }`} 
        />
        <FiMoon 
          className={`absolute inset-0 h-5 w-5 transition-all duration-300 ${
            isDarkMode 
              ? '-rotate-90 opacity-0' 
              : 'rotate-0 opacity-100'
          }`} 
        />
      </div>
      
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-400/20 to-secondary-400/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-primary-400/30 dark:to-secondary-400/30" />
    </button>
  );
}