const https = require('https');

// Simple fetch wrapper
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) { resolve(null); }
                } else {
                    resolve(null);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// Validation Helper
function assert(condition, message) {
    if (!condition) {
        console.log(`\x1b[31m❌ FAIL: ${message}\x1b[0m`);
        throw new Error(message);
    } else {
        console.log(`\x1b[32m✅ PASS: ${message}\x1b[0m`);
    }
}

async function run() {
    console.log('\x1b[36m%s\x1b[0m', '🌍 REAL WORLD INTEGRATION: External Data Sources');
    console.log('==================================================');
    console.log('Verifying that external APIs/Sites are reachable and return expected structures.\n');

    let errors = 0;

    // --- TEST 1: Exchange Rate API (Frankfurter) ---
    console.log('--- Checking Exchange Rate API (Frankfurter) ---');
    try {
        const data = await fetchJson('https://api.frankfurter.app/latest?from=USD&to=IDR');
        assert(data && data.rates && data.rates.IDR, 'Frankfurter returned IDR rate');
        console.log(`   Current Rate: ${data.rates.IDR}`);
    } catch (e) {
        console.log(`\x1b[33m⚠️ WARN: Frankfurter Failed (${e.message}) - Not Critical if fallback works\x1b[0m`);
    }

    // --- TEST 2: Crypto Proxy (CryptoCompare) ---
    console.log('\n--- Checking Crypto API (CryptoCompare) ---');
    try {
        const data = await fetchJson('https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC&tsyms=USD');
        assert(data && data.RAW && data.RAW.BTC && data.RAW.BTC.USD, 'CryptoCompare returned BTC data');
        assert(data.RAW.BTC.USD.PRICE > 0, 'BTC Price is positive');
    } catch (e) {
        console.log(`\x1b[31m❌ FAIL: CryptoCompare API Error: ${e.message}\x1b[0m`);
        errors++;
    }

    // --- TEST 3: Yahoo Finance (Gold Futures) ---
    console.log('\n--- Checking Yahoo Finance (GC=F) ---');
    try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC%3DF&crumb=`;
        const data = await fetchJson(url);
        if (data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result.length > 0) {
            const q = data.quoteResponse.result[0];
            assert(q.regularMarketPrice > 0, 'GC=F Price > 0');
            console.log(`   GC=F Price: ${q.regularMarketPrice}`);
        } else {
            console.log('\x1b[31m❌ FAIL: Yahoo Finance returned no data for GC=F. Structure might have changed.\x1b[0m');
            errors++;
        }
    } catch (e) {
        console.log(`\x1b[31m❌ FAIL: Yahoo Finance Error: ${e.message}\x1b[0m`);
        errors++;
    }

    console.log('\n==================================================');
    if (errors === 0) {
        console.log('\x1b[32m🎉 ALL EXTERNAL INTEGRATIONS HEALTHY\x1b[0m');
        process.exit(0);
    } else {
        console.log(`\x1b[31m💀 ${errors} EXTERNAL SOURCE FAILURES DETECTED\x1b[0m`);
        console.log('You may need to update scraping logic or check API keys.');
        process.exit(1);
    }
}

run();
