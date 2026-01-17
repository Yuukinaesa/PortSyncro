
const assert = require('assert');

// Mock helpers
const formatNumberForCSV = (val) => val === 0 ? '0' : String(val); // Simplified

// Logic under test
function getCSVFields(tx) {
    const displayAmount = tx.assetType === 'cash' ? '' : ((tx.assetType === 'stock' && tx.market !== 'US') ? Math.round(tx.amount / 100) : tx.amount);
    const priceField = tx.assetType === 'cash' ? '' : formatNumberForCSV(tx.price);

    return { displayAmount, priceField };
}

// Test Data
const stockTx = { assetType: 'stock', market: 'US', amount: 10, price: 150 };
const idxTx = { assetType: 'stock', market: 'IDX', amount: 50000, price: 2000 }; // 500 lots
const cryptoTx = { assetType: 'crypto', amount: 0.5, price: 50000 };
const cashTx = { assetType: 'cash', amount: 1000000, price: 1 };

console.log('--- Testing CSV Logic ---');

// 1. Stock (US)
const res1 = getCSVFields(stockTx);
console.log('Stock US:', res1);
if (res1.displayAmount !== 10 || res1.priceField !== '150') throw new Error('Stock US failed');

// 2. Stock (IDX)
const res2 = getCSVFields(idxTx);
console.log('Stock IDX:', res2);
if (res2.displayAmount !== 500 || res2.priceField !== '2000') throw new Error('Stock IDX failed');

// 3. Crypto
const res3 = getCSVFields(cryptoTx);
console.log('Crypto:', res3);
if (res3.displayAmount !== 0.5 || res3.priceField !== '50000') throw new Error('Crypto failed');

// 4. Cash (CRITICAL TEST)
const res4 = getCSVFields(cashTx);
console.log('Cash:', res4);
if (res4.displayAmount !== '' || res4.priceField !== '') throw new Error('Cash failed! Expected empty strings.');

console.log('ALL TESTS PASSED');
