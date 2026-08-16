# Checkpoint policy — worked examples

Four real instances from the session that produced this skill (2026-08-13/14), used here to
calibrate borderline cases rather than leave the policy purely abstract.

## 1. Deploy dispatch — stopped and asked

`deploy-main.yml` dispatches a build+deploy that restarts the `dgfy-api` backend shared by both
`beta.dgfy.ph` and `dgfy.ph`, with no approval gate available on GitHub Free. Even in a session
where the human had been saying "move fast" for hours, this specific action got an explicit
confirmation question before dispatching — because the general mood of a session doesn't cover a
specific high-stakes action that was never actually named. The human answered "build + deploy now"
and the dispatch proceeded immediately once answered.

**Calibration**: "the human seems to want speed right now" is not consent for a checkpoint-tier
action. Ask the specific question; a general mood isn't standing authorization.

## 2. A standing scope boundary, set mid-session

Partway through a later session, the human said "I want to focus on things we can do on develop
right now for now. I won't touch prod for the meantime." Every subsequent action — workflow edits
that only take effect on the *next* deploy dispatch, PR merges, issue triage — stayed inside that
boundary without re-asking each time, because the instruction was a standing scope constraint, not
a one-off answer to a single question.

**Calibration**: a standing boundary, once set, applies to everything downstream until the human
lifts it — it doesn't need to be re-confirmed per action, but it also doesn't expire on its own.

## 3. Self-correction on the issue-linking SOP — caught before push

While drafting a commit for a doc-only PR, the commit message said `Closes #49` — but `#49` was an
internal task-tracker ID, not a GitHub issue number. The actual GitHub issue #49 was an unrelated,
already-merged PR. This was caught by checking what issue #49 actually was *before* pushing, not
after — the commit was amended in place rather than pushed and corrected later. A tracking issue
was then filed (the repo's own SOP: every PR needs a linked issue) and the commit re-amended to
close the right one.

**Calibration**: verify a reference actually points where you think it does before it becomes
public (pushed, commented, filed) — a plausible-looking number is not verification.

## 4. Reporting a measurement's actual limits, not its best-case reading

Investigating whether a database port exposed on a production server (`3306:3306`, commented
"TEMPORARY! remove once fixed") was a real internet-facing risk, a single external connectivity
test from one vantage point failed to reach the port — while a control port on the same host
succeeded. The honest report was "not reachable from this one test, likely blocked upstream by a
cloud firewall I can't directly inspect," not "confirmed safe." The distinction mattered: the
existing issue tracking this had overstated it as definitely publicly reachable, and the correction
went the other way without overcorrecting into false reassurance.

**Calibration**: one passing (or failing) test from one vantage point narrows a claim, it doesn't
resolve it. Report the actual boundary of what was checked, not the most convenient reading of the
result — in either direction.
