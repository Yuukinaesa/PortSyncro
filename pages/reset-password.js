// pages/reset-password.js
import { useState } from 'react';
import { auth } from '../lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import Link from 'next/link';
import Head from 'next/head';
import { useTheme } from '../lib/themeContext';
import { useLanguage } from '../lib/languageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import ProtectedRoute from '../components/ProtectedRoute';
import { secureLogger } from './../lib/security';
import { FiMail, FiActivity, FiArrowRight } from 'react-icons/fi';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await sendPasswordResetEmail(auth, email);
      // Always show success message to prevent user enumeration
      setMessage(t('resetPasswordEmailSent'));
    } catch (error) {
      secureLogger.error("Error sending password reset email:", error);

      // SECURITY: Do NOT reveal if email exists or not (prevents user enumeration)
      // Always show a generic success-like message for user-not-found errors
      if (error.code === 'auth/user-not-found') {
        // Show success message even if email not found - security best practice
        setMessage(t('resetPasswordEmailSent'));
      } else if (error.code === 'auth/invalid-email') {
        // Only show error for clearly invalid email format
        setError(t('invalidEmailFormat'));
      } else if (error.code === 'auth/too-many-requests') {
        setError(t('tooManyRequests'));
      } else {
        setError(t('resetPasswordFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute authPage={true}>
      <Head>
        <title>Reset Password | PortSyncro</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center px-4 relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-100 dark:bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="absolute top-6 right-6 flex gap-3 z-10">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-blue-900/20">
              <FiActivity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              PortSyncro
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              {t('tagline')}
            </p>
          </div>

          <div className="bg-white dark:bg-[#161b22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 p-8">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {t('resetPassword')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t('enterEmailForReset')}
              </p>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {error}
              </div>
            )}

            {message && (
              <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-300 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {message}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  {t('email')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors">
                    <FiMail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 px-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {t('sendResetEmail')}
                    <FiArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <Link href="/login" className="text-sm font-bold text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white transition-colors">
                {t('backToLogin')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}