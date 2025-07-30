// lib/fetchPrices.js
export async function fetchStockPrices(tickers) {
  console.log('fetchStockPrices called with tickers:', tickers);
  
  if (!tickers || tickers.length === 0) {
    console.log('No tickers provided, returning empty object');
    return {};
  }
  
  try {
    const result = {};
    
    // Map untuk melacak ticker yang sudah diproses (case-insensitive)
    const processedTickers = new Map();
    // Simple in-memory cache for this request
    const fetchCache = {};
    
    console.log('Processing tickers:', tickers);
    
    // Deteksi region berdasarkan ticker
    for (const ticker of tickers) {
      try {
        console.log('Processing ticker:', ticker);
        
        // Skip jika sudah diproses (case-insensitive)
        const tickerUpper = ticker.toUpperCase();
        if (processedTickers.has(tickerUpper)) {
          console.log('Ticker already processed:', tickerUpper);
          continue;
        }
        processedTickers.set(tickerUpper, true);
        // Use cache if available
        if (fetchCache[tickerUpper]) {
          console.log('Using cached data for:', tickerUpper);
          result[ticker] = fetchCache[tickerUpper];
          continue;
        }
        
        let symbol = ticker;
        let exchange = '';
        
        // Auto-detect exchange/region berdasarkan format
        // Format: SYMBOL:EXCHANGE atau SYMBOL.EXCHANGE
        if (ticker.includes(':')) {
          [symbol, exchange] = ticker.split(':');
        } else if (ticker.includes('.')) {
          [symbol, exchange] = ticker.split('.');
        }
        
        console.log('Parsed symbol:', symbol, 'exchange:', exchange);
        
        // Normalisasi simbol untuk menghindari masalah case-sensitivity
        const normalizedSymbol = symbol.toUpperCase();
        
        // Tentukan endpoint dan format symbol berdasarkan exchange
        let apiUrl = '';
        if (exchange === 'JK' || (!exchange && normalizedSymbol.length <= 4 && normalizedSymbol === symbol.toUpperCase())) {
          // Indonesia (IDX)
          apiUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${normalizedSymbol}.JK?interval=1d`;
          console.log('Fetching IDX stock data from:', apiUrl);
        } else {
          // Default to IDX for unknown exchanges
          apiUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${normalizedSymbol}.JK?interval=1d`;
          console.log('Fetching IDX stock data (default) from:', apiUrl);
        }
        
        console.log('Making API request to:', apiUrl);
        const response = await fetch(apiUrl);
        console.log('API response status:', response.status);
        
        if (!response.ok) {
          console.warn(`Could not fetch data for ${ticker} from ${apiUrl} - status: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        console.log('API response data for', ticker, ':', data);
        
        // API call completed
        if (data.chart && 
            data.chart.result && 
            data.chart.result[0] && 
            data.chart.result[0].meta && 
            data.chart.result[0].meta.regularMarketPrice) {
          const price = data.chart.result[0].meta.regularMarketPrice;
          const currency = data.chart.result[0].meta.currency || 'USD';
          
          // Get price change if available - try multiple sources
          let change = 0;
          let changeTime = '24h';
          
          // Log all available data for debugging
          console.log(`Full meta data for ${ticker}:`, data.chart.result[0].meta);
          
          // Try chartPreviousClose first (this is what Yahoo Finance uses)
          if (data.chart.result[0].meta.chartPreviousClose && data.chart.result[0].meta.chartPreviousClose > 0) {
            const prevClose = data.chart.result[0].meta.chartPreviousClose;
            change = ((price - prevClose) / prevClose) * 100;
            changeTime = '24h';
            console.log(`Calculated change using chartPreviousClose for ${ticker}: ${prevClose} -> ${price} = ${change.toFixed(2)}% (24h)`);
          } 
          // Try previousClose as fallback
          else if (data.chart.result[0].meta.previousClose && data.chart.result[0].meta.previousClose > 0) {
            const prevClose = data.chart.result[0].meta.previousClose;
            change = ((price - prevClose) / prevClose) * 100;
            changeTime = '24h';
            console.log(`Calculated change using previousClose for ${ticker}: ${prevClose} -> ${price} = ${change.toFixed(2)}% (24h)`);
          }
          // Try regularMarketChange if previousClose not available
          else if (data.chart.result[0].meta.regularMarketChange && data.chart.result[0].meta.regularMarketChangePercent) {
            change = data.chart.result[0].meta.regularMarketChangePercent;
            changeTime = '24h';
            console.log(`Using regularMarketChangePercent for ${ticker}: ${change.toFixed(2)}% (24h)`);
          }
          // Try chart data for intraday changes
          else if (data.chart.result[0].indicators && 
                   data.chart.result[0].indicators.quote && 
                   data.chart.result[0].indicators.quote[0] &&
                   data.chart.result[0].indicators.quote[0].close) {
            const closeData = data.chart.result[0].indicators.quote[0].close;
            const validCloses = closeData.filter(c => c !== null && c !== undefined);
            if (validCloses.length >= 2) {
              const currentClose = validCloses[validCloses.length - 1];
              const previousClose = validCloses[validCloses.length - 2];
              if (previousClose > 0) {
                change = ((currentClose - previousClose) / previousClose) * 100;
                changeTime = '1d';
                console.log(`Calculated change from chart data for ${ticker}: ${previousClose} -> ${currentClose} = ${change.toFixed(2)}% (1d)`);
              }
            }
          } else {
            console.log(`No change data available for ${ticker}, change set to 0`);
          }
          
          // Always use the original ticker as the key
          result[ticker] = {
            price,
            currency,
            change: parseFloat(change.toFixed(2)), // Ensure it's a number with 2 decimal places
            changeTime, // Add time period information
            lastUpdate: new Date().toLocaleString()
          };
          console.log('Successfully processed ticker:', ticker, 'with price:', price, 'change:', change.toFixed(2) + '%', 'time:', changeTime);
          // result[ticker] sudah cukup untuk IDX stocks
        } else {
          console.warn('No valid price data found for ticker:', ticker);
        }
        // After successful fetch and result assignment:
        if (result[ticker]) {
          fetchCache[tickerUpper] = result[ticker];
        }
      } catch (tickerError) {
        console.error(`Error fetching data for ${ticker}:`, tickerError);
      }
    }
    // Stock fetch completed
    console.log('Stock fetch completed, result:', result);
    return result;
  } catch (error) {
    console.error('Error fetching stock prices:', error);
    return {};
  }
}

export async function fetchCryptoPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};
  
  try {
    const result = {};
    
    // Fetch all crypto prices in parallel
    const pricePromises = symbols.map(async (symbol) => {
      try {
        let priceData = null;
        
        // Try CryptoCompare first
        try {
          const response = await fetch(
            `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${symbol}&tsyms=USD`,
            {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.RAW && data.RAW[symbol] && data.RAW[symbol].USD) {
              priceData = data.RAW[symbol].USD;
            } else if (data.Response === "Error" && data.Message.includes("rate limit")) {
              console.warn(`CryptoCompare rate limited for ${symbol}, trying alternative...`);
            }
          } else {
            console.warn(`CryptoCompare HTTP error for ${symbol}: ${response.status}`);
          }
        } catch (error) {
          console.warn(`CryptoCompare failed for ${symbol}:`, error.message);
        }
        
        // If CryptoCompare failed, try simple price endpoint as fallback
        if (!priceData) {
          try {
            const response = await fetch(
              `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`,
              {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0'
                }
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              console.log(`Simple price response for ${symbol}:`, data);
              
              if (data.USD) {
                priceData = {
                  PRICE: data.USD,
                  CHANGEPCT24HOUR: 0 // We don't have change data from simple endpoint
                };
              }
            }
          } catch (error) {
            console.warn(`Simple price failed for ${symbol}:`, error.message);
          }
        }
        
        if (priceData) {
          const change = priceData.CHANGEPCT24HOUR || 0;
          result[symbol] = {
            price: priceData.PRICE,
            currency: 'USD',
            change: parseFloat(change.toFixed(2)),
            changeTime: '24h',
            lastUpdate: new Date().toLocaleString()
          };
          
          console.log(`Successfully processed crypto ${symbol} with price: ${priceData.PRICE}, change: ${change.toFixed(2)}% (24h)`);
        } else {
          console.warn(`No price data available for ${symbol} from any source`);
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error.message);
      }
    });
    
    // Wait for all promises to complete
    await Promise.all(pricePromises);
    
    console.log('Crypto fetch completed, result:', result);
    return result;
  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return {};
  }
}

export async function fetchExchangeRate() {
  try {
    // console.log('Attempting to fetch exchange rate...');
    
    // Mengambil data kurs dari Exchange Rates API
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    
    if (!response.ok) {
      throw new Error(`Gagal mengambil data kurs: ${response.status}`);
    }
    
    const data = await response.json();
    // console.log('Exchange rate API response:', data);
    
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
      throw new Error('Data kurs USD/IDR tidak ditemukan');
    }
    
    if (isNaN(rate)) {
      throw new Error('Format kurs tidak valid');
    }
    
    // console.log('Berhasil mengambil kurs:', rate);
    return {
      rate,
      source: 'Exchange Rate API',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}