# PortSyncro - Portfolio Management Application

A secure, real-time portfolio management application built with Next.js and Firebase for tracking stocks and cryptocurrency investments.

<div align="center">
  <img src="public/img/mainlogo.png" alt="PortSyncro Logo" width="150" style="border: 2px solid #e1e5e9; border-radius: 8px; padding: 8px;">
</div>

## 📸 Screenshots

<div align="center">
  <img src="public/img/dashboard.png" alt="Dashboard" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
  <img src="public/img/addasset.png" alt="Add Asset" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
  <br>
  <img src="public/img/asset.png" alt="Asset View" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
  <img src="public/img/avgcalc1.png" alt="Average Calculator" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
  <br>
  <img src="public/img/history.png" alt="History" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
  <img src="public/img/login.png" alt="Login" width="300" style="border: 2px solid #e1e5e9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 5px;">
</div>

## 🔒 Security Features

- **Firebase Authentication** with secure session management
- **Protected routes** with automatic redirects
- **Input validation & sanitization** for XSS protection
- **Rate limiting** (30 requests/minute per user/IP)
- **AES-256-CBC encryption** for sensitive data
- **Security headers** (CSP, HSTS, X-Frame-Options)
- **Real-time threat detection** and monitoring

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Firebase project

### Environment Variables
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_ENCRYPTION_KEY=your_32_character_encryption_key
```

### Installation
```bash
git clone https://github.com/yourusername/portsyncro.git
cd portsyncro
npm install
npm run dev
```

## 🌟 Key Features

- **📊 Real-time Portfolio Tracking** - Monitor stocks and crypto investments live
- **💰 Average Price Calculator** - Advanced calculation for multiple transactions
- **📈 Stock & Crypto Support** - Indonesian stocks (IDX) and global cryptocurrencies
- **🔄 Transaction History** - Complete history with filtering and search
- **🔐 Secure Authentication** - Firebase-based user management
- **📱 Responsive Design** - Works on desktop and mobile devices
- **🌍 Multi-language Support** - Indonesian and English interface

## 🔗 Live Demo

**[🌐 Visit PortSyncro Live](https://portsyncro.arfan.biz.id/)**

## 📊 Data Sources

- **Stocks**: Yahoo Finance API (Indonesia Stock Exchange)
- **Cryptocurrencies**: CryptoCompare API (Global crypto data)
- **Exchange Rates**: Exchange Rate API (USD/IDR conversion)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Firebase project

### Environment Variables
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_ENCRYPTION_KEY=your_32_character_encryption_key
```

### Installation
```bash
git clone https://github.com/yourusername/portsyncro.git
cd portsyncro
npm install
npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**PortSyncro** - Sinkronisasi Portofolio yang Mudah untuk Kripto dan Saham
