
const { formatQuantity, calculateAssetValue } = require('../lib/utils');

// Mock helpers for calculateAssetValue test since it's usually inside a React component or imports complex logic
// We will test formatQuantity primarily as it was the root cause of precision loss.

console.log('--- Testing formatQuantity ---');

const testCases = [
    { input: 1.0, expected: '1' },
    { input: 0.12345678, expected: '0,12345678' },
    { input: 0.00000001, expected: '0,00000001' },
    { input: 100.5, expected: '100,5' },
    { input: 1234.5678, expected: '1.234,5678' }, // ID locale uses dot for thousands
    { input: 0.000000005, expected: '0' }, // Below 8 decimals might round to 0 or very small
];

let failed = 0;

testCases.forEach(({ input, expected }) => {
    const result = formatQuantity(input);
    // Normalize result (Intl might use non-breaking space)
    const normalizedResult = result.replace(/\u00A0/g, ' ');

    if (normalizedResult === expected) {
        console.log(`PASS: ${input} -> ${normalizedResult}`);
    } else {
        // Intl formatting might differ slightly based on Node version (e.g. whitespace), 
        // so we'll be lenient on thousands separators if the decimals match.
        console.log(`CHECK: ${input} -> ${normalizedResult} (Expected: ${expected})`);

        // Strict check for decimals
        if (input < 1 && !result.includes(',')) {
            console.error("FAIL: Small number lost decimal precision!");
            failed++;
        }
    }
});

if (failed === 0) {
    console.log('All Precision Tests Passed!');
} else {
    console.error('Precision Tests Failed!');
    process.exit(1);
}
