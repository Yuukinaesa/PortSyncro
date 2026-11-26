
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load env from .env.local (when running locally) or process.env (when running in CI)
const envPath = path.join(__dirname, '..', '.env.local');
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

let env = {};
if (fs.existsSync(envPath)) {
    console.log('Reading env from:', envPath);
    const fileContent = fs.readFileSync(envPath, 'utf8');
    fileContent.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim();
            env[key] = val;
        }
    });
} else {
    console.log('No .env.local file found (using process.env).');
}

console.log('\n--- Environment Verification ---');
const key = env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

if (!key) {
    if (isCI) {
        console.log('ℹ️ CI environment detected without ENCRYPTION_KEY secret; verifying .env.example template instead.');
        const examplePath = path.join(__dirname, '..', '.env.example');
        if (!fs.existsSync(examplePath) || !fs.readFileSync(examplePath, 'utf8').includes('ENCRYPTION_KEY=')) {
            console.error('❌ CRITICAL: .env.example is missing ENCRYPTION_KEY definition!');
            process.exit(1);
        }
        console.log('✅ .env.example template verified cleanly for CI.');
        process.exit(0);
    }
    console.error('❌ CRITICAL: ENCRYPTION_KEY is missing from .env.local and process.env!');
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
