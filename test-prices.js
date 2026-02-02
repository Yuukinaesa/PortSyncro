// Test script to directly call fetchStockPrices
const { fetchStockPrices, fetchCryptoPrices, fetchGoldPrices } = require('./lib/fetchPrices');

async function testPrices() {
    console.log('========================================');
    console.log('TESTING LIVE API PRICES');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('');

    // Test Stock Prices
    console.log('1. Fetching Stock Prices for BMHS.JK...');
    try {
        const stockPrices = await fetchStockPrices(['BMHS.JK']);
        console.log('STOCK PRICES RESULT:');
        console.log(JSON.stringify(stockPrices, null, 2));
    } catch (error) {
        console.error('Error fetching stock prices:', error.message);
    }

    console.log('');
    console.log('2. Fetching Gold Prices...');
    try {
        const goldPrices = await fetchGoldPrices();
        console.log('GOLD PRICES RESULT:');
        console.log(JSON.stringify(goldPrices, null, 2));
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
    }

    console.log('');
    console.log('========================================');
    console.log('TEST COMPLETED');
    console.log('========================================');
}

testPrices();
