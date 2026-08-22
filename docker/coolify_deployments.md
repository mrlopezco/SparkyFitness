# Coolify Deployments (This Fork)

Guide for deploying this fork on a Coolify homeserver with `docker/docker-compose.coolify.yml`. This stack **builds images from the repo Dockerfiles** and does **not** pull `codewithcj/*` Hub images.

## Coolify resource settings

| Setting | Value |
|---------|--------|
| Source | This fork’s Git repository |
| Base Directory | `/` (repo root) |
| Docker Compose file | `docker/docker-compose.coolify.yml` |
| Build | On deploy / on push (compose `build:` sections) |

Do not point Coolify at the upstream one-click SparkyFitness service if you want fork features; use this compose file instead.

## Environment checklist

Set these in Coolify’s environment UI (or equivalent). Use the ready-made [`.env.coolify`](../.env.coolify) at the repo root as the source of truth for this fork (paste values into Coolify — do not rely on the file being present on the server). Full descriptions also live in `docker/.env.example`.

### Required secrets / DB

| Variable | Notes |
|----------|--------|
| `SPARKY_FITNESS_DB_NAME` | Database name |
| `SPARKY_FITNESS_DB_USER` | Postgres superuser (migrations) |
| `SPARKY_FITNESS_DB_PASSWORD` | Postgres password |
| `SPARKY_FITNESS_APP_DB_USER` | App DB user |
| `SPARKY_FITNESS_APP_DB_PASSWORD` | App DB password |
| `SPARKY_FITNESS_API_ENCRYPTION_KEY` | 64-char hex; changing later invalidates encrypted provider data |
| `BETTER_AUTH_SECRET` | Session / 2FA signing; **never change** after users enable TOTP |
| `SPARKY_FITNESS_FRONTEND_URL` | Public HTTPS URL Coolify serves (e.g. `https://fitness.example.com`) |

### Required volume paths

These must persist across redeploys (Coolify persistent storage or host paths):

| Variable | Mounted as |
|----------|------------|
| `DB_PATH` | Postgres data (`/var/lib/postgresql`) |
| `SERVER_BACKUP_PATH` | Server backups |
| `SERVER_UPLOADS_PATH` | Uploads (avatars, exercise images) |
| `GHD_DATA_PATH` | GHD sidecar `/data` (tokens + SQLite per user) |

### Common homeserver flags

| Variable | Typical self-hosted value |
|----------|---------------------------|
| `ALLOW_PRIVATE_NETWORK_CORS` | `true` if you hit the app via LAN IPs |
| `ALLOW_PRIVATE_NETWORK_AI` | `true` only on trusted single-tenant setups needing private AI URLs |
| `SPARKY_FITNESS_DISABLE_SIGNUP` | `true` after creating your admin account |
| `SPARKY_FITNESS_ADMIN_EMAIL` | Your admin user email |
| `TZ` | e.g. `America/Denver` |
| `NGINX_RATE_LIMIT` | e.g. `5r/s` |
| `GARMIN_SERVICE_PORT` | `8000` (default) |
| `GARMIN_SERVICE_IS_CN` | `false` unless China region |
| `GHD_MICROSERVICE_URL` | `http://sparkyfitness-ghd:8001` (default) |
| `GHD_SERVICE_PORT` | `8001` (default) |

Generate secrets once and store them in Coolify:

```bash
openssl rand -hex 32
```

## Routing

- Compose publishes the frontend as `${SPARKY_FITNESS_FRONTEND_PORT:-3004}` → nginx `${NGINX_LISTEN_PORT:-80}`.
- Point Coolify’s HTTP proxy / domain at the **frontend** service (or that published port).
- Set `SPARKY_FITNESS_FRONTEND_URL` to the same public HTTPS URL Coolify assigns.
- Backend and Garmin stay on the internal `sparkyfitness-network`; nginx proxies API traffic to `sparkyfitness-server:3010`.

## Deploy workflow

1. Push commits to the branch Coolify watches.
2. Coolify rebuilds `sparkyfitness-server`, `sparkyfitness-frontend`, `sparkyfitness-garmin`, and `sparkyfitness-ghd` from this repo’s Dockerfiles, then recreates containers.
3. After Dockerfile or dependency changes, force a rebuild in Coolify if auto-deploy did not pick up cache-busting (Redeploy / Rebuild without cache).

Local dry-run of compose resolution (optional, from a machine with Docker):

```powershell
docker compose -f docker/docker-compose.coolify.yml config
```

## Services in this stack

| Service | Image source |
|---------|----------------|
| `sparkyfitness-db` | `postgres:18.3-alpine` |
| `sparkyfitness-server` | Build `docker/Dockerfile.backend` |
| `sparkyfitness-frontend` | Build `docker/Dockerfile.frontend` |
| `sparkyfitness-garmin` | Build `docker/Dockerfile.garmin_microservice` |
| `sparkyfitness-ghd` | Build `docker/Dockerfile.ghd_microservice` |

## Pitfalls

- **Do not swap back to Hub images** (`codewithcj/*`) or fork changes will not ship.
- **Do not rotate** `SPARKY_FITNESS_API_ENCRYPTION_KEY` or `BETTER_AUTH_SECRET` after production data / 2FA exists unless you accept lockouts and re-linking providers.
- **`DB_PATH` must be durable.** If the path is empty or ephemeral, redeploys wipe the database.
- Garmin depends on DB + server; if the API cannot reach Garmin, check `GARMIN_MICROSERVICE_URL` (default `http://sparkyfitness-garmin:8000`) and container logs.
- GHD sidecar needs durable `GHD_DATA_PATH`; if the Node API cannot reach it, check `GHD_MICROSERVICE_URL` (default `http://sparkyfitness-ghd:8001`) and `sparkyfitness-ghd` logs.
- `SPARKY_FITNESS_FRONTEND_URL` must match the browser origin (scheme + host + port) or auth/CORS will fail.
