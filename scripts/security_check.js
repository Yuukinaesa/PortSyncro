// scripts/security_check.js
// Comprehensive Unified Security Audit for PortSyncro (SCA, SAST, Secrets, OWASP, Firestore)

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

console.log('================================================================');
console.log('🛡️  PORTSYNCRO UNIFIED SECURITY AUDIT ENGINE');
console.log('================================================================\n');

let failed = false;

function runStep(title, command) {
  console.log(`▶ [RUNNING] ${title}...`);
  try {
    execSync(command, { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log(`✅ [PASS] ${title}\n`);
  } catch (error) {
    console.error(`❌ [FAIL] ${title} failed!\n`);
    failed = true;
  }
}

// 1. Dependency Vulnerability Audit (audit-ci)
runStep('1. Dependency Vulnerability Audit (audit-ci --moderate)', 'npx audit-ci --moderate');

// 2. Secret & Credential Leak Scan
runStep('2. Deep Secret & Credential Leak Scan', 'node scripts/audit_deep_scan.js');

// 3. Red-Team AppSec & Vulnerability Audit (OWASP, SSRF, IDOR, CSP, Firestore)
runStep('3. OWASP & Infrastructure Security Audit', 'node scripts/run_vulnerability_audit.js');

// 4. Crypto & Entropy Audit
runStep('4. Crypto Hygiene & API Key Pattern Scan', 'node scripts/audit_security_scan.js');

// 5. SAST Linting with eslint-plugin-security
runStep('5. SAST Static Analysis (ESLint Security Plugin)', 'npx eslint . --max-warnings=50');

console.log('================================================================');
if (failed) {
  console.error('❌ SECURITY CHECKS FAILED! Please remediate the reported security issues.');
  process.exit(1);
} else {
  console.log('🎉 ALL SECURITY CHECKS PASSED — APPLICATION IS HARDENED & SECURE.');
  console.log('================================================================\n');
}
