
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load env from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
console.log('Reading env from:', envPath);

let fileContent = '';
try {
    fileContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
    console.error('❌ CRITICAL: Could not read .env.local file!');
    process.exit(1);
}

// Simple parser
const env = {};
fileContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim(); // Rejoin in case value has =
        env[key] = val;
    }
});

console.log('\n--- Environment Verification ---');
const key = env.ENCRYPTION_KEY;

if (!key) {
    console.error('❌ CRITICAL: ENCRYPTION_KEY is missing from .env.local!');
    process.exit(1);
} else {
    // Check if it's hex or raw string? The app treats it as raw string if passed to Buffer.from(...) without 'hex', 
    // unless logic specifically handles it. lib/encryption.js usually handles both or expects specific format.
    // However, crypto.createCipheriv needs specific byte length.

    // If we assume the key is a 32-char string (256 bits if purely ASCII, but usually we want 32 BYTES)
    // If it's a hex string representing 32 bytes, it should be 64 characters long.
    // If it's a raw string of 32 characters, it works as 32 bytes (utf8).

    console.log(`Checking key length: ${key.length} characters`);

    if (key.length === 32) {
        console.log('✅ ENCRYPTION_KEY is valid (32 characters / bytes)');
    } else if (key.length === 64) {
        console.log('✅ ENCRYPTION_KEY is valid (64 characters hex string -> 32 bytes)');
    } else {
        console.error(`❌ CRITICAL: ENCRYPTION_KEY length is ${key.length}, expected 32 (raw) or 64 (hex)!`);
        process.exit(1);
    }
}
console.log('Environment check passed.');
