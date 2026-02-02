// scripts/qa_scenario_runner.js
const { spawnSync } = require('child_process');
const path = require('path');

console.log('\x1b[36m🚀 PORTSYNCRO QA SCENARIO AUTOMATION\x1b[0m');
console.log('==================================================');
console.log('Mapping Automated Scripts to QA Scenarios...');

const checks = [
    { id: 'PM-01', name: 'Add US Stock Logic', type: 'logic', test: 'Test 7' },
    { id: 'PM-02', name: 'Add IDX Stock Logic', type: 'logic', test: 'Test 1' },
    { id: 'PM-06', name: 'Edit Asset - Averaging', type: 'logic', test: 'Test 2' },
    { id: 'PM-07', name: 'Delete Asset Logic', type: 'logic', test: 'Test 4' },
    { id: 'PM-08', name: 'Precision & Float Handling', type: 'logic', test: 'Test 5' },
    { id: 'SEC-01', name: 'XSS Input Validation', type: 'integration', test: 'Input Validation' },
    { id: 'SEC-03', name: 'Rate Limiting', type: 'integration', test: 'API Rate Limiting' },
    { id: 'SEC-04', name: 'No-Cache Implementation', type: 'integration', test: 'API No-Cache Headers' },
    { id: 'DS-01', name: 'Encryption Environment', type: 'env', test: 'key length' }
];

console.log('\n🔄 Executing underlying test suites...\n');

// 1. Logic Tests
const logicRes = spawnSync('node', [path.join(__dirname, 'audit_logic_test.js')], { encoding: 'utf-8' });
console.log('Logic Module:', logicRes.status === 0 ? '✅ OK' : '❌ FAIL');
const logicOutput = logicRes.stdout || '';

// 2. Integration Tests
const integrationRes = spawnSync('node', [path.join(__dirname, 'integration_test.js')], { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
console.log('Integration Module:', integrationRes.status === 0 ? '✅ OK' : '❌ FAIL');
const integrationOutput = integrationRes.stdout || ''; // May contain ANSI colors

// 3. Env Tests
const envRes = spawnSync('node', [path.join(__dirname, 'audit_test_verify_env.js')], { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
console.log('Security Module:', envRes.status === 0 ? '✅ OK' : '❌ FAIL');
const envOutput = envRes.stdout || '';

console.log('\n--------------------------------------------------');
console.log('📊 SCENARIO VERIFICATION REPORT');
console.log('--------------------------------------------------');

let passed = 0;
let total = checks.length;

checks.forEach(check => {
    let status = 'FAIL';

    if (check.type === 'logic') {
        if (logicOutput.includes(`${check.test} Passed`)) status = 'PASS';
    } else if (check.type === 'integration') {
        // Simple text match, ignoring ANSI codes if possible or just precise match
        if (integrationOutput.includes(check.test) && !integrationOutput.includes(`${check.test}: ❌ FAIL`)) {
            status = 'PASS';
        }
    } else if (check.type === 'env') {
        if (envOutput.includes(check.test)) status = 'PASS';
    }

    const color = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}[${check.id}] ${check.name.padEnd(30)} : ${status}\x1b[0m`);
    if (status === 'PASS') passed++;
});

console.log('--------------------------------------------------');
console.log(`Summary: ${passed}/${total} Critical Scenarios Verified.`);
console.log('Scenarios not listed require Manual UI Testing (refer to QA_TEST_SCENARIOS.md).');
console.log('==================================================');

if (passed === total) process.exit(0);
else process.exit(1);
