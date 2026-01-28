const https = require('https');

const url = 'https://harga-emas.org/';

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
};

https.get(url, options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        // Look for "Pegadaian" again, maybe case sensitive?
        // Or look for "Harga Emas Hari Ini"
        console.log('Length:', data.length);
        const lower = data.toLowerCase();
        const idx = lower.indexOf('tabungan emas'); // specific product
        if (idx !== -1) {
            console.log('Found "tabungan emas" at', idx);
            console.log(data.substring(idx, idx + 2000));
        } else {
            console.log('tabungan emas NOT found.');
            // Look for specific number "29.660" (from user screenshot, maybe it matches?)
            const priceIdx = data.indexOf('29.660');
            if (priceIdx !== -1) {
                console.log('Found user price 29.660 at', priceIdx);
                console.log(data.substring(priceIdx - 200, priceIdx + 200));
            } else {
                console.log('User price 29.660 NOT found.');
            }
        }

    });
});
