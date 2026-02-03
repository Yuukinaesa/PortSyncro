const { spawnSync, execSync } = require('child_process');
const path = require('path');
const http = require('http');

// CONFIGURATION
const SERVER_PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, '..');

const TESTS = [
    { name: 'Environment Check', file: 'audit_test_verify_env.js', required: true },
    { name: 'Security Scan', file: 'security_scan_comprehensive.js', required: true },
    { name: 'Core Logic Engine', file: 'audit_logic_test.js', required: true },
    { name: 'Precision Helper', file: 'test-precision.mjs', required: true },
    { name: 'Integration Suite', file: 'integration_test.js', required: false, needsServer: true }
];

// ANSI COLORS
const colors = {
    reset: "\x1b[0m",
    pass: "\x1b[32m",
    fail: "\x1b[31m",
    warn: "\x1b[33m",
    info: "\x1b[36m",
    header: "\x1b[1m\x1b[35m"
};

function log(msg, type = 'info') {
    console.log(`${colors.info}[SYSTEM] ${msg}${colors.reset}`);
}

async function checkServer() {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
    });
}

async function runSuite() {
    console.clear();
    console.log(`${colors.header}
╔══════════════════════════════════════════════════════════════════╗
║                🚀 PORTSYNCRO FULL SYSTEM TEST                    ║
║                   Comprehensive Readiness Check                  ║
╚══════════════════════════════════════════════════════════════════╝
${colors.reset}`);

    log(`Project Root: ${PROJECT_ROOT}`);
    log(`Checking Server Status on Port ${SERVER_PORT}...`);

    const isServerUp = await checkServer();
    if (isServerUp) {
        console.log(`${colors.pass}✅ Server is UP. Integration tests will run in LIVE mode.${colors.reset}\n`);
    } else {
        console.log(`${colors.warn}⚠️  Server is DOWN. Integration tests needing localhost will be SKIPPED or FAIL.${colors.reset}`);
        console.log(`${colors.warn}   (Run 'npm run dev' in another terminal for full coverage)${colors.reset}\n`);
    }

    let summary = [];
    let failureCount = 0;

    for (const test of TESTS) {
        console.log(`${colors.info}▶ RUNNING: ${test.name}...${colors.reset}`);

        if (test.needsServer && !isServerUp) {
            console.log(`${colors.warn}   ⏹ SKIPPED (Server not running)${colors.reset}\n`);
            summary.push({ name: test.name, status: 'SKIPPED' });
            continue;
        }

        const scriptPath = path.join(__dirname, test.file);

        // Determine runner args
        let args = [scriptPath];
        if (test.file.endsWith('.mjs')) {
            args = ['--no-warnings', scriptPath];
        }

        const start = Date.now();
        const result = spawnSync('node', args, {
            cwd: PROJECT_ROOT, // Run from root so .env and relative paths work
            stdio: 'inherit',
            encoding: 'utf-8',
            env: { ...process.env, FORCE_COLOR: '1' }
        });
        const duration = ((Date.now() - start) / 1000).toFixed(2);

        if (result.status === 0) {
            console.log(`${colors.pass}   ✅ PASSED (${duration}s)${colors.reset}\n`);
            summary.push({ name: test.name, status: 'PASS', time: duration });
        } else {
            console.log(`${colors.fail}   ❌ FAILED (Exit Code: ${result.status})${colors.reset}\n`);
            summary.push({ name: test.name, status: 'FAIL', time: duration });
            if (test.required) failureCount++;
        }
    }

    // FINAL REPORT
    console.log(`${colors.header}
══════════════════════════════════════════════════════════════════
                      📊 TEST SUMMARY REPORT
══════════════════════════════════════════════════════════════════
${colors.reset}`);

    summary.forEach(s => {
        const statusColor = s.status === 'PASS' ? colors.pass : s.status === 'SKIPPED' ? colors.warn : colors.fail;
        console.log(`${s.name.padEnd(25)} : ${statusColor}${s.status}${colors.reset} ${s.time ? `(${s.time}s)` : ''}`);
    });

    console.log('\n');
    if (failureCount === 0) {
        console.log(`${colors.pass}✨ ALL SYSTEMS OPERATIONAL. READY FOR DEPLOYMENT.${colors.reset}`);
        process.exit(0);
    } else {
        console.log(`${colors.fail}💀 ${failureCount} CRITICAL TEST(S) FAILED. DO NOT DEPLOY.${colors.reset}`);
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error(err);
    process.exit(1);
});
