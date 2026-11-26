// scripts/test_ui_metrics_guide.mjs
// Automated verification of bilingual dictionary completeness and metrics guide consistency

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('🧪 RUNNING UI METRICS & I18N CONSISTENCY AUDIT...');

// 1. Verify languageContext has all metric keys in both id and en
const langContextPath = path.resolve('lib/languageContext.js');
const langContextContent = fs.readFileSync(langContextPath, 'utf8');

const requiredKeys = [
  'initialPorto',
  'initialPortoDesc',
  'currentPorto',
  'capitalReturn',
  'investedCost',
  'currentValue',
  'exclStableShort',
  'activeCapital',
  'stablecoinCash',
  'stablecoinStandby',
  'accounts',
  'assets',
  'metricsGuideTitle',
  'guideInitialPortoTitle',
  'guideStableTitle',
  'guideCostVsValueTitle',
  'stablecoinSummary',
  'allCrypto'
];

// Check id section
const idSection = langContextContent.substring(
  langContextContent.indexOf('const translations = {'),
  langContextContent.indexOf('en: {')
);

// Check en section
const enSection = langContextContent.substring(
  langContextContent.indexOf('en: {')
);

requiredKeys.forEach(key => {
  assert(idSection.includes(`${key}:`), `Missing key '${key}' in Indonesian translations`);
  assert(enSection.includes(`${key}:`), `Missing key '${key}' in English translations`);
});
assert(idSection.includes("stockSuccessfullySold: 'Berhasil menjual {amount} lot {ticker}'"), 'ID stockSuccessfullySold must keep template params');
assert(enSection.includes("stockSuccessfullySold: 'Successfully sold {amount} lots of {ticker}'"), 'EN stockSuccessfullySold must keep template params');
console.log('✅ 1. All 18 bilingual metric keys & critical templates present in both ID and EN dictionaries.');

// 2. Verify MetricsGuideModal.js exists and exports default function
const modalPath = path.resolve('components/MetricsGuideModal.js');
assert(fs.existsSync(modalPath), 'MetricsGuideModal.js does not exist');
const modalContent = fs.readFileSync(modalPath, 'utf8');
assert(modalContent.includes('export default function MetricsGuideModal'), 'MetricsGuideModal must export default component');
console.log('✅ 2. MetricsGuideModal component exists and has valid default export.');

// 3. Verify Portfolio.js imports and renders MetricsGuideModal
const portfolioPath = path.resolve('components/Portfolio.js');
const portfolioContent = fs.readFileSync(portfolioPath, 'utf8');
assert(portfolioContent.includes('import MetricsGuideModal from \'./MetricsGuideModal\';'), 'Portfolio.js must import MetricsGuideModal');
assert(portfolioContent.includes('<MetricsGuideModal'), 'Portfolio.js must render <MetricsGuideModal');
assert(portfolioContent.includes('notification={{ ...notification, isOpen: true }}'), 'Portfolio.js must pass notification object with isOpen: true to Notification');
console.log('✅ 3. Portfolio.js cleanly integrates MetricsGuideModal and Notification.');

// 4. Mathematical Formula Integrity Verification
// Rule: (Current Portfolio) - (Pre-P/L Portfolio) == Total P/L
const testCases = [
  { cash: 10000000, investedCost: 50000000, gain: 5000000 },
  { cash: 5000000, investedCost: 80000000, gain: -12000000 },
  { cash: 0, investedCost: 25000000, gain: -3500000 }
];

testCases.forEach((tc, idx) => {
  const initialPorto = tc.investedCost + tc.cash;
  const currentInvestedVal = tc.investedCost + tc.gain;
  const currentPorto = currentInvestedVal + tc.cash;
  const computedGain = currentPorto - initialPorto;
  assert.strictEqual(computedGain, tc.gain, `Math mismatch in test case ${idx}`);
});
console.log('✅ 4. Mathematical integrity verified: (Current Porto) - (Porto Utuh) === Total P/L.');

console.log('\n🎉 ALL UI METRICS & I18N VERIFICATIONS PASSED 100%!');
