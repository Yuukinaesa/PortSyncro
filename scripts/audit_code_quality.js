const fs = require('fs');
const path = require('path');

const DIRECTORIES_TO_SCAN = ['pages', 'components', 'lib', 'hooks'];
const FORBIDDEN_PATTERNS = [
    { pattern: /console\.log\(/, message: 'Found console.log() - Use a proper logger or remove in production', severity: 'warning' },
    { pattern: /debugger;/, message: 'Found debugger statement', severity: 'error' },
    { pattern: /alert\(/, message: 'Found alert() - UI blocking', severity: 'error' },
    { pattern: /TODO:/, message: 'Found TODO comment - Resolve before strict release', severity: 'info' },
    { pattern: /FIXME:/, message: 'Found FIXME comment - Critical to resolve', severity: 'warning' }
];

let issueCount = 0;
let errorCount = 0;

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        FORBIDDEN_PATTERNS.forEach(check => {
            if (check.pattern.test(line)) {
                // Ignore comments for code patterns if possible, but simple regex is sufficient for now
                // Skip if it is this file itself (not applicable here as we scan logic/ui folders)

                const loc = `${filePath}:${index + 1}`;
                const coloredLoc = `\x1b[36m${loc}\x1b[0m`;

                if (check.severity === 'error') {
                    console.error(`\x1b[31m[ERROR] ${check.message} at ${coloredLoc}\x1b[0m`);
                    console.error(`    ${line.trim()}`);
                    errorCount++;
                    issueCount++;
                } else if (check.severity === 'warning') {
                    console.warn(`\x1b[33m[WARN]  ${check.message} at ${coloredLoc}\x1b[0m`);
                    issueCount++;
                } else {
                    // console.log(`[INFO]  ${check.message} at ${loc}`); 
                }
            }
        });
    });
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            walkDir(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
            scanFile(fullPath);
        }
    }
}

console.log('\n--- 🕵️  CODE QUALITY AUDIT ---');
console.log('Scanning directories:', DIRECTORIES_TO_SCAN.join(', '));

DIRECTORIES_TO_SCAN.forEach(d => walkDir(path.join(process.cwd(), d)));

console.log('\n------------------------------------------------');
if (errorCount > 0) {
    console.log(`\x1b[31m❌ FAILED: Found ${errorCount} critical errors and ${issueCount} total issues.\x1b[0m`);
    process.exit(1);
} else {
    if (issueCount > 0) {
        console.log(`\x1b[33m⚠️  PASSED WITH WARNINGS: Found ${issueCount} non-critical issues.\x1b[0m`);
    } else {
        console.log(`\x1b[32m✅ PASSED: Clean code quality.\x1b[0m`);
    }
    process.exit(0);
}
