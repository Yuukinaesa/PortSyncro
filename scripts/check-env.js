#!/usr/bin/env node

// scripts/check-env.js
const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

const optionalEnvVars = [
  'NEXT_PUBLIC_DEMO_EMAIL',
  'NEXT_PUBLIC_DEMO_PASSWORD'
];

function checkEnvironmentVariables() {
  console.log('🔍 Checking environment variables...\n');
  
  let allValid = true;
  const missing = [];
  const present = [];
  
  // Check required variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
      allValid = false;
    } else {
      present.push(varName);
    }
  });
  
  // Check optional variables
  const optionalPresent = [];
  optionalEnvVars.forEach(varName => {
    if (process.env[varName]) {
      optionalPresent.push(varName);
    }
  });
  
  // Display results
  if (present.length > 0) {
    console.log('✅ Required environment variables found:');
    present.forEach(varName => {
      console.log(`   ${varName}: ${process.env[varName] ? '✓ Set' : '✗ Missing'}`);
    });
    console.log('');
  }
  
  if (optionalPresent.length > 0) {
    console.log('ℹ️  Optional environment variables found:');
    optionalPresent.forEach(varName => {
      console.log(`   ${varName}: ✓ Set`);
    });
    console.log('');
  }
  
  if (missing.length > 0) {
    console.log('❌ Missing required environment variables:');
    missing.forEach(varName => {
      console.log(`   ${varName}: ✗ Missing`);
    });
    console.log('');
    console.log('Please set these variables in your .env.local file or deployment environment.');
  }
  
  // Check for common issues
  console.log('🔧 Additional checks:');
  
  // Check if Firebase config looks valid
  const firebaseKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (firebaseKey) {
    if (firebaseKey.length < 20) {
      console.log('   ⚠️  Firebase API key seems too short - please verify');
      allValid = false;
    }
    if (!firebaseKey.startsWith('AIza')) {
      console.log('   ⚠️  Firebase API key format seems invalid - should start with "AIza"');
      allValid = false;
    }
  }
  
  // Check if project ID looks valid
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    if (projectId.includes(' ')) {
      console.log('   ⚠️  Firebase project ID contains spaces - please verify');
      allValid = false;
    }
    if (projectId.length < 5) {
      console.log('   ⚠️  Firebase project ID seems too short - please verify');
      allValid = false;
    }
  }
  
  // Check auth domain format
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (authDomain && !authDomain.includes('.firebaseapp.com')) {
    console.log('   ⚠️  Firebase auth domain format seems invalid - should end with ".firebaseapp.com"');
    allValid = false;
  }
  
  // Check for demo account
  if (process.env.NEXT_PUBLIC_DEMO_EMAIL && process.env.NEXT_PUBLIC_DEMO_PASSWORD) {
    console.log('   ✅ Demo account configured');
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(process.env.NEXT_PUBLIC_DEMO_EMAIL)) {
      console.log('   ⚠️  Demo email format seems invalid');
      allValid = false;
    }
  } else {
    console.log('   ℹ️  Demo account not configured (optional)');
  }
  
  console.log('');
  
  if (allValid) {
    console.log('🎉 All environment variables are properly configured!');
    console.log('✅ Ready for production deployment');
    process.exit(0);
  } else {
    console.log('❌ Environment configuration incomplete');
    console.log('Please fix the issues above before deploying to production');
    process.exit(1);
  }
}

// Run the check
checkEnvironmentVariables(); 