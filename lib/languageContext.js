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
    bank: 'Bank',
    bankAndWalletShort: 'Bank & E-Wallet',
    bankAndWallet: 'Bank & E-Wallet',
    totalGain: 'Total Untung/Rugi',
    totalGainLoss: 'Total Untung/Rugi',
    gainLoss: 'Untung/Rugi',
    gainLossIDR: 'Untung/Rugi IDR',
    gainLossUSD: 'Untung/Rugi USD',
    performance: 'Performa',
    profitable: 'Menguntungkan',
    loss: 'Rugi',
    ofTotalCost: 'dari total biaya',
    yesterday: 'Kemarin',
    fromPortfolio: 'dari portfolio',
    addFirstAsset: 'Tambah Aset Pertama',
    emptyPortfolio: 'Portfolio Kosong',
    emptyPortfolioDesc: 'Mulai membangun portfolio Anda dengan menambahkan aset saham atau kripto untuk melacak investasi Anda',
    add: 'Tambah',
    noStocksAdded: 'Belum ada saham yang ditambahkan',
    noCryptoAdded: 'Belum ada kripto yang ditambahkan',

    // Portfolio Summary (consolidated)
    portfolioSummary: 'Ringkasan Portfolio',
    portfolioValue: 'Nilai Portfolio',
    portfolioValueIDR: 'Nilai Portfolio (IDR)',
    portfolioValueUSD: 'Nilai Portfolio (USD)',
    totalAssets: 'Total Aset',
    totalStocks: 'Total Saham',
    totalCrypto: 'Total Kripto',
    totalCost: 'Total Biaya',
    totalValue: 'Total Nilai',
    totalGainLoss: 'Total Untung/Rugi',
    totalGainLossIDR: 'Total Untung/Rugi (IDR)',
    totalGainLossUSD: 'Total Untung/Rugi (USD)',
    total: 'Total',
    sell: 'Jual',
    amountToSell: 'Jumlah Jual',
    estimatedValue: 'Estimasi Nilai',
    confirmSell: 'Konfirmasi Jual',

    // Asset Table
    stock: 'Saham',
    crypto: 'Kripto',
    amount: 'Jumlah',
    currentPrice: 'Harga Sekarang',
    idrValue: 'Nilai IDR',
    usdValue: 'Nilai USD',
    action: 'Aksi',
    avgPrice: 'Harga Rata-rata',
    sell: 'Jual',
    notAvailable: 'Tidak tersedia',
    assetTable: 'Tabel Aset',
    combined: 'Gabungan',

    // Asset Table Titles
    stockAssetTable: 'Tabel Aset Saham',
    cryptoAssetTable: 'Tabel Aset Kripto',
    bankAssetTable: 'Tabel Aset Bank & E-Wallet',
    bankAndWalletAssetTable: 'Tabel Aset Bank & E-Wallet',

    // Forms
    stockCode: 'Kode Saham',
    stockCodePlaceholder: 'Masukkan kode saham',
    stockCodeHelp: 'Masukkan kode saham IDX (contoh: BBCA, BBRI, UNTR)',
    lotAmount: 'Jumlah Lot',
    lotAmountPlaceholder: 'Masukkan jumlah lot',
    lotAmountHelp: '1 lot = 100 saham untuk saham IDX',
    addStock: 'Tambah Saham',
    adding: 'Menambahkan...',
    stockSuccessfullyAdded: 'Saham {ticker} berhasil ditambahkan',
    cryptoSuccessfullyAdded: 'Kripto {symbol} berhasil ditambahkan',
    failedToAddStock: 'Gagal menambahkan saham: {error}',
    failedToAddCrypto: 'Gagal menambahkan kripto: {error}',
    stockSuccessfullyDeleted: 'Saham {ticker} berhasil dihapus',
    cryptoSuccessfullyDeleted: 'Kripto {symbol} berhasil dihapus',
    failedToDeleteStock: 'Gagal menghapus saham: {error}',
    failedToDeleteCrypto: 'Gagal menghapus kripto: {error}',
    failedToDeleteTransaction: 'Gagal menghapus transaksi: {error}',
    failedToPrepareTransactionDeletion: 'Gagal mempersiapkan penghapusan transaksi: {error}',
    stockSuccessfullySold: 'Berhasil menjual {amount} lot {ticker}',
    cryptoSuccessfullySold: 'Berhasil menjual {amount} {symbol}',
    errorSellingStock: 'Error Menjual Saham',
    errorSellingCrypto: 'Error Menjual Kripto',
    failedToSellStock: 'Gagal menjual saham: {error}',
    failedToSellCrypto: 'Gagal menjual kripto: {error}',
    invalidIdxStock: 'Kode saham "{ticker}" bukan saham IDX atau tidak ditemukan. Pastikan kode saham valid dan terdaftar di Bursa Efek Indonesia.',
    stockNotFound: 'Kode saham "{ticker}" tidak ditemukan di Yahoo Finance. Pastikan kode saham valid dan terdaftar di Bursa Efek Indonesia.',
    invalidStockFormat: 'Format kode saham tidak valid. Kode saham IDX harus 4 huruf (contoh: BBCA, BBRI, UNTR).',
    confirmSale: 'Konfirmasi Penjualan',
    saleConfirmation: 'Anda akan menjual {amount} {unit} {symbol} dengan nilai sekitar {value}. Lanjutkan penjualan?',
    saleConfirmationNoPrice: 'Anda akan menjual {amount} {unit} {symbol}. Data harga akan diperbarui otomatis. Lanjutkan penjualan?',

    // Manual Asset & Edit Form
    manualPriceOptional: 'Harga Manual (Opt)',
    manualPriceSettingOptional: 'Setting Harga Manual (Opsional)',
    resetToMarket: 'Reset ke Market',
    priceIDR: 'Harga (IDR)',
    priceUSD: 'Harga (USD)',
    usedPrice: 'Harga Pakai',
    estTotalValue: 'Est. Total Nilai',
    saveChanges: 'Simpan Perubahan',
    manualPriceWarning: '⚠️ Aset ini menggunakan harga manual. Kosongkan dan save untuk reset ke harga market.',
    manualModeWarning: '⚠️ Aset sedang mode manual. Kosongkan nilai untuk kembali ke mode auto/API.',
    brokerExchange: 'Sekuritas / Exchange',
    brokerPlaceholderStock: 'Contoh: IPOT, Ajaib',
    brokerPlaceholderCrypto: 'Contoh: Binance, Indodax',
    manual: 'MANUAL',
    invalidUSTickerFormat: 'Format Ticker US tidak valid',
    coinNotFoundManualRequired: 'Koin tidak ditemukan di API. Jika ingin menambahkan sebagai Aset Manual, Anda WAJIB mengisi "Harga Beli Rata-rata" (USD atau IDR) agar dapat dijadikan harga acuan saat ini.',
    stockNotFoundManualRequired: 'Saham tidak ditemukan di API. Jika ingin menambahkan sebagai Aset Manual, Anda WAJIB mengisi "Harga Beli Rata-rata" agar dapat dijadikan harga acuan saat ini.',

    // Demo account
    demoLoginFailed: 'Gagal login dengan akun demo. Silakan coba lagi.',
    demoInvalidCredential: 'Kredensial demo tidak valid. Pastikan email dan password demo sudah dikonfigurasi dengan benar.',
    demoUserNotFound: 'Akun demo tidak ditemukan. Pastikan akun demo sudah dibuat di Firebase.',
    demoWrongPassword: 'Password demo salah. Silakan cek konfigurasi environment variables.',
    demoAccountNotAvailable: 'Akun demo tidak tersedia',

    // Filter and Sort
    searchStock: 'Cari saham...',
    searchCrypto: 'Cari kripto...',
    sortBy: 'Urutkan:',
    sortByNameAsc: 'Nama (A-Z)',
    sortByNameDesc: 'Nama (Z-A)',
    sortByAmountAsc: 'Jumlah (Terkecil)',
    sortByAmountDesc: 'Jumlah (Terbesar)',
    sortByPriceAsc: 'Harga (Terkecil)',
    sortByPriceDesc: 'Harga (Terbesar)',
    sortByValueAsc: 'Nilai (Terkecil)',
    sortByValueDesc: 'Nilai (Terbesar)',
    sortByAvgPriceAsc: 'Harga Rata-rata (Terkecil)',
    sortByAvgPriceDesc: 'Harga Rata-rata (Terbesar)',
    sortByGainLossAsc: 'Gain/Loss (Terkecil)',
    sortByGainLossDesc: 'Gain/Loss (Terbesar)',
    showingResults: '({filtered} dari {total} {type})',

    cryptoSymbol: 'Simbol Kripto',
    cryptoSymbolPlaceholder: 'Masukkan simbol kripto',
    cryptoSymbolHelp: 'Masukkan simbol kripto (contoh: BTC, ETH, ADA)',
    cryptoAmount: 'Jumlah',
    cryptoAmountPlaceholder: 'Masukkan jumlah kripto',
    cryptoAmountHelp: 'Masukkan jumlah kripto yang dibeli',
    amountPlaceholder: 'Masukkan jumlah kripto',
    amountHelp: 'Masukkan jumlah kripto yang dibeli',
    addCrypto: 'Tambah Kripto',
    enterCryptoSymbol: 'Masukkan simbol kripto',
    enterValidAmount: 'Masukkan jumlah yang valid (lebih dari 0)',
    failedToAddCrypto: 'Gagal menambahkan kripto: {error}',
    useCommaOrDot: 'Gunakan koma (,) atau titik (.) sebagai pemisah desimal',
    avgPrice: 'Harga Rata-rata',
    avgPricePlaceholder: 'Masukkan harga rata-rata (opsional)',
    avgPriceHint: 'Kosongkan untuk menggunakan harga pasar saat ini',
    avgPriceHint: 'Kosongkan untuk menggunakan harga pasar saat ini',
    optional: 'Opsional',

    // Cash / Bank
    addCash: 'Tambah Bank & E-Wallet',
    addCashDesc: 'Tambahkan aset kas bank atau e-wallet ke portfolio Anda',
    bankName: 'Nama Bank / E-Wallet',
    balance: 'Saldo',
    save: 'Simpan',
    cashSuccessfullyAdded: 'Bank & E-Wallet {ticker} berhasil ditambahkan',
    failedToAddCash: 'Gagal menambahkan Bank & E-Wallet: {error}',

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
    rateLimitExceeded: 'Batas Permintaan Terlampaui',
    rateLimitMessage: 'Terlalu banyak permintaan ke server. Silakan tunggu beberapa saat sebelum mencoba lagi. Data akan diperbarui otomatis dalam 5 menit.',

    // Exchange Rate
    exchangeRate: 'Kurs USD/IDR:',
    exchangeRateSource: 'Sumber: {source}',
    refreshExchangeRate: 'Refresh kurs',
    exchangeRateUnavailable: 'Kurs tidak tersedia untuk konversi ke IDR',
    notAvailable: 'Tidak tersedia',

    // Transaction History
    transactionHistory: 'Riwayat Transaksi',
    exportCSV: 'Export All',
    exportStocks: 'Export Saham',
    exportCrypto: 'Export Crypto',
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
    actions: 'Aksi',
    confirmDelete: 'Konfirmasi Hapus',
    confirmDeleteTransaction: 'Apakah Anda yakin ingin menghapus transaksi {type} {asset} ({amount})?',
    confirmDeleteTransactionHistory: 'Apakah Anda yakin ingin menghapus riwayat transaksi {type} {asset}?',
    deleteTransactionHistoryWarning: '⚠️ PERHATIAN: Menghapus riwayat transaksi TIDAK akan menghapus aset dari portfolio. Aset akan tetap ada di portfolio Anda.',
    confirmDeleteAsset: 'Apakah Anda yakin ingin menghapus aset {asset}?',
    confirmDeleteAll: 'Konfirmasi Hapus Semua',
    confirmDeleteAllTransactions: 'Apakah Anda yakin ingin menghapus semua transaksi? Tindakan ini tidak dapat dibatalkan.',
    confirmDeleteAllTransactionsAndPortfolio: 'Apakah Anda yakin ingin menghapus semua riwayat transaksi? Portfolio Anda akan tetap tersimpan. Tindakan ini tidak dapat dibatalkan.',
    deleteAll: 'Hapus Semua',
    noTransactions: 'Tidak ada transaksi',
    noTransactionsDesc: 'Belum ada transaksi yang ditambahkan. Mulai dengan menambahkan aset untuk melihat riwayat transaksi.',
    noTransactionsToDelete: 'Tidak ada transaksi yang dapat dihapus.',
    exportFailed: 'Gagal mengekspor data ke CSV: {error}',
    exportPortfolio: 'Export Portfolio',
    export: 'Export Portfolio',
    portfolioExportSuccess: 'Portfolio berhasil diekspor ke CSV',
    portfolioExportFailed: 'Gagal mengekspor portfolio: {error}',
    assetSuccessfullyDeleted: 'Aset {asset} berhasil dihapus',
    stockSuccessfullyDeleted: 'Saham {ticker} berhasil dihapus',
    cryptoSuccessfullyDeleted: 'Kripto {symbol} berhasil dihapus',
    failedToDeleteStock: 'Gagal menghapus saham: {error}',
    failedToDeleteCrypto: 'Gagal menghapus kripto: {error}',
    failedToDeleteAsset: 'Gagal menghapus aset: {error}',

    // Modals
    resetCodeInvalid: 'Kode reset password tidak valid atau kedaluwarsa.',
    // The following keys are already defined under // Reset Password, moving them here as per instruction
    passwordChangedSuccessfully: 'Password berhasil diubah. Silakan login dengan password baru Anda.',
    passwordChangeFailed: 'Gagal mengubah password. Silakan coba lagi.',
    invalidOrExpiredResetCode: 'Kode reset password tidak valid atau sudah kadaluarsa.', // This was already here, but instruction implies it should be moved/re-added
    tryResetPasswordAgain: 'Coba Reset Password Lagi',

    // Errors
    invalidValue: 'Masukkan nilai yang valid',
    invalidLotAmount: 'Penjualan saham IDX hanya diperbolehkan dalam satuan lot bulat (tidak boleh desimal atau koma).',
    amountExceeds: 'Jumlah yang dijual tidak boleh melebihi jumlah yang dimiliki ({amount})',
    priceDataUnavailable: 'Data harga tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.',
    cryptoPriceUnavailable: 'Data harga kripto tidak tersedia. Silakan coba lagi dalam beberapa saat atau klik tombol refresh.',
    valueNotAvailable: 'Nilai tidak tersedia',
    priceNotAvailable: 'Harga tidak tersedia',
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
    loadingInitialData: 'Memuat data awal...',

    // Footer
    copyright: '© {year} PortSyncro - Sinkronisasi Portofolio yang Mudah untuk Kripto dan Saham',

    // User
    logout: 'Logout',
    user: 'User',

    // Authentication
    email: 'Email',
    emailPlaceholder: 'email@contoh.com',
    password: 'Password',
    passwordPlaceholder: 'Masukkan password Anda',
    confirmPassword: 'Konfirmasi Password',
    confirmPasswordPlaceholder: 'Masukkan password yang sama',
    passwordMinLength: 'Minimal 6 karakter',
    minPasswordLength: 'Minimal 6 karakter',
    signIn: 'Masuk',
    signingIn: 'Memasuki...',
    login: 'Login',
    register: 'Register',
    processing: 'Memproses...',
    tagline: 'Sinkronisasi Portofolio yang Mudah untuk Kripto dan Saham',
    welcomeBack: 'Selamat datang kembali ke portfolio Anda',
    createAccount: 'Buat Akun',
    createAccountDesc: 'Bergabung dengan PortSyncro untuk mulai melacak portfolio Anda',
    or: 'atau',
    loginDemoAccount: 'Login dengan Akun Demo',

    // Login/Register Messages
    emailAndPasswordRequired: 'Email dan password harus diisi',
    invalidCredentials: 'Email atau password salah. Pastikan Anda sudah terdaftar dan masukan kredensial yang benar.',
    tooManyFailedAttempts: 'Terlalu banyak percobaan gagal. Akun Anda sementara diblokir, coba lagi nanti atau reset password.',
    accountDisabled: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.',
    connectionError: 'Masalah koneksi. Periksa koneksi internet Anda dan coba lagi.',
    loginFailed: 'Gagal masuk: {error}',

    passwordMismatch: 'Password tidak cocok.',
    passwordsDoNotMatch: 'Password tidak cocok.',
    passwordTooShort: 'Password minimal 6 karakter.',
    emailAlreadyInUse: 'Email sudah digunakan. Gunakan email lain atau login.',
    invalidEmailFormat: 'Format email tidak valid.',
    invalidEmail: 'Format email tidak valid.',
    weakPassword: 'Password terlalu lemah. Gunakan minimal 6 karakter.',
    registrationFailed: 'Pendaftaran gagal. Silakan coba lagi.',
    userNotFound: 'Pengguna tidak ditemukan.',
    wrongPassword: 'Password salah.',
    invalidCredential: 'Email atau password salah. Silakan cek kembali.',
    tooManyRequests: 'Terlalu banyak percobaan login. Silakan coba lagi nanti.',

    dontHaveAccount: 'Belum punya akun?',
    alreadyHaveAccount: 'Sudah punya akun?',
    forgotPassword: 'Lupa Password',

    // Reset Password
    resetPassword: 'Reset Password',
    enterEmailForReset: 'Masukkan email Anda untuk reset password',
    resetPasswordEmailSent: 'Email untuk reset password telah dikirim. Silakan periksa inbox dan folder spam Anda.',
    emailNotRegistered: 'Email tidak terdaftar. Silakan periksa atau daftar akun baru.',
    resetPasswordFailed: 'Gagal mengirim email reset password. Silakan coba lagi nanti.',
    sendResetEmail: 'Kirim Email Reset Password',
    backToLogin: 'Kembali ke Login',

    // Confirm Reset Password
    // invalidResetCode: 'Kode reset password tidak valid atau sudah kadaluarsa.', // Moved to // Modals
    // invalidOrExpiredResetCode: 'Kode reset password tidak valid atau sudah kadaluarsa.', // Moved to // Modals
    // passwordChangedSuccessfully: 'Password berhasil diubah. Silakan login dengan password baru Anda.', // Moved to // Modals
    // passwordChangeFailed: 'Gagal mengubah password. Silakan coba lagi.', // Moved to // Modals
    verifyingResetCode: 'Memverifikasi kode reset password...',
    // tryResetPasswordAgain: 'Coba Reset Password Lagi', // Moved to // Modals
    enterNewPasswordForAccount: 'Masukkan password baru untuk akun {email}',
    newPassword: 'Password Baru',
    changePassword: 'Ubah Password',

    // Average Price Calculator
    averagePriceCalculator: 'Kalkulator Harga Rata-rata',
    assetType: 'Jenis Aset',
    ticker: 'Kode Saham',
    symbol: 'Simbol',
    purchases: 'Pembelian',
    addPurchase: 'Tambah Pembelian',
    broker: 'Sekuritas',
    exchange: 'Exchange',
    lots: 'Lot',
    amount: 'Jumlah',
    price: 'Harga',
    currency: 'Mata Uang',
    calculateAverage: 'Hitung Rata-rata',
    calculationResults: 'Hasil Perhitungan',
    totalLots: 'Total Lot',
    totalAmount: 'Total Jumlah',
    averagePrice: 'Harga Rata-rata',
    totalValue: 'Total Nilai',
    purchaseDetails: 'Detail Pembelian',
    addToPortfolio: 'Tambah ke Portfolio',
    calculateAnother: 'Hitung Lagi',
    pleaseFillValidData: 'Silakan isi data yang valid',
    calculationError: 'Terjadi kesalahan dalam perhitungan',
    allPurchasesMustUseSameCurrency: 'Semua pembelian harus menggunakan mata uang yang sama',
    source: 'Sumber',
    sourcePlaceholder: 'Nama sekuritas/exchange (opsional)',
    perShare: 'per saham',
    perUnit: 'per unit',
    purchase: 'Pembelian',
    reset: 'Reset',
    close: 'Tutup',
    averagePriceEstimate: 'Estimasi Harga Rata-Rata',

    // Additional Features
    addAssetDesc: 'Tambahkan saham dan kripto Anda untuk melacak portfolio',
    addStockDesc: 'Tambahkan saham Indonesia & AS ke portfolio Anda',
    addCryptoDesc: 'Tambahkan kripto ke portfolio Anda',
    quickActions: 'Aksi Cepat',
    quickActionsDesc: 'Butuh bantuan menghitung harga rata-rata atau mengelola portfolio?',
    viewPortfolio: 'Lihat Portfolio',

    // Settings
    settings: 'Pengaturan',
    showBalance: 'Tampilkan Saldo',
    hideBalance: 'Sembunyikan Saldo',
    balanceHidden: 'Saldo saat ini tersembunyi',
    balanceVisible: 'Saldo ditampilkan di dashboard',
    lightMode: 'Mode Terang',
    darkMode: 'Mode Gelap',
    switchToLightMode: 'Ganti ke tampilan terang',
    switchToDarkMode: 'Ganti ke tampilan gelap',
    switchToIndonesian: 'Ganti ke Bahasa Indonesia',
    switchToEnglish: 'Ganti ke Bahasa Inggris',
    calculateAveragePriceDesc: 'Hitung estimasi harga rata-rata',

    // Data Sources
    dataSources: 'Sumber Data',
    stockData: 'Data Saham',
    stockDataSource: 'Yahoo Finance API - Data saham IDX (Indonesia Stock Exchange)',
    cryptoData: 'Data Kripto',
    cryptoDataSource: 'CryptoCompare API - Data harga kripto global',
    exchangeRateSource: 'Exchange Rate API - Kurs USD/IDR',

    // Additional missing translations
    refreshAll: 'Refresh Semua',
    privacy: 'Privasi',
    terms: 'Syarat & Ketentuan',
    support: 'Bantuan',
    refreshAllPrices: 'Refresh Semua Harga',
    refreshAllData: 'Refresh Semua Data',
    refreshPrices: 'Refresh Harga',
    refreshExchangeRate: 'Refresh Kurs',
    refreshPortfolio: 'Refresh Portfolio',
    refreshData: 'Refresh Data',
    refreshNow: 'Refresh Sekarang',
    refreshButton: 'Refresh',
    refreshButtonText: 'Refresh',
    refreshButtonTooltip: 'Refresh data terbaru',

    // Portfolio actions
    exportPortfolio: 'Export Portfolio',
    exportToCSV: 'Export ke CSV',
    exportData: 'Export Data',
    downloadPortfolio: 'Download Portfolio',
    downloadCSV: 'Download CSV',

    // Asset management
    addNewAsset: 'Tambah Aset Baru',
    addNewStock: 'Tambah Saham Baru',
    addNewCrypto: 'Tambah Kripto Baru',
    editAsset: 'Edit Aset',
    editStock: 'Edit Saham',
    editCrypto: 'Edit Kripto',
    deleteAsset: 'Hapus Aset',
    deleteStock: 'Hapus Saham',
    deleteCrypto: 'Hapus Kripto',

    // Portfolio summary (removed duplicates - already defined above)

    // Performance metrics
    performanceMetrics: 'Metrik Performa',
    totalReturn: 'Total Return',
    totalReturnIDR: 'Total Return (IDR)',
    totalReturnUSD: 'Total Return (USD)',
    returnPercentage: 'Persentase Return',
    returnPercentageIDR: 'Persentase Return (IDR)',
    returnPercentageUSD: 'Persentase Return (USD)',

    // Time periods
    today: 'Hari Ini',
    yesterday: 'Kemarin',
    thisWeek: 'Minggu Ini',
    thisMonth: 'Bulan Ini',
    thisYear: 'Tahun Ini',
    lastWeek: 'Minggu Lalu',
    lastMonth: 'Bulan Lalu',
    lastYear: 'Tahun Lalu',

    // Status messages
    status: 'Status',
    statusLoading: 'Memuat...',
    statusSuccess: 'Berhasil',
    statusError: 'Error',
    statusWarning: 'Peringatan',
    statusInfo: 'Informasi',

    // Notifications
    notification: 'Notifikasi',
    notificationSuccess: 'Berhasil',
    notificationError: 'Error',
    notificationWarning: 'Peringatan',
    notificationInfo: 'Informasi',
    notificationClose: 'Tutup',
    notificationDismiss: 'Abaikan',

    // Tooltips
    tooltip: 'Tooltip',
    tooltipRefresh: 'Refresh data terbaru',
    tooltipExport: 'Export data ke CSV',
    tooltipAdd: 'Tambah aset baru',
    tooltipEdit: 'Edit aset',
    tooltipDelete: 'Hapus aset',
    tooltipSell: 'Jual aset',

    // Placeholders
    placeholderSearch: 'Cari...',
    placeholderSearchStocks: 'Cari saham...',
    placeholderSearchCrypto: 'Cari kripto...',
    placeholderEnterAmount: 'Masukkan jumlah...',
    placeholderEnterPrice: 'Masukkan harga...',

    // Units
    unit: 'Unit',
    unitLot: 'Lot',
    unitShare: 'Saham',
    unitCoin: 'Koin',
    unitToken: 'Token',
    unitIDR: 'IDR',
    unitUSD: 'USD',
    unitPercent: '%',

    // Validation messages
    validation: 'Validasi',
    validationRequired: 'Field ini wajib diisi',
    validationInvalid: 'Format tidak valid',
    validationMinLength: 'Minimal {min} karakter',
    validationMaxLength: 'Maksimal {max} karakter',
    validationMinValue: 'Minimal nilai {min}',
    validationMaxValue: 'Maksimal nilai {max}',
    validationEmail: 'Format email tidak valid',
    validationPassword: 'Password minimal 6 karakter',
    validationPasswordMatch: 'Password tidak cocok',

    // Stock validation
    stockCodeAndLotRequired: 'Kode saham dan jumlah lot harus diisi',
    invalidStockCodeFormat: 'Format kode saham tidak valid',
    stockCodeLettersOnly: 'Kode saham hanya boleh berisi huruf',
    failedToFetchStockPrice: 'Gagal mengambil harga saham (HTTP {status}): {error}',

    // Crypto validation
    invalidCryptoSymbolFormat: 'Format simbol kripto tidak valid',
    invalidCryptoSymbol: 'Simbol kripto tidak valid',
    cryptoSymbolTooManyNumbers: 'Simbol kripto mengandung terlalu banyak angka',
    noPriceDataAvailable: 'Data harga tidak tersedia',

    // Confirmation messages
    confirmation: 'Konfirmasi',
    confirmationDelete: 'Apakah Anda yakin ingin menghapus?',
    confirmationDeleteAsset: 'Apakah Anda yakin ingin menghapus aset ini?',
    confirmationDeleteTransaction: 'Apakah Anda yakin ingin menghapus transaksi ini?',
    confirmationLogout: 'Apakah Anda yakin ingin logout?',
    confirmationUnsavedChanges: 'Ada perubahan yang belum disimpan. Apakah Anda yakin ingin keluar?',

    // Success messages
    successMessage: 'Pesan Sukses',
    successAdded: 'Berhasil ditambahkan',
    successUpdated: 'Berhasil diperbarui',
    successDeleted: 'Berhasil dihapus',
    successSaved: 'Berhasil disimpan',
    successExported: 'Berhasil diexport',
    successRefreshed: 'Berhasil direfresh',

    // Error messages
    errorMessage: 'Pesan Error',
    errorAdded: 'Gagal menambahkan',
    errorUpdated: 'Gagal memperbarui',
    errorDeleted: 'Gagal menghapus',
    errorSaved: 'Gagal menyimpan',
    errorExported: 'Gagal mengexport',
    errorRefreshed: 'Gagal refresh',
    errorNetwork: 'Error jaringan',
    errorServer: 'Error server',
    errorUnknown: 'Error tidak diketahui',

    // Loading messages
    loadingMessage: 'Pesan Loading',
    loadingData: 'Memuat data...',
    loadingPrices: 'Memuat harga...',
    loadingPortfolio: 'Memuat portfolio...',
    loadingTransactions: 'Memuat transaksi...',
    loadingExport: 'Mengexport data...',
    loadingSave: 'Menyimpan data...',

    // Empty states
    emptyState: 'State Kosong',
    emptyStateNoData: 'Tidak ada data',
    emptyStateNoResults: 'Tidak ada hasil',
    emptyStateNoAssets: 'Tidak ada aset',
    emptyStateNoTransactions: 'Tidak ada transaksi',
    emptyStateNoStocks: 'Tidak ada saham',
    emptyStateNoCrypto: 'Tidak ada kripto',

    // Help text
    helpText: 'Teks Bantuan',
    helpTextAddAsset: 'Tambahkan aset untuk mulai melacak portfolio Anda',
    helpTextRefresh: 'Refresh untuk mendapatkan data terbaru',
    helpTextExport: 'Export data ke file CSV untuk analisis lebih lanjut',
    helpTextSearch: 'Cari aset berdasarkan nama atau kode',
    helpTextSort: 'Urutkan aset berdasarkan kriteria yang dipilih',

    // Accessibility
    accessibility: 'Aksesibilitas',
    accessibilityMenu: 'Menu',
    accessibilityClose: 'Tutup',
    accessibilityOpen: 'Buka',
    accessibilityToggle: 'Toggle',
    accessibilityExpand: 'Expand',
    accessibilityCollapse: 'Collapse',
    accessibilityNext: 'Selanjutnya',
    accessibilityPrevious: 'Sebelumnya',
    accessibilityFirst: 'Pertama',
    accessibilityLast: 'Terakhir',
    accessibilityPage: 'Halaman',
    accessibilityOf: 'dari',
    accessibilityResults: 'hasil',
    accessibilityLoading: 'Memuat',
    accessibilityLoaded: 'Dimuat',
    accessibilityError: 'Error',
    accessibilitySuccess: 'Berhasil',
    accessibilityWarning: 'Peringatan',
    accessibilityInfo: 'Informasi',
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
    bank: 'Bank',
    bankAndWalletShort: 'Bank & E-Wallet',
    bankAndWallet: 'Bank & E-Wallet',
    totalGain: 'Total Gain/Loss',
    totalGainLoss: 'Total Gain/Loss',
    gainLoss: 'Gain/Loss',
    gainLossIDR: 'Gain/Loss IDR',
    gainLossUSD: 'Gain/Loss USD',
    performance: 'Performance',
    profitable: 'Profitable',
    loss: 'Loss',
    ofTotalCost: 'of total cost',
    yesterday: 'Yesterday',
    fromPortfolio: 'of portfolio',
    addFirstAsset: 'Add First Asset',
    emptyPortfolio: 'Empty Portfolio',
    emptyPortfolioDesc: 'Start building your portfolio by adding stock or crypto assets to track your investments',
    add: 'Add',
    noStocksAdded: 'No stocks added yet',
    noCryptoAdded: 'No crypto added yet',
    total: 'Total',
    sell: 'Sell',
    amountToSell: 'Amount to Sell',
    estimatedValue: 'Estimated Value',
    confirmSell: 'Confirm Sell',

    // Portfolio Summary (consolidated)
    portfolioSummary: 'Portfolio Summary',
    portfolioValue: 'Portfolio Value',
    portfolioValueIDR: 'Portfolio Value (IDR)',
    portfolioValueUSD: 'Portfolio Value (USD)',
    totalAssets: 'Total Assets',
    totalStocks: 'Total Stocks',
    totalCrypto: 'Total Crypto',
    totalCost: 'Total Cost',
    totalValue: 'Total Value',
    totalGainLoss: 'Total Gain/Loss',
    totalGainLossIDR: 'Total Gain/Loss (IDR)',
    totalGainLossUSD: 'Total Gain/Loss (USD)',

    // Asset Table
    stock: 'Stock',
    crypto: 'Crypto',
    amount: 'Amount',
    currentPrice: 'Current Price',
    idrValue: 'IDR Value',
    usdValue: 'USD Value',
    action: 'Action',
    avgPrice: 'Avg Price',
    sell: 'Sell',
    notAvailable: 'Not available',
    assetTable: 'Asset Table',
    combined: 'Combined',

    // Asset Table Titles
    stockAssetTable: 'Stock Asset Table',
    cryptoAssetTable: 'Crypto Asset Table',
    bankAssetTable: 'Bank & E-Wallet Asset Table',
    bankAndWalletAssetTable: 'Bank & E-Wallet Asset Table',

    // Forms
    stockCode: 'Stock Code',
    stockCodePlaceholder: 'Enter stock code',
    stockCodeHelp: 'Enter IDX stock code (e.g., BBCA, BBRI, UNTR)',
    lotAmount: 'Lot Amount',
    lotAmountPlaceholder: 'Enter lot amount',
    lotAmountHelp: '1 lot = 100 shares for IDX stocks',
    addStock: 'Add Stock',
    adding: 'Adding...',
    stockSuccessfullyAdded: 'Stock {ticker} successfully added',
    cryptoSuccessfullyAdded: 'Crypto {symbol} successfully added',
    failedToAddStock: 'Failed to add stock: {error}',
    failedToAddCrypto: 'Failed to add crypto: {error}',
    stockSuccessfullyDeleted: 'Stock {ticker} successfully deleted',
    cryptoSuccessfullyDeleted: 'Crypto {symbol} successfully deleted',
    failedToDeleteStock: 'Failed to delete stock: {error}',
    failedToDeleteCrypto: 'Failed to delete crypto: {error}',
    failedToDeleteTransaction: 'Failed to delete transaction: {error}',
    failedToPrepareTransactionDeletion: 'Failed to prepare transaction deletion: {error}',
    stockSuccessfullySold: 'Successfully sold {amount} lots of {ticker}',
    cryptoSuccessfullySold: 'Successfully sold {amount} {symbol}',
    errorSellingStock: 'Error Selling Stock',
    errorSellingCrypto: 'Error Selling Crypto',
    failedToSellStock: 'Failed to sell stock: {error}',
    failedToSellCrypto: 'Failed to sell crypto: {error}',
    invalidIdxStock: 'Stock code "{ticker}" is not an IDX stock or not found. Please ensure the stock code is valid and listed on the Indonesia Stock Exchange.',
    stockNotFound: 'Stock code "{ticker}" not found on Yahoo Finance. Please ensure the stock code is valid and listed on the Indonesia Stock Exchange.',
    invalidStockFormat: 'Invalid stock code format. IDX stock codes should be 4 letters (e.g., BBCA, BBRI, UNTR).',
    confirmSale: 'Confirm Sale',
    saleConfirmation: 'You will sell {amount} {unit} {symbol} {value}. Continue with the sale?',
    saleConfirmationNoPrice: 'You will sell {amount} {unit} {symbol}. Price data will be updated automatically. Continue with the sale?',

    // Manual Asset & Edit Form
    manualPriceOptional: 'Manual Price (Opt)',
    manualPriceSettingOptional: 'Manual Price Setting (Optional)',
    resetToMarket: 'Reset to Market',
    priceIDR: 'Price (IDR)',
    priceUSD: 'Price (USD)',
    usedPrice: 'Used Price',
    estTotalValue: 'Est. Total Value',
    saveChanges: 'Save Changes',
    manualPriceWarning: '⚠️ This asset uses manual price. Clear and save to reset to market price.',
    manualModeWarning: '⚠️ Asset is in manual mode. Clear value to return to auto/API mode.',
    brokerExchange: 'Broker / Exchange',
    brokerPlaceholderStock: 'E.g., Robinhood, Fidelity',
    brokerPlaceholderCrypto: 'E.g., Binance, Coinbase',
    manual: 'MANUAL',
    invalidUSTickerFormat: 'Invalid US Ticker Format',
    coinNotFoundManualRequired: 'Coin not found in API. To add as Manual Asset, you MUST fill "Average Price" (USD or IDR) to use as current reference price.',
    stockNotFoundManualRequired: 'Stock not found in API. To add as Manual Asset, you MUST fill "Average Price" to use as current reference price.',

    // Demo account
    demoLoginFailed: 'Failed to login with demo account. Please try again.',
    demoInvalidCredential: 'Invalid demo credentials. Please ensure demo email and password are properly configured.',
    demoUserNotFound: 'Demo account not found. Please ensure the demo account exists in Firebase.',
    demoWrongPassword: 'Incorrect demo password. Please check your environment variables configuration.',
    demoAccountNotAvailable: 'Demo account is not available',

    // Filter and Sort
    searchStock: 'Search stocks...',
    searchCrypto: 'Search crypto...',
    sortBy: 'Sort by:',
    sortByNameAsc: 'Name (A-Z)',
    sortByNameDesc: 'Name (Z-A)',
    sortByAmountAsc: 'Amount (Smallest)',
    sortByAmountDesc: 'Amount (Largest)',
    sortByPriceAsc: 'Price (Smallest)',
    sortByPriceDesc: 'Price (Largest)',
    sortByValueAsc: 'Value (Smallest)',
    sortByValueDesc: 'Value (Largest)',
    sortByAvgPriceAsc: 'Average Price (Smallest)',
    sortByAvgPriceDesc: 'Average Price (Largest)',
    sortByGainLossAsc: 'Gain/Loss (Smallest)',
    sortByGainLossDesc: 'Gain/Loss (Largest)',
    showingResults: '({filtered} of {total} {type})',

    cryptoSymbol: 'Crypto Symbol',
    cryptoSymbolPlaceholder: 'Enter crypto symbol',
    cryptoSymbolHelp: 'Enter crypto symbol (e.g., BTC, ETH, ADA)',
    cryptoAmount: 'Amount',
    cryptoAmountPlaceholder: 'Enter crypto amount',
    cryptoAmountHelp: 'Enter the amount of crypto purchased',
    amountPlaceholder: 'Enter crypto amount',
    amountHelp: 'Enter the amount of crypto purchased',
    addCrypto: 'Add Crypto',
    enterCryptoSymbol: 'Enter crypto symbol',
    enterValidAmount: 'Enter a valid amount (greater than 0)',
    failedToAddCrypto: 'Failed to add crypto: {error}',
    useCommaOrDot: 'Use comma (,) or period (.) as decimal separator',
    avgPrice: 'Average Price',
    avgPricePlaceholder: 'Enter average price (optional)',
    avgPriceHint: 'Leave empty to use current market price',
    avgPriceHint: 'Leave empty to use current market price',
    optional: 'Optional',

    // Cash / Bank
    addCash: 'Add Bank & E-Wallet',
    addCashDesc: 'Add bank or e-wallet cash assets to your portfolio',
    bankName: 'Bank / E-Wallet Name',
    balance: 'Balance',
    save: 'Save',
    cashSuccessfullyAdded: 'Bank & E-Wallet {ticker} successfully added',
    failedToAddCash: 'Failed to add Bank & E-Wallet: {error}',

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
    rateLimitExceeded: 'Rate Limit Exceeded',
    rateLimitMessage: 'Too many requests to the server. Please wait a few moments before trying again. Data will be updated automatically in 5 minutes.',

    // Exchange Rate
    exchangeRate: 'USD/IDR Rate:',
    exchangeRateSource: 'Source: {source}',
    refreshExchangeRate: 'Refresh rate',
    exchangeRateUnavailable: 'Exchange rate not available for IDR conversion',
    notAvailable: 'Not available',

    // Transaction History
    transactionHistory: 'Transaction History',
    exportCSV: 'Export All',
    exportStocks: 'Export Stocks',
    exportCrypto: 'Export Crypto',
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
    actions: 'Actions',
    confirmDelete: 'Confirm Delete',
    confirmDeleteTransaction: 'Are you sure you want to delete transaction {type} {asset} ({amount})?',
    confirmDeleteTransactionHistory: 'Are you sure you want to delete transaction history {type} {asset}?',
    deleteTransactionHistoryWarning: '⚠️ WARNING: Deleting transaction history WILL NOT delete assets from your portfolio. The assets will remain in your portfolio.',
    confirmDeleteAsset: 'Are you sure you want to delete asset {asset}?',
    confirmDeleteAll: 'Confirm Delete All',
    confirmDeleteAllTransactions: 'Are you sure you want to delete all transactions? This action cannot be undone.',
    confirmDeleteAllTransactionsAndPortfolio: 'Are you sure you want to delete all transaction history? Your portfolio will remain intact. This action cannot be undone.',
    deleteAll: 'Delete All',
    noTransactions: 'No transactions',
    noTransactionsDesc: 'No transactions have been added yet. Start by adding assets to see transaction history.',
    noTransactionsToDelete: 'No transactions to delete.',
    exportFailed: 'Failed to export data to CSV: {error}',
    exportPortfolio: 'Export Portfolio',
    export: 'Export Portfolio',
    portfolioExportSuccess: 'Portfolio exported to CSV successfully',
    portfolioExportFailed: 'Failed to export portfolio: {error}',
    assetSuccessfullyDeleted: 'Asset {asset} successfully deleted',
    stockSuccessfullyDeleted: 'Stock {ticker} successfully deleted',
    cryptoSuccessfullyDeleted: 'Crypto {symbol} successfully deleted',
    failedToDeleteStock: 'Failed to delete stock: {error}',
    failedToDeleteCrypto: 'Failed to delete crypto: {error}',
    failedToDeleteAsset: 'Failed to delete asset: {error}',

    // Modals
    privacy: 'Privacy',
    resetCodeInvalid: 'Invalid or expired reset password code.',
    // The following keys are already defined under // Reset Password, moving them here as per instruction
    passwordChangedSuccessfully: 'Password changed successfully. Please login with your new password.',
    passwordChangeFailed: 'Failed to change password. Please try again.',
    invalidOrExpiredResetCode: 'Invalid or expired reset password code.', // This was already here, but instruction implies it should be moved/re-added
    tryResetPasswordAgain: 'Try Reset Password Again',
    terms: 'Terms',
    support: 'Support',
    settings: 'Settings',
    showBalance: 'Show Balance',
    hideBalance: 'Hide Balance',
    balanceHidden: 'Balance is currently hidden',
    balanceVisible: 'Balance is visible on dashboard',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    switchToLightMode: 'Switch to light appearance',
    switchToDarkMode: 'Switch to dark appearance',
    switchToIndonesian: 'Switch to Indonesian',
    switchToEnglish: 'Switch to English',
    calculateAveragePriceDesc: 'Calculate average price estimate',

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
    priceNotAvailable: 'Price not available',
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
    loadingInitialData: 'Loading initial data...',

    // Footer
    copyright: '© {year} PortSyncro - Easy Portfolio Synchronization for Cryptocurrencies and Stocks',

    // User
    logout: 'Logout',
    user: 'User',

    // Authentication
    email: 'Email',
    emailPlaceholder: 'email@example.com',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    confirmPassword: 'Confirm Password',
    confirmPasswordPlaceholder: 'Enter the same password',
    passwordMinLength: 'Minimum 6 characters',
    minPasswordLength: 'Minimum 6 characters',
    signIn: 'Sign In',
    signingIn: 'Signing In...',
    login: 'Login',
    register: 'Register',
    processing: 'Processing...',
    tagline: 'Easy Portfolio Synchronization for Cryptocurrencies and Stocks',
    welcomeBack: 'Welcome back to your portfolio',
    createAccount: 'Create Account',
    createAccountDesc: 'Join PortSyncro to start tracking your portfolio',
    or: 'or',
    loginDemoAccount: 'Login with Demo Account',

    // Login/Register Messages
    emailAndPasswordRequired: 'Email and password must be filled',
    invalidCredentials: 'Email or password is incorrect. Make sure you are registered and enter the correct credentials.',
    tooManyFailedAttempts: 'Too many failed attempts. Your account is temporarily blocked, try again later or reset password.',
    accountDisabled: 'Your account has been disabled. Please contact administrator.',
    connectionError: 'Connection problem. Check your internet connection and try again.',
    loginFailed: 'Login failed: {error}',

    passwordMismatch: 'Passwords do not match.',
    passwordsDoNotMatch: 'Passwords do not match.',
    passwordTooShort: 'Password must be at least 6 characters.',
    emailAlreadyInUse: 'Email is already in use. Use another email or login.',
    invalidEmailFormat: 'Invalid email format.',
    invalidEmail: 'Invalid email format.',
    weakPassword: 'Password is too weak. Use at least 6 characters.',
    registrationFailed: 'Registration failed. Please try again.',
    userNotFound: 'User not found.',
    wrongPassword: 'Wrong password.',
    invalidCredential: 'Invalid email or password. Please check your credentials.',
    tooManyRequests: 'Too many login attempts. Please try again later.',

    dontHaveAccount: 'Don\'t have an account?',
    alreadyHaveAccount: 'Already have an account?',
    forgotPassword: 'Forgot Password',

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
    invalidOrExpiredResetCode: 'Invalid or expired password reset code.',
    passwordChangedSuccessfully: 'Password changed successfully. Please login with your new password.',
    passwordChangeFailed: 'Failed to change password. Please try again.',
    verifyingResetCode: 'Verifying reset code...',
    tryResetPasswordAgain: 'Try Reset Password Again',
    enterNewPasswordForAccount: 'Enter new password for account {email}',
    newPassword: 'New Password',
    changePassword: 'Change Password',

    // Average Price Calculator
    averagePriceCalculator: 'Average Price Calculator',
    assetType: 'Asset Type',
    ticker: 'Stock Ticker',
    symbol: 'Symbol',
    purchases: 'Purchases',
    addPurchase: 'Add Purchase',
    broker: 'Broker',
    exchange: 'Exchange',
    lots: 'Lots',
    amount: 'Amount',
    price: 'Price',
    currency: 'Currency',
    calculateAverage: 'Calculate Average',
    calculationResults: 'Calculation Results',
    totalLots: 'Total Lots',
    totalAmount: 'Total Amount',
    averagePrice: 'Average Price',
    totalValue: 'Total Value',
    purchaseDetails: 'Purchase Details',
    addToPortfolio: 'Add to Portfolio',
    calculateAnother: 'Calculate Another',
    pleaseFillValidData: 'Please fill in valid data',
    calculationError: 'An error occurred in the calculation',
    allPurchasesMustUseSameCurrency: 'All purchases must use the same currency',
    source: 'Source',
    sourcePlaceholder: 'Broker/exchange name (optional)',
    perShare: 'per share',
    perUnit: 'per unit',
    purchase: 'Purchase',
    reset: 'Reset',
    close: 'Close',
    averagePriceEstimate: 'Estimated Average Price',

    // Additional Features
    addAssetDesc: 'Add stocks and crypto to your portfolio to track your portfolio',
    addStockDesc: 'Add Indonesian & US stocks to your portfolio',
    addCryptoDesc: 'Add crypto to your portfolio',
    quickActions: 'Quick Actions',
    quickActionsDesc: 'Need help calculating average price or managing your portfolio?',
    viewPortfolio: 'View Portfolio',

    // Data Sources
    dataSources: 'Data Sources',
    stockData: 'Stock Data',
    stockDataSource: 'Yahoo Finance API - IDX stock data (Indonesia Stock Exchange)',
    cryptoData: 'Crypto Data',
    cryptoDataSource: 'CryptoCompare API - Global crypto price data',
    exchangeRateSource: 'Exchange Rate API - USD/IDR exchange rate',

    // Additional missing translations
    refreshAll: 'Refresh All',
    refreshAllPrices: 'Refresh All Prices',
    refreshAllData: 'Refresh All Data',
    refreshPrices: 'Refresh Prices',
    refreshExchangeRate: 'Refresh Exchange Rate',
    refreshPortfolio: 'Refresh Portfolio',
    refreshData: 'Refresh Data',
    refreshNow: 'Refresh Now',
    refreshButton: 'Refresh',
    refreshButtonText: 'Refresh',
    refreshButtonTooltip: 'Refresh latest data',

    // Portfolio actions
    exportPortfolio: 'Export Portfolio',
    exportToCSV: 'Export to CSV',
    exportData: 'Export Data',
    downloadPortfolio: 'Download Portfolio',
    downloadCSV: 'Download CSV',

    // Asset management
    addNewAsset: 'Add New Asset',
    addNewStock: 'Add New Stock',
    addNewCrypto: 'Add New Crypto',
    editAsset: 'Edit Asset',
    editStock: 'Edit Stock',
    editCrypto: 'Edit Crypto',
    deleteAsset: 'Delete Asset',
    deleteStock: 'Delete Stock',
    deleteCrypto: 'Delete Crypto',

    // Portfolio summary (removed duplicates - already defined above)

    // Performance metrics
    performanceMetrics: 'Performance Metrics',
    totalReturn: 'Total Return',
    totalReturnIDR: 'Total Return (IDR)',
    totalReturnUSD: 'Total Return (USD)',
    returnPercentage: 'Return Percentage',
    returnPercentageIDR: 'Return Percentage (IDR)',
    returnPercentageUSD: 'Return Percentage (USD)',

    // Time periods
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    thisYear: 'This Year',
    lastWeek: 'Last Week',
    lastMonth: 'Last Month',
    lastYear: 'Last Year',

    // Status messages
    status: 'Status',
    statusLoading: 'Loading...',
    statusSuccess: 'Success',
    statusError: 'Error',
    statusWarning: 'Warning',
    statusInfo: 'Info',

    // Notifications
    notification: 'Notification',
    notificationSuccess: 'Success',
    notificationError: 'Error',
    notificationWarning: 'Warning',
    notificationInfo: 'Info',
    notificationClose: 'Close',
    notificationDismiss: 'Dismiss',

    // Tooltips
    tooltip: 'Tooltip',
    tooltipRefresh: 'Refresh latest data',
    tooltipExport: 'Export data to CSV',
    tooltipAdd: 'Add new asset',
    tooltipEdit: 'Edit asset',
    tooltipDelete: 'Delete asset',
    tooltipSell: 'Sell asset',

    // Placeholders
    placeholderSearch: 'Search...',
    placeholderSearchStocks: 'Search stocks...',
    placeholderSearchCrypto: 'Search crypto...',
    placeholderEnterAmount: 'Enter amount...',
    placeholderEnterPrice: 'Enter price...',

    // Units
    unit: 'Unit',
    unitLot: 'Lot',
    unitShare: 'Share',
    unitCoin: 'Coin',
    unitToken: 'Token',
    unitIDR: 'IDR',
    unitUSD: 'USD',
    unitPercent: '%',

    // Validation messages
    validation: 'Validation',
    validationRequired: 'This field is required',
    validationInvalid: 'Invalid format',
    validationMinLength: 'Minimum {min} characters',
    validationMaxLength: 'Maximum {max} characters',
    validationMinValue: 'Minimum value {min}',
    validationMaxValue: 'Maximum value {max}',
    validationEmail: 'Invalid email format',
    validationPassword: 'Password must be at least 6 characters',
    validationPasswordMatch: 'Passwords do not match',

    // Stock validation
    stockCodeAndLotRequired: 'Stock code and lot amount must be filled',
    invalidStockCodeFormat: 'Invalid stock code format',
    stockCodeLettersOnly: 'Stock code should contain only letters',
    failedToFetchStockPrice: 'Failed to fetch stock price (HTTP {status}): {error}',

    // Crypto validation
    invalidCryptoSymbolFormat: 'Invalid crypto symbol format',
    invalidCryptoSymbol: 'Invalid crypto symbol',
    cryptoSymbolTooManyNumbers: 'Crypto symbol contains too many numbers',
    noPriceDataAvailable: 'No price data available',

    // Confirmation messages
    confirmation: 'Confirmation',
    confirmationDelete: 'Are you sure you want to delete?',
    confirmationDeleteAsset: 'Are you sure you want to delete this asset?',
    confirmationDeleteTransaction: 'Are you sure you want to delete this transaction?',
    confirmationLogout: 'Are you sure you want to logout?',
    confirmationUnsavedChanges: 'You have unsaved changes. Are you sure you want to leave?',

    // Success messages
    successMessage: 'Success Message',
    successAdded: 'Successfully added',
    successUpdated: 'Successfully updated',
    successDeleted: 'Successfully deleted',
    successSaved: 'Successfully saved',
    successExported: 'Successfully exported',
    successRefreshed: 'Successfully refreshed',

    // Error messages
    errorMessage: 'Error Message',
    errorAdded: 'Failed to add',
    errorUpdated: 'Failed to update',
    errorDeleted: 'Failed to delete',
    errorSaved: 'Failed to save',
    errorExported: 'Failed to export',
    errorRefreshed: 'Failed to refresh',
    errorNetwork: 'Network error',
    errorServer: 'Server error',
    errorUnknown: 'Unknown error',

    // Loading messages
    loadingMessage: 'Loading Message',
    loadingData: 'Loading data...',
    loadingPrices: 'Loading prices...',
    loadingPortfolio: 'Loading portfolio...',
    loadingTransactions: 'Loading transactions...',
    loadingExport: 'Exporting data...',
    loadingSave: 'Saving data...',

    // Empty states
    emptyState: 'Empty State',
    emptyStateNoData: 'No data',
    emptyStateNoResults: 'No results',
    emptyStateNoAssets: 'No assets',
    emptyStateNoTransactions: 'No transactions',
    emptyStateNoStocks: 'No stocks',
    emptyStateNoCrypto: 'No crypto',

    // Help text
    helpText: 'Help Text',
    helpTextAddAsset: 'Add assets to start tracking your portfolio',
    helpTextRefresh: 'Refresh to get the latest data',
    helpTextExport: 'Export data to CSV file for further analysis',
    helpTextSearch: 'Search assets by name or code',
    helpTextSort: 'Sort assets by selected criteria',

    // Accessibility
    accessibility: 'Accessibility',
    accessibilityMenu: 'Menu',
    accessibilityClose: 'Close',
    accessibilityOpen: 'Open',
    accessibilityToggle: 'Toggle',
    accessibilityExpand: 'Expand',
    accessibilityCollapse: 'Collapse',
    accessibilityNext: 'Next',
    accessibilityPrevious: 'Previous',
    accessibilityFirst: 'First',
    accessibilityLast: 'Last',
    accessibilityPage: 'Page',
    accessibilityOf: 'of',
    accessibilityResults: 'results',
    accessibilityLoading: 'Loading',
    accessibilityLoaded: 'Loaded',
    accessibilityError: 'Error',
    accessibilitySuccess: 'Success',
    accessibilityWarning: 'Warning',
    accessibilityInfo: 'Info',
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('id'); // Default to Indonesian

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