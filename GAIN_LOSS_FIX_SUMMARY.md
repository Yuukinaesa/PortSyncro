# Ringkasan Perbaikan Gain/Loss Calculation

## 🎯 **Tujuan**
Memperbaiki perhitungan gain/loss yang tidak akurat di dashboard, terutama untuk kasus break-even dan perhitungan real-time.

## 🐛 **Masalah yang Ditemukan**

### 1. **Gain/Loss Tidak Akurat**
Berdasarkan screenshot dashboard, ditemukan masalah:
- **BBCA**: Menunjukkan `Rp -845.000` dan `-100.00%` padahal seharusnya break-even
- **SOL**: Menunjukkan `Rp -940` dan `-100.00%` padahal seharusnya ada gain kecil
- **SUI**: Menunjukkan `Rp -0` dan `-0.77%` padahal seharusnya loss kecil
- **FLY**: Menunjukkan `Rp 0` dan `+0.41%` padahal seharusnya gain kecil

### 2. **Root Cause**
- Perhitungan gain/loss menggunakan data `asset.gain` yang sudah lama
- Tidak menggunakan harga real-time untuk perhitungan gain/loss
- Perhitungan tidak konsisten antara saham (IDR) dan crypto (USD)

## 🔧 **Perbaikan yang Dilakukan**

### 1. **File**: `components/AssetTable.js`

#### **Perubahan Utama**:
- **Menambahkan perhitungan real-time gain/loss** menggunakan harga pasar terkini
- **Memisahkan perhitungan untuk saham dan crypto**
- **Menambahkan debug logging** untuk troubleshooting

#### **Kode yang Ditambahkan**:
```javascript
// Recalculate gain/loss using real-time price and current portfolio value
let realTimeGain = 0;
let realTimeGainPercentage = 0;

if (assetValue.price && asset.totalCost) {
  // Calculate current portfolio value using real-time price
  const currentPortfolioValue = assetValue.price * (type === 'stock' ? asset.lots * 100 : asset.amount);
  
  if (type === 'stock') {
    // For stocks: gain/loss in IDR
    realTimeGain = currentPortfolioValue - asset.totalCost;
    realTimeGainPercentage = calculateGainPercentage(realTimeGain, asset.totalCost);
  } else {
    // For crypto: gain/loss in USD, convert to IDR for display
    const gainUSD = currentPortfolioValue - asset.totalCost;
    realTimeGain = exchangeRate ? gainUSD * exchangeRate : gainUSD;
    // For percentage calculation, use USD values
    realTimeGainPercentage = calculateGainPercentage(gainUSD, asset.totalCost);
  }
}
```

#### **Perubahan Display**:
```javascript
// Sebelum
<span className={`text-sm font-medium ${getGainColor(asset.gain)}`}>
  {asset.gain !== undefined && asset.gain !== null ? (asset.gain === 0 ? 'Rp 0' : formatPrice(asset.gain, asset.currency || 'IDR', true)) : '-'}
</span>

// Sesudah
<span className={`text-sm font-medium ${getGainColor(realTimeGain)}`}>
  {realTimeGain !== undefined && realTimeGain !== null ? (realTimeGain === 0 ? 'Rp 0' : formatPrice(realTimeGain, asset.currency || 'IDR', true)) : '-'}
</span>
```

### 2. **Logika Perhitungan**

#### **Untuk Saham (IDR)**:
```javascript
// Current portfolio value = current price × (lots × 100 shares)
const currentPortfolioValue = assetValue.price * (asset.lots * 100);
// Gain/Loss = Current value - Total cost
realTimeGain = currentPortfolioValue - asset.totalCost;
// Percentage = (Gain/Loss) / Total cost × 100
realTimeGainPercentage = (realTimeGain / asset.totalCost) * 100;
```

#### **Untuk Crypto (USD)**:
```javascript
// Current portfolio value = current price × amount
const currentPortfolioValue = assetValue.price * asset.amount;
// Gain/Loss in USD = Current value - Total cost
const gainUSD = currentPortfolioValue - asset.totalCost;
// Convert to IDR for display
realTimeGain = exchangeRate ? gainUSD * exchangeRate : gainUSD;
// Percentage calculation uses USD values
realTimeGainPercentage = (gainUSD / asset.totalCost) * 100;
```

## 📊 **Hasil Perbaikan**

### 1. **Perhitungan yang Benar**
- **BBCA**: Sekarang akan menunjukkan gain/loss yang akurat berdasarkan harga real-time
- **SOL**: Gain/loss akan dihitung dengan benar dalam USD, lalu dikonversi ke IDR
- **SUI**: Loss kecil akan ditampilkan dengan benar
- **FLY**: Gain kecil akan ditampilkan dengan benar

### 2. **Konsistensi Data**
- **Real-time**: Semua perhitungan menggunakan harga pasar terkini
- **Currency**: Saham dalam IDR, crypto dalam USD (dikonversi ke IDR untuk display)
- **Break-even**: Nilai 0 akan ditampilkan dengan warna biru dan format "Rp 0"

### 3. **Debug Information**
```javascript
console.log(`Asset ${type === 'stock' ? asset.ticker : asset.symbol}:`, {
  currentPrice: assetValue.price,
  avgPrice: asset.avgPrice,
  totalCost: asset.totalCost,
  currentPortfolioValue: assetValue.price * (type === 'stock' ? asset.lots * 100 : asset.amount),
  realTimeGain,
  realTimeGainPercentage,
  oldGain: asset.gain,
  type: type,
  exchangeRate: exchangeRate
});
```

## ✅ **Keuntungan Perbaikan**

### 1. **Akurasi**
- Gain/loss dihitung berdasarkan harga real-time
- Tidak bergantung pada data lama yang mungkin tidak akurat
- Perhitungan konsisten antara saham dan crypto

### 2. **User Experience**
- User melihat gain/loss yang akurat dan up-to-date
- Break-even ditampilkan dengan jelas (warna biru, "Rp 0")
- Tidak ada lagi kebingungan dengan nilai yang tidak masuk akal

### 3. **Maintenance**
- Kode lebih mudah di-debug dengan logging yang detail
- Perhitungan terpisah untuk saham dan crypto
- Mudah untuk menambah fitur baru di masa depan

## 🔍 **Testing**

### 1. **Break-even Scenario**
- Asset dengan harga sekarang = avg price
- Seharusnya menampilkan "Rp 0" dengan warna biru
- Percentage = 0.00%

### 2. **Gain Scenario**
- Asset dengan harga sekarang > avg price
- Seharusnya menampilkan nilai positif dengan warna hijau
- Percentage positif

### 3. **Loss Scenario**
- Asset dengan harga sekarang < avg price
- Seharusnya menampilkan nilai negatif dengan warna merah
- Percentage negatif

## 📋 **Checklist Perbaikan**

- [x] **Real-time Calculation**: Menambahkan perhitungan gain/loss real-time
- [x] **Stock Logic**: Memperbaiki perhitungan untuk saham (IDR)
- [x] **Crypto Logic**: Memperbaiki perhitungan untuk crypto (USD → IDR)
- [x] **Display Update**: Menggunakan nilai real-time untuk display
- [x] **Debug Logging**: Menambahkan logging untuk troubleshooting
- [x] **Break-even Fix**: Memastikan break-even ditampilkan dengan benar
- [x] **Color Coding**: Memastikan warna sesuai dengan nilai gain/loss

## 🚀 **Hasil Akhir**

Sekarang gain/loss dihitung dengan akurat berdasarkan:
1. **Harga real-time** dari API
2. **Total cost** yang benar dari transaksi
3. **Currency conversion** yang tepat untuk crypto
4. **Break-even detection** yang akurat

Dashboard akan menampilkan gain/loss yang akurat dan up-to-date! 🎉 