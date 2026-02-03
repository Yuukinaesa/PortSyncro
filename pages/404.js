import Head from 'next/head';
import Link from 'next/link';
import { useLanguage } from '../lib/languageContext';
import { FiHome, FiAlertTriangle } from 'react-icons/fi';

export default function Custom404() {
    // Wrap in try-catch or optional chaining in case context is not available at top level (unlikely for 404 but safe)
    let t = (key) => key;
    try {
        const langContext = useLanguage();
        if (langContext) {
            t = langContext.t;
        }
    } catch (e) {
        // Fallback if context fails
        t = (key) => {
            const distinct = {
                'pageNotFound': 'Halaman Tidak Ditemukan',
                'pageNotFoundDesc': 'Maaf, halaman yang Anda cari tidak dapat ditemukan atau telah dipindahkan.',
                'backToHome': 'Kembali ke Dashboard'
            };
            return distinct[key] || key;
        };
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117] px-4 sm:px-6 lg:px-8 transition-colors duration-200">
            <Head>
                <title>404 - Page Not Found | PortSyncro</title>
            </Head>

            <div className="max-w-lg w-full text-center">
                {/* Abstract Background Element */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none mt-10 ml-10"></div>

                <div className="relative z-10">
                    <div className="mx-auto flex items-center justify-center w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 mb-8 animate-bounce-slow">
                        <FiAlertTriangle className="w-12 h-12 text-red-600 dark:text-red-500" />
                    </div>

                    <h1 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-500 mb-4 tracking-tighter drop-shadow-sm">
                        404
                    </h1>

                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                        {t('pageNotFound') || 'Halaman Tidak Ditemukan'}
                    </h2>

                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                        {t('pageNotFoundDesc') || 'Maaf, halaman yang Anda cari tidak dapat ditemukan, telah dipindahkan, atau tidak tersedia saat ini.'}
                    </p>

                    <Link
                        href="/"
                        className="inline-flex items-center px-8 py-4 border border-transparent text-base font-bold rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-200 transform hover:-translate-y-1 active:scale-95"
                    >
                        <FiHome className="mr-2 -ml-1 w-5 h-5" />
                        {t('backToHome') || 'Kembali ke Dashboard'}
                    </Link>

                    <div className="mt-12 text-sm text-gray-400 dark:text-gray-600">
                        PortSyncro
                    </div>
                </div>
            </div>
        </div>
    );
}
