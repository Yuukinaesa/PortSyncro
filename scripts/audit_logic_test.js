
const assert = require('assert');

// MOCK LOGGER
const secureLogger = {
    log: (...args) => console.log('[LOG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args)
};

// ----------------------------------------------------------------------------
// COPIED LOGIC FROM lib/utils.js (Modified to remove imports)
// ----------------------------------------------------------------------------

function cleanFractionalLots(lots) {
    const lotsNum = parseFloat(lots);
    if (isNaN(lotsNum) || lotsNum <= 0) {
        return 0;
    }
    return Math.floor(lotsNum);
}

function calculatePositionFromTransactions(transactions, currentPrice, exchangeRate = null) {
    let totalAmount = 0;
    let totalCost = 0;
    let totalCostIDR = 0;
    let totalCostUSD = 0;
    let entryPrice = null;
    let isDeleted = false;
    let lastDeleteTimestamp = null;

    // Sort transactions by timestamp to process in chronological order
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    sortedTransactions.forEach(tx => {
        // If asset has been deleted and this transaction is before the delete, skip it
        if (isDeleted && lastDeleteTimestamp && new Date(tx.timestamp) <= new Date(lastDeleteTimestamp)) {
            // secureLogger.log(`Skipping transaction - asset was deleted at ${lastDeleteTimestamp}`);
            return;
        }

        if (tx.type === 'buy') {
            const previousTotal = totalAmount;
            totalCost += tx.price * tx.amount;
            totalAmount += tx.amount;

            const market = tx.market || 'IDX';
            if (tx.assetType === 'stock') {
                if (market === 'US') {
                    const txValueUSD = tx.valueUSD || (tx.price * tx.amount);
                    totalCostUSD += txValueUSD;
                    if (tx.valueIDR) totalCostIDR += tx.valueIDR;
                } else {
                    // IDX Stocks
                    const txValueIDR = tx.valueIDR || (tx.price * tx.amount);
                    totalCostIDR += txValueIDR;
                    if (tx.valueUSD) totalCostUSD += tx.valueUSD;
                }
            } else {
                if (tx.valueIDR) totalCostIDR += tx.valueIDR;
                if (tx.valueUSD) totalCostUSD += tx.valueUSD;
            }

            if (tx.entry) {
                entryPrice = tx.entry;
            }

        } else if (tx.type === 'update') {
            if (totalAmount > 0) {
                const assetType = tx.assetType || 'stock';
                if (tx.amount && tx.amount > 0) {
                    totalAmount = tx.amount;
                }
                const totalShares = assetType === 'stock' ? totalAmount : totalAmount;
                totalCost = tx.price * totalShares;
                totalCostIDR = tx.valueIDR || totalCostIDR;
                totalCostUSD = tx.valueUSD || totalCostUSD;
                if (tx.entry) {
                    entryPrice = tx.entry;
                }
            } else {
                totalCost += tx.price * tx.amount;
                totalAmount += tx.amount;
                if (tx.valueIDR) totalCostIDR += tx.valueIDR;
                if (tx.valueUSD) totalCostUSD += tx.valueUSD;
                if (tx.entry) {
                    entryPrice = tx.entry;
                }
            }
        } else if (tx.type === 'sell') {
            if (totalAmount > 0 && totalCost > 0) {
                const avgPrice = totalCost / totalAmount;
                const costToReduce = avgPrice * tx.amount;

                const costRatio = tx.amount / totalAmount;

                totalCost -= costToReduce;
                totalAmount -= tx.amount;

                if (totalCostIDR > 0) {
                    totalCostIDR -= totalCostIDR * costRatio;
                }
                if (totalCostUSD > 0) {
                    totalCostUSD -= totalCostUSD * costRatio;
                }

                if (totalAmount <= 1e-9) {
                    totalAmount = 0;
                    totalCost = 0;
                    totalCostIDR = 0;
                    totalCostUSD = 0;
                }
            }
        } else if (tx.type === 'delete') {
            totalAmount = 0;
            totalCost = 0;
            totalCostIDR = 0;
            totalCostUSD = 0;
            entryPrice = null;
            isDeleted = true;
            lastDeleteTimestamp = tx.timestamp;
        }
    });

    const firstTx = sortedTransactions.find(tx => tx.type === 'buy' || tx.type === 'update');
    const assetType = firstTx?.assetType || 'stock';

    let avgPrice = 0;
    if (totalAmount > 0) {
        avgPrice = totalCost / totalAmount;
    }

    let porto = 0;
    let portoIDR = 0;
    let portoUSD = 0;

    if (totalAmount > 0 && currentPrice > 0) {
        if (assetType === 'stock') {
            const market = firstTx?.market || 'IDX';
            if (market === 'US') {
                portoUSD = currentPrice * totalAmount;
                portoIDR = exchangeRate && exchangeRate > 0 ? portoUSD * exchangeRate : 0;
                porto = portoUSD;
            } else {
                portoIDR = currentPrice * totalAmount;
                portoUSD = exchangeRate && exchangeRate > 0 ? portoIDR / exchangeRate : 0;
                porto = portoIDR;
            }
        } else {
            portoUSD = currentPrice * totalAmount;
            portoIDR = exchangeRate && exchangeRate > 0 ? portoUSD * exchangeRate : 0;
            porto = portoUSD;
        }
    }

    let gain = 0;
    let gainIDR = 0;
    let gainUSD = 0;

    if (totalAmount > 0) {
        if (assetType === 'stock') {
            const currentValue = currentPrice * totalAmount;
            const costBasis = avgPrice * totalAmount;

            gainIDR = currentValue - costBasis;
            gainUSD = exchangeRate && exchangeRate > 0 ? gainIDR / exchangeRate : 0;
            gain = gainIDR;
        } else {
            // For crypto/others (USD based)
            // Logic in source: gainUSD = currentValue - costBasis;
            // But wait, if avgPrice is USD (because crypto prices are USD), then costBasis is USD.
            // currentPrice is USD.
            // So Gain is USD.
            const currentValue = currentPrice * totalAmount;
            const costBasis = avgPrice * totalAmount;

            gainUSD = currentValue - costBasis;
            gainIDR = exchangeRate && exchangeRate > 0 ? gainUSD * exchangeRate : 0;
            gain = gainUSD;
        }
    }

    return {
        amount: totalAmount,
        avgPrice,
        totalCost,
        totalCostIDR,
        totalCostUSD,
        gain,
        gainIDR,
        gainUSD,
        porto,
        portoIDR,
        portoUSD,
        entryPrice
    };
}

// ----------------------------------------------------------------------------
// TEST CASES
// ----------------------------------------------------------------------------

console.log('Running Critical Logic Audit...');

try {
    // TEST 1: Basic Stock Buy (IDX)
    const tx1 = [
        { id: '1', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 100, price: 5000, valueIDR: 500000, timestamp: '2023-01-01T10:00:00Z', market: 'IDX', currency: 'IDR' }
    ];
    const res1 = calculatePositionFromTransactions(tx1, 6000, 15000);
    assert.strictEqual(res1.amount, 100, 'Test 1: Amount incorrect');
    assert.strictEqual(res1.avgPrice, 5000, 'Test 1: AvgPrice incorrect');
    assert.strictEqual(res1.portoIDR, 600000, 'Test 1: PortoIDR incorrect');
    assert.strictEqual(res1.gainIDR, 100000, 'Test 1: GainIDR incorrect');
    console.log('✅ Test 1 Passed: Basic Stock Buy');

    // TEST 2: Buy multiple times (Averaging)
    const tx2 = [
        { id: '1', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 100, price: 5000, valueIDR: 500000, timestamp: '2023-01-01T10:00:00Z', market: 'IDX', currency: 'IDR' },
        { id: '2', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 100, price: 7000, valueIDR: 700000, timestamp: '2023-01-02T10:00:00Z', market: 'IDX', currency: 'IDR' }
    ];
    const res2 = calculatePositionFromTransactions(tx2, 8000, 15000);
    // Total Cost = 500000 + 700000 = 1200000
    // Total Amount = 200
    // Avg Price = 6000
    assert.strictEqual(res2.amount, 200, 'Test 2: Amount incorrect');
    assert.strictEqual(res2.avgPrice, 6000, 'Test 2: AvgPrice incorrect');
    console.log('✅ Test 2 Passed: Averaging Up');

    // TEST 3: Partial Sell (FIFO / Average Cost reduction)
    const tx3 = [
        { id: '1', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 200, price: 6000, valueIDR: 1200000, timestamp: '2023-01-01T10:00:00Z', market: 'IDX', currency: 'IDR' },
        { id: '2', type: 'sell', assetType: 'stock', ticker: 'BBCA', amount: 100, price: 8000, valueIDR: 800000, timestamp: '2023-01-02T10:00:00Z', market: 'IDX', currency: 'IDR' }
    ];
    const res3 = calculatePositionFromTransactions(tx3, 9000, 15000);
    // Remaining Amount = 100
    // Remaining Cost = 1200000 - (6000 * 100) = 600000.
    // Avg Price should remain 6000.
    assert.strictEqual(res3.amount, 100, 'Test 3: Amount incorrect');
    assert.strictEqual(res3.avgPrice, 6000, 'Test 3: AvgPrice incorrect');
    console.log('✅ Test 3 Passed: Partial Sell');

    // TEST 4: Delete and Re-Buy (Logic Check)
    const tx4 = [
        { id: '1', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 100, price: 5000, valueIDR: 500000, timestamp: '2023-01-01T10:00:00Z' },
        { id: '2', type: 'delete', assetType: 'stock', ticker: 'BBCA', amount: 0, price: 0, timestamp: '2023-01-02T10:00:00Z' },
        { id: '3', type: 'buy', assetType: 'stock', ticker: 'BBCA', amount: 50, price: 8000, valueIDR: 400000, timestamp: '2023-01-03T10:00:00Z' }
    ];
    const res4 = calculatePositionFromTransactions(tx4, 9000, 15000);
    // Should ignore tx1. Start fresh from tx3.
    assert.strictEqual(res4.amount, 50, 'Test 4: Amount incorrect (should be 50)');
    assert.strictEqual(res4.avgPrice, 8000, 'Test 4: AvgPrice incorrect (should be 8000)');
    console.log('✅ Test 4 Passed: Delete and Re-buy');

    // TEST 5: Floating Point Precision
    // 0.1 + 0.2
    const tx5 = [
        { id: '1', type: 'buy', assetType: 'crypto', symbol: 'BTC', amount: 0.1, price: 10000, valueUSD: 1000, timestamp: '2023-01-01' },
        { id: '2', type: 'buy', assetType: 'crypto', symbol: 'BTC', amount: 0.2, price: 10000, valueUSD: 2000, timestamp: '2023-01-02' }
    ];
    const res5 = calculatePositionFromTransactions(tx5, 20000, 15000);
    // Amount should be 0.3, but float might make it 0.30000000000000004
    // The logic in utils doesn't round amount explicitly until display.
    // Verify it is close enough.
    const diff = Math.abs(res5.amount - 0.3);
    assert.ok(diff < 1e-9, `Test 5: Float precision issue. Amount: ${res5.amount}`);
    console.log('✅ Test 5 Passed: Float Precision');

    // TEST 6: "update" transaction type behavior
    // Case: Buy 100, then Update to 150 (Manual Fix)
    const tx6 = [
        { id: '1', type: 'buy', assetType: 'stock', amount: 100, price: 100, timestamp: '2023-01-01' },
        { id: '2', type: 'update', assetType: 'stock', amount: 150, price: 100, timestamp: '2023-01-02' }
    ];
    const res6 = calculatePositionFromTransactions(tx6, 120, 15000);
    assert.strictEqual(res6.amount, 150, 'Test 6: Update should set absolute amount');
    console.log('✅ Test 6 Passed: Update Logic');

    // TEST 6b: Gold Buy/Sell Logic (Large Numbers)
    const tx6b = [
        { id: '1', type: 'buy', assetType: 'gold', ticker: 'ANTAM', amount: 10, price: 1000000, valueIDR: 10000000, timestamp: '2023-01-01', currency: 'IDR' },
        { id: '2', type: 'sell', assetType: 'gold', ticker: 'ANTAM', amount: 5, price: 1200000, valueIDR: 6000000, timestamp: '2023-01-02', currency: 'IDR' }
    ];
    // Current price 1,200,000
    const res6b = calculatePositionFromTransactions(tx6b, 1200000, 15000);

    // Remaining: 5g
    // Cost Basis for Remaining: 5 * 1,000,000 = 5,000,000
    // Gain (Unrealized) for Remaining: (1,200,000 - 1,000,000) * 5 = 1,000,000

    assert.strictEqual(res6b.amount, 5, 'Test 6b: Gold Amount incorrect');
    assert.strictEqual(res6b.avgPrice, 1000000, 'Test 6b: Gold AvgPrice incorrect');
    assert.strictEqual(res6b.totalCostIDR, 5000000, 'Test 6b: Gold TotalCostIDR incorrect');
    console.log('✅ Test 6b Passed: Gold Logic (Large Numbers)');

    // TEST 7: US Stock Buy (Currency Conversion)
    const tx7 = [
        { id: '1', type: 'buy', assetType: 'stock', ticker: 'AAPL', amount: 10, price: 150, valueUSD: 1500, valueIDR: 22500000, timestamp: '2023-01-01', market: 'US' }
    ];
    // Exchange Rate 15000. Current Price 160.
    const res7 = calculatePositionFromTransactions(tx7, 160, 15000);
    // Value USD: 10 * 160 = 1600.
    // Value IDR: 1600 * 15000 = 24,000,000.
    assert.strictEqual(res7.portoUSD, 1600, 'Test 7: PortoUSD incorrect');
    assert.strictEqual(res7.portoIDR, 24000000, 'Test 7: PortoIDR incorrect');
    console.log('✅ Test 7 Passed: US Stock Conversion');

    // TEST 8: Cash Logic
    const tx8 = [
        { id: '1', type: 'update', assetType: 'cash', amount: 50000000, price: 1, timestamp: '2023-01-01' }
    ];
    const res8 = calculatePositionFromTransactions(tx8, 1, 15000);
    assert.strictEqual(res8.amount, 50000000, 'Test 8: Cash Amount incorrect');
    console.log('✅ Test 8 Passed: Cash Logic');

} catch (err) {
    console.error('❌ TESTS FAILED');
    console.error(err);
    process.exit(1);
}

console.log('ALL TESTS PASSED - LOGIC IS SOUND');
