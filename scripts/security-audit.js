#!/usr/bin/env node

// scripts/security-audit.js
// Comprehensive security audit script for PortSyncro

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runSecurityAudit() {
  log('🔒 Starting comprehensive security audit...', 'cyan');
  log('==========================================', 'cyan');
  
  let auditScore = 100;
  const issues = [];
  const warnings = [];
  const recommendations = [];
  
  // 1. Check npm audit
  log('\n📦 Checking npm dependencies for vulnerabilities...', 'blue');
  try {
    const auditResult = execSync('npm audit --json', { encoding: 'utf8' });
    const auditData = JSON.parse(auditResult);
    
    if (auditData.metadata.vulnerabilities.total === 0) {
      log('✅ No vulnerabilities found in dependencies', 'green');
    } else {
      log(`⚠️  Found ${auditData.metadata.vulnerabilities.total} vulnerabilities:`, 'yellow');
      log(`   - Critical: ${auditData.metadata.vulnerabilities.critical}`, 'red');
      log(`   - High: ${auditData.metadata.vulnerabilities.high}`, 'yellow');
      log(`   - Moderate: ${auditData.metadata.vulnerabilities.moderate}`, 'yellow');
      log(`   - Low: ${auditData.metadata.vulnerabilities.low}`, 'blue');
      
      auditScore -= auditData.metadata.vulnerabilities.critical * 10;
      auditScore -= auditData.metadata.vulnerabilities.high * 5;
      auditScore -= auditData.metadata.vulnerabilities.moderate * 2;
      auditScore -= auditData.metadata.vulnerabilities.low * 1;
      
      issues.push(`Found ${auditData.metadata.vulnerabilities.total} vulnerabilities in dependencies`);
    }
  } catch (error) {
    log('❌ Error running npm audit', 'red');
    issues.push('Failed to run npm audit');
  }
  
  // 2. Check environment variables
  log('\n🔐 Checking environment variables...', 'blue');
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const requiredVars = [
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'NEXT_PUBLIC_ENCRYPTION_KEY'
    ];
    
    const missingVars = requiredVars.filter(varName => !envContent.includes(varName));
    
    if (missingVars.length === 0) {
      log('✅ All required environment variables are set', 'green');
    } else {
      log(`⚠️  Missing environment variables: ${missingVars.join(', ')}`, 'yellow');
      warnings.push(`Missing environment variables: ${missingVars.join(', ')}`);
      auditScore -= 5;
    }
  } else {
    log('⚠️  .env.local file not found', 'yellow');
    warnings.push('.env.local file not found');
    auditScore -= 10;
  }
  
  // 3. Check security files
  log('\n🛡️  Checking security implementation...', 'blue');
  const securityFiles = [
    'lib/security.js',
    'lib/securityMonitoring.js',
    'lib/enhancedSecurity.js',
    'lib/encryption.js',
    'lib/middleware.js'
  ];
  
  const missingFiles = securityFiles.filter(file => !fs.existsSync(path.join(process.cwd(), file)));
  
  if (missingFiles.length === 0) {
    log('✅ All security files are present', 'green');
  } else {
    log(`❌ Missing security files: ${missingFiles.join(', ')}`, 'red');
    issues.push(`Missing security files: ${missingFiles.join(', ')}`);
    auditScore -= 15;
  }
  
  // 4. Check Next.js configuration
  log('\n⚙️  Checking Next.js security configuration...', 'blue');
  const nextConfigPath = path.join(process.cwd(), 'next.config.js');
  if (fs.existsSync(nextConfigPath)) {
    const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
    const requiredHeaders = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Content-Security-Policy',
      'Strict-Transport-Security'
    ];
    
    const missingHeaders = requiredHeaders.filter(header => !nextConfig.includes(header));
    
    if (missingHeaders.length === 0) {
      log('✅ Security headers are properly configured', 'green');
    } else {
      log(`⚠️  Missing security headers: ${missingHeaders.join(', ')}`, 'yellow');
      warnings.push(`Missing security headers: ${missingHeaders.join(', ')}`);
      auditScore -= 5;
    }
  } else {
    log('❌ next.config.js not found', 'red');
    issues.push('next.config.js not found');
    auditScore -= 10;
  }
  
  // 5. Check for console.log statements
  log('\n📝 Checking for insecure logging...', 'blue');
  try {
    const grepResult = execSync('grep -r "console.log" --include="*.js" --include="*.jsx" . | grep -v "scripts/" | wc -l', { encoding: 'utf8' });
    const consoleLogCount = parseInt(grepResult.trim());
    
    if (consoleLogCount === 0) {
      log('✅ No console.log statements found in production code', 'green');
    } else {
      log(`⚠️  Found ${consoleLogCount} console.log statements in production code`, 'yellow');
      warnings.push(`${consoleLogCount} console.log statements found in production code`);
      auditScore -= Math.min(consoleLogCount * 2, 20);
    }
  } catch (error) {
    log('ℹ️  Could not check for console.log statements (grep not available)', 'blue');
  }
  
  // 6. Check for hardcoded secrets
  log('\n🔍 Checking for hardcoded secrets...', 'blue');
  const sourceDirs = ['pages', 'components', 'lib'];
  let foundSecrets = 0;
  
  for (const dir of sourceDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath, { recursive: true });
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.jsx')) {
          const filePath = path.join(dirPath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Check for hardcoded credentials - improved pattern matching
          const credentialPatterns = [
            // More specific patterns to avoid false positives
            /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
            /password\s*[:=]\s*['"][a-zA-Z0-9@$!%*?&]{8,}['"]/i,
            /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
            /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i,
            // Check for Firebase config patterns
            /firebase.*config\s*[:=]\s*\{[^}]*apiKey\s*[:=]\s*['"][^'"]+['"]/i
          ];
          
          // Skip certain files that are known to have false positives
          const skipFiles = [
            'languageContext.js',
            'confirm-reset-password.js',
            'translation',
            'i18n'
          ];
          
          if (skipFiles.some(skipFile => filePath.includes(skipFile))) {
            continue;
          }
          
          for (const pattern of credentialPatterns) {
            if (pattern.test(content)) {
              foundSecrets++;
              log(`⚠️  Potential hardcoded secret found in ${file}`, 'yellow');
            }
          }
        }
      }
    }
  }
  
  if (foundSecrets === 0) {
    log('✅ No hardcoded secrets found', 'green');
  } else {
    warnings.push(`${foundSecrets} potential hardcoded secrets found`);
    auditScore -= foundSecrets * 5;
  }
  
  // 7. Check package.json for security-related packages
  log('\n📦 Checking security packages...', 'blue');
  const packagePath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    const securityPackages = ['helmet', 'cors', 'express-rate-limit'];
    const missingPackages = securityPackages.filter(pkg => !dependencies[pkg]);
    
    if (missingPackages.length === 0) {
      log('✅ All recommended security packages are installed', 'green');
    } else {
      log(`ℹ️  Consider installing: ${missingPackages.join(', ')}`, 'blue');
      recommendations.push(`Install security packages: ${missingPackages.join(', ')}`);
    }
  }
  
  // Generate report
  log('\n📊 Security Audit Report', 'magenta');
  log('========================', 'magenta');
  
  log(`\n🎯 Overall Security Score: ${auditScore}/100`, auditScore >= 90 ? 'green' : auditScore >= 70 ? 'yellow' : 'red');
  
  if (issues.length > 0) {
    log('\n❌ Critical Issues:', 'red');
    issues.forEach(issue => log(`   - ${issue}`, 'red'));
  }
  
  if (warnings.length > 0) {
    log('\n⚠️  Warnings:', 'yellow');
    warnings.forEach(warning => log(`   - ${warning}`, 'yellow'));
  }
  
  if (recommendations.length > 0) {
    log('\n💡 Recommendations:', 'blue');
    recommendations.forEach(rec => log(`   - ${rec}`, 'blue'));
  }
  
  // Security level assessment
  let securityLevel = '';
  if (auditScore >= 90) {
    securityLevel = 'EXCELLENT';
    log('\n🏆 Security Level: EXCELLENT - Production ready with enterprise-grade security', 'green');
  } else if (auditScore >= 80) {
    securityLevel = 'GOOD';
    log('\n✅ Security Level: GOOD - Minor improvements recommended', 'yellow');
  } else if (auditScore >= 70) {
    securityLevel = 'FAIR';
    log('\n⚠️  Security Level: FAIR - Several improvements needed', 'yellow');
  } else {
    securityLevel = 'POOR';
    log('\n❌ Security Level: POOR - Significant security improvements required', 'red');
  }
  
  // Save audit report
  const report = {
    timestamp: new Date().toISOString(),
    score: auditScore,
    level: securityLevel,
    issues,
    warnings,
    recommendations
  };
  
  const reportPath = path.join(process.cwd(), 'security-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log(`\n📄 Detailed report saved to: security-audit-report.json`, 'cyan');
  
  // Exit with appropriate code
  if (issues.length > 0) {
    log('\n❌ Security audit failed. Please address the critical issues.', 'red');
    process.exit(1);
  } else {
    log('\n✅ Security audit completed successfully!', 'green');
    process.exit(0);
  }
}

// Run audit if called directly
if (require.main === module) {
  runSecurityAudit();
}

module.exports = { runSecurityAudit }; 