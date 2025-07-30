#!/usr/bin/env node

// Script to check environment variables for local development
console.log('🔍 Checking environment variables...\n');

const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

const optionalVars = [
  'NEXT_PUBLIC_DEMO_EMAIL',
  'NEXT_PUBLIC_DEMO_PASSWORD'
];

console.log('📋 Required Firebase Variables:');
let allRequiredPresent = true;
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: Set`);
  } else {
    console.log(`❌ ${varName}: Not set`);
    allRequiredPresent = false;
  }
});

console.log('\n📋 Optional Demo Variables:');
let demoAvailable = true;
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: Set`);
  } else {
    console.log(`⚠️  ${varName}: Not set (demo login will be disabled)`);
    demoAvailable = false;
  }
});

console.log('\n📊 Summary:');
if (allRequiredPresent) {
  console.log('✅ All required Firebase variables are set');
} else {
  console.log('❌ Some required Firebase variables are missing');
}

if (demoAvailable) {
  console.log('✅ Demo login will be available');
} else {
  console.log('⚠️  Demo login will be disabled (optional)');
}

console.log('\n💡 To set up environment variables locally:');
console.log('1. Create a .env.local file in your project root');
console.log('2. Add your Firebase configuration variables');
console.log('3. Optionally add demo account credentials');
console.log('4. Restart your development server'); 