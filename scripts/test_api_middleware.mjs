import assert from 'assert';
// We need to import the handler. 
// Since it's a default export, we import it as 'handler'.
// Note: importing from pages/api in Node might fail if it uses Next.js specific polyfills that aren't present.
// However, the code looks pure JS (fetch, secureLogger).
// We might need to mock 'fs' or 'path' if they are used and cause issues, but they seem fine.
import handler from '../pages/api/prices.js';

// SETUP MOCKS
const originalFetch = global.fetch;
if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'mock-firebase-api-key-for-unit-test';
}

console.log('\x1b[36m%s\x1b[0m', '🛡️  TEST: API Middleware & Auth (Mocked)');
console.log('==================================================');

// Mock Request/Response
class MockRes {
    constructor() {
        this.statusCode = 200;
        this.headers = {};
        this.body = null;
        this.finished = false;
    }

    setHeader(key, value) {
        this.headers[key.toLowerCase()] = value;
    }

    status(code) {
        this.statusCode = code;
        return this;
    }

    json(data) {
        this.body = data;
        this.finished = true;
        return this;
    }
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assertStatus(name, res, expectedStatus) {
        if (res.statusCode === expectedStatus) {
            console.log(`\x1b[32m✅ PASS: ${name} (Status ${expectedStatus})\x1b[0m`);
            passed++;
        } else {
            console.log(`\x1b[31m❌ FAIL: ${name} - Expected ${expectedStatus}, Got ${res.statusCode}\x1b[0m`);
            if (res.body && res.body.message) console.log(`   Message: ${res.body.message}`);
            if (res.body && res.body.error) console.log(`   Error: ${res.body.error}`);
            failed++;
        }
    }

    // --- TEST 1: Unauthenticated Request (Should fail due to strict mode) ---
    {
        const req = {
            method: 'POST',
            headers: { 'content-length': '50', 'x-forwarded-for': '127.0.0.1' },
            body: { stocks: ['BBCA'] }
        };
        const res = new MockRes();

        // Mock fetch to ensure it doesn't try to look up empty token
        global.fetch = async () => ({ ok: false });

        await handler(req, res);
        assertStatus('No Auth Header', res, 401);
    }

    // --- TEST 2: Invalid Token (Should fail) ---
    {
        const req = {
            method: 'POST',
            headers: {
                'authorization': 'Bearer invalid_token',
                'content-length': '50',
                'x-forwarded-for': '127.0.0.1'
            },
            body: { stocks: ['BBCA'] }
        };
        const res = new MockRes();

        // Mock Identity Toolkit response as Error
        global.fetch = async (url) => {
            if (url.includes('identitytoolkit')) {
                return { ok: false, status: 400, json: async () => ({}) };
            }
            return { ok: false };
        };

        await handler(req, res);
        assertStatus('Invalid Token', res, 401);
    }

    // --- TEST 3: Valid Token (Should succeed) ---
    {
        const req = {
            method: 'POST',
            headers: {
                'authorization': 'Bearer valid_token',
                'content-length': '50',
                'x-forwarded-for': '127.0.0.2'
            },
            body: { stocks: ['BBCA'] }
        };
        const res = new MockRes();

        // 1. Mock Identity Toolkit Success
        // 2. Mock fetchStockPrices (via mocking fetch inside the lib, but we need to mock global.fetch carefully)

        global.fetch = async (url) => {
            // Auth Check
            if (url.includes('identitytoolkit')) {
                return {
                    ok: true,
                    json: async () => ({
                        users: [{ localId: 'user_123', email: 'test@example.com' }]
                    })
                };
            }
            // Logic Mocks (Google/Yahoo)
            if (url.includes('google') || url.includes('yahoo')) {
                return { ok: false }; // Let it fail gracefully or return empty, we just want 200 OK from API
            }
            return { ok: false };
        };

        await handler(req, res);
        assertStatus('Valid Token', res, 200);

        // Check Rate Limit Headers
        if (res.headers['x-ratelimit-limit'] && res.headers['x-ratelimit-remaining']) {
            console.log(`\x1b[32m✅ PASS: Rate Limit Headers Present (${res.headers['x-ratelimit-remaining']} remaining)\x1b[0m`);
            passed++;
        } else {
            console.log(`\x1b[31m❌ FAIL: Rate Limit Headers Missing\x1b[0m`);
            failed++;
        }
    }

    // --- TEST 4: Method Not Allowed ---
    {
        const req = { method: 'GET', headers: {} };
        const res = new MockRes();
        await handler(req, res);
        assertStatus('Method GET', res, 405);
    }

    // --- TEST 5: Security Helper & RateLimiter Bounded Memory ---
    {
        const { RateLimiter, secureErrorHandler, getClientIp } = await import('../lib/security.js');
        assert.strictEqual(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } }), '203.0.113.5');
        assert.strictEqual(getClientIp({ headers: {}, socket: { remoteAddress: '127.0.0.9' } }), '127.0.0.9');
        const safeHandled = secureErrorHandler.handle(null, 'test');
        assert.strictEqual(safeHandled.code, 'UNKNOWN_ERROR');
        assert.strictEqual(secureErrorHandler.isSensitiveError(null), false);
        const boundedLimiter = new RateLimiter(60000, 5, 1100);
        for (let i = 0; i < 1200; i++) boundedLimiter.isAllowed(`ip_${i}`);
        assert(boundedLimiter.requests.size <= 1100, `Expected <= 1100 keys, got ${boundedLimiter.requests.size}`);
        console.log('\x1b[32m✅ PASS: Security Helpers & Bounded RateLimiter\x1b[0m');
        passed++;
    }

    // --- TEST 6: Exchange Rate Single-Flight Coalescing ---
    {
        const { default: exchangeRateHandler } = await import('../pages/api/exchange-rate.js');
        let upstreamCalls = 0;
        global.fetch = async (url) => {
            if (url.includes('frankfurter.app')) {
                upstreamCalls++;
                await new Promise(r => setTimeout(r, 30));
                return { ok: true, json: async () => ({ rates: { IDR: 16250 } }) };
            }
            return { ok: false };
        };
        const r1 = new MockRes(), r2 = new MockRes(), r3 = new MockRes();
        await Promise.all([
            exchangeRateHandler({ method: 'GET', headers: { 'x-forwarded-for': '198.51.100.1' } }, r1),
            exchangeRateHandler({ method: 'GET', headers: { 'x-forwarded-for': '198.51.100.2' } }, r2),
            exchangeRateHandler({ method: 'GET', headers: { 'x-forwarded-for': '198.51.100.3' } }, r3),
        ]);
        assertStatus('Exchange Rate Coalesced Status', r1, 200);
        assert.strictEqual(r1.body?.rate, 16250);
        assert.strictEqual(r2.body?.rate, 16250);
        assert.strictEqual(r3.body?.rate, 16250);
        assert.strictEqual(upstreamCalls, 1, `Expected 1 upstream FX fetch, got ${upstreamCalls}`);
        console.log('\x1b[32m✅ PASS: Exchange Rate Single-Flight Coalescing (1 upstream fetch for 3 concurrent misses)\x1b[0m');
        passed++;
    }

    // --- REPORT ---
    global.fetch = originalFetch;
    console.log('\n==================================================');
    if (failed === 0) {
        console.log(`\x1b[32m🎉 ALL ${passed} MIDDLEWARE TESTS PASSED\x1b[0m`);
        process.exit(0);
    } else {
        console.log(`\x1b[31m💀 ${failed} TESTS FAILED\x1b[0m`);
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
