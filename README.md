# ⋆✴︎˚｡⋆ Just Launched My New Project: PortSyncro - Easy Portfolio Synchronization for Cryptocurrencies, Stocks, and Gold ⋆✴︎˚｡⋆

Ever found yourself in this frustrating situation? You have the same stock (like BBRI) across 3 different brokerages, or Bitcoin spread across 2 different exchanges, and you're constantly struggling to track your true average price and overall portfolio performance?

I've always been proactive about risk management. Seeing incidents like R*B Sekuritas going down for days, or In*o*ax experiencing technical issues, reinforced my belief in the importance of diversification across multiple platforms. But this created a new problem: portfolio fragmentation.

## Why Split Across Different Platforms?

When you invest in the same asset across multiple platforms, you're not just diversifying your holdings, you're protecting yourself from platform-specific risks. Imagine needing to withdraw funds during an emergency, only to find that your primary exchange or brokerage is experiencing technical issues or downtime. By spreading your investments across multiple platforms, you ensure that you always have access to at least some of your funds, regardless of which platform encounters problems.

## The Challenge

- Same assets across multiple brokerages/exchanges with no unified view
- Manual calculations leading to errors and time waste
- Difficulty tracking overall portfolio performance
- Platform downtime risks (as we've seen with recent incidents)
- No real-time synchronization

## The Solution

PortSyncro bridges the gap between smart diversification and manageable portfolio tracking. It's a modern, secure platform that unifies your investments across multiple platforms into one intelligent dashboard. With this, I can more easily maintain stock, crypto, and gold investments simultaneously.

## Key Features

✅ **Portfolio Synchronization** - Unify assets across multiple platforms with strict Cloud-First synchronization.

✅ **Smart Average Price Calculator** - Accurate calculations regardless of where you bought each asset.

✅ **Real-time Performance Tracking** - Live updates from **Yahoo Finance**, **CoinGecko**, & **Pegadaian**.

✅ **Dual Currency Support** - Gain/loss calculations in both **IDR** and **USD** (Real-time Exchange Rates via Frankfurter API).

✅ **Comprehensive Analytics** - Detailed performance insights and reporting.

✅ **Data Integrity** - "Restore = REPLACE" functionality ensures clean state recovery from backups.

✅ **Gold Asset Management** - Track physical & digital gold prices from Antam/Pegadaian.

✅ **Enterprise-Grade Security** - Hardened logging, protected routes, and strict production safety constraints.

## Security & Reliability

- **Firebase Authentication** with secure session management
- **AES-256-CBC encryption** for sensitive data
- **Protected routes** with automatic redirects
- **Input validation & sanitization** for XSS protection
- **Rate limiting** (30 requests/minute per user/IP)
- **Security headers** (CSP, HSTS, X-Frame-Options)
- **Zero-knowledge Logging** (No sensitive data or debug logs exposed in Production)
- **Strict Offline Handling** (Prevents data desynchronization)

## Data Sources

- **Indonesian Stocks (IDX)** - Yahoo Finance API & Google Finance (Real-time Web Scraping)
- **US Stocks** - Google Finance (Real-time) & Yahoo Finance
- **Global Cryptocurrencies** - CryptoCompare API (Min-API)
- **Gold (Emas)** - Pegadaian (via IndoGold Scraping) & Yahoo Finance (GLD ETF for Global Trends)
- **Exchange Rates** - Frankfurter API (Primary) & Exchange Rate API

## Why This Matters

In today's volatile market, having your investments spread across multiple platforms is smart risk management. But without proper tools, it becomes a nightmare to manage. PortSyncro gives you the security of diversification without the complexity of manual tracking.

This project represents months of development and real-world problem-solving. It's not just another portfolio tracker, it's a solution born from actual investment challenges that many of us face.

## Live Demo

**[🌐 Experience PortSyncro Live](https://portsyncro.arfan.biz.id/)**

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: Firebase (Authentication, Firestore Database, Functions)
- **State Management**: React Context + Real-time Firestore Listeners
- **PWA**: Fully offline-capable UI (with strict online data sync)
- **Security**: Hardened Security Monitoring, AES-256

## Screenshots

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

---

**PortSyncro** - Sinkronisasi Portofolio yang Mudah untuk Kripto, Saham, dan Emas

*Built with ❤️ for the Indonesian investment community*
