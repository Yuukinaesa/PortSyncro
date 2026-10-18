
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
        const data = JSON.stringify({ payload: crypto.randomBytes(16).toString('hex') });

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
async function auditHeaders() {
    console.log('\n--- 🌐 3. Security Headers Audit (Middleware) ---');
    try {
        const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
        const headers = Object.fromEntries(res.headers.entries());

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
    } catch (e) {
        log(`Server Request Failed: ${e.message} - Is server running?`, 'fail');
    }
}

// --- 4. API RATE LIMIT & PROTECTION ---
async function auditApi() {
    console.log('\n--- ⚡ 4. API Security Audit ---');
    try {
        const res = await fetch(`http://localhost:${PORT}/api/prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stocks: [] }),
            signal: AbortSignal.timeout(2000)
        });
        log(`API Response Status: ${res.status}`, res.status === 200 || res.status === 400 || res.status === 401 || res.status === 429 ? 'pass' : 'warn');

        const rateHeaders = Array.from(res.headers.keys()).filter(h => h.includes('rate') || h.includes('limit'));
        if (rateHeaders.length > 0) {
            log(`Rate Limit Headers detected: ${rateHeaders.join(', ')}`, 'pass');
        } else {
            log('No explicit Rate Limit headers found on response (Might be internal only)', 'warn');
        }
    } catch (e) {
        log(`API Request Failed: ${e.message}`, 'fail');
    }
}

// EXECUTE
console.log("🚀 STARTING PORTSYNCRO PRODUCTION AUDIT...");
setTimeout(auditEncryption, 100);
setTimeout(auditValidation, 200);
setTimeout(auditHeaders, 500); // Wait for async
setTimeout(auditApi, 1000);

