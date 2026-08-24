# Sync upstream — reference

Companion to [SKILL.md](SKILL.md). Read when running a sync or writing a conflict report.

## Remotes

| Remote | Expected URL | Role |
|--------|--------------|------|
| `origin` | Your fork (e.g. `mrlopezco/SparkyFitness`) | Push `main` / `deploy` here |
| `upstream` | `https://github.com/CodeWithCJ/SparkyFitness.git` | Read-only source of releases |

Add upstream if missing:

```bash
git remote add upstream https://github.com/CodeWithCJ/SparkyFitness.git
```

## Branch roles

From `.cursor/rules/fork-upstream-isolation.mdc`:

| Branch | Role |
|--------|------|
| `main` | Mirror of upstream only — **no** fork features |
| `deploy` | Coolify production + fork features |
| `feature/*` | Fork WIP; PR/merge into `deploy`, not upstream |

## Sync shape

```
upstream/main (or tag vX.Y.Z)
        │
        ▼
   origin/main   (fast-forward mirror)
        │
        ▼
   origin/deploy (merge main; keep fork commits)
        │
        ▼
   Coolify redeploy (manual)
```

Always **merge** into `deploy`, never rebase shared `deploy` history.

## Conflict hotspots

Expect friction in paths this fork already customizes:

- `docker/Dockerfile.frontend`, `docker/Dockerfile.backend`
- `docker/docker-compose.coolify.yml`, `docker/coolify_deployments.md`
- Thin hooks in shared upstream UI/server files (single import, `app.use`, button, prop)
- `SparkyFitnessServer/db/migrations/` and `SparkyFitnessServer/db/rls_policies.sql` if both sides changed

### Resolution defaults

1. **Shared upstream modules** — take upstream content; re-apply only the thin hook lines from `deploy`.
2. **Fork-only files** (new routes, services, docs under `docs/content/1.install/12*.md`–`14*.md`, Coolify templates) — keep ours.
3. **Docker/Coolify** — preserve fork Coolify ARG/`NODE_ENV`/compose wiring unless upstream change is clearly required for the app to build; call out in the decision checklist.
4. **Migrations / RLS** — never silently combine; list both sides and wait for the user.

## Pre/post checks

### Versions

Compare before vs after:

- `SparkyFitnessServer/package.json`
- `SparkyFitnessFrontend/package.json`
- `SparkyFitnessMobile/package.json`
- `shared/package.json`

### Migrations

```bash
git diff --name-only main_old..main -- SparkyFitnessServer/db/migrations/
```

(Use the actual pre-sync `main` SHA if needed.) New migrations apply on server restart/Coolify redeploy. Leave `db_schema_backup.sql` alone (CI regenerates).

### Env / Coolify

Diff upstream env examples vs fork:

- `docker/.env.example`
- `.env.coolify.template` / `.env.coolify` (local; do not commit secrets)
- `docker/docker-compose.coolify.yml`

List new required vars in the sync summary. Skill does not edit Coolify UI.

### Fork feature smoke list

Docs: `docs/content/1.install/12.fork-ai-meal-log.md` through `14.fork-*.md`.

Confirm hooks still present after merge (search/mount points), including:

- Quick AI Meal Log / Describe with AI
- Training plan
- Diary weight widget
- Garmin health data (compose vs `SparkyFitnessGarmin/`)
- Module visibility settings

## Local deploy branch lag

If `deploy` is behind `origin/deploy`, always `git pull origin deploy` before merging `main`.

## What this skill does not do

- Drive Coolify redeploy buttons
- Open GitHub PRs unless the user asks in the same session
- Push without explicit per-branch approval
- Force-push or skip hooks
