---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-06-27
applies_to: developer_deployment_setup
topic: developer_deployment_handoff
---

# Developer Deployment Handoff

## Purpose

This guide is for developers who need to set up deployment access for SKUpervisor.

The intended workflow is:

1. Developer finishes code locally.
2. Developer commits changes on a feature branch.
3. Developer opens a PR into `staging`.
4. The `staging` candidate is qualified, promoted through a governed `staging -> master` PR, and deployed only after the exact `origin/master` SHA is proven.
5. Developers never push directly to `master`; production-current claims require runtime proof and deployed-change accuracy review, not green CI alone.

Developers should not manually upload changed source files to production with WinSCP. WinSCP is only for first-time access setup, server inspection, and emergency file review.

## Authoritative References

Read these before changing the deployment system:

1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. `docs/ops/DEPLOYMENT_GUIDE.md`
5. `docs/ops/NO_STAGING_RELEASE_STANDARD.md`
6. `docs/ops/PRODUCTION_CHECKLIST.md`
7. `docs/guides/SCRIPTS_GUIDE.md`
8. `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`

This setup does not create a new architecture boundary. It uses the existing SSH/PM2 VPS deploy path.

## What Developers Install

Install these on the developer machine:

1. Git for Windows, including Git Bash and OpenSSH.
2. Node.js LTS compatible with the repo engines: Node `>=18`, npm `>=9`.
3. PowerShell. Windows PowerShell is enough; PowerShell 7 is also acceptable.
4. WinSCP for SFTP access and first-time server credential validation.
5. Code editor of choice.

Optional:

1. HeidiSQL, only when the developer needs direct database inspection.
2. PuTTY tools if the developer prefers Pageant or `plink.exe` for SSH tunnels.
3. PM2 locally only for production-like local runtime checks.

## Credential Handling

The owner provides credentials out-of-band. Do not commit credentials to this repository.

Never write these values into tracked files:

1. GitHub personal access tokens.
2. Server passwords.
3. SSH private keys.
4. MySQL usernames and passwords.
5. JWT, SMTP, payment, Redis, or tenant tokens.

Use placeholders in docs and examples. Store secrets only in local untracked files, Windows Credential Manager, WinSCP saved sessions, Pageant, `.ssh` keys, or CI secret stores.

If a file-based handoff is needed on a trusted local machine, use this gitignored companion file:

```text
docs/ops/DEVELOPER_DEPLOYMENT_CREDENTIALS.local.md
```

That file may contain the actual credentials for the developer doing setup. It is intentionally ignored by Git through `docs/ops/*.local.md`. Before sharing the repository, confirm the file is still untracked:

```powershell
git status --short --ignored docs/ops/DEVELOPER_DEPLOYMENT_CREDENTIALS.local.md
```

Expected status:

```text
!! docs/ops/DEVELOPER_DEPLOYMENT_CREDENTIALS.local.md
```

Recommended local files:

```text
.env.qa.local
.env.qa.secrets.local
.env.prod.local
```

These files are local-only and must stay uncommitted.

## Access Model

There are three different access paths:

1. GitHub access: allows the developer to push committed feature branches and open PRs into `staging`.
2. SSH/SFTP access: allows server login, deployment script execution, and log inspection.
3. MySQL access through an SSH tunnel: optional database inspection using HeidiSQL.

Normal production deployment uses GitHub plus SSH after governed promotion to `master`. The server pulls the exact `origin/master` SHA and records deployment evidence.

## One-Time GitHub Setup

1. Clone the repository.
2. Configure Git identity:

```powershell
git config --global user.name "Developer Name"
git config --global user.email "developer@example.com"
```

3. Authenticate GitHub using the provided access method.

Do not paste a GitHub token into source files or docs. If using HTTPS, store it through Git Credential Manager when prompted by Git.

4. Install dependencies:

```powershell
npm install
cd frontend; npm install; cd ..
cd backend; npm install; cd ..
```

5. Confirm local tools:

```powershell
node --version
npm --version
git --version
powershell -ExecutionPolicy Bypass -Command "$PSVersionTable.PSVersion"
```

## One-Time WinSCP Setup

Create a WinSCP site:

```text
File protocol: SFTP
Host name: <production-host>
Port number: <production-ssh-port>
User name: <production-user>
Authentication: password or private key supplied by owner
Remote directory: /var/www/skupervisor
```

Use WinSCP to verify that the developer can see:

```text
/var/www/skupervisor
/var/www/skupervisor/scripts/deploy.sh
/var/www/skupervisor/ecosystem.config.cjs
/var/www/skupervisor/logs/deploy
```

Do not use WinSCP to overwrite application source files during normal work. Manual uploads bypass Git history, release gates, deploy summaries, and runtime SHA proof.

## One-Time SSH Key Setup

From Git Bash:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/skupervisor_deploy_ed25519 -C "skupervisor-deploy-<developer-name>"
```

Send the `.pub` file to the owner, or add it to the server only if the owner explicitly authorizes that.

Local SSH config:

```sshconfig
Host skupervisor-prod
  HostName <production-host>
  Port <production-ssh-port>
  User <production-user>
  IdentityFile ~/.ssh/skupervisor_deploy_ed25519
  IdentitiesOnly yes
```

Validate non-interactive SSH:

```bash
ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
```

If password login is used instead of a key, the deploy workflow may still work interactively, but key-based auth is preferred for repeatable deployments.

## SSH Tunnel Setup For Database Access

The deployment workflow itself does not require HeidiSQL.

Install HeidiSQL only if the developer needs to inspect production MySQL or help debug database state. Database writes in production require explicit owner approval.

Using PuTTY `plink.exe`:

```powershell
plink.exe -ssh <production-user>@<production-host> -P <production-ssh-port> -N -L 3307:127.0.0.1:3306
```

Keep that tunnel window open.

HeidiSQL connection:

```text
Network type: MySQL (TCP/IP)
Hostname / IP: 127.0.0.1
Port: 3307
User: <mysql-user>
Password: <mysql-password>
Database: select after connecting
```

If HeidiSQL cannot connect:

1. Confirm the `plink.exe` tunnel is still running.
2. Confirm port `3307` is not already used locally.
3. Confirm server SSH credentials are valid.
4. Confirm the MySQL user is allowed from the server-side connection path.

## Local QA And Production Gate Files

Create local env files from examples:

```powershell
copy .env.qa.local.example .env.qa.local
copy .env.qa.secrets.local.example .env.qa.secrets.local
copy .env.prod.local.example .env.prod.local
```

The owner supplies values for:

```text
QA_BASE_URL
QA_SSH_HOST
QA_SSH_PORT
QA_SSH_USER
QA_COMPANY_TOKEN
QA_AUTH_JWT, optional
PROD_COMPANY_TOKEN
PROD_AUTH_JWT, optional
```

These values are used by the no-staging release gate and production contract checks.

## Normal Developer Workflow

Developers do this:

```powershell
git status --short
npm run check:architecture
npm run lint:docs
git switch -c <feature-branch> origin/staging
git add <changed-files>
git commit -m "<clear commit message>"
git fetch origin staging
git rebase origin/staging
git push origin <feature-branch>
```

Then open a PR from `<feature-branch>` into `staging`. Direct developer pushes to `master` are not part of the governed workflow.

The PR must include or link batch/slice documentation, included and excluded work, affected surfaces, risk, required tests/docs/compliance evidence, and merge-adoption proof when high-risk customer-flow paths changed.

After the `staging -> master` promotion PR merges and the owner is ready to deploy, they can tell the owner or Codex agent:

```text
Deploy to production
```

The agent/operator then runs the guarded deployment flow.

## Guarded Deployment Flow

Run from the repository root on the operator machine.

On Windows, use Git Bash explicitly:

```powershell
& "C:\Program Files\Git\bin\bash.exe" scripts/deploy-remote.sh --yes
```

Do not pipe a PowerShell here-string or generated multi-line script into remote `bash` for manual deploy recovery when SHA or branch arguments are present. CRLF can become part of `--expect-commit` or `--branch` and create false SHA mismatches or invalid refspecs. If the wrapper cannot be used, pass one remote command argument through `ssh.exe` and compute the expected commit on the server after `git fetch`.

The wrapper:

1. Refuses dirty local worktrees.
2. Syncs local `master` with `origin/master`.
3. Checks the deploy source contract.
4. Runs no-staging preflight.
5. Pushes the target commit if needed.
6. Fetches QA deploy summary evidence when missing.
7. Runs the no-staging release gate.
8. Verifies `release_verdict.json`.
9. Connects to production over SSH.
10. Runs `scripts/deploy.sh --branch master --expect-commit <target_sha>`.
11. Builds frontend surfaces.
12. Runs backend deploy gates, migrations, tenant/index checks, PM2 reload, public endpoint checks, and evidence writing.

## Server-Side Deploy Command

The remote wrapper runs this on the server:

```bash
cd /var/www/skupervisor
bash scripts/deploy.sh --branch master --expect-commit <target_sha>
```

Do not replace this with only:

```bash
pm2 start ecosystem.config.cjs
```

PM2 is part of runtime management, but the deploy script is responsible for the full release workflow. If PM2 must be started manually during initial server setup or recovery, use:

```bash
cd /var/www/skupervisor
pm2 start ecosystem.config.cjs --env production
pm2 save
```

For normal deploys, let `scripts/deploy.sh` handle PM2 reload.

## Post-Deploy Proof

After deployment, verify:

```bash
ssh skupervisor-prod "cd /var/www/skupervisor && git rev-parse HEAD && cat .deploy-state/last_deployed_commit && ls -1t logs/deploy/deploy_*.summary.txt | head -1"
```

Public endpoint checks:

```bash
curl -fsS https://skupervisor.dgfy.ph/api/v1/health
curl -fsS https://skupervisor.dgfy.ph
curl -fsS https://pos.dgfy.ph
curl -fsS https://dgfy.ph
curl -fsS https://store.dgfy.ph
```

The target SHA must match:

1. Remote Git `HEAD`.
2. `.deploy-state/last_deployed_commit`.
3. Latest deploy summary.
4. `/api/v1/health` runtime SHA.

If these do not match, production is not proven current.

## Failure Rules

Stop and ask the owner before proceeding when:

1. `qa.deploy.summary.sha_match` fails.
2. The local or server worktree is dirty.
3. The deploy target SHA differs from `origin/master`.
4. A linked release worktree is being used and local `master` in another worktree does not match the intended release SHA.
5. `QA_COMPANY_TOKEN` is missing, a placeholder, or belongs to a different environment than `QA_BASE_URL`.
6. QA rollback or restore drill setup fails.
7. A manual SSH deploy shows a visually correct SHA/branch but fails due to likely CRLF argument corruption.
8. The SSH tunnel works but MySQL login fails.
9. PM2 shows a repeated restart loop.
10. `/api/v1/health` is healthy but runtime SHA is missing or mismatched.
11. The deploy requires an emergency bypass.
12. Batch inventory is missing or marks any batch as `split`, `fix first`, `defer`, or `blocked`.
13. Branch protection or distinct QA proof is missing for automatic production deployment.

Emergency bypass requires explicit owner approval and these values:

```text
RELEASE_EMERGENCY_BYPASS=1
RELEASE_EMERGENCY_REASON=<reason>
RELEASE_EMERGENCY_ACTOR=<name_or_id>
```

Emergency bypass cannot override dirty deploy source, missing high-risk merge-adoption proof, stale frontend asset parity, production runtime SHA mismatch, payment uncertainty, missing batch inventory, or unknown QA target.

## What To Tell Developers

Use this short version:

```text
Install Git for Windows, Node LTS, PowerShell, WinSCP, and optionally HeidiSQL.
Set up GitHub access, WinSCP/SFTP access, SSH key login, and local QA/prod env files.
If you need database access, open the SSH tunnel first and connect HeidiSQL to 127.0.0.1:3307.
When your code is ready, commit it on a feature branch, push that branch, and open a PR into staging.
Do not push directly to master. Do not upload source files manually with WinSCP. The deploy system promotes qualified staging changes into master, then production pulls the exact origin/master SHA over SSH and runs the full guarded deployment workflow.
```
