# Resolving omitted targets from the current worktree

This contract lets the Worker and PR Reviewer resolve an omitted issue or PR target from the
current task context. It is session-local guidance: it does not create issues, PRs, or Orca links,
and it does not change either role's existing validation, board, checkpoint, review, or merge rules.

## Precedence and scope

- A supplied issue number, planner artifact path, manual handoff path, or PR number is explicit and
  wins. Validate it under the role's existing contract and skip omitted-target resolution. An
  explicit issue without a plan path keeps the current behavior; it does not trigger plan pickup.
- A manual Reviewer handoff with `pr: <number>` is explicit. `pr: none` leaves the PR target
  omitted and invokes the resolver.
- When a target is omitted, inspect only the current checkout and, when available, the Orca
  metadata attached to this exact worktree. Never borrow context from a sibling or parent
  worktree, choose among multiple tasks, or set Orca links automatically.

## Optional Orca adapter

Use Orca only as an optional source of `linkedIssue` and `linkedPR`. From the repository root, pin
the lookup to this checkout's top-level path:

```bash
TOP="$(git rev-parse --show-toplevel)"
orca worktree show --worktree "path:$TOP" --json
```

This `jq` filter checks the result and prints only the accepted link fields:

```bash
orca worktree show --worktree "path:$TOP" --json |
  jq -e --arg top "$TOP" '
    def link_ok: . == null or (type == "number" and . > 0 and floor == .);
    .result.worktree as $worktree
    | select(.ok == true and $worktree.path == $top)
    | ($worktree.linkedTaskSourceContext.providerIdentity // null) as $identity
    | select($identity == null or (
        ((($identity.provider // "") | ascii_downcase) == "github")
        and ((($identity.owner // "") | ascii_downcase) == "sieitzz")
        and ((($identity.repo // "") | ascii_downcase) == "dgfy-platform")
      ))
    | select(($worktree.linkedIssue | link_ok) and ($worktree.linkedPR | link_ok))
    | {linkedIssue: $worktree.linkedIssue, linkedPR: $worktree.linkedPR}
  '
```

If both printed values are `null`, report that no assignment is linked and use the repository-local
fallback. A failed command, empty output, or filter that produces no result is also unavailable;
name the specific validation that failed.

Accept the result only when all of these checks pass:

1. The command succeeds and returns JSON with `.ok == true`.
2. `.result.worktree.path` exactly equals `$TOP`.
3. `.result.worktree.linkedTaskSourceContext.providerIdentity` is absent or identifies
   `github` / `Sieitzz/dgfy-platform`, compared case-insensitively.
4. The links are null or valid issue/PR numbers. If both links are null, the adapter has no
   assignment to contribute.

Only read `.result.worktree.path`, `.result.worktree.linkedIssue`,
`.result.worktree.linkedPR`, and the optional provider identity fields named above. Do not inspect
`parentWorktreeId`, `childWorktreeIds`, another worktree, or any other Orca selector. Use
`path:$TOP`, not `active`: `active` may follow Orca UI focus and is not guaranteed to identify the
worktree that owns the current session.

Treat Orca as unavailable, report the reason, and continue to the repository-local fallback when
Orca is not on `PATH`, the command fails, the output is empty or invalid JSON, `ok` is false, the
path does not match, the provider identity is for another repository, the link values are
malformed, or both links are null. Do not treat a malformed or mismatched link as an assignment.

## Repository-local issue signal

The only repository-local issue signal is the last path component of the current branch when it
starts with an issue number of one to seven digits followed by `-` or the end of the name. For
example, `feature/2594-address-details-api` yields `2594`; `fix/1234` yields `1234`;
`feature/address-details-2594`, detached `HEAD`, `develop`, `staging`, `main`, `hotfix-1234`, and
`staging-1234` yield no signal. This is a fallback signal, never proof that an issue is valid.

If both a valid Orca `linkedIssue` and a branch number exist and they disagree, stop and report
both candidates. Do not silently prefer either source. Otherwise use the Orca issue link when
present, then the branch number. If neither exists, the Worker has no assignment. A lone planner
file is not an assignment: `.tmp` can persist across tasks in a plain checkout.

## Worker: resolve an omitted issue

Run this procedure only when the invocation has no explicit issue, plan path, or manual handoff
path. The Worker must finish resolution before creating a branch or writing the issue board.

1. Determine assignment **A** from the current worktree's valid `linkedIssue`, then the branch
   number signal. Stop on an Orca/branch disagreement.
2. Inspect `.tmp/plan-*.md` files directly under this worktree's top-level `.tmp` directory. Do not
   search another worktree or treat a filename alone as plan identity. For each candidate, validate
   its front matter, schema, repository, issue identity, `status`, substantive content, route, and
   freshness using [the Planner/Worker handoff compatibility contract](PLANNER_WORKER_HANDOFF_COMPATIBILITY.md)
   and the existing Worker plan-validation rules. The front-matter `issue` is the identity; a
   filename number that disagrees is a conflict.
3. With **A** known:
   - Exactly one valid, ready plan with `issue == A`: use it as though its path had been supplied,
     including its Plan Handoff provenance in the PR.
   - A plan for A that is invalid, stale, or `needs-decision`: stop; never fall back to direct
     implementation.
   - More than one plan for A, a filename/identity mismatch, or any plan files with none for A:
     stop and list the conflicting plan identities.
   - No plan files: implement A directly under the existing Worker workflow.
4. With no **A**, stop and request `/implement #N` or `/implement @.tmp/plan-N.md`, even if one
   plan file exists.
5. Verify A before any branch or board mutation with
   `gh api repos/Sieitzz/dgfy-platform/issues/N` (replace `N` with A). It must exist in this
   repository, have no `pull_request` key, be open, and not carry the `epic` label. Do not add an
   acceptance-criteria check; that is not a Worker precondition.

Direct issue resolution always targets `develop`/`develop`; never infer a hotfix from Orca or a
branch name. A matching ready plan keeps the route validated from that artifact under the existing
Worker handoff rules. Any hotfix therefore still requires a valid artifact containing the required
operator instruction and route evidence, plus the current hotfix-specific revalidation and
checkpoints.

## Reviewer: resolve an omitted PR

Run this procedure only when no PR number was supplied and no Reviewer handoff supplies `pr: N`.

1. Before resolving the PR, stop if the valid Orca `linkedIssue` and branch number signal both
   exist but disagree, even when a `linkedPR` is present.
2. If the valid current-worktree Orca link has a `linkedPR`, verify it with
   `gh api repos/Sieitzz/dgfy-platform/pulls/N`. It must be open and its
   `.base.repo.full_name` must identify `Sieitzz/dgfy-platform` case-insensitively. If the link is
   closed, merged, malformed, missing from this repository, or targets another base repository,
   stop as a stale link. Do not fall through to a guessed PR.
3. If `linkedPR` is absent, form a candidate set from one fully paginated open-PR listing. Include
   each unique PR number that matches either condition:
   - its `head.ref` equals the current branch and its `head.repo.full_name` is
     `Sieitzz/dgfy-platform` (this excludes fork heads); or
   - its body contains `closes`, `fixes`, `resolves`, or `refs` followed by the current task's
     verified Orca `linkedIssue`, or the branch number when no Orca issue link exists.

   A copy-pasteable listing and local filter, after resolving any Orca/branch issue conflict, is:

   ```bash
   BRANCH="$(git branch --show-current)"
   ISSUE="<verified linked issue or branch number; empty when neither exists>"
   gh api --paginate --slurp \
     'repos/Sieitzz/dgfy-platform/pulls?state=open&per_page=100' |
     jq --arg branch "$BRANCH" --arg issue "$ISSUE" '
       [add[]
        | select(
            ((.head.ref == $branch)
             and (((.head.repo.full_name // "") | ascii_downcase)
                  == "sieitzz/dgfy-platform"))
            or ($issue != "" and
                ((.body // "")
                 | test("(?i)\\b(closes|fixes|resolves|refs)\\s+#" + $issue + "\\b")))
          )
        | {
            number,
            branch_match: (.head.ref == $branch
              and (((.head.repo.full_name // "") | ascii_downcase)
                   == "sieitzz/dgfy-platform")),
            issue_match: ($issue != "" and ((.body // "")
              | test("(?i)\\b(closes|fixes|resolves|refs)\\s+#" + $issue + "\\b")))
          }
       ]'
   ```

   Exactly one unique PR candidate is required. If the same PR matches both conditions, keep it
   once and report both matching bases. Zero candidates or two or more unique candidates—including
   different PRs found by the two conditions—means stop and ask for `/pr-reviewer <PR>`.
4. Verify the selected PR again with the REST endpoint above before starting the audit. Preserve
   the existing audit scope, fixed `## Review` comment shape, merge restrictions (including the
   unconditional `main` exclusion), first-live-use report-only gate, and board rules.

## Stop and resolution reports

A stop is one concise message with the reason, every candidate and its source, and the exact input
needed. It makes no branch, board, comment, review, or merge mutation. Use:

- Worker: `/implement #N` or `/implement @.tmp/plan-N.md`
- Reviewer: `/pr-reviewer <PR>`

Before continuing after resolution, print one line identifying the resolved target, source, and
open-state verification. Use one source from this list: `explicit`, `plan`, `orca-linkedIssue`,
`branch-number`, `orca-linkedPR`, `branch-head`, or `issue-reference`.

```text
Resolved target: issue #N — source: orca-linkedIssue — verified open
Resolved target: PR #N — source: branch-head — verified open
```

For a Reviewer candidate that matched both branch and issue, include both as the basis in a short
follow-up sentence while keeping the resolution line's source field to one value. The fixed
`## Review` comment is unchanged; the resolution report is session output only.

## Manual smoke matrix

Use fixture JSON for Orca states that are not the current live state. Do not run `orca worktree
set` to create a fixture; it would mutate this session's links.

| Scenario | Expected result |
| --- | --- |
| Explicit `@.tmp/plan-N.md` or explicit PR number | No resolver runs; existing explicit validation applies. |
| One valid ready plan and matching Orca `linkedIssue` | The plan is used and its artifact path appears in `## Plan Handoff`. |
| No plan and a valid Orca `linkedIssue` | The linked issue is REST-verified open and implemented directly. |
| Reviewer with a valid linked PR, or no linked PR and exactly one branch-head PR | That open PR is selected; the link or candidate basis is reported. |
| Orca unavailable with branch `fix/1234-address`; then a branch with no number | First case uses the verified `1234` signal; second stops for an explicit target. |
| Conflicts: two matching plans, only a different-issue plan, `needs-decision`, Orca/branch mismatch, closed/epic/PR-number Worker target, multiple PR candidates, or a closed linked PR | Each stops with the candidates, reason, exact input needed, and no mutation. |
