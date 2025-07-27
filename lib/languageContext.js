import { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

// Translation dictionary
const translations = {
  id: {
    // Navigation
    portfolio: 'Portfolio',
    addAsset: 'Tambah Aset',
    history: 'Riwayat',
    
    // Portfolio
    totalPortfolio: 'Total Portfolio',
    stocks: 'Saham',
    crypto: 'Kripto',
    totalGain: 'Total Gain',
    yesterday: 'Kemarin',
    fromPortfolio: 'dari portfolio',
    addFirstAsset: 'Tambah Aset Pertama',
    emptyPortfolio: 'Portfolio Kosong',
    emptyPortfolioDesc: 'Mulai membangun portfolio Anda dengan menambahkan aset saham atau kripto untuk melacak investasi Anda',
    
    // Asset Table
    stock: 'Saham',
    crypto: 'Kripto',
    amount: 'Jumlah',
    currentPrice: 'Harga Sekarang',
    idrValue: 'Nilai IDR',
    usdValue: 'Nilai USD',
    action: 'Aksi',
    avgPrice: 'Harga Rata-rata',
    gainLoss: 'Untung/Rugi',
    sell: 'Jual',
    notAvailable: 'Tidak tersedia',
    
    // Forms
    stockCode: 'Kode Saham',
    stockCodePlaceholder: 'Contoh: BBCA, BBRI, ASII',
    lotAmount: 'Jumlah Lot',
    lotAmountPlaceholder: 'Contoh: 1, 0.5',
    addStock: 'Tambah Saham',
    adding: 'Menambahkan...',
    stockSuccessfullyAdded: 'Saham berhasil ditambahkan',
    quickOptions: 'Pilihan Cepat',
    
    cryptoSymbol: 'Simbol Kripto',
    cryptoSymbolPlaceholder: 'Contoh: BTC, ETH, SOL',
    cryptoAmount: 'Jumlah',
    cryptoAmountPlaceholder: 'Contoh: 0.05, 0.00123456, 100',
    addCrypto: 'Tambah Kripto',
    enterCryptoSymbol: 'Masukkan simbol kripto',
    enterValidAmount: 'Masukkan jumlah yang valid (lebih dari 0)',
    failedToAddCrypto: 'Gagal menambahkan kripto: {error}',
    
    // Messages
    success: 'Sukses',
    error: 'Error',
    warning: 'Peringatan',
    confirm: 'Konfirmasi',
    cancel: 'Batal',
    ok: 'OK',
    loading: 'Loading...',
    refresh: 'Refresh',
    refreshNow: 'Refresh sekarang',
    lastUpdated: 'Terakhir diperbarui',
    
    // Exchange Rate
    exchangeRate: 'Kurs USD/IDR:',
    exchangeRateSource: 'Sumber: {source}',
    refreshExchangeRate: 'Refresh kurs',
    exchangeRateUnavailable: 'Kurs tidak tersedia untuk konversi ke IDR',
    notAvailable: 'Tidak tersedia',
    
    // Transaction History
    transactionHistory: 'Riwayat Transaksi',
    exportCSV: 'Export CSV',
    transactionType: 'Tipe Transaksi',
    assetType: 'Jenis Aset',
    all: 'Semua',
    buy: 'Beli',
    sell: 'Jual',
    delete: 'Hapus',
    allAssets: 'Semua Aset',
    date: 'Tanggal',
    type: 'Tipe',
    asset: 'Aset',
    price: 'Harga',
    exportFailed: 'Gagal mengekspor data ke CSV: {error}',
    exportPortfolio: 'Export Portfolio',
    export: 'Export',
    portfolioExportSuccess: 'Portfolio berhasil diekspor ke CSV',
    portfolioExportFailed: 'Gagal mengekspor portfolio: {error}',
    
    // Modals
    confirmSale: 'Konfirmasi Penjualan',
    saleConfirmation: 'Anda akan menjual {amount} {unit} {symbol} {value}. Lanjutkan penjualan?',
    saleConfirmationNoPrice: 'Anda akan menjual {amount} {unit} {symbol}. Data harga akan diperbarui otomatis. Lanjutkan penjualan?',
    
    // Errors
    invalidValue: 'Masukkan nilai yang valid',
    invalidLotAmount: 'Penjualan saham IDX hanya diperbolehkan dalam satuan lot bulat (tidak boleh desimal atau koma).',
    amountExceeds: 'Jumlah yang dijual tidak boleh melebihi jumlah yang dimiliki ({amount})',
    priceDataUnavailable: 'Data harga tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.',
    cryptoPriceUnavailable: 'Data harga kripto tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.',
    valueNotAvailable: 'Nilai tidak tersedia',
    unknownAssetType: 'Tipe aset tidak dikenali',
    
    // Success messages
    priceUpdateSuccess: 'Data harga berhasil diperbarui!',
    priceUpdateFailed: 'Gagal memperbarui data harga: {error}',
    updatingPriceData: 'Data harga sedang diperbarui',
    priceUpdateInfo: 'Beberapa data harga mungkin belum tersedia. Klik tombol refresh untuk memperbarui data real-time.',
    updatingCryptoPriceData: 'Memperbarui Data Harga Kripto',
    cryptoPriceUpdateInfo: 'Data harga kripto sedang diperbarui. Silakan tunggu sebentar...',
    failedToUpdateData: 'Gagal memperbarui data',
    refreshData: 'Refresh data',
    add: 'Tambah',
    
    // Empty states
    noStocksAdded: 'Belum ada saham yang ditambahkan',
    noCryptoAdded: 'Belum ada kripto yang ditambahkan',
    addAsset: 'Tambah Aset',
    assetList: 'Daftar Aset',
    assetsInPortfolio: 'aset dalam portfolio Anda',
    
    // Loading states
    updatingPrices: 'Memperbarui data harga...',
    refreshingData: 'Memperbarui data...',
    
    // Footer
    copyright: '© {year} PortSyncro - Sinkronisasi Portofolio yang Mudah untuk Kripto dan Saham',
    
    // User
    logout: 'Logout',
    user: 'User',
    
    // Authentication
    email: 'Email',
    emailPlaceholder: 'email@contoh.com',
    password: 'Password',
    confirmPassword: 'Konfirmasi Password',
    confirmPasswordPlaceholder: 'Masukkan password yang sama',
    passwordMinLength: 'Minimal 6 karakter',
    signIn: 'Masuk',
    signingIn: 'Memasuki...',
    login: 'Login',
    register: 'Register',
    processing: 'Memproses...',
    tagline: 'Sinkronisasi Portofolio yang Mudah untuk Kripto dan Saham',
    
    // Login/Register Messages
    emailAndPasswordRequired: 'Email dan password harus diisi',
    invalidCredentials: 'Email atau password salah. Pastikan Anda sudah terdaftar dan masukan kredensial yang benar.',
    tooManyFailedAttempts: 'Terlalu banyak percobaan gagal. Akun Anda sementara diblokir, coba lagi nanti atau reset password.',
    accountDisabled: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.',
    connectionError: 'Masalah koneksi. Periksa koneksi internet Anda dan coba lagi.',
    loginFailed: 'Gagal masuk: {error}',
    
    passwordMismatch: 'Password tidak cocok.',
    passwordTooShort: 'Password minimal 6 karakter.',
    emailAlreadyInUse: 'Email sudah digunakan. Gunakan email lain atau login.',
    invalidEmailFormat: 'Format email tidak valid.',
    weakPassword: 'Password terlalu lemah. Gunakan minimal 6 karakter.',
    registrationFailed: 'Pendaftaran gagal. Silakan coba lagi.',
    
    dontHaveAccount: 'Belum punya akun?',
    alreadyHaveAccount: 'Sudah punya akun?',
    forgotPassword: 'Lupa Password',
    useDemoAccountText: 'Gunakan akun berikut untuk demo:',
    useDemoAccount: 'Gunakan Akun Demo',
    createDemoAccountText: 'Ingin membuat akun demo untuk testing?',
    createDemoAccount: 'Buat Akun Demo',
    
    // Reset Password
    resetPassword: 'Reset Password',
    enterEmailForReset: 'Masukkan email Anda untuk reset password',
    resetPasswordEmailSent: 'Email untuk reset password telah dikirim. Silakan periksa inbox dan folder spam Anda.',
    emailNotRegistered: 'Email tidak terdaftar. Silakan periksa atau daftar akun baru.',
    resetPasswordFailed: 'Gagal mengirim email reset password. Silakan coba lagi nanti.',
    sendResetEmail: 'Kirim Email Reset Password',
    backToLogin: 'Kembali ke Login',
    
    // Confirm Reset Password
    invalidResetCode: 'Kode reset password tidak valid atau sudah kadaluarsa.',
    passwordChangedSuccessfully: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
    passwordChangeFailed: 'Gagal mengubah password. Silakan coba lagi.',
    verifyingResetCode: 'Memverifikasi kode reset password...',
    tryResetPasswordAgain: 'Coba Reset Password Lagi',
    enterNewPasswordForAccount: 'Masukkan password baru untuk akun {email}',
    newPassword: 'Password Baru',
    changePassword: 'Ubah Password',
  },
  en: {
    // Navigation
    portfolio: 'Portfolio',
    addAsset: 'Add Asset',
    history: 'History',
    
    // Portfolio
    totalPortfolio: 'Total Portfolio',
    stocks: 'Stocks',
    crypto: 'Crypto',
    totalGain: 'Total Gain',
    yesterday: 'Yesterday',
    fromPortfolio: 'of portfolio',
    addFirstAsset: 'Add First Asset',
    emptyPortfolio: 'Empty Portfolio',
    emptyPortfolioDesc: 'Start building your portfolio by adding stock or crypto assets to track your investments',
    
    // Asset Table
    stock: 'Stock',
    crypto: 'Crypto',
    amount: 'Amount',
    currentPrice: 'Current Price',
    idrValue: 'IDR Value',
    usdValue: 'USD Value',
    action: 'Action',
    avgPrice: 'Avg Price',
    gainLoss: 'Gain/Loss',
    sell: 'Sell',
    notAvailable: 'Not available',
    
    // Forms
    stockCode: 'Stock Code',
    stockCodePlaceholder: 'Example: BBCA, BBRI, ASII',
    lotAmount: 'Lot Amount',
    lotAmountPlaceholder: 'Example: 1, 0.5',
    addStock: 'Add Stock',
    adding: 'Adding...',
    stockSuccessfullyAdded: 'Stock successfully added',
    quickOptions: 'Quick Options',
    
    cryptoSymbol: 'Crypto Symbol',
    cryptoSymbolPlaceholder: 'Example: BTC, ETH, SOL',
    cryptoAmount: 'Amount',
    cryptoAmountPlaceholder: 'Example: 0.05, 0.00123456, 100',
    addCrypto: 'Add Crypto',
    enterCryptoSymbol: 'Enter crypto symbol',
    enterValidAmount: 'Enter a valid amount (greater than 0)',
    failedToAddCrypto: 'Failed to add crypto: {error}',
    
    // Messages
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    confirm: 'Confirm',
    cancel: 'Cancel',
    ok: 'OK',
    loading: 'Loading...',
    refresh: 'Refresh',
    refreshNow: 'Refresh now',
    lastUpdated: 'Last updated',
    
    // Exchange Rate
    exchangeRate: 'USD/IDR Rate:',
    exchangeRateSource: 'Source: {source}',
    refreshExchangeRate: 'Refresh rate',
    exchangeRateUnavailable: 'Exchange rate not available for IDR conversion',
    notAvailable: 'Not available',
    
    // Transaction History
    transactionHistory: 'Transaction History',
    exportCSV: 'Export CSV',
    transactionType: 'Transaction Type',
    assetType: 'Asset Type',
    all: 'All',
    buy: 'Buy',
    sell: 'Sell',
    delete: 'Delete',
    allAssets: 'All Assets',
    date: 'Date',
    type: 'Type',
    asset: 'Asset',
    price: 'Price',
    exportFailed: 'Failed to export data to CSV: {error}',
    exportPortfolio: 'Export Portfolio',
    export: 'Export',
    portfolioExportSuccess: 'Portfolio exported to CSV successfully',
    portfolioExportFailed: 'Failed to export portfolio: {error}',
    
    // Modals
    confirmSale: 'Confirm Sale',
    saleConfirmation: 'You will sell {amount} {unit} {symbol} {value}. Continue with the sale?',
    saleConfirmationNoPrice: 'You will sell {amount} {unit} {symbol}. Price data will be updated automatically. Continue with the sale?',
    
    // Errors
    invalidValue: 'Please enter a valid value',
    invalidLotAmount: 'IDX stock sales are only allowed in whole lots (no decimals or commas).',
    amountExceeds: 'Amount to sell cannot exceed the amount owned ({amount})',
    priceDataUnavailable: 'Price data not available. Please try again in a moment or click the refresh button.',
    cryptoPriceUnavailable: 'Crypto price data not available. Please try again in a moment or click the refresh button.',
    valueNotAvailable: 'Value not available',
    unknownAssetType: 'Unknown asset type',
    
    // Success messages
    priceUpdateSuccess: 'Price data updated successfully!',
    priceUpdateFailed: 'Failed to update price data: {error}',
    updatingPriceData: 'Price data is being updated',
    priceUpdateInfo: 'Some price data may not be available yet. Click the refresh button to update real-time data.',
    updatingCryptoPriceData: 'Updating Crypto Price Data',
    cryptoPriceUpdateInfo: 'Crypto price data is being updated. Please wait a moment...',
    failedToUpdateData: 'Failed to update data',
    refreshData: 'Refresh data',
    add: 'Add',
    
    // Empty states
    noStocksAdded: 'No stocks added yet',
    noCryptoAdded: 'No crypto added yet',
    addAsset: 'Add Asset',
    assetList: 'Asset List',
    assetsInPortfolio: 'assets in your portfolio',
    
    // Loading states
    updatingPrices: 'Updating price data...',
    refreshingData: 'Refreshing data...',
    
    // Footer
    copyright: '© {year} PortSyncro - Easy Portfolio Synchronization for Cryptocurrencies and Stocks',
    
    // User
    logout: 'Logout',
    user: 'User',
    
    // Authentication
    email: 'Email',
    emailPlaceholder: 'email@example.com',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    confirmPasswordPlaceholder: 'Enter the same password',
    passwordMinLength: 'Minimum 6 characters',
    signIn: 'Sign In',
    signingIn: 'Signing In...',
    login: 'Login',
    register: 'Register',
    processing: 'Processing...',
    tagline: 'Easy Portfolio Synchronization for Cryptocurrencies and Stocks',
    
    // Login/Register Messages
    emailAndPasswordRequired: 'Email and password must be filled',
    invalidCredentials: 'Email or password is incorrect. Make sure you are registered and enter the correct credentials.',
    tooManyFailedAttempts: 'Too many failed attempts. Your account is temporarily blocked, try again later or reset password.',
    accountDisabled: 'Your account has been disabled. Please contact administrator.',
    connectionError: 'Connection problem. Check your internet connection and try again.',
    loginFailed: 'Login failed: {error}',
    
    passwordMismatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 6 characters.',
    emailAlreadyInUse: 'Email is already in use. Use another email or login.',
    invalidEmailFormat: 'Invalid email format.',
    weakPassword: 'Password is too weak. Use at least 6 characters.',
    registrationFailed: 'Registration failed. Please try again.',
    
    dontHaveAccount: 'Don\'t have an account?',
    alreadyHaveAccount: 'Already have an account?',
    forgotPassword: 'Forgot Password',
    useDemoAccountText: 'Use the following account for demo:',
    useDemoAccount: 'Use Demo Account',
    createDemoAccountText: 'Want to create a demo account for testing?',
    createDemoAccount: 'Create Demo Account',
    
    // Reset Password
    resetPassword: 'Reset Password',
    enterEmailForReset: 'Enter your email to reset password',
    resetPasswordEmailSent: 'Password reset email has been sent. Please check your inbox and spam folder.',
    emailNotRegistered: 'Email is not registered. Please check or register a new account.',
    resetPasswordFailed: 'Failed to send password reset email. Please try again later.',
    sendResetEmail: 'Send Reset Email',
    backToLogin: 'Back to Login',
    
    // Confirm Reset Password
    invalidResetCode: 'Invalid or expired password reset code.',
    passwordChangedSuccessfully: 'Password changed successfully. Please login with your new password.',
    passwordChangeFailed: 'Failed to change password. Please try again.',
    verifyingResetCode: 'Verifying reset code...',
    tryResetPasswordAgain: 'Try Reset Password Again',
    enterNewPasswordForAccount: 'Enter new password for account {email}',
    newPassword: 'New Password',
    changePassword: 'Change Password',
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('id'); // Default to Indonesian

  // Load language preference from localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && translations[savedLanguage]) {
      setLanguage(savedLanguage);
    }
  }, []);

  // Save language preference to localStorage
  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const t = (key, params = {}) => {
    let text = translations[language][key] || translations.en[key] || key;
    
    // Replace parameters in the text
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    
    return text;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'id' ? 'en' : 'id');
  };

  const value = {
    language,
    setLanguage,
    t,
    toggleLanguage,
    isIndonesian: language === 'id',
    isEnglish: language === 'en'
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}; 