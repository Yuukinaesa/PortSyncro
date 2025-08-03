// pages/_app.js
import { AuthProvider } from '../lib/authContext';
import { ThemeProvider } from '../lib/themeContext';
import { LanguageProvider } from '../lib/languageContext';
import Head from 'next/head';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LanguageProvider>
          <Head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
            <meta name="theme-color" content="#0ea5e9" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="format-detection" content="telephone=no" />
          </Head>
          <Component {...pageProps} />
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default MyApp;