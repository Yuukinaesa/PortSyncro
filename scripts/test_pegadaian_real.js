const https = require('https');

const url = 'https://www.pegadaian.co.id/produk/harga-emas-batangan-dan-tabungan-tabungan-emas';

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }
};

https.get(url, options, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`Redirecting to: ${res.headers.location}`);
        const newUrl = res.headers.location.startsWith('http') ? res.headers.location : `https://www.pegadaian.co.id${res.headers.location}`;
        https.get(newUrl, options, (res2) => {
            console.log('Status 2:', res2.statusCode);
            let data = '';
            res2.on('data', c => data += c);
            res2.on('end', () => {
                console.log('Length 2:', data.length);
                // Check for "Harga Tabungan Emas"
                if (data.includes('Harga Tabungan Emas')) {
                    console.log('Found "Harga Tabungan Emas" on redirected page');
                    const idx = data.indexOf('Harga Beli');
                    if (idx !== -1) console.log(data.substring(idx, idx + 200));
                } else {
                    console.log('Content not found on redirected page.');
                }
            });
        });
        return;
    }

    console.log('Status:', res.statusCode);
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        // Look for "Harga Beli" or specific numbers from screenshot "29.660"
        console.log('Length:', data.length);
        const searchPrice = '29.660';
        const idx = data.indexOf(searchPrice);
        if (idx !== -1) {
            console.log('Found price sequence!');
            console.log(data.substring(idx - 100, idx + 100));
        } else {
            console.log('Price sequence not found. Dumping substring...');
            console.log(data.substring(0, 1000));
        }

        // Also check for "Harga Tabungan Emas"
        const titleIdx = data.indexOf('Harga Tabungan Emas');
        if (titleIdx !== -1) {
            console.log('Found title!');
        }
    });
}).on('error', e => console.error(e));
