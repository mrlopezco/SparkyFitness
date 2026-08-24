---
name: sync-upstream
description: >-
  Sync this SparkyFitness fork from upstream CodeWithCJ (mirror main, merge into
  deploy for Coolify). Stops on conflicts with a decision report; never auto-resolves
  or force-pushes. Use when the user says sync upstream, pull SparkyFitness release,
  update from CodeWithCJ, merge upstream into deploy, or invokes @sync-upstream.
disable-model-invocation: true
---

# Sync upstream (fork → deploy)

Read [reference.md](reference.md) for remotes, branch roles, hotspots, and Coolify checks.
On conflicts, fill [conflict-report.md](conflict-report.md) and **STOP** — do not resolve until the user decides.

## Hard gates (never skip)

1. Dirty worktree or mid-rebase/cherry-pick/merge already in progress → **STOP**; ask user to stash, commit, or abort first.
2. Missing `upstream` remote → **STOP**; tell them:
   `git remote add upstream https://github.com/CodeWithCJ/SparkyFitness.git`
3. `main` cannot fast-forward to `upstream/main` → **STOP**; report divergence (fork commits on `main` violate policy).
4. Merge conflicts on `deploy` → **do not auto-resolve**. Leave the merge **in progress**, fill the conflict report, wait for user decisions.
5. **Never** force-push, never `--no-verify`, never push `deploy` (or `main`) without explicit approval in the current turn.
6. **Never** commit unless the user asked to commit after approving resolutions.

## Workflow checklist

Copy and track:

```
Sync progress:
- [ ] Preflight
- [ ] Fetch upstream + origin
- [ ] Fast-forward main
- [ ] Merge main into deploy
- [ ] Happy-path summary OR conflict report + STOP
- [ ] User-directed resolve (if any)
- [ ] Ask before push
- [ ] Post-sync reminders
```

### 1. Preflight

```bash
git status -sb
git remote -v
git branch -vv
```

- Require clean working tree (no unstaged/staged changes you did not create for this sync).
- Confirm `origin` (fork) and `upstream` (`CodeWithCJ/SparkyFitness`) exist.
- Note current branch; you will switch to `main` then `deploy`.
- Record package versions (e.g. `SparkyFitnessServer/package.json` `"version"`) for the summary.

### 2. Fetch

```bash
git fetch upstream --tags
git fetch origin
```

Compare tips:

```bash
git log -1 --oneline upstream/main
git tag -l "v*" --sort=-v:refname | head -5
git rev-list --left-right --count main...upstream/main
git rev-list --left-right --count origin/deploy...deploy
```

Default sync target: **`upstream/main`**. If the user names a tag (e.g. `v1.6.3`) and it differs from `upstream/main`, sync that tag instead and say so in the report.

### 3. Fast-forward `main` (mirror only)

```bash
git checkout main
git pull origin main
git merge --ff-only upstream/main
```

- If `--ff-only` fails → **STOP** with divergence report; do not reset unless the user explicitly asks to reset `main` to upstream.
- Do **not** push yet. Continue to deploy merge first so one summary covers both.

If already up to date with `upstream/main`, say so and continue (deploy may still need the merge).

### 4. Merge `main` into `deploy`

```bash
git checkout deploy
git pull origin deploy
git merge main
```

Use **merge**, not rebase (Coolify tracks `deploy`; shared history).

**On success (no conflicts):** produce the happy-path summary (below). Do not push yet.

**On conflicts:**

1. Leave the merge in progress (do **not** `git merge --abort` unless the user asks).
2. List conflicted files: `git diff --name-only --diff-filter=U`
3. Fill [conflict-report.md](conflict-report.md) in the chat (and optionally write a filled copy under `.cursor/skills/sync-upstream/reports/` only if the user wants a saved file).
4. **STOP.** Wait for per-file decisions. Suggest defaults from fork policy (see reference): prefer upstream for shared modules; re-apply thin hooks from `deploy`.

### 5. After user decisions (conflicts only)

- Resolve **only** as the user instructed.
- `git add` resolved paths; complete merge commit **only if the user asked to commit**.
- Re-check `git status` and that no `UU` paths remain.
- Produce an updated short summary, then ask about push.

### 6. Ask before push

Ask separately (or as one clear checklist):

- Push `origin main`? (mirror)
- Push `origin deploy`? (Coolify production)

Only run `git push` for branches the user approved. Never force-push.

### 7. Post-sync reminders

- Coolify: redeploy from **`deploy`** (skill does not drive Coolify UI).
- Refresh open `feature/*` branches: `git checkout feature/...` then `git merge deploy`.
- Spot-check fork features (see [reference.md](reference.md)).

## Happy-path summary template

```markdown
# Upstream sync summary

- **Upstream tip:** `<sha>` (`upstream/main` / tag `vX.Y.Z`)
- **Version:** `<old>` → `<new>` (from package.json)
- **main:** fast-forwarded / already up to date
- **deploy:** merged `main` cleanly; range `main_old..main_new` (N commits)
- **New migrations:** (paths or "none")
- **Notable docker/env changes:** (brief or "none")
- **Push?** Reply: push main? push deploy?
- **Next:** Coolify redeploy; `git merge deploy` into open feature branches
```

## Conflict policy (quick)

| Situation | Action |
|-----------|--------|
| Shared upstream module conflict | Prefer **theirs/upstream**; re-apply thin hook from ours |
| Fork-only new file | Keep **ours** |
| Docker/Coolify fork edits vs upstream Dockerfile | Ask user; default keep Coolify ARGs/compose fork bits + take upstream app layers if possible |
| Migration/RLS overlap | **STOP** and escalate in report — do not invent a merge |

Details: [reference.md](reference.md).
