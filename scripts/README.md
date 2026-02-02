# PortSyncro Testing Suite

This project includes a comprehensive suite of tests to ensure security, logic correctness, and production readiness.

## Quick Start

To run all tests:

```bash
npm test
```

Or manually:

```bash
node scripts/run_all_tests.js
```

## Included Tests

| Script | Purpose |
|--------|---------|
| `scripts/audit_security_scan.js` | Scans codebase for hardcoded secrets, dangerous patterns (console.log in prod), and basic vulnerabilities. |
| `scripts/audit_test_verify_env.js` | Verifies that `.env.local` exists and contains valid required variables (e.g. `ENCRYPTION_KEY`). |
| `scripts/audit_logic_test.js` | Tests core business logic (FIFO calculations, Portfolio valuation, P/L) in isolation. |
| `scripts/test-precision.js` | Verifies numeric precision handling (Decimal vs Comma locales) to prevent rounding errors. |
| `scripts/full_audit.js` | Performs black-box testing against the running application (Encryption, API Security Headers, Rate Limiting). |

## Notes

- **Full Audit Requirement**: The `full_audit.js` script requires the dev server to be running (`npm run dev`) to test API endpoints and headers. It defaults to port 3000.
- If your server is running on a different port (e.g., 3001), you can specify it:
  ```bash
  PORT=3001 npm test
  ```
