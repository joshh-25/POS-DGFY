As of Claude Code 2.1.259, the permission checker will not auto-approve a Bash command's file
read/write targets that it can't statically resolve to an absolute path, whenever any `Read()`
deny rule is configured. This repo's own settings always trigger that condition
(`.claude/settings.local.json` denies `Read(.env)`, `Read(.env.*)`, `Read(.secrets)`), so every
Claude Code session working in this repo — main session or subagent, including a worktree
checkout — hits this by default unless commands are written to avoid it. Two concrete triggers,
both cheap to avoid:

1. **Never `cd` to reach a file — address it by absolute path instead.** The checker doesn't model
   `cd`, so `cd some/dir && grep ... relative/file` (or `cd dir; cmd1; cmd2`) makes every relative
   path after it unresolvable, and each such command then costs a manual approval. This applies
   inside subagents too (reproduced live from an Explore agent), not just the main session.
2. **Put flags before the search pattern in `grep` (and similar tools).** The checker stops
   flag-parsing at the first non-flag token, so `grep -n PAT -A 30 file.sql` gets misread as three
   separate file-path arguments (`-A`, `30`, `file.sql`). Write `grep -n -A 30 PAT /abs/path/file.sql`
   — pattern last, flags (with their values) all before it.

Apply both by default in every Bash tool call in this repo: use absolute paths throughout instead
of `cd`-ing first, and order grep invocations flag-first/pattern-last. See #1497 for the full
writeup and root cause.
