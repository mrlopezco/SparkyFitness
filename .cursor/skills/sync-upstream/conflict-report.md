# Upstream sync — conflict report

Agent: copy this template into the chat, fill every section, then **STOP**. Do not resolve conflicts or push until the user answers the Decision checklist.

---

## Status

- **Blocked at:** merge `main` into `deploy` (merge left in progress)
- **Date/time:**
- **Upstream tip:** `<sha>` — `upstream/main` / tag `vX.Y.Z`
- **Local main (post-FF):** `<sha>`
- **Deploy (pre-merge):** `<sha>` (`origin/deploy` aligned? yes/no)
- **Package version before:** `X.Y.Z`
- **Package version on incoming main:** `X.Y.Z`

## Conflicted files

| File | Ours (`deploy`) intent | Theirs (`main`/upstream) intent | Suggested default | User decision |
|------|------------------------|---------------------------------|-------------------|---------------|
| `path` | brief | brief | upstream + thin hook / keep ours / ask | _pending_ |

Add one row per `git diff --name-only --diff-filter=U` path.

## Hotspot flags

Mark if any conflicted path matches:

- [ ] Docker / Coolify (`docker/Dockerfile.*`, `docker-compose.coolify.yml`, coolify docs)
- [ ] Migrations (`SparkyFitnessServer/db/migrations/`)
- [ ] RLS (`SparkyFitnessServer/db/rls_policies.sql`)
- [ ] Thin-hook mount in a shared upstream module
- [ ] Env templates / compose env wiring

## Deltas from this sync (non-conflict)

- **New migration files:** (paths or none)
- **Notable docker/env changes on clean paths:** (brief or none)
- **Commit range merged so far:** `old..new` (N commits) — or N/A if merge incomplete

## Decision needed

User: reply with decisions per file (or “accept all suggested defaults”). Examples:

1. `docker/Dockerfile.backend` — keep Coolify ARG block / take upstream / manual hybrid: …
2. `path/to/hook.tsx` — keep thin hook from deploy on top of upstream
3. …

## After you decide

Agent will:

1. Resolve only as instructed
2. Ask before creating the merge commit (if not already asked)
3. Ask before `git push origin main` and `git push origin deploy`
4. Remind Coolify redeploy + `git merge deploy` on open `feature/*` branches

## Abort option

If you want a clean tree instead of an in-progress merge:

```bash
git merge --abort
```

Say **abort merge** and the agent will run that and stop without pushing.
