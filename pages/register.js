// pages/register.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import Link from 'next/link';
import Head from 'next/head';
import { useTheme } from '../lib/themeContext';
import { useLanguage } from '../lib/languageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import ProtectedRoute from '../components/ProtectedRoute';
import { isDemoAccountAvailable } from '../lib/utils';
import { secureLogger, validateInput } from './../lib/security';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUserPlus, FiActivity } from 'react-icons/fi';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      setLoading(false);
      return;
    }

    // Strict Password Validation
    if (!validateInput.password(password)) {
      setError(t('strictPasswordRequirements'));
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      secureLogger.log("User registered successfully:", userCredential.user);
      router.push('/');
    } catch (error) {
      secureLogger.error("Error signing up:", error);
      if (error.code === 'auth/email-already-in-use') {
        setError(t('emailAlreadyInUse'));
      } else if (error.code === 'auth/invalid-email') {
        setError(t('invalidEmailFormat'));
      } else if (error.code === 'auth/weak-password') {
        setError(t('weakPassword'));
      } else {
        setError(t('registrationFailed'));
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

      if (!demoEmail || !demoPassword) {
        throw new Error('Demo account credentials not configured');
      }

      await signInWithEmailAndPassword(auth, demoEmail, demoPassword);
      router.push('/');
    } catch (error) {
      secureLogger.error('Demo login error:', error);
      if (error.message === 'Demo account credentials not configured') {
        setError(t('demoAccountNotAvailable'));
      } else {
        setError(t('demoLoginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute authPage={true}>
      <Head>
        <title>Register | PortSyncro</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] flex flex-col justify-center py-16 px-4 animate-fade-in relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-full h-96 bg-purple-100 dark:bg-purple-900/10 blur-[100px] rounded-b-full pointer-events-none" />

        <div className="absolute top-8 right-6 flex gap-3 z-50">
          <LanguageToggle />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-purple-900/20">
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
                {t('createAccount')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t('createAccountDesc') || 'Join PortSyncro to start tracking your portfolio'}
              </p>
            </div>

            {error && (
              <div className="mb-6 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-shake">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span>{error || 'An error occurred'}</span>
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  {t('email')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-purple-500 transition-colors">
                    <FiMail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    className="w-full pl-11 pr-4 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  {t('password')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-purple-500 transition-colors">
                    <FiLock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
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
                <p className="mt-1.5 text-[10px] text-gray-500 ml-1">
                  {t('minPasswordLength') || 'Minimum 6 characters'}
                </p>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 ml-1">
                  {t('confirmPassword')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 dark:text-gray-500 group-focus-within:text-purple-500 transition-colors">
                    <FiLock className="w-5 h-5" />
                  </div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="w-full pl-11 pr-12 py-3.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600/50 focus:border-purple-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 transition-all"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('confirmPasswordPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
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
                    <FiUserPlus className="w-5 h-5" />
                    {t('register')}
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                {t('alreadyHaveAccount')} {' '}
                <Link href="/login" className="font-bold text-blue-400 hover:text-blue-300 transition-colors">
                  {t('login')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}