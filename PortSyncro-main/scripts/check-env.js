#!/usr/bin/env node

// scripts/check-env.js
// Professional Environment Check for Production Deployment

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

function checkEnvironment() {
  console.log('🔍 Checking environment variables...');
  
  let hasErrors = false;
  const missingVars = [];
  const warnings = [];
  
  // Check required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
      hasErrors = true;
    }
  }
  
  // Check optional environment variables
  for (const envVar of optionalEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  }
  
  // Display results
  if (hasErrors) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n💡 Please set these environment variables before deploying.');
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️  Optional environment variables not set:');
    warnings.forEach(varName => {
      console.warn(`   - ${varName}`);
    });
    console.warn('\n💡 These are optional but recommended for full functionality.');
  }
  
  // Check Firebase configuration
  try {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    };
    
    // Validate Firebase config
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey.length < 10) {
      throw new Error('Invalid Firebase API Key');
    }
    
    if (!firebaseConfig.projectId || firebaseConfig.projectId.length < 5) {
      throw new Error('Invalid Firebase Project ID');
    }
    
    console.log('✅ Firebase configuration is valid');
    
  } catch (error) {
    console.error('❌ Firebase configuration error:', error.message);
    process.exit(1);
  }
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 16) {
    console.error(`❌ Node.js version ${nodeVersion} is not supported. Please use Node.js 16 or higher.`);
    process.exit(1);
  }
  
  console.log(`✅ Node.js version ${nodeVersion} is supported`);
  
  // Check if we're in production mode
  if (process.env.NODE_ENV === 'production') {
    console.log('🚀 Production environment detected');
    
    // Additional production checks
    if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.includes('.firebaseapp.com')) {
      console.warn('⚠️  Firebase Auth Domain should end with .firebaseapp.com');
    }
  }
  
  console.log('✅ Environment check completed successfully!');
  console.log('🎉 Ready for deployment');
}

// Run the check
if (require.main === module) {
  checkEnvironment();
}

module.exports = { checkEnvironment }; 