const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const IGNORE_DIRS = ['.git', 'node_modules', '.next', 'out', 'public', 'scripts', '.vscode'];
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.env'];

const PATTERNS = [
    { name: 'Potential Hardcoded Secret', regex: /(api_key|secret|password|auth_token)\s*[:=]\s*['"`][a-zA-Z0-9_\-\.]{8,}['"`]/i, severity: 'HIGH' },
    { name: 'Console Log in Production Code', regex: /console\.log\(/, severity: 'LOW' },
    { name: 'Todo Comment', regex: /\/\/\s*(TODO|FIXME)/, severity: 'INFO' },
    { name: 'Dangerous HTML', regex: /dangerouslySetInnerHTML/, severity: 'MEDIUM' },
    { name: 'Eval Usage', regex: /eval\(/, severity: 'HIGH' }
];

let issues = [];

function scanDir(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        if (IGNORE_DIRS.includes(file)) return;

        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else {
            const ext = path.extname(file);
            if (EXTENSIONS.includes(ext)) {
                checkFile(fullPath);
            }
        }
    });
}

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(ROOT_DIR, filePath);

    // Skip self (if running from scripts) and localization files
    if (relativePath.includes('security_scan_comprehensive.js') || relativePath.includes('languageContext.js')) return;

    PATTERNS.forEach(pattern => {
        if (pattern.regex.test(content)) {
            // Find line number
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                if (pattern.regex.test(line)) {
                    // Filter out comments for code checks if possible, but simple regex for now
                    if (pattern.name === 'Console Log in Production Code' && (line.trim().startsWith('//') || filePath.includes('.test.') || filePath.includes('audit'))) return;

                    issues.push({
                        file: relativePath,
                        line: index + 1,
                        message: pattern.name,
                        content: line.trim().substring(0, 100),
                        severity: pattern.severity
                    });
                }
            });
        }
    });
}

console.log('\x1b[36m🔍 STARTING DEEP CODE SCAN...\x1b[0m');
try {
    scanDir(ROOT_DIR);
} catch (e) {
    console.error('Scan failed:', e);
}

const high = issues.filter(i => i.severity === 'HIGH');
const medium = issues.filter(i => i.severity === 'MEDIUM');
const low = issues.filter(i => i.severity === 'LOW');
const info = issues.filter(i => i.severity === 'INFO');

console.log(`\nScan Complete. Found ${issues.length} potential items.`);
console.log(`🔴 HIGH: ${high.length} | 🟠 MEDIUM: ${medium.length} | 🟡 LOW: ${low.length} | 🔵 INFO: ${info.length}\n`);

if (high.length > 0) {
    console.log('\x1b[31mCRITICAL ISSUES FOUND:\x1b[0m');
    high.forEach(i => console.log(`  [${i.file}:${i.line}] ${i.message}`));
}

if (medium.length > 0) {
    console.log('\x1b[33mWARNINGS:\x1b[0m');
    medium.forEach(i => console.log(`  [${i.file}:${i.line}] ${i.message}`));
}

// Low/Info hidden by default or shown if verbose
// issues.forEach(i => console.log(`${i.severity}: ${i.file}:${i.line} - ${i.message}`));

if (high.length > 0) {
    console.log('\n❌ SECURITY SCAN FAILED');
    process.exit(1);
} else {
    console.log('\n✅ SECURITY SCAN PASSED');
    process.exit(0);
}
