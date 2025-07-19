// lib/fetchExchangeRate.js
export async function fetchExchangeRate() {
    try {
      console.log('Attempting to fetch exchange rate...');
      
      // Menggunakan API kurs mata uang
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch exchange rate: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Exchange rate API response:', data);
      
      // Check for different possible response structures
      let rate = null;
      if (data.conversion_rates && data.conversion_rates.IDR) {
        rate = data.conversion_rates.IDR;
      } else if (data.rates && data.rates.IDR) {
        rate = data.rates.IDR;
      } else if (data.IDR) {
        rate = data.IDR;
      } else {
        console.error('Unexpected API response structure:', data);
        throw new Error('Exchange rate data structure not recognized');
      }
      
      // Validasi nilai kurs
      if (isNaN(rate) || rate <= 0) {
        throw new Error('Invalid exchange rate value');
      }
      
      // Validasi range kurs (10,000 - 20,000 IDR per USD) - but allow for market fluctuations
      if (rate < 5000 || rate > 25000) {
        console.warn('Exchange rate seems unusual for USD/IDR:', rate);
      }
      
      console.log('Berhasil mengambil kurs:', rate);
      return {
        rate,
        source: 'Exchange Rate API',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      throw error; // Propagate error instead of returning null
    }
}