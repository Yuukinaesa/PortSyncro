# 💹 PortSyncro - Effortless Portfolio Sync for Crypto and Stocks
A modern, professional web application for tracking stocks and cryptocurrencies. **PortSyncro** helps you manage, analyze, and simulate your investments with ease, accuracy, and a beautiful interface—all powered by Next.js, React, and Firebase.

🌐 Live Website: [portsyncro.arfan.biz.id](https://portsyncro.arfan.biz.id/)

---

## ✨ Features

### 📊 Real-time Stock & Crypto Prices
- **Live Data:** Fetch real-time prices for stocks (IDX & US) and cryptocurrencies
- **Smart Portfolio:** Track multiple assets in one place
- **Professional Formatting:** Clean, readable data presentation

### 💸 USD/IDR Exchange Rate
- **Automatic Conversion:** Live USD/IDR rates for accurate portfolio value
- **Source:** ExchangeRate-API integration

### 🧾 Transaction History
- **Buy/Sell Tracking:** Record and view all your asset transactions
- **Detailed Logs:** Timestamped, categorized, and easy to review

### 🔒 Authentication
- **Secure Login/Register:** Firebase Auth for safe access
- **Protected Routes:** Only logged-in users can access portfolio features

### 🌗 Dark Mode
- **Modern UI:** Beautiful interface in both light and dark themes
- **One-click Toggle:** Instantly switch between modes

### 🛡️ Error Handling
- **Friendly Messages:** Clear feedback for missing data or API issues
- **Robust Validation:** Prevents invalid input and actions

---

## 🚀 Quickstart

Clone the repository:
```sh
git clone https://github.com/Yuukinaesa/PortSyncro.git
cd PortSyncro
```

Install dependencies:
```sh
npm install
# or
yarn install
```

Set up your environment variables:
- Copy `.env.local.example` to `.env.local` and fill in your Firebase and API keys.

Run the application:
```sh
npm run dev
# or
yarn dev
```

Open your browser:
- Visit [http://localhost:3000](http://localhost:3000)

---

## 🖥️ Requirements
- Node.js: 16+
- Next.js: React framework
- Firebase: Auth & Firestore
- Tailwind CSS: Styling
- Yahoo Finance API: Stock data
- CryptoCompare API: Crypto data
- ExchangeRate-API: Currency conversion

---

## 📂 Project Structure
```
components/      # Reusable React components
lib/             # Utility functions, API clients, context
pages/           # Next.js pages (routes)
public/          # Static assets (images, icons)
styles/          # Global and component styles
```

---

## 🎯 Key Features
- Modern, responsive design
- Real-time calculations and updates
- Secure authentication
- Accurate currency conversion
- Comprehensive transaction history
- Professional UI/UX

---

## 📄 License
This project is licensed under the MIT License.

---

## 🤝 Contributing
Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## 🙋 Support
For questions or support, please open an issue on the repository.

---

> **PortSyncro** — [portsyncro.arfan.biz.id](https://portsyncro.arfan.biz.id)
> _Effortless Portfolio Sync for Crypto and Stocks._
