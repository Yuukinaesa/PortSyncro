# Deployment Guide - Demo Account Setup

This guide explains how to set up the demo account feature when deploying to Vercel.

## 🚀 Vercel Deployment

### 1. Environment Variables Setup

After deploying your app to Vercel, you need to configure the demo account environment variables:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following environment variables:

#### Required Variables (Firebase)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

#### Optional Variables (Demo Account)
```
NEXT_PUBLIC_DEMO_EMAIL=your_demo_email@example.com
NEXT_PUBLIC_DEMO_PASSWORD=your_demo_password
```

### 2. Demo Account Configuration

#### Option A: Enable Demo Account
- Set both `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD`
- Users will see a "Login Demo Account" button on login/register pages
- Demo account allows users to explore the app without registration

#### Option B: Disable Demo Account
- Leave `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD` empty
- Demo login button will be hidden
- Users must register to use the app

### 3. Redeploy Application

After setting environment variables:
1. Go to **Deployments** tab
2. Click **Redeploy** on your latest deployment
3. Wait for deployment to complete

### 4. Verify Setup

1. Visit your deployed application
2. Go to login page
3. Check if demo login button appears (if configured)
4. Test demo login functionality

## 🔒 Security Considerations

- Demo account credentials are exposed in client-side code (NEXT_PUBLIC_*)
- Use a dedicated demo account with limited permissions
- Consider using Firebase Auth with demo user creation
- Regularly rotate demo account password
- Monitor demo account usage

## 🛠️ Alternative Demo Account Setup

For better security, consider creating demo accounts programmatically:

```javascript
// Example: Create demo account on app initialization
const createDemoAccount = async () => {
  try {
    const demoEmail = `demo-${Date.now()}@yourdomain.com`;
    const demoPassword = generateSecurePassword();
    
    await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
    
    // Set demo account data
    await setDoc(doc(db, "users", user.uid), {
      email: demoEmail,
      isDemoAccount: true,
      createdAt: new Date().toISOString(),
      assets: { stocks: [], crypto: [] }
    });
    
    return { email: demoEmail, password: demoPassword };
  } catch (error) {
    console.error('Error creating demo account:', error);
    return null;
  }
};
```

## 📝 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✅ | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✅ | Firebase app ID |
| `NEXT_PUBLIC_DEMO_EMAIL` | ❌ | Demo account email |
| `NEXT_PUBLIC_DEMO_PASSWORD` | ❌ | Demo account password |

## 🚨 Troubleshooting

### Demo Button Not Appearing
- Check if both `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD` are set
- Verify environment variables are properly configured in Vercel
- Redeploy application after setting environment variables

### Demo Login Fails
- Verify demo account credentials are correct
- Check Firebase authentication settings
- Ensure demo account exists in Firebase Auth
- Check browser console for error messages

### Environment Variables Not Loading
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Redeploy application after adding environment variables
- Check Vercel deployment logs for errors 