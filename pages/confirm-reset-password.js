// pages/confirm-reset-password.js
import { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { useLanguage } from '../lib/languageContext';
import { useTheme } from '../lib/themeContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import ProtectedRoute from '../components/ProtectedRoute';

export default function ConfirmResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oobCode, setOobCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { t } = useLanguage();
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Ambil oobCode dari query parameters
    const { oobCode } = router.query;
    
    if (oobCode) {
      setOobCode(oobCode);
      
      // Verifikasi kode reset password
      const verifyCode = async () => {
        try {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setEmail(email);
          setLoading(false);
        } catch (error) {
          console.error("Error verifying reset code:", error);
          setError(t('invalidResetCode'));
          setLoading(false);
        }
      };
      
      verifyCode();
    } else {
      setLoading(false);
    }
  }, [router.query]);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }
    
    if (newPassword.length < 6) {
      setError(t('passwordTooShort'));
      return;
    }
    
    setLoading(true);
    
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setMessage(t('passwordChangedSuccessfully'));
      
      // Redirect ke halaman login setelah beberapa detik
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (error) {
      console.error("Error resetting password:", error);
      setError(t('passwordChangeFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute authPage={true}>
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center px-4 transition-colors">
        <Head>
          <title>{t('resetPassword')} | PortSyncro</title>
        </Head>

        <div className="absolute top-4 right-4 flex gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        {loading ? (
          <div className="text-center text-gray-800 dark:text-white">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
            <p>{t('verifyingResetCode')}</p>
          </div>
        ) : error && !email ? (
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                {t('resetPassword')}
              </h1>
            </div>
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-200 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
            <div className="text-center">
              <Link href="/reset-password" className="bg-indigo-600 text-white px-4 py-2 rounded-lg inline-block hover:bg-indigo-700">
                {t('tryResetPasswordAgain')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                {t('resetPassword')}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-2">{t('enterNewPasswordForAccount', { email })}</p>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-200 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-200 px-4 py-3 rounded-lg text-sm">
                {message}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              <div className="mb-4">
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('newPassword')}</label>
                <input
                  type="password"
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-gray-800 dark:text-white"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('passwordMinLength')}
                />
              </div>

              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('confirmPassword')}</label>
                <input
                  type="password"
                  className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 text-gray-800 dark:text-white"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('confirmPasswordPlaceholder')}
                />
              </div>

              <button
                type="submit"
                disabled={loading || message}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
              >
                {loading ? t('processing') : t('changePassword')}
              </button>
            </form>

            {!message && (
              <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
                  {t('backToLogin')}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}