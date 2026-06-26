---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-27
applies_to: local_workspace_cleanup_and_release_branching
topic: workspace_cleanup_branch_policy
---

# Workspace Cleanup And Branch Policy

## Purpose

This runbook prevents future agents and developers from accidentally using the
old divergent local `master` checkout as a release base after the June 26, 2026
production cleanup.

Production source of truth is:

```text
origin/master
production remote HEAD
production .deploy-state/last_deployed_commit
live /api/v1/health services.observability.runtime_sha
```

As of the June 26, 2026 final proof, all four production markers matched:

```text
fd21e4cc2f0ad4b2c14e059b907a3e93a4a60983
```

## Current Local Workspace Roles

Use this clean checkout for new work:

```text
C:\xampp\htdocs\SKU-Inventory-Manager-clean
```

This checkout was created from `origin/master` after the production cleanup and
is intended to be the default human and agent workspace.

Keep this older checkout as preserved evidence unless the owner explicitly
approves archival or deletion:

```text
C:\xampp\htdocs\SKU-Inventory-Manager
```

The older checkout's local `master` was intentionally left divergent after the
cleanup. It may contain historical local commits, preserved WIP references, and
stash context. Do not start new feature, bugfix, docs, or release work from that
local `master`.

## Non-Negotiable Rules

1. Start new non-payment work from `origin/master`, preferably in
   `C:\xampp\htdocs\SKU-Inventory-Manager-clean`.
2. Do not merge, rebase, or reset the old local `master` unless the owner
   explicitly asks for that exact operation.
3. Do not drop or apply the PayMongo implementation stash without explicit
   PayMongo release approval.
4. Do not refer to a stash by number alone in durable instructions. Stash
   numbers move when new stashes are created. Use the stash message.
5. Do not deploy from a dirty checkout or from a checkout whose branch is behind
   `origin/master`.
6. Do not describe source-only changes as production-live without matching
   production proof.

## Preserved Stashes

The PayMongo implementation stash is intentionally excluded from non-payment
work:

```text
pre-prod-deploy-preserve-paymongo-commerce-work-2026-06-08
```

Its `stash@{n}` number can change. Search by message:

```powershell
git stash list | Select-String "pre-prod-deploy-preserve-paymongo-commerce-work-2026-06-08"
```

The non-PayMongo WIP preservation stash from the cleanup is:

```text
codex-preserve-non-paymongo-wip-before-completion-2026-06-26
```

That stash is evidence for the June 26 cleanup. Keep it until the owner decides
that the deployed inventory and final proof no longer need local preservation.

## Starting A Clean Work Branch

From the clean workspace:

```powershell
cd C:\xampp\htdocs\SKU-Inventory-Manager-clean
git fetch origin master
git switch -c codex/<short-task-name> origin/master
```

If a separate folder is safer for a release slice:

```powershell
cd C:\xampp\htdocs\SKU-Inventory-Manager
git fetch origin master
git worktree add -b codex/<short-task-name> C:\xampp\htdocs\SKU-Inventory-Manager-<short-task-name> origin/master
```

Before committing:

```powershell
git status --short --branch
git diff --check
```

Before deploying:

```powershell
git fetch origin master
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
```

Deploy only when the intended release branch is clean and the pushed target SHA
is exactly the source that production should pull.

## PayMongo Work

PayMongo work must use a dedicated branch and explicit approval:

```powershell
cd C:\xampp\htdocs\SKU-Inventory-Manager-clean
git fetch origin master
git switch -c codex/paymongo-<short-scope> origin/master
```

Then apply the preserved PayMongo stash only after approval:

```powershell
git stash list | Select-String "pre-prod-deploy-preserve-paymongo-commerce-work-2026-06-08"
```

Do not apply unrelated non-payment stash entries to a PayMongo branch.

## Production Proof Checklist

After every production deployment, record:

1. `origin/master` SHA.
2. Production remote `HEAD`.
3. Production `.deploy-state/last_deployed_commit`.
4. Newest deploy summary path.
5. Live `/api/v1/health services.observability.runtime_sha`.
6. Whether stale QA parity required the documented emergency bypass.

The production markers must match before the release is considered complete.

## Cleanup Checklist

Safe cleanup candidates:

1. Completed release worktrees whose branches have been pushed or superseded.
2. Ignored dependency folders or build outputs inside temporary worktrees.
3. Release evidence directories only after proof is captured elsewhere.

Do not clean:

1. The old `C:\xampp\htdocs\SKU-Inventory-Manager` evidence checkout.
2. The PayMongo implementation stash.
3. Local secret files such as `.env.qa.local` and `.env.qa.secrets.local`.
4. Deploy summaries, `.deploy-state`, or production evidence artifacts unless
   explicitly archived first.

