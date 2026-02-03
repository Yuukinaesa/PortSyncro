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
    // Check for mocks
    for (const [key, response] of mocks.entries()) {
        if (url.includes(key)) {
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

    const stocks = await fetchStockPrices(['BBCA']);
    // Logic: 
    // Price = 5250
    // PrevClose = 5000
    // Change = (5250 - 5000)/5000 = 0.05 = 5%

    // NOTE: The logic might try Yahoo first or parallel. 
    // If Yahoo fails (empty json above), it falls back to Google.

    if (stocks['BBCA']) {
        const s = stocks['BBCA'];
        assertCase('Stock Price Parsing', s.price, 5250);
        assertCase('Stock Change Calc', s.change, 5.00);
        assertCase('Currency Detection', s.currency, 'IDR');
    } else {
        console.log('\x1b[31m❌ FAIL: Stock BBCA not returned\x1b[0m');
        failed++;
    }

    // --- TEST 2: Crypto Prices (CryptoCompare API) ---
    console.log('\n--- Testing Crypto Fetch (API Mock) ---');

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
