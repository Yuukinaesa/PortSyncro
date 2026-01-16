// pages/login.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import Head from 'next/head';
import { useTheme } from '../lib/themeContext';
import { useLanguage } from '../lib/languageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import ProtectedRoute from '../components/ProtectedRoute';
import { isDemoAccountAvailable } from '../lib/utils';
import { secureLogger } from './../lib/security';
import { FiMail, FiLock, FiEye, FiEyeOff, FiLogIn, FiActivity } from 'react-icons/fi';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [email, password, error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch (error) {
      secureLogger.error('Login error:', error);
      // Security: Use generic error messages to prevent information leakage
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
          // Don't reveal if email exists or not - use generic message
          setError(t('invalidCredentials'));
          break;
        case 'auth/too-many-requests':
          setError(t('tooManyRequests'));
          break;
        case 'auth/user-disabled':
          setError(t('accountDisabled'));
          break;
        default:
          // Generic error - never expose Firebase error details
          setError(t('loginFailedGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;
      const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
      if (!demoEmail || !demoPassword) throw new Error('Demo account credentials not configured');
      await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      router.push('/');
    } catch (error) {
      secureLogger.error('Demo login error:', error);
      setError(t('demoLoginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute authPage={true}>
      <Head>
        <title>Login | PortSyncro</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center px-4 relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute top-0 left-0 w-full h-96 bg-blue-100 dark:bg-blue-900/10 blur-[100px] rounded-b-full pointer-events-none" />

        <div className="absolute top-6 right-6 flex gap-3 z-10">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-blue-900/20">
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
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {t('signIn')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t('welcomeBack') || 'Welcome back to your portfolio'}
              </p>
            </div>

            {error && (
              <div className="mb-6 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span>{error || 'An error occurred'}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
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

              <div>
                <div className="flex justify-between mb-2 ml-1">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('password')}
                  </label>
                  <Link href="/reset-password" className="text-xs font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                    {t('forgotPassword')}
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 transition-colors">
                    <FiLock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/50 focus:border-blue-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('passwordPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
                  </button>
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
                    <FiLogIn className="w-5 h-5" />
                    {t('signIn')}
                  </>
                )}
              </button>
            </form>

            {isDemoAccountAvailable() && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-widest">
                    <span className="px-3 bg-white dark:bg-[#161b22] text-gray-500">{t('or')}</span>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={handleDemoLogin}
                    disabled={loading}
                    className="w-full bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white py-3.5 px-4 rounded-xl font-bold transition-all transform active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {t('loginDemoAccount')}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                {t('dontHaveAccount')} {' '}
                <Link href="/register" className="font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  {t('register')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}