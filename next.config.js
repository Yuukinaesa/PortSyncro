/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // swcMinify dihapus karena sudah tidak didukung
    
    // Environment Variables Documentation
    // Required: NEXT_PUBLIC_FIREBASE_* (Firebase configuration)
    // Optional: NEXT_PUBLIC_DEMO_EMAIL, NEXT_PUBLIC_DEMO_PASSWORD (Demo account)
    // Demo account enables "Login Demo Account" button on login/register pages
  }
  
  module.exports = nextConfig