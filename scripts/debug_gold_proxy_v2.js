const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) { resolve(null); }
            });
        }).on('error', reject);
    });
}

async function debug() {
    console.log('--- DEBUG GOLD PROXIES ---');

    // 1. CryptoCompare PAXG (Pax Gold - Reliable Proxy)
    console.log('\n[1] Checking PAXG (CryptoCompare)...');
    try {
        const data = await fetchJson('https://min-api.cryptocompare.com/data/pricemultifull?fsyms=PAXG&tsyms=USD');
        if (data && data.RAW && data.RAW.PAXG && data.RAW.PAXG.USD) {
            const usd = data.RAW.PAXG.USD;
            console.log(`PAXG Price: ${usd.PRICE}`);
            console.log(`PAXG Change (24h): ${usd.CHANGEPCT24HOUR}% <-- THIS IS THE RAW CHANGE`);
            if (usd.CHANGEPCT24HOUR === 0) console.log('⚠️ PAXG CHANGE IS EXACTLY 0!');
        } else {
            console.log('PAXG Data invalid:', JSON.stringify(data).substring(0, 100));
        }
    } catch (e) { console.log('PAXG Fetch Error:', e.message); }

    // 2. Yahoo GC=F
    console.log('\n[2] Checking GC=F (Yahoo Query V7)...');
    try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC%3DF&crumb=`;
        const data = await fetchJson(url);
        if (data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0]) {
            const q = data.quoteResponse.result[0];
            console.log(`GC=F Price: ${q.regularMarketPrice}`);
            console.log(`GC=F Change: ${q.regularMarketChangePercent}%`);
        } else {
            console.log('GC=F Data invalid.');
        }
    } catch (e) { console.log('GC=F Fetch Error:', e.message); }

    // 3. Yahoo GLD
    console.log('\n[3] Checking GLD (Yahoo Query V7)...');
    try {
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=GLD&crumb=`;
        const data = await fetchJson(url);
        if (data && data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0]) {
            const q = data.quoteResponse.result[0];
            console.log(`GLD Price: ${q.regularMarketPrice}`);
            console.log(`GLD Change: ${q.regularMarketChangePercent}%`);
        } else {
            console.log('GLD Data invalid.');
        }
    } catch (e) { console.log('GLD Fetch Error:', e.message); }
}

debug();
