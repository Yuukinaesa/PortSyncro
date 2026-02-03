
import { calculatePositionFromTransactions, formatQuantity, formatIDR, formatUSD } from '../lib/utils.js';
import assert from 'assert';

console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING STRICT WORKFLOW SIMULATION');
console.log('==================================================');

let failedTests = 0;
let stepCounter = 1;

function verify(stepName, actual, expected, message) {
    try {
        assert.strictEqual(actual, expected, message);
        // console.log(`  Step ${stepCounter}: ${stepName} - OK`);
    } catch (e) {
        console.error(`\x1b[31m❌ Step ${stepCounter} FAILED [${stepName}]: ${message || ''}\x1b[0m`);
        console.error(`   Expected: ${expected}`);
        console.error(`   Actual:   ${actual}`);
        failedTests++;
    }
    stepCounter++;
}

// ----------------------------------------------------------------------------
// SIMULATION: USER JOURNEY - STOCK (BBRI)
// ----------------------------------------------------------------------------
console.log('\n🔹 SIMULATION 1: STOCK USER JOURNEY (BBRI)');

let bbriTransactions = [];
const currentPriceBBRI = 5500;
const exchangeRate = 15000;

// 1. Initial Buy
console.log('   Action: Buy 10 lots @ 4500');
bbriTransactions.push({
    id: 'tx1', type: 'buy', assetType: 'stock', ticker: 'BBRI',
    amount: 1000, // 10 lots * 100
    price: 4500, valueIDR: 4500000,
    timestamp: '2023-01-01T10:00:00Z', market: 'IDX'
});

let pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('Initial Amount', pos.amount, 1000);
verify('Initial Avg', pos.avgPrice, 4500);
verify('Initial Gain', pos.gainIDR, (5500 - 4500) * 1000); // 1,000,000

// 2. Buy More (DCA Up)
console.log('   Action: Buy 10 lots @ 5000');
bbriTransactions.push({
    id: 'tx2', type: 'buy', assetType: 'stock', ticker: 'BBRI',
    amount: 1000,
    price: 5000, valueIDR: 5000000,
    timestamp: '2023-02-01T10:00:00Z', market: 'IDX'
});

pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('DCA Amount', pos.amount, 2000);
verify('DCA Avg', pos.avgPrice, 4750); // (4500+5000)/2
verify('DCA Cost', pos.totalCostIDR, 9500000);

// 3. Sell Half (Profit Taking)
console.log('   Action: Sell 10 lots @ 5200');
bbriTransactions.push({
    id: 'tx3', type: 'sell', assetType: 'stock', ticker: 'BBRI',
    amount: 1000,
    price: 5200, valueIDR: 5200000,
    timestamp: '2023-03-01T10:00:00Z', market: 'IDX'
});

pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('Sell Amount', pos.amount, 1000);
verify('Sell Avg (Static)', pos.avgPrice, 4750); // FIFO/Avg logic: Average price doesn't change on sell in this model
verify('Sell Cost Remaining', pos.totalCost, 4750000); // 1000 * 4750

// 4. Correction (Update last sell)
console.log('   Action: Correction - Last sell was actually @ 5300 (UI Update)');
// Simulate finding the tx and updating it.
const txIndex = bbriTransactions.findIndex(t => t.id === 'tx3');
bbriTransactions[txIndex] = {
    ...bbriTransactions[txIndex],
    price: 5300,
    valueIDR: 5300000
};

// Re-calc
pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('Corrected Sell Amount', pos.amount, 1000); // Amount unchanged
verify('Corrected Sell Avg', pos.avgPrice, 4750); // Avg price unchanged
// Note: Changing SELL price affects CASH/Realized Gain (not calc here), but doesn't affect Remaining Position Cost Basis in this logic,
// UNLESS the logic uses "Value Sold" to reduce Cost.
// Let's check logic: "totalCost -= costToReduce". costToReduce = avgPrice * tx.amount.
// So Sell PRICE doesn't affect renaming cost basis calculation in `calculatePositionFromTransactions`.
// It only affects Realized Gain (which is separate).

// 5. Delete Asset
console.log('   Action: Delete Asset');
const deleteTimestamp = '2023-04-01T10:00:00Z';
bbriTransactions.push({
    id: 'tx4', type: 'delete', assetType: 'stock', ticker: 'BBRI',
    amount: 0, price: 0,
    timestamp: deleteTimestamp
});

pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('Delete Amount', pos.amount, 0);
verify('Delete Cost', pos.totalCost, 0);

// 6. Buy Again (New Cycle)
console.log('   Action: Buy Again 5 lots @ 6000');
bbriTransactions.push({
    id: 'tx5', type: 'buy', assetType: 'stock', ticker: 'BBRI',
    amount: 500,
    price: 6000, valueIDR: 3000000,
    timestamp: '2023-05-01T10:00:00Z'
});

pos = calculatePositionFromTransactions(bbriTransactions, currentPriceBBRI, exchangeRate);
verify('New Cycle Amount', pos.amount, 500);
verify('New Cycle Avg', pos.avgPrice, 6000); // Should be fresh calculation
verify('New Cycle Cost', pos.totalCost, 3000000);


// ----------------------------------------------------------------------------
// SIMULATION 2: UI FORMATTING STRICT CHECK
// ----------------------------------------------------------------------------
console.log('\n🔹 SIMULATION 2: UI FORMATTING STRICT CHECK');

const fmt1 = formatIDR(4500500);
verify('Format IDR', fmt1, 'Rp.4.500.500');

const fmt2 = formatUSD(1234.567);
verify('Format USD', fmt2, '$1,234.57'); // Rounding

const fmtQty = formatQuantity(0.00012345);
// ID Locale uses comma for decimals
// 0,00012345
// Note: output might depend on node locale.
// We check if it contains comma.
if (fmtQty.includes(',')) {
    // console.log('  Format Quantity Comma check - OK');
} else {
    // console.log(`  Format Quantity Comma check - FAIL: ${fmtQty}`);
    verify('Format Qty Comma', fmtQty.includes(','), true, "Should use comma for decimal");
}

const fmtQtyWhole = formatQuantity(100);
verify('Format Qty Whole', fmtQtyWhole, '100');


// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------

if (failedTests === 0) {
    console.log('\n\x1b[32m🎉 ALL STRICT WORKFLOW SIMULATIONS PASSED\x1b[0m');
    process.exit(0);
} else {
    console.log(`\n\x1b[31m💥 ${failedTests} SIMULATION STEPS FAILED\x1b[0m`);
    process.exit(1);
}
