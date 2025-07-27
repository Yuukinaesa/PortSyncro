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
          // Get price change if available
          let change = 0;
          if (data.chart.result[0].meta.previousClose) {
            const prevClose = data.chart.result[0].meta.previousClose;
            change = ((price - prevClose) / prevClose) * 100;
          }
          // Always use the original ticker as the key
          result[ticker] = {
            price,
            currency,
            change,
            lastUpdate: new Date().toLocaleString()
          };
          console.log('Successfully processed ticker:', ticker, 'with price:', price);
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
  
  // Fetching crypto prices
  
  try {
    const result = {};
    
    // Fetch all crypto prices in parallel
    const pricePromises = symbols.map(async (symbol) => {
      try {
        // Fetching price
        
        // Try multiple APIs for better reliability
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
            // CryptoCompare response received
            
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
        
        // If CryptoCompare failed or rate limited, try alternative APIs
        if (!priceData) {
          try {
            // Map common symbols to CoinGecko IDs
            const coinGeckoIds = {
              'BTC': 'bitcoin',
              'ETH': 'ethereum',
              'BNB': 'binancecoin',
              'ADA': 'cardano',
              'SOL': 'solana',
              'DOT': 'polkadot',
              'DOGE': 'dogecoin',
              'AVAX': 'avalanche-2',
              'MATIC': 'matic-network',
              'LINK': 'chainlink'
            };
            
            const coinGeckoId = coinGeckoIds[symbol.toUpperCase()];
            
            if (coinGeckoId) {
              // Try CoinGecko API as fallback
              const response = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd&include_24hr_change=true`,
                {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                  }
                }
              );
              
              if (response.ok) {
                const data = await response.json();
                console.log(`CoinGecko response for ${symbol}:`, data);
                
                if (data[coinGeckoId]) {
                  const coinData = data[coinGeckoId];
                  priceData = {
                    PRICE: coinData.usd,
                    CHANGEPCT24HOUR: coinData.usd_24h_change || 0
                  };
                }
              } else {
                console.warn(`CoinGecko HTTP error for ${symbol}: ${response.status}`);
              }
            } else {
              console.warn(`No CoinGecko mapping for ${symbol}`);
            }
          } catch (error) {
            console.warn(`CoinGecko failed for ${symbol}:`, error.message);
          }
        }
        
        // If still no data, try simple price endpoint as last resort
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
          result[symbol] = {
            price: priceData.PRICE,
            currency: 'USD',
            change: priceData.CHANGEPCT24HOUR || 0,
            lastUpdate: new Date().toLocaleString()
          };
          
                        // Successfully fetched price
        } else {
          console.warn(`No price data available for ${symbol} from any source`);
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error.message);
      }
    });
    
    // Wait for all promises to complete
    await Promise.all(pricePromises);
    
    // Crypto fetch completed
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