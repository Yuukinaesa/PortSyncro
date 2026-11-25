const { execSync } = require('child_process');
const fs = require('fs');

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').map(s => s.trim()).filter(Boolean);
const patterns = [
  { name: 'Telegram Bot Token', regex: /\b\d{9,10}:[a-zA-Z0-9_-]{35}\b/ },
  { name: 'Private Key', regex: /-----BEGIN (RSA )?PRIVATE KEY-----/ },
  { name: 'GitHub Token', regex: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/ },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z-_]{35}\b/ }
];

let found = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  if (file === '.env.example' || file.startsWith('scripts/audit_') || file.startsWith('scripts/run_vulnerability_') || file.includes('test')) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const p of patterns) {
    if (p.regex.test(content)) {
      console.log(`[ALERT] Matched ${p.name} in ${file}`);
      found++;
    }
  }
}
if (found === 0) {
  console.log(`PASS: Zero leaked credentials across ${files.length} git-tracked files!`);
} else {
  console.error(`FAIL: Found ${found} potential secrets.`);
  process.exit(1);
}
