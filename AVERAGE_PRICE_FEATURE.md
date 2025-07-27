# Fitur Average Price & Gain/Loss

## Overview
Fitur Average Price (Harga Rata-rata) memungkinkan pengguna untuk melacak keuntungan dan kerugian investasi mereka dengan lebih akurat. Sistem ini menghitung rata-rata harga pembelian secara otomatis dan menampilkan gain/loss berdasarkan perbedaan antara harga pasar saat ini dengan rata-rata harga pembelian. **Fitur terbaru: Average Price dapat diedit manual untuk penyesuaian yang lebih fleksibel.**

## Komponen Utama

### 1. Average Price (Harga Rata-rata) - **EDITABLE**
- **Definisi**: Rata-rata harga pembelian yang dapat diedit manual
- **Cara Edit**: Klik ikon edit (✏️) di kolom Avg Price
- **Rumus Default**: `Total Cost / Total Amount`
- **Fleksibilitas**: Dapat disesuaikan manual untuk akurasi yang lebih baik
- **Contoh**: 
  - Beli 1 lot BBCA @ Rp 7,000 = Rp 700,000
  - Beli 1 lot BBCA @ Rp 8,000 = Rp 800,000
  - Total: 2 lot, Rp 1,500,000
  - **Average Price**: Rp 1,500,000 / 2 lot = Rp 7,500 per lot
  - **Dapat diedit** menjadi Rp 7,200 jika diperlukan

### 2. Auto Calculation
- **Definisi**: Jika tidak input manual, sistem menggunakan harga pasar saat pembelian
- **Kegunaan**: Memastikan data selalu tersedia
- **Override**: Dapat diganti dengan nilai manual kapan saja

### 3. Gain/Loss (Keuntungan/Kerugian)
- **Definisi**: Selisih antara nilai pasar saat ini dengan total biaya pembelian
- **Rumus**: `Current Market Value - Total Cost`
- **Update Otomatis**: Berubah saat Average Price diedit
- **Tampilan**: 
  - Hijau untuk profit (gain)
  - Merah untuk loss
  - Dengan persentase ROI

### 4. ROI (Return on Investment)
- **Definisi**: Persentase keuntungan/kerugian relatif terhadap modal investasi
- **Rumus**: `(Gain / Total Cost) × 100%`
- **Real-time**: Update otomatis saat Average Price berubah

## Struktur Tabel Baru

| Kolom | Deskripsi | Fitur |
|-------|-----------|-------|
| **Asset** | Nama saham/kripto | Icon dan kode |
| **Jumlah** | Lot (saham) / Amount (kripto) | Editable saat jual |
| **Harga Sekarang** | Harga pasar real-time | Dengan perubahan % |
| **Nilai IDR** | Nilai dalam Rupiah | Konversi otomatis |
| **Nilai USD** | Nilai dalam Dollar | Untuk kripto |
| **Aksi** | Tombol Jual | Konfirmasi penjualan |
| **Avg Price** | Harga rata-rata | **EDITABLE** ✏️ |
| **Gain/Loss** | Keuntungan/kerugian | Update otomatis |

## Cara Penggunaan

### Menambah Saham dengan Entry Price
1. Buka tab "Tambah Aset" → "Saham"
2. Masukkan kode saham (contoh: BBCA)
3. Masukkan jumlah lot
4. **Opsional**: Masukkan harga entry (harga beli per saham)
5. Klik "Tambah Saham"

### Menambah Kripto dengan Entry Price
1. Buka tab "Tambah Aset" → "Kripto"
2. Masukkan simbol kripto (contoh: SOL)
3. Masukkan jumlah
4. **Opsional**: Masukkan harga entry (harga beli per unit)
5. Klik "Tambah Kripto"

### Mengedit Average Price
1. **Klik ikon edit** (✏️) di kolom Avg Price
2. **Masukkan harga baru** yang diinginkan
3. **Klik ✓** untuk menyimpan atau **✕** untuk batal
4. **Gain/Loss akan update otomatis**

### Melihat Gain/Loss
- **Tabel Aset**: Kolom "Avg Price" dan "Gain/Loss" menampilkan informasi detail
- **Dashboard**: Kartu "Total Gain" dan "ROI" menampilkan ringkasan
- **Warna**: 
  - 🟢 Hijau = Profit
  - 🔴 Merah = Loss

## Contoh Skenario

### Skenario 1: Pembelian Bertahap dengan Edit
```
Transaksi 1: Beli 1 lot BBCA @ Rp 7,000
Transaksi 2: Beli 1 lot BBCA @ Rp 8,000
Harga Sekarang: Rp 8,450

Perhitungan Awal:
- Total Cost: Rp 15,000,000 (2 lot)
- Average Price: Rp 7,500 per lot
- Current Value: Rp 16,900,000 (2 lot × Rp 8,450)
- Gain: Rp 1,900,000
- ROI: +12.67%

Setelah Edit Avg Price ke Rp 7,200:
- Total Cost: Rp 14,400,000 (2 lot × Rp 7,200)
- Current Value: Rp 16,900,000
- Gain: Rp 2,500,000
- ROI: +17.36%
```

### Skenario 2: Auto Calculation
```
Saat menambah aset tanpa input manual:
- Sistem menggunakan harga pasar saat ini
- Avg Price = Harga pasar saat pembelian
- Dapat diedit nanti jika diperlukan
```

## Fitur Tambahan

### 1. Edit Average Price
- **Icon Edit**: ✏️ di kolom Avg Price
- **Input Validation**: Hanya terima angka positif
- **Real-time Update**: Gain/Loss berubah langsung
- **Cancel Option**: Bisa dibatalkan dengan ✕

### 2. Informasi Visual
- **Ikon**: 📈 untuk gain, 📉 untuk loss
- **Warna**: Konsisten di seluruh aplikasi
- **Persentase**: Ditampilkan dengan simbol +/-

### 3. Responsive Design
- **Desktop**: Semua kolom ditampilkan
- **Mobile**: Kolom penting tetap terlihat
- **Tablet**: Layout yang dioptimalkan

### 4. Real-time Updates
- Harga diperbarui otomatis
- Gain/Loss dihitung ulang setiap kali harga berubah
- Dashboard menampilkan data terbaru

## Perhitungan Teknis

### Formula Average Price (Editable)
```javascript
// Default calculation
avgPrice = totalCost / totalAmount

// After manual edit
avgPrice = userInput
totalCost = avgPrice * totalAmount
gain = (currentPrice * totalAmount) - totalCost
```

### Formula Gain/Loss (Auto Update)
```javascript
gain = (currentPrice × totalAmount) - totalCost
```

### Formula ROI (Real-time)
```javascript
roi = (gain / totalCost) × 100
```

### Handling Sell Transactions
- Average price tidak berubah saat menjual
- Cost basis dikurangi proporsional
- Gain/Loss dihitung berdasarkan posisi yang tersisa

## Keuntungan Fitur

1. **Fleksibilitas Tinggi**: Average Price dapat disesuaikan manual
2. **Tracking Akurat**: Melacak performa investasi dengan presisi
3. **Analisis Mendalam**: Memahami profitabilitas setiap aset
4. **Keputusan Investasi**: Data untuk strategi beli/jual
5. **Portfolio Management**: Overview performa keseluruhan
6. **User Experience**: Interface yang intuitif dan informatif

## Troubleshooting

### Q: Bagaimana cara mengedit Average Price?
A: Klik ikon edit (✏️) di kolom Avg Price, masukkan harga baru, lalu klik ✓ untuk menyimpan.

### Q: Apakah Gain/Loss berubah saat edit Average Price?
A: Ya, Gain/Loss akan update otomatis berdasarkan Average Price yang baru.

### Q: Bagaimana jika tidak memasukkan Entry Price saat menambah aset?
A: Sistem akan menggunakan harga pasar saat pembelian sebagai Average Price default.

### Q: Apakah Average Price bisa diedit berkali-kali?
A: Ya, dapat diedit kapan saja sesuai kebutuhan.

### Q: Bagaimana dengan transaksi jual?
A: Transaksi jual mengurangi jumlah dan cost basis, tetapi tidak mengubah average price. 