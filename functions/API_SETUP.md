# F3 API Configuration

This document describes how to configure the F3 Nation API credentials for Cloud Functions.

## Production (Deployed Functions)

API credentials are stored in Firebase Functions config:

```bash
# Set credentials
firebase functions:config:set f3.api_key="YOUR_API_KEY_HERE"
firebase functions:config:set f3.client="f3nearme"

# View current config
firebase functions:config:get
```

The Cloud Functions code reads `functions.config().f3.api_key` at runtime.

## Local Development (Emulator)

For local development, API credentials are set via environment variables in `functions/.env`:

```bash
cp functions/.env.example functions/.env
# Edit functions/.env and set your F3_API_KEY
```

The code checks `process.env.F3_API_KEY` first, then falls back to `functions.config()`.

A `.runtimeconfig.json` file in `functions/` provides `functions.config()` values to the emulator.

## Getting Your API Key

Contact the F3 Nation API administrator to obtain your API key.

## Security Notes

- Never commit API keys to version control
- `functions/.env`, `functions/.runtimeconfig.json`, and `functions/service-account.json` are all gitignored
- For production, use Firebase Functions config (`firebase functions:config:set`)
- The `process.env.F3_API_KEY` variable is only used locally and is not pushed to Firebase/GCP
