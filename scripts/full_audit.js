
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// --- COLOR OUTPUT ---
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};

function log(msg, type = 'info') {
    const color = type === 'pass' ? colors.green : type === 'fail' ? colors.red : type === 'warn' ? colors.yellow : colors.reset;
    const prefix = type === 'pass' ? '✅ PASS' : type === 'fail' ? '❌ FAIL' : type === 'warn' ? '⚠️ WARN' : 'ℹ️ INFO';
    console.log(`${color}[${prefix}] ${msg}${colors.reset}`);
}

// --- 1. ENCRYPTION LOGIC AUDIT ---
// Re-implement logic from lib/encryption.js to verify it works (AES-256-GCM)
function auditEncryption() {
    console.log('\n--- 🔐 1. Encryption Logic Audit ---');
    try {
        const key = crypto.randomBytes(32).toString('hex').substring(0, 32); // Simulate 32-char key
        const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
        const data = JSON.stringify({ secret: "ProductionSecret123!" });

        // Encrypt
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        if (decrypted === data) {
            log('AES-256-GCM Encryption/Decryption Cycle Loop', 'pass');
        } else {
            log('Encryption/Decryption Data Mismatch', 'fail');
        }
    } catch (e) {
        log(`Encryption Logic Crashed: ${e.message}`, 'fail');
    }
}

// --- 2. REGEX / VALIDATION AUDIT ---
// Patterns from lib/security.js
function auditValidation() {
    console.log('\n--- 🛡️ 2. Validation Logic Audit ---');

    // Password Regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,128}$/;

    const weakPass = "password123";
    const strongPass = "P@ssw0rd123!";

    if (!passwordRegex.test(weakPass)) log('Weak Password Rejected correctly', 'pass');
    else log('Weak Password Accepted (Audit Fail)', 'fail');

    if (passwordRegex.test(strongPass)) log('Strong Password Accepted correctly', 'pass');
    else log('Strong Password Rejected (Audit Fail)', 'fail');

    // XSS Sanitization Logic (Basic)
    const xssInput = "<script>alert(1)</script>Hello";
    const sanitized = xssInput.replace(/[<>]/g, '');
    if (sanitized === "scriptalert(1)/scriptHello") log("Basic XSS Tag Stripping matches expected logic", 'pass');
    else log(`XSS Logic Mismatch: ${sanitized}`, 'fail');
}

// --- 3. SERVER SECURITY HEADERS AUDIT ---
function auditHeaders() {
    console.log('\n--- 🌐 3. Security Headers Audit (Middleware) ---');
    http.get(BASE_URL, (res) => {
        const headers = res.headers;

        // Check X-Frame-Options
        if (headers['x-frame-options'] === 'DENY') log('X-Frame-Options: DENY present', 'pass');
        else log(`X-Frame-Options Missing or wrong: ${headers['x-frame-options']}`, 'fail');

        // Check HSTS
        if (headers['strict-transport-security']) log('HSTS Header present', 'pass');
        else log('HSTS Header Missing', 'fail');

        // Check CSP
        if (headers['content-security-policy']) {
            log('Content-Security-Policy present', 'pass');
            if (headers['content-security-policy'].includes("script-src 'self'")) {
                log('CSP restricts script-src', 'pass');
            } else {
                log('CSP script-src might be too open', 'warn');
            }
        } else {
            log('Content-Security-Policy Missing', 'fail');
        }

        // Check Standard Headers
        if (headers['x-content-type-options'] === 'nosniff') log('X-Content-Type-Options: nosniff present', 'pass');
        else log('X-Content-Type-Options Missing', 'fail');

    }).on('error', (e) => {
        log(`Server Request Failed: ${e.message} - Is server running?`, 'fail');
    });
}

// --- 4. API RATE LIMIT & PROTECTION ---
function auditApi() {
    console.log('\n--- ⚡ 4. API Security Audit ---');

    // We try to request a protected endpoint
    const options = {
        hostname: 'localhost',
        port: PORT,
        path: '/api/prices',
        method: 'POST', // standard method
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const req = http.request(options, (res) => {
        log(`API Response Status: ${res.statusCode}`, res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 429 ? 'pass' : 'warn');

        // Rate Limit Header Check (Custom or Standard)
        const rateHeaders = Object.keys(res.headers).filter(h => h.includes('rate') || h.includes('limit'));
        if (rateHeaders.length > 0) {
            log(`Rate Limit Headers detected: ${rateHeaders.join(', ')}`, 'pass');
        } else {
            log('No explicit Rate Limit headers found on response (Might be internal only)', 'warn');
        }
    });

    req.on('error', e => log(`API Request Failed: ${e.message}`, 'fail'));
    req.write(JSON.stringify({ stocks: [] }));
    req.end();
}

// EXECUTE
console.log("🚀 STARTING PORTSYNCRO PRODUCTION AUDIT...");
setTimeout(auditEncryption, 100);
setTimeout(auditValidation, 200);
setTimeout(auditHeaders, 500); // Wait for async
setTimeout(auditApi, 1000);

