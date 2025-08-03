# PortSyncro - Portfolio Management App

A modern portfolio management application built with Next.js and Tailwind CSS, designed to track stocks and cryptocurrency investments with a beautiful Dribbble-inspired UI/UX.

**Easy Portfolio Synchronization for Cryptocurrencies and Stocks**

<img src="public/img/mainlogo.png" alt="PortSyncro Logo" width="200">

## 🚀 Features

- **Portfolio Management**: Track Indonesian stocks and cryptocurrency investments
- **Real-time Price Updates**: Get live prices for stocks and crypto
- **Exchange Rate Integration**: USD/IDR exchange rate tracking
- **Average Price Calculator**: Calculate weighted average prices for multiple purchases
- **Transaction History**: Keep track of all buy/sell transactions
- **Export Functionality**: Export portfolio data to CSV
- **Multi-language Support**: English and Indonesian
- **Dark/Light Mode**: Toggle between themes
- **Responsive Design**: Works on desktop, tablet, and mobile

## 📱 Screenshots

| Dashboard | Asset Management | Asset View |
|-----------|------------------|------------|
| ![Dashboard](public/img/dashboard.png) | ![Add Asset](public/img/addasset.png) | ![Asset](public/img/asset.png) |

| Average Price Calculator | History | Login |
|-------------------------|---------|-------|
| ![Average Price Calculator](public/img/avgcalc1.png) | ![History](public/img/history.png) | ![Login](public/img/login.png) |

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 18
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Auth
- **Database**: Firebase Firestore
- **Icons**: React Icons
- **State Management**: React Context API

## 📦 Quick Start

1. Clone the repository:
```bash
git clone https://github.com/yourusername/PortSyncro.git
cd PortSyncro
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables in `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🎨 Design Features

- **Glass Morphism**: Subtle backdrop blur effects
- **Gradient Backgrounds**: Beautiful gradient combinations
- **Smooth Animations**: CSS transitions and micro-interactions
- **Responsive Design**: Mobile-first approach
- **Dark Mode**: Full dark mode support

## 📊 Key Features

### Portfolio Management
- Add Indonesian stocks (IDX market) with lot-based calculations
- Add cryptocurrencies with real-time pricing
- Track portfolio performance and gains/losses
- View portfolio allocation and percentages

### Price Tracking
- Real-time stock prices from Yahoo Finance
- Cryptocurrency prices from multiple sources
- USD/IDR exchange rate integration

### Calculations
- **Average Price Calculator**: Calculate weighted average prices for multiple purchases
- **Gain/Loss Calculations**: Calculations in both IDR and USD currencies
- **Performance Metrics**: Comprehensive analytics and performance tracking

## 🌐 Internationalization

PortSyncro supports multiple languages:
- **English (en)**: Complete English interface
- **Indonesian (id)**: Complete Indonesian interface

## 🚀 Deployment

Deploy to Vercel, Netlify, or any Next.js-compatible platform.

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
