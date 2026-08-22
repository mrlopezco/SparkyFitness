# Local Docker Startup Commands

Cheat sheet for the hot-reload stack in `docker/docker-compose.dev.yml`. Run all commands from the **repo root** (PowerShell on Windows is fine).

Always pass `--env-file .env.local` so Compose can interpolate `${...}` in the YAML. Service `env_file:` also injects the same file into containers.

## One-time setup

1. Use the local env file at the repo root (gitignored via `*.local`):

- Preferred: [`.env.local`](../.env.local) (created for this fork)
- Or copy from the template: `Copy-Item docker\.env.example .env.local`

2. Confirm these are set in `.env.local` (do not leave `changeme_*` placeholders):

| Variable | Notes |
|----------|--------|
| `SPARKY_FITNESS_DB_PASSWORD` | Postgres superuser password |
| `SPARKY_FITNESS_APP_DB_PASSWORD` | App DB user password |
| `SPARKY_FITNESS_API_ENCRYPTION_KEY` | 64-char hex (`openssl rand -hex 32`) |
| `BETTER_AUTH_SECRET` | Strong persistent secret |
| `SPARKY_FITNESS_FRONTEND_URL` | Must be `http://localhost:8080` for Vite |

For Coolify production values, use [`.env.coolify`](../.env.coolify) (paste into Coolify UI — see `coolify_deployments.md`). Local and Coolify secrets are **different** on purpose.

## Start

Foreground (logs in the terminal):

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml up --build
```

Detached:

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml up --build -d
```

After the first successful build you can omit `--build` unless Dockerfiles or dependencies changed:

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml up -d
```

## Stop

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml down
```

Stop and remove anonymous volumes (use if `node_modules` inside containers are stale after package changes):

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml down -v
```

## Logs

All services:

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml logs -f
```

One service (`sparkyfitness-db`, `sparkyfitness-server`, `sparkyfitness-frontend`, `sparkyfitness-garmin`, `sparkyfitness-ghd`):

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml logs -f sparkyfitness-server
```

GHD sidecar only:

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml up --build -d sparkyfitness-ghd
docker compose --env-file .env.local -f docker/docker-compose.dev.yml logs -f sparkyfitness-ghd
```

## Rebuild a single service

```powershell
docker compose --env-file .env.local -f docker/docker-compose.dev.yml up --build -d sparkyfitness-server
```

## URLs and ports

| What | URL / host |
|------|------------|
| Frontend (Vite) | http://localhost:8080 |
| Backend API | http://localhost:3010 |
| Postgres | `localhost:5432` |
| GHD sidecar | http://localhost:8001 |

## Persistent local data

Bind mounts under `docker/docker_volume/`:

- `postgresql/` — database files
- `uploads/` — profile / exercise images
- `backup/` — server backups
- `ghd_data/` — GHD per-user SQLite warehouses + Garmin tokens

Source code is bind-mounted for hot reload (`SparkyFitnessServer`, `SparkyFitnessFrontend`, `SparkyFitnessGarmin`, `SparkyFitnessGhd`). Container `node_modules` use anonymous volumes so the host does not overwrite them.

## Windows notes

- Always run compose from the repo root so `.env.local` and build contexts resolve.
- Paths in the compose file use `../` relative to `docker/`; no path changes needed for PowerShell.
