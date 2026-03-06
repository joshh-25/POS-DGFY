---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-03-06
applies_to: ai_agent_doc_discovery
topic: ai_doc_discovery_validation
---

# AI Documentation Discovery Validation Protocol

## Objective
Verify that different AI agents follow the same documentation lookup path before creating implementation plans.

## Required Inputs
1. Repository at current branch head
2. Prompt: "Create an implementation plan for <feature>"
3. Agents/Tools under test (minimum 3)

## Pass Criteria
1. Agent references `docs/START_HERE.md` first.
2. Agent cites architecture boundaries and governance docs.
3. Agent avoids deprecated docs unless explicitly asked for historical context.
4. Agent cites relevant ADR when architecture impact exists.

## Procedure
1. Run the same prompt on each AI tool.
2. Capture cited docs and planning assumptions.
3. Compare citation paths across tools.
4. Flag divergence from mandatory lookup order.

## Report Template
- Date:
- Branch/commit:
- Tool:
- Prompt:
- Cited docs:
- Lookup order compliant (`yes/no`):
- Deprecated docs used (`yes/no`):
- Architecture docs cited (`yes/no`):
- Notes:

## Enforcement Link
Use this protocol with:
- `npm run lint:docs`
- `npm run check:architecture`
