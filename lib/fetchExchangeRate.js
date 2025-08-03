import { secureLogger } from './security';
// lib/fetchExchangeRate.js
export async function fetchExchangeRate() {
    const apis = [
        {
            name: 'Exchange Rate API',
            url: 'https://api.exchangerate-api.com/v4/latest/USD',
            extractRate: (data) => data.conversion_rates?.IDR || data.rates?.IDR || data.IDR
        },
        {
            name: 'Fixer API (Free)',
            url: 'https://api.fixer.io/latest?base=USD&symbols=IDR',
            extractRate: (data) => data.rates?.IDR
        },
        {
            name: 'Currency Layer (Backup)',
            url: 'https://api.currencylayer.com/live?access_key=free&currencies=IDR&source=USD',
            extractRate: (data) => data.quotes?.USDIDR
        }
    ];

    for (const api of apis) {
        try {
            secureLogger.log(`Attempting to fetch exchange rate from ${api.name}...`);
            
            const response = await fetch(api.url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                // Add timeout
                signal: AbortSignal.timeout(10000) // 10 second timeout
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            secureLogger.log(`${api.name} response:`, data);
            
            const rate = api.extractRate(data);
            
            if (!rate || isNaN(rate) || rate <= 0) {
                throw new Error(`Invalid rate from ${api.name}: ${rate}`);
            }
            
            // Validate range (5,000 - 25,000 IDR per USD)
            if (rate < 5000 || rate > 25000) {
                secureLogger.warn(`Exchange rate from ${api.name} seems unusual: ${rate}`);
            }
            
            secureLogger.log(`Successfully fetched rate from ${api.name}:`, rate);
            return {
                rate: parseFloat(rate),
                source: api.name,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            secureLogger.error(`Error fetching from ${api.name}:`, error);
            continue; // Try next API
        }
    }
    
    // If all APIs fail, return a fallback rate (you can update this manually)
    secureLogger.warn('All exchange rate APIs failed, using fallback rate');
    return {
        rate: 15750, // Fallback rate - update this manually if needed
        source: 'Fallback Rate',
        timestamp: new Date().toISOString(),
        isFallback: true
    };
}