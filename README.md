# Dispatch

Self-hosted over-the-air updates for React Native / Expo apps. Drop-in replacement for EAS Updates — works with the standard `expo-updates` client, no custom SDK needed.

## Features

- **OTA updates** — Push JS bundle updates to devices without app store review
- **Channels & branches** — Route devices to different update streams (production, staging, canary)
- **Gradual rollout** — Roll out updates to a percentage of devices with deterministic bucketing
- **Instant rollback** — Switch channel pointers or create rollback directives, no rebuild needed
- **Critical updates** — Force immediate reload for security fixes
- **Code signing** — RSA-signed manifests so devices verify updates came from you
- **Multi-project** — Manage multiple apps from a single server
- **Fingerprint-based versioning** — Auto-detect native dependency changes via `@expo/fingerprint`
- **Web dashboard** — Manage releases, monitor adoption, configure channels, view audit logs
- **CLI tool** — `dispatch init`, `dispatch publish` for local dev and CI/CD
- **GitHub Actions workflow** — Ready-to-use CI/CD pipeline with native change detection

## Quick Start

### 1. Deploy the server

```bash
# Clone and start dependencies (Postgres + MinIO)
git clone https://github.com/alexmgriffiths/dispatch.git
cd dispatch
docker compose up -d

# Run the server locally
cp .env.example .env  # edit with your settings
cargo run
```

Or deploy with Docker:

```bash
docker build -t dispatch .
docker run -p 9999:9999 \
  -e DATABASE_URL=postgres://... \
  -e S3_BUCKET=ota-updates \
  -e S3_BASE_URL=https://cdn.example.com/ota-updates \
  dispatch
```

### 2. Set up your app

Install the CLI from [AppDispatch/cli](https://github.com/AppDispatch/cli):

```bash
# Download the latest release for your platform
curl -sL https://github.com/AppDispatch/cli/releases/latest/download/dispatch-darwin-arm64 -o /usr/local/bin/dispatch
chmod +x /usr/local/bin/dispatch
```

Then from your Expo project:

```bash
dispatch login --server https://ota.example.com --key <your-api-key>
dispatch init
```

This installs `expo-updates`, patches your `app.json`, and configures fingerprint-based runtime versioning.

### 3. Publish an update

```bash
dispatch publish --channel production -m "Fix login bug"
```

The CLI exports your JS bundle, computes the runtime fingerprint, uploads assets, and publishes the update.

Options:

```
--channel <name>     Target channel (default: production)
--message <text>     Release message (default: latest git commit)
--platform <p>       ios, android, or both (default: both)
--rollout <0-100>    Rollout percentage (default: 100)
--critical           Force immediate reload on devices
```

### 4. Set up CI/CD

Copy [`examples/ota-deploy.yml`](examples/ota-deploy.yml) to your app repo at `.github/workflows/ota-deploy.yml`.

Add these to your GitHub repo settings:

| Setting | Where | Value |
|---------|-------|-------|
| `OTA_SERVER_URL` | Variables | `https://your-server.com` |
| `OTA_API_KEY` | Secrets | API key from Dashboard > Settings |

Every push to `main` installs the Dispatch CLI, exports the JS bundle, and publishes to production. Native changes are auto-detected and skipped.

## Dashboard

The web dashboard is served at your server's root URL. First-time setup creates an admin account and your first project.

**Releases** — View all published updates. Toggle active/critical, adjust rollout percentage, open detail drawer for build info and actions.

**Builds** — Uploads from CI that haven't been published yet. Click "Publish" to go to the publish flow.

**Publish** — Select platform builds, pick channels, set rollout %, and publish.

**Adoption** — Time-series download trends and device distribution across update versions.

**Settings** — Branches & channels, API keys, webhooks, team management.

## Key Concepts

### Runtime Version

Determines compatibility between JS bundles and native binaries. Devices only receive updates matching their runtime version. Use fingerprint-based versioning (`runtimeVersion: { policy: "fingerprint" }`) to auto-detect native changes.

### Channels & Branches

**Channels** are what devices connect to (e.g. `production`). **Branches** are where updates live. A channel points to a branch.

- **Promote**: Point `production` to a different branch — all devices instantly get the new updates
- **Roll back**: Switch the pointer back
- **Gradual rollout**: Set a rollout branch at 10% — that percentage gets the new branch, the rest stay on the current one

### Rollout

Two levels: **per-update** (what % of devices get this specific update) and **per-channel** (what % of devices are routed to an alternative branch). Both use deterministic bucketing so the same device always gets the same result.

### Critical Updates

Normal updates apply on next cold start. Critical updates force an immediate reload. Use for security fixes.

## Code Signing

Optional RSA manifest signing for end-to-end update verification.

```bash
# Generate key pair
openssl genpkey -algorithm RSA -out private-key.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in private-key.pem -pubout -out public-key.pem
```

Set `PRIVATE_KEY_PATH=./private-key.pem` on the server, then add the public key to your app's `updates.codeSigningCertificate` in `app.json`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `S3_BUCKET` | Yes | S3 bucket for assets |
| `S3_BASE_URL` | Yes | Public URL prefix for assets (CloudFront or S3) |
| `S3_REGION` | No | AWS region (default: `us-east-1`) |
| `AWS_ENDPOINT_URL` | No | Custom S3 endpoint (for MinIO, R2, etc.) |
| `PRIVATE_KEY_PATH` | No | RSA private key for code signing |
| `HOST` | No | Bind address (default: `0.0.0.0`) |
| `PORT` | No | Server port (default: `9999`) |

## Project Structure

```
dispatch/
├── src/                     # Server (Rust/Axum)
│   ├── handlers/            # API route handlers
│   ├── main.rs              # Entry point, routing, middleware
│   ├── auth.rs              # Authentication & project resolution
│   ├── models.rs            # Database & response models
│   └── errors.rs            # Error types
├── packages/                # See github.com/AppDispatch/cli & react-native SDK
├── web/                     # Dashboard (React/TypeScript)
├── migrations/              # SQL migrations
├── examples/                # Example CI/CD workflows
├── docker-compose.yml       # Local dev (Postgres + MinIO)
└── Dockerfile               # Production build
```

## License

MIT
