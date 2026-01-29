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
import { secureLogger } from './../lib/security';
import { FiLock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';


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

  const verifyCode = async () => {
    try {
      const email = await verifyPasswordResetCode(auth, oobCode);
      setEmail(email);
      setError('');
    } catch (error) {
      secureLogger.error("Error verifying reset code:", error);
      setError(t('invalidOrExpiredResetCode'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (router.query.oobCode) {
      setOobCode(router.query.oobCode);
      setLoading(true);

      const code = router.query.oobCode;
      if (code) {
        verifyPasswordResetCode(auth, code)
          .then((email) => {
            setEmail(email);
            setError('');
          })
          .catch((error) => {
            secureLogger.error("Error verifying reset code:", error);
            setError(t('invalidOrExpiredResetCode'));
          })
          .finally(() => {
            setLoading(false);
          });
      }
    } else {
      setLoading(false);
    }
  }, [router.query, t]);

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
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (error) {
      secureLogger.error("Error resetting password:", error);
      setError(t('passwordChangeFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute authPage={true}>
      <Head>
        <title>{t('resetPassword')} | PortSyncro</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center px-4 relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-100 dark:bg-purple-900/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="absolute top-6 right-6 flex gap-3 z-10">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md relative z-10">
          {loading && !email && !error ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">{t('verifyingResetCode')}</p>
            </div>
          ) : error && !email ? (
            <div className="bg-white dark:bg-[#161b22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 p-8 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
                <FiAlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('resetCodeInvalid')}</h3>
              <p className="text-gray-500 mb-8">{error}</p>
              <Link href="/reset-password" className="block w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition-all">
                {t('tryResetPasswordAgain')}
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#161b22] rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 p-8">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {t('resetPassword')}
                </h1>
                <p className="text-gray-500 text-sm">{t('enterNewPasswordForAccount', { email })}</p>
              </div>

              {error && (
                <div className="mb-6 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  <span>{error || 'An error occurred'}</span>
                </div>
              )}

              {message && (
                <div className="mb-6 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800 text-green-700 dark:text-green-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              {!message ? (
                <form onSubmit={handleResetPassword} className="space-y-5">
                  <div>
                    <label htmlFor="new-password" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                      {t('newPassword')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors">
                        <FiLock className="w-5 h-5" />
                      </div>
                      <input
                        type="password"
                        id="new-password"
                        name="newPassword"
                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('passwordMinLength')}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm-new-password" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                      {t('confirmPassword')}
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors">
                        <FiLock className="w-5 h-5" />
                      </div>
                      <input
                        type="password"
                        id="confirm-new-password"
                        name="confirmPassword"
                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('confirmPasswordPlaceholder')}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 px-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all transform active:scale-[0.98]"
                  >
                    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : t('changePassword')}
                  </button>
                </form>
              ) : (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mx-auto text-green-500">
                    <FiCheckCircle className="w-8 h-8" />
                  </div>
                  <p className="text-gray-400 text-sm">{t('redirectingToLogin')}</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </ProtectedRoute>
  );
}