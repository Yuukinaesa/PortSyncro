const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scripts = [
    { name: 'Security Scan', file: 'scripts/audit_security_scan.js' },
    { name: 'Environment Verify', file: 'scripts/audit_test_verify_env.js' },
    { name: 'Logic & Calculation', file: 'scripts/audit_logic_test.js' },
    { name: 'Precision Tests', file: 'scripts/test-precision.mjs' },
    { name: 'Full System Audit', file: 'scripts/full_audit.js' }
];

// Header
console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING PORTSYNCRO TEST SUITE');
console.log('==================================================');
console.log(`Target Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('==================================================\n');

let failedTests = 0;

// Execute each script
scripts.forEach(script => {
    const scriptPath = path.join(process.cwd(), script.file);
    const displayName = script.name.padEnd(20);

    console.log(`\x1b[33m▶ Running: ${script.name} (${script.file})\x1b[0m`);

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
        console.log(`\x1b[31m❌ SCIPT MISSING: ${script.file}\x1b[0m\n`);
        failedTests++;
        return;
    }

    const start = Date.now();
    try {
        // Run synchronously
        // We inherit stdio so the user sees the output of each script in real-time
        // Construct args: Add --no-warnings for .mjs files to suppress MODULE_TYPELESS_PACKAGE_JSON warning
        const args = script.file.endsWith('.mjs') ? ['--no-warnings', script.file] : [script.file];

        const result = spawnSync('node', args, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env, FORCE_COLOR: 'true' }
        });

        const duration = ((Date.now() - start) / 1000).toFixed(2);

        if (result.status === 0) {
            console.log(`\x1b[32m✅ ${displayName} PASSED (${duration}s)\x1b[0m\n`);
        } else {
            console.log(`\x1b[31m❌ ${displayName} FAILED (Exit Code: ${result.status})\x1b[0m\n`);
            failedTests++;
        }
    } catch (e) {
        console.log(`\x1b[31m❌ EXECUTION ERROR: ${e.message}\x1b[0m\n`);
        failedTests++;
    }
});

// Summary
console.log('==================================================');
if (failedTests === 0) {
    console.log('\x1b[32m🎉 ALL TESTS PASSED! PROJECT IS HEALTHY.\x1b[0m');
    console.log('You can safely deploy to production.');
    process.exit(0);
} else {
    console.log(`\x1b[31m💀 ${failedTests} TEST(S) FAILED. PLEASE CHECK THE LOGS ABOVE.\x1b[0m`);
    console.log('Fix the issues before deploying.');
    process.exit(1);
}
