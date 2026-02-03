const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Scripts are located in the same directory as this runner
const scripts = [
    { name: 'Security Scan', file: 'audit_security_scan.js' },
    { name: 'Strict Logic', file: 'strict_logic_test.mjs' },
    { name: 'Strict Workflow', file: 'strict_workflow_test.mjs' },
    { name: 'Environment Verify', file: 'audit_test_verify_env.js' },
    { name: 'Logic & Calculation', file: 'audit_logic_test.js' },
    { name: 'Precision Tests', file: 'test-precision.mjs' },
    { name: 'CSV Logic Test', file: 'test-csv.js' },
    { name: 'Debug Gold Logic', file: 'debug_harga_emas_2.js' },
    // { name: 'Debug Structure', file: 'debug_he_structure.js' }, // Optional
    { name: 'Full System Audit', file: 'full_audit.js' },
    { name: 'Integration Tests', file: 'integration_test.js' }
];

// Determine Project Root (One level up from scripts/)
const PROJECT_ROOT = path.join(__dirname, '..');

// Header
console.log('\x1b[36m%s\x1b[0m', '🚀 STARTING PORTSYNCRO TEST SUITE');
console.log('==================================================');
console.log(`Target Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Project Root: ${PROJECT_ROOT}`);
console.log('==================================================\n');

let failedTests = 0;

// Execute each script
scripts.forEach(script => {
    // Resolve absolute path to the script file
    const scriptPath = path.join(__dirname, script.file);
    const displayName = script.name.padEnd(20);

    console.log(`\x1b[33m▶ Running: ${script.name} (${script.file})\x1b[0m`);

    // Check if file exists
    if (!fs.existsSync(scriptPath)) {
        console.log(`\x1b[31m❌ SCRIPT MISSING: ${scriptPath}\x1b[0m\n`);
        failedTests++;
        return;
    }

    const start = Date.now();
    try {
        // Run synchronously
        // Ensure CWD is set to Project Root so .env and other relative paths work correctly
        const args = script.file.endsWith('.mjs') ? ['--no-warnings', scriptPath] : [scriptPath];

        const result = spawnSync('node', args, {
            stdio: 'inherit',
            cwd: PROJECT_ROOT,
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
