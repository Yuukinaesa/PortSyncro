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
        // We know "Pegadaian" exists in the text.
        // Let's print the 20 lines AFTER "Pegadaian" appears to see the table structure.
        // Search for known price patterns "28." (approx 28k)
        // Or "28,680"
        const specificPrice = "28.680";
        const idxPoints = [];
        let pos = data.indexOf(specificPrice);
        while (pos !== -1) {
            idxPoints.push(pos);
            pos = data.indexOf(specificPrice, pos + 1);
        }

        if (idxPoints.length > 0) {
            console.log(`Found price ${specificPrice} at indices:`, idxPoints);
            idxPoints.forEach(p => {
                console.log(`--- Context for ${p} ---`);
                console.log(data.substring(p - 200, p + 200));
            });
        } else {
            console.log(`Price ${specificPrice} NOT found. Trying generic pattern.`);
            // Try searching for "Tabungan Emas"
            const tabIdx = data.indexOf("Tabungan Emas");
            if (tabIdx !== -1) {
                console.log('Found Tabungan Emas at', tabIdx);
                console.log(data.substring(tabIdx, tabIdx + 1000));
            }
        }

        // Also look for "Jual" and "Beli" in that chunk
    });
});
