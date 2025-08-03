# PortSyncro - Portfolio Management App

A secure, modern portfolio management application built with Next.js and Firebase, featuring real-time stock and cryptocurrency tracking.

## 🔒 Security Features

PortSyncro implements enterprise-grade security measures:

### Authentication & Authorization
- **Firebase Authentication** with email/password
- **Protected Routes** with automatic redirects
- **Session Management** with timeout protection
- **Input Validation** and sanitization for all user inputs

### API Security
- **Rate Limiting** (25 requests/minute per user)
- **Input Sanitization** for all API endpoints
- **CORS Protection** with strict origin policies
- **Request Validation** with comprehensive error handling

### Security Headers
- **Content Security Policy (CSP)** with strict directives
- **HTTP Strict Transport Security (HSTS)**
- **X-Frame-Options** to prevent clickjacking
- **X-Content-Type-Options** to prevent MIME sniffing
- **Referrer Policy** with strict origin controls
- **Permissions Policy** to restrict browser features

### Data Protection
- **Environment Variables** for all sensitive configuration
- **Secure Logging** with sensitive data redaction
- **Input Sanitization** to prevent XSS attacks
- **Data Validation** with strict type checking

## 🚀 Getting Started

### Prerequisites
- Node.js 16.0.0 or higher
- npm 8.0.0 or higher
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/portsyncro.git
   cd portsyncro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   # Required Firebase Configuration
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   
   # Optional Demo Account (for testing)
   NEXT_PUBLIC_DEMO_EMAIL=demo@example.com
   NEXT_PUBLIC_DEMO_PASSWORD=demo_password
   ```

4. **Run security checks**
   ```bash
   npm run security-check
   npm run check-env
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production with security checks
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run security-check` - Run security validation
- `npm run check-env` - Validate environment variables
- `npm run audit` - Run security audit and checks
- `npm run build:prod` - Production build with all checks
- `npm run start:prod` - Production start with all checks

## 🛡️ Security Best Practices

### For Developers
1. **Never commit sensitive data** - Use environment variables
2. **Run security checks** before deployment
3. **Validate all inputs** - Use the provided validation utilities
4. **Use secure logging** - Avoid logging sensitive information
5. **Keep dependencies updated** - Run `npm audit` regularly

### For Deployment
1. **Use HTTPS** in production
2. **Set up proper Firebase security rules**
3. **Configure CSP headers** for your domain
4. **Monitor logs** for suspicious activity
5. **Regular security audits** of the application

### Firebase Security Rules
Ensure your Firestore security rules are properly configured:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📁 Project Structure

```
PortSyncro/
├── components/          # React components
├── lib/                # Utility libraries
│   ├── security.js     # Security utilities
│   ├── middleware.js   # Security middleware
│   └── ...
├── pages/              # Next.js pages
│   └── api/           # API endpoints
├── scripts/            # Build and security scripts
├── styles/             # CSS styles
└── public/             # Static assets
```

## 🔍 Security Monitoring

The application includes comprehensive security monitoring:

- **Request Logging** with user agent analysis
- **Rate Limiting** with automatic cleanup
- **Error Tracking** with sanitized error messages
- **Input Validation** with detailed error reporting
- **Security Headers** validation

## 🚨 Security Alerts

The application will automatically detect and block:
- Suspicious user agents (scanners, bots)
- Malicious request headers
- Rate limit violations
- Invalid input patterns
- Authentication bypass attempts

## 📞 Support

For security issues or questions:
1. Check the security documentation
2. Run `npm run security-check`
3. Review Firebase security rules
4. Contact the development team

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔄 Updates

Regular security updates are applied to:
- Dependencies (via `npm audit`)
- Security configurations
- Input validation rules
- Rate limiting policies

---

**⚠️ Security Notice**: This application handles financial data. Always follow security best practices and keep the application updated with the latest security patches.
