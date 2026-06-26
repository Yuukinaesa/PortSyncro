import assert from 'assert';
import { fetchStockPrices, fetchCryptoPrices, fetchGoldPrices } from '../lib/fetchPrices.js';

// MOCK LOGGER to prevent clutter
const mockLogger = {
    log: () => { },
    warn: () => { },
    error: () => { }
};

// Hack to replace the imported logger if possible, but pure ESM makes mocking defined exports hard.
// Ideally we rely on the fact that the code uses `secureLogger`.
// If `secureLogger` is imported in the SUT, we can't easily swap it without a loader/test-runner like Jest.
// However, the SUT (fetchPrices.js) imports `secureLogger` from `./security.js`.
// Since we are running in Node, we might see logs. That's fine.

// HEADER
console.log('\x1b[36m%s\x1b[0m', '🧪 UNIT TEST: Price Fetching Logic (Mocked)');
console.log('==================================================');

// MOCK GLOBAL FETCH
const originalFetch = global.fetch;
const mocks = new Map();

global.fetch = async (url, options) => {
    // Check for mocks sorted by length descending to match more specific rules first
    const sortedKeys = [...mocks.keys()].sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (url.includes(key)) {
            const response = mocks.get(key);
            return {
                ok: true,
                status: 200,
                text: async () => response.text || JSON.stringify(response.json),
                json: async () => response.json
            };
        }
    }
    return {
        ok: false,
        status: 404,
        text: async () => 'Not Found',
        json: async () => ({})
    };
};

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assertCase(name, actual, expected, message) {
        try {
            assert.deepStrictEqual(actual, expected, message);
            console.log(`\x1b[32m✅ PASS: ${name}\x1b[0m`);
            passed++;
        } catch (e) {
            console.log(`\x1b[31m❌ FAIL: ${name}\x1b[0m`);
            console.error('   Expected:', expected);
            console.error('   Actual:', actual);
            console.error('   Error:', e.message);
            failed++;
        }
    }

    // --- TEST 1: Stock Prices (Google Finance Scraping Logic) ---
    console.log('\n--- Testing Stock Fetch (Google Mock) ---');

    // Mock HTML for Google Finance
    const mockGoogleHTML = `
        <div class="YMlKec fxKbKc">5,250</div>
        <div class="P6K39c">5,000</div> 
        <!-- Previous Close context -->
        <div>Previous close</div><div>5,000</div>
    `;

    mocks.set('google.com/finance', {
        text: mockGoogleHTML
    });
    // Remove Yahoo mock to force Google path OR mock Yahoo as failure
    mocks.set('yahoo.com', { json: {} }); // Invalid yahoo response

    const stocks = await fetchStockPrices(['BBCA.JK']);
    // Logic: 
    // Price = 5250
    // PrevClose = 5000
    // Change = (5250 - 5000)/5000 = 0.05 = 5%

    // NOTE: The logic might try Yahoo first or parallel. 
    // If Yahoo fails (empty json above), it falls back to Google.

    if (stocks['BBCA.JK']) {
        const s = stocks['BBCA.JK'];
        assertCase('Stock Price Parsing', s.price, 5250);
        assertCase('Stock Change Calc', s.change, 5.00);
        assertCase('Currency Detection', s.currency, 'IDR');
    } else {
        console.log('\x1b[31m❌ FAIL: Stock BBCA.JK not returned\x1b[0m');
        failed++;
    }

    // --- TEST 2: Crypto Prices (Binance & CryptoCompare APIs) ---
    console.log('\n--- Testing Crypto Fetch (Binance Mock) ---');

    mocks.set('api.binance.com', {
        json: [
            {
                symbol: 'BTCUSDT',
                lastPrice: '50000.50',
                priceChangePercent: '2.5'
            }
        ]
    });

    mocks.set('cryptocompare.com', {
        json: {
            RAW: {
                BTC: {
                    USD: {
                        PRICE: 50000.50,
                        CHANGEPCT24HOUR: 2.5
                    }
                }
            }
        }
    });

    const crypto = await fetchCryptoPrices(['BTC']);

    if (crypto['BTC']) {
        const c = crypto['BTC'];
        assertCase('Crypto Price', c.price, 50000.50);
        assertCase('Crypto Change', c.change, 2.5);
        assertCase('Crypto Currency', c.currency, 'USD');
    } else {
        console.log('\x1b[31m❌ FAIL: Crypto BTC not returned\x1b[0m');
        failed++;
    }

    // --- TEST 3: Gold Prices (IndoGold Scraping) ---
    console.log('\n--- Testing Gold Fetch (IndoGold Mock) ---');

    const mockIndoGoldHTML = `
        Harga Beli Rp. 1,000,000
        Harga Jual/Buyback Rp. 950,000
    `;

    mocks.set('indogold.id', { text: mockIndoGoldHTML });

    // Mock GC=F to fail so we fall back to PAXG as expected in this unit test
    mocks.set('google.com/finance?q=GC=F', { text: '<html>No Price for GC=F</html>' });

    // Mock Proxy for Global Change
    mocks.set('PAXG', { // For fetchCryptoPrices call inside fetchIndoGoldPrices
        json: { RAW: { PAXG: { USD: { PRICE: 2000, CHANGEPCT24HOUR: 1.5 } } } }
    });

    // NOTE: fetchIndoGoldPrices calls fetchCryptoPrices internally.
    // My mock router matches 'cryptocompare.com' which is used by fetchCryptoPrices.
    // I already set 'cryptocompare.com' above to return BTC. 
    // I need to update it to include PAXG for this test or handle logic.
    mocks.set('cryptocompare.com', {
        json: {
            RAW: {
                PAXG: { USD: { PRICE: 2000, CHANGEPCT24HOUR: 1.5 } },
                BTC: { USD: { PRICE: 50000, CHANGEPCT24HOUR: 2.5 } }
            }
        }
    });

    const gold = await fetchGoldPrices();

    // Logic:
    // Base Buy = 1,000,000 (from HTML)
    // Spot Buy = 1,000,000 * 1.0025 = 1,002,500
    // Spot Change = PAXG Change = 1.5

    if (gold && gold.spot) {
        assertCase('Gold Spot Price', gold.spot.price, 1002500);
        assertCase('Gold Global Change', gold.spot.change, 1.5);
        assertCase('Gold Antam Price', gold.physical.antam.price, 1002500 + 160000);
    } else {
        console.log('\x1b[31m❌ FAIL: Gold data not returned\x1b[0m');
        failed++;
    }

    // --- TEST 4: Stablecoin Live Real-Time Logic ---
    console.log('\n--- Testing Stablecoin Live Real-Time Logic ---');
    
    // Mock CoinGecko stablecoins to return real-time floating prices
    mocks.set('api.coingecko.com/api/v3/simple/price', {
        json: {
            "tether": { "usd": 0.9998, "usd_24h_change": 0.02 },
            "usd-coin": { "usd": 1.0001, "usd_24h_change": -0.01 },
            "ethena-usde": { "usd": 1.0000, "usd_24h_change": 0.00 }
        }
    });

    const stablecoinsData = await fetchCryptoPrices(['USDT', 'USDC', 'USDE']);

    if (stablecoinsData['USDT'] && stablecoinsData['USDC'] && stablecoinsData['USDE']) {
        assertCase('USDT Real-time Price is 0.9998', stablecoinsData['USDT'].price, 0.9998);
        assertCase('USDT Real-time Change is 0.02', stablecoinsData['USDT'].change, 0.02);
        assertCase('USDT Currency is USD', stablecoinsData['USDT'].currency, 'USD');
        assertCase('USDT Source is CoinGecko', stablecoinsData['USDT'].source, 'CoinGecko');
        assertCase('USDC Real-time Price is 1.0001', stablecoinsData['USDC'].price, 1.0001);
        assertCase('USDC Real-time Change is -0.01', stablecoinsData['USDC'].change, -0.01);
        assertCase('USDE Real-time Price is 1.0000', stablecoinsData['USDE'].price, 1.0000);
    } else {
        console.log('\x1b[31m❌ FAIL: USDT, USDC, or USDE not returned\x1b[0m');
        failed++;
    }


    // --- REPORT ---
    console.log('\n==================================================');
    if (failed === 0) {
        console.log(`\x1b[32m🎉 ALL ${passed} UNIT TESTS PASSED\x1b[0m`);
        process.exit(0);
    } else {
        console.log(`\x1b[31m💀 ${failed} TESTS FAILED\x1b[0m`);
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
