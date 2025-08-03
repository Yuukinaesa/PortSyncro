#!/usr/bin/env node

// scripts/security-check.js
// Security validation script for PortSyncro

const fs = require('fs');
const path = require('path');

// Security configuration validation
function validateSecurityConfig() {
  console.log('🔒 Checking security configuration...');
  
  let hasErrors = false;
  const warnings = [];
  
  // Check if security.js exists
  const securityPath = path.join(process.cwd(), 'lib', 'security.js');
  if (!fs.existsSync(securityPath)) {
    console.error('❌ Security utility file (lib/security.js) not found');
    hasErrors = true;
  } else {
    console.log('✅ Security utility file found');
  }
  
  // Check if middleware.js exists
  const middlewarePath = path.join(process.cwd(), 'lib', 'middleware.js');
  if (!fs.existsSync(middlewarePath)) {
    console.error('❌ Security middleware file (lib/middleware.js) not found');
    hasErrors = true;
  } else {
    console.log('✅ Security middleware file found');
  }
  
  // Check Next.js config for security headers
  const nextConfigPath = path.join(process.cwd(), 'next.config.js');
  if (fs.existsSync(nextConfigPath)) {
    const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
    
    const requiredHeaders = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'Permissions-Policy'
    ];
    
    for (const header of requiredHeaders) {
      if (!nextConfig.includes(header)) {
        console.error(`❌ Security header '${header}' not found in next.config.js`);
        hasErrors = true;
      }
    }
    
    if (!hasErrors) {
      console.log('✅ All required security headers configured');
    }
  } else {
    console.error('❌ next.config.js not found');
    hasErrors = true;
  }
  
  // Check package.json for security-related dependencies
  const packagePath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // Check for known vulnerable packages
    const vulnerablePackages = [
      'lodash',
      'moment',
      'jquery',
      'bootstrap'
    ];
    
    for (const pkg of vulnerablePackages) {
      if (dependencies[pkg]) {
        warnings.push(`⚠️  Consider replacing ${pkg} with a more secure alternative`);
      }
    }
    
    // Check for security-related packages
    const securityPackages = [
      'helmet',
      'express-rate-limit',
      'cors',
      'helmet-csp'
    ];
    
    for (const pkg of securityPackages) {
      if (!dependencies[pkg]) {
        console.log(`ℹ️  Consider adding ${pkg} for additional security`);
      }
    }
  }
  
  // Check for environment variables
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check for sensitive data in env file
    const sensitivePatterns = [
      /password\s*=/i,
      /secret\s*=/i,
      /key\s*=/i,
      /token\s*=/i
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(envContent)) {
        console.log('ℹ️  Sensitive data found in .env.local (this is expected)');
        break;
      }
    }
  } else {
    console.log('ℹ️  .env.local not found - make sure to create it with required variables');
  }
  
  // Check for common security issues in source files
  const sourceDirs = ['pages', 'components', 'lib'];
  const securityIssues = [];
  
  for (const dir of sourceDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      checkDirectoryForSecurityIssues(dirPath, securityIssues);
    }
  }
  
  if (securityIssues.length > 0) {
    console.warn('⚠️  Potential security issues found:');
    securityIssues.forEach(issue => console.warn(`   - ${issue}`));
  }
  
  // Display warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Security warnings:');
    warnings.forEach(warning => console.warn(`   ${warning}`));
  }
  
  if (hasErrors) {
    console.error('\n❌ Security check failed. Please fix the issues above.');
    process.exit(1);
  } else {
    console.log('\n✅ Security check passed!');
    console.log('🎉 Your application has good security practices implemented.');
  }
}

function checkDirectoryForSecurityIssues(dirPath, issues) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    
    if (file.isDirectory()) {
      checkDirectoryForSecurityIssues(fullPath, issues);
    } else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // Check for common security issues
      if (content.includes('eval(') && !content.includes('// safe eval')) {
        issues.push(`${fullPath}: eval() usage detected`);
      }
      
      if (content.includes('innerHTML') && !content.includes('DOMPurify')) {
        issues.push(`${fullPath}: innerHTML usage without sanitization`);
      }
      
      if (content.includes('localStorage') && !content.includes('encrypt')) {
        issues.push(`${fullPath}: localStorage usage without encryption`);
      }
      
      if (content.includes('sessionStorage') && !content.includes('encrypt')) {
        issues.push(`${fullPath}: sessionStorage usage without encryption`);
      }
      
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
        'confirm-reset-password.js'
      ];
      
      if (skipFiles.some(skipFile => fullPath.includes(skipFile))) {
        continue;
      }
      
      for (const pattern of credentialPatterns) {
        if (pattern.test(content)) {
          issues.push(`${fullPath}: Hardcoded credentials detected`);
          break;
        }
      }
      
      // Check for console.log statements in production code
      if (content.includes('console.log(') && !content.includes('secureLogger')) {
        const lines = content.split('\n');
        const consoleLogLines = lines
          .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
          .filter(({ line }) => line.includes('console.log(') && !line.includes('secureLogger'));
        
        if (consoleLogLines.length > 0) {
          issues.push(`${fullPath}: console.log statements found (use secureLogger instead)`);
        }
      }
    }
  }
}

// Run security check
if (require.main === module) {
  validateSecurityConfig();
}

module.exports = { validateSecurityConfig }; 