# Prime recipes — commands, budgets, traps

Copy-paste discovery commands for the prime phase. Load this before running a real prime rather
than reconstructing the commands from memory.

## Step order and commands

```bash
# 1. ADR index — always, ~2k tokens. Machine-generated (npm run check:adr -- --write-index),
#    never stale. 6 columns: # | Title | Status | Topic | Review by | Binding clauses.
cat docs/architecture/adr/INDEX.md

# 2. Structured topic index — always, ~free. The reliable router; use grep -r, never a shell
#    glob (docs/Radney Suggestions/ has a space in its path and breaks naive globs).
grep -rn '^topic:\|^applies_to:\|^related_adr:' docs

# 3. Matched ADRs, full text, status accepted|amended only.
sed -n '1,200p' docs/architecture/adr/00NN-*.md

# 4. Compliance impact declarations — surfaces/related_adr, for change history.
grep -rln '<term>' docs/compliance/impact-declarations/

# 5. GitHub issues — MANDATORY, every prime, every tier. Run a scoped pass and a broad pass;
#    mark broad-only hits weak. In:title alone can miss real coverage; a bare broad search can
#    also pull in unrelated hits that merely contain the word.
gh issue list --state open --search "<term> in:title" --limit 50 --json number,title,labels
gh issue list --state open --search "<alternate framing>" --limit 50 --json number,title,labels
gh issue list --state open --label epic --search "<term>" --json number,title
gh issue view <N> --json number,title,state,body   # full bodies, stakeholder tier only

# 6. Staleness probe — for any loaded doc claiming "not implemented"/"planned".
grep -ril "<term>" apps/*/src 2>/dev/null | head -5
```

## Tier budgets

| Tier | ~Tokens | Loads | Clause-level flagging? |
|---|---|---|---|
| `cheap` | 15k | ADR index + full ADR bodies + issue titles | No — say so if this tier is chosen |
| `stakeholder` (default) | 50–65k | + matched docs + full issue bodies | Yes |
| `implementation` | 163k | + API/web code, opt-in only | Yes |

If a tier's budget would be exceeded: prune lowest-authority material first (`historical` before
`reference` before `authoritative`; proposals before accepted ADRs; issue bodies last), and name
every pruned item in the prime report. Never truncate silently.

## Known traps

- **`docs/Radney Suggestions/`** has a literal space in the path — `grep -r` handles it, a shell
  glob (`docs/*/*.md`) does not.
- **`docs/release/` and `docs/releases/` both exist** — if either matches, say which one.
- **7 ADR renumbering collisions** left stub entries — `docs/architecture/adr/INDEX.md`'s second
  table (`## Renumbered (collision stubs)`) maps an old number a stakeholder might cite to its
  current one.
- **`docs/features/IMPLEMENTATION_PHASE_LEDGER.md` is 4,955 lines** — never read whole.
  `grep '^## Phase'` for the section list only. Its register table is stale past Phase 27; trust
  the per-phase `##` sections, not the table, for anything beyond that.
- **`docs/INDEX.md` and `docs/database/schema.md` and `docs/api/specification.md` all omit
  affiliates and vouchers entirely.** Their silence proves nothing — never flag a topic as
  zero-coverage on the strength of one of these being empty; confirm via steps 1–2 first.
- **`docs/archive/**` is prohibited as a planning source** (AGENTS.md) — a hit there is context at
  best, never a citable clause.
- **A bare `gh issue list --search "<one word>"`** returns anything containing the word, not just
  on-topic issues — confirmed live for "voucher", which also pulled in unrelated tenant-schema
  collation issues. Always pair a scoped `in:title` pass with the broad one and mark the broad-only
  difference weak.
- **Frontmatter can be stale relative to shipped code.** A doc's own "not implemented" claim is not
  evidence the feature doesn't exist — probe `apps/*/src` before trusting it.
