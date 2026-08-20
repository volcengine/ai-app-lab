# Contributing

## Development setup

Use Node.js 20 or newer. The backend currently has no third-party runtime dependency installation step.

```bash
node --check frontend/app.js
node --check frontend/text-format.js
cd backend
npm test
```

## Change rules

- Keep the runtime fail closed; never add realistic test-data fallback to a real Provider path.
- Keep model output evidence-bound and validate citation IDs on the backend.
- Never commit API keys, Service Role Keys, Feishu content, customer data, backups, logs, videos, or screenshots from real accounts.
- Add focused tests for Provider contracts, persistence, workspace isolation and frontend runtime wiring.
- Update the Skill application bundle after source changes:

```bash
node skills/sales-intelligence-workbench/scripts/sync-assets.mjs
node skills/sales-intelligence-workbench/scripts/sync-assets.mjs --check
node skills/sales-intelligence-workbench/scripts/self-test.mjs
```

## Pull requests

Describe the user-visible behavior, affected Provider or data boundary, tests run, and any external calls or cost. Call out migrations, compatibility changes and remaining risks explicitly.

Do not include private acceptance evidence in a pull request. Use synthetic fixtures for automated tests.
