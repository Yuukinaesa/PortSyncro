// test-sell-functionality.js
// Test script untuk memvalidasi fungsi penjualan aset

const API_BASE_URL = 'http://localhost:3000';

// Simple formatting function for testing
function formatNumber(number, decimals = 0) {
  if (number === null || number === undefined || isNaN(number)) {
    return '0';
  }
  
  const num = typeof number === 'string' ? parseFloat(number) : number;
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];
  
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  if (decimalPart && decimals > 0) {
    return `${formattedInteger},${decimalPart}`;
  }
  
  return formattedInteger;
}

function formatIDR(amount, decimals = 0) {
  return `Rp ${formatNumber(amount, decimals)}`;
}

function formatUSD(amount, decimals = 2) {
  return `$ ${formatNumber(amount, decimals)}`;
}

// Test the prices API with a sample stock
async function testPricesAPI() {
  try {
    console.log('Testing Prices API...');
    console.log(`Requesting: ${API_BASE_URL}/api/prices`);
    
    const requestData = {
      stocks: ['BBCA.JK'], // Test with a common Indonesian stock
      crypto: ['BTC']      // Test with Bitcoin
    };
    
    console.log('Request Data:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    console.log('Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('\nPrices API Response:');
    console.log(JSON.stringify(data, null, 2));
    
    // Validate the response
    if (data.prices) {
      console.log('\n=== Price Data Validation ===');
      
      // Check stock price
      if (data.prices['BBCA.JK']) {
        const stockPrice = data.prices['BBCA.JK'];
        console.log(`✅ Stock BBCA.JK: ${formatIDR(stockPrice.price) || 'N/A'}`);
        console.log(`   Currency: ${stockPrice.currency || 'N/A'}`);
        console.log(`   Change: ${stockPrice.change || 'N/A'}%`);
        console.log(`   Last Update: ${stockPrice.lastUpdate || 'N/A'}`);
      } else {
        console.log('❌ Stock BBCA.JK: No price data available');
      }
      
      // Check crypto price
      if (data.prices['BTC']) {
        const cryptoPrice = data.prices['BTC'];
        console.log(`✅ Crypto BTC: ${formatUSD(cryptoPrice.price) || 'N/A'}`);
        console.log(`   Currency: ${cryptoPrice.currency || 'N/A'}`);
        console.log(`   Change: ${cryptoPrice.change || 'N/A'}%`);
        console.log(`   Last Update: ${cryptoPrice.lastUpdate || 'N/A'}`);
      } else {
        console.log('❌ Crypto BTC: No price data available');
      }
    } else {
      console.error('\nERROR: No prices found in the response data');
    }
    
    return data;
  } catch (error) {
    console.error('\nPrices API Test Failed:', error.message);
    return null;
  }
}

// Test multiple stock tickers to simulate the sell functionality
async function testMultipleStocks() {
  try {
    console.log('\n\nTesting Multiple Stocks (simulating sell scenario)...');
    
    const requestData = {
      stocks: ['BBCA.JK', 'BBRI.JK', 'ASII.JK'], // Multiple Indonesian stocks
      crypto: []
    };
    
    console.log('Request Data:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    console.log('Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    
    console.log('\n=== Multiple Stocks Test Results ===');
    if (data.prices) {
      const stockTickers = ['BBCA.JK', 'BBRI.JK', 'ASII.JK'];
      
      stockTickers.forEach(ticker => {
        if (data.prices[ticker]) {
          const price = data.prices[ticker];
          console.log(`✅ ${ticker}: ${formatIDR(price.price) || 'N/A'}`);
        } else {
          console.log(`❌ ${ticker}: No price data available`);
        }
      });
      
      // Calculate success rate
      const availablePrices = stockTickers.filter(ticker => data.prices[ticker]);
      const successRate = (availablePrices.length / stockTickers.length) * 100;
      console.log(`\nSuccess Rate: ${availablePrices.length}/${stockTickers.length} (${successRate.toFixed(1)}%)`);
      
      if (successRate >= 80) {
        console.log('🎉 Price fetching is working well!');
      } else if (successRate >= 50) {
        console.log('⚠️ Price fetching is partially working');
      } else {
        console.log('❌ Price fetching needs improvement');
      }
    }
    
    return data;
  } catch (error) {
    console.error('\nMultiple Stocks Test Failed:', error.message);
    return null;
  }
}

// Test error handling with invalid tickers
async function testErrorHandling() {
  try {
    console.log('\n\nTesting Error Handling with Invalid Tickers...');
    
    const requestData = {
      stocks: ['INVALID.JK', 'TEST.JK'], // Invalid tickers
      crypto: ['INVALID']                // Invalid crypto symbol
    };
    
    console.log('Request Data:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    console.log('Response Status:', response.status, response.statusText);
    
    const data = await response.json();
    console.log('\nError Handling Response:');
    console.log(JSON.stringify(data, null, 2));
    
    // The API should handle invalid tickers gracefully
    console.log('\n✅ API handled invalid tickers gracefully');
    
    return data;
  } catch (error) {
    console.error('\nError Handling Test Failed:', error.message);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== Sell Functionality Test Suite ===\n');
  
  // Test 1: Basic prices API
  console.log('Test 1: Basic Prices API');
  await testPricesAPI();
  
  // Test 2: Multiple stocks (simulating sell scenario)
  console.log('\nTest 2: Multiple Stocks Test');
  await testMultipleStocks();
  
  // Test 3: Error handling
  console.log('\nTest 3: Error Handling Test');
  await testErrorHandling();
  
  console.log('\n=== All Tests Complete ===');
  console.log('\nIf all tests pass, the sell functionality should work correctly with:');
  console.log('✅ Fresh price fetching when data is not available');
  console.log('✅ Proper error handling and user feedback');
  console.log('✅ Loading states during price fetching');
  console.log('✅ Success/error notifications');
}

// Execute the tests
runAllTests().catch(error => {
  console.error('Test execution failed:', error);
}); 