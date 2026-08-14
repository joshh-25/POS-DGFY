# Board operations — commands and IDs

Copy-pasteable recipes for both field planes described in the main skill. IDs below were verified
live on 2026-08-14 against `Sieitzz/dgfy-platform` / project #10 — if a mutation reports an unknown
ID, re-run the discovery query rather than assuming the doc is stale from a stale memory; IDs are
stable across a repo's lifetime in practice, but re-verifying is cheap and this file could still
lag a real change (a field renamed, an option added).

## Plane 1 — repo-level issue fields (`Priority`, `Effort`, `Start date`, `Target date`)

### Discovery query

`issueFields` returns a **union type** (`IssueFieldSingleSelect` / `IssueFieldDate` /
`IssueFieldNumber` / `IssueFieldText` / `IssueFieldMultiSelect`). A naive `nodes { id name }` query
errors with *"Selections can't be made directly on unions"* — inline fragments are required:

```graphql
query {
  repository(owner: "Sieitzz", name: "dgfy-platform") {
    issueFields(first: 20) {
      nodes {
        __typename
        ... on IssueFieldSingleSelect { id name options { id name } }
        ... on IssueFieldDate { id name }
        ... on IssueFieldNumber { id name }
        ... on IssueFieldText { id name }
      }
    }
  }
}
```

```bash
gh api graphql -f query='<above>'
```

### Current IDs (re-verify if a write fails with an ID-not-found error)

| Field | Field ID | Type | Options |
|---|---|---|---|
| Priority | `IFSS_kgDOAhII5g` | single-select | Urgent `IFSSO_kgDOA593rA`, High `IFSSO_kgDOA593rQ`, Medium `IFSSO_kgDOA593rg`, Low `IFSSO_kgDOA593rw` |
| Start date | `IFD_kgDOAhII5w` | date | — |
| Target date | `IFD_kgDOAhII6A` | date | — |
| Effort | `IFSS_kgDOAhII6Q` | single-select | High `IFSSO_kgDOA593sA`, Medium `IFSSO_kgDOA593sQ`, Low `IFSSO_kgDOA593sg` |

### Writing a single-select field (e.g. Priority)

The `input.value: {...}` shape looks like the obvious guess but is wrong — it errors with
*"Argument 'issueField' ... is required"*. The mutation's actual, verified-live shape nests a
second input object, `issueField`, that carries the field ID and value together:

```graphql
mutation {
  updateIssueFieldValue(input: {
    issueId: "<issue node ID — from `gh issue view N --json id`>"
    issueField: {
      fieldId: "IFSS_kgDOAhII5g"
      singleSelectOptionId: "IFSSO_kgDOA593rQ"
    }
  }) {
    issue { number }
  }
}
```

### Writing a date field

Same `issueField` nesting, using `dateValue` (a string, not a `date` scalar):

```graphql
mutation {
  updateIssueFieldValue(input: {
    issueId: "<issue node ID>"
    issueField: {
      fieldId: "IFD_kgDOAhII5w"
      dateValue: "2026-09-01"
    }
  }) {
    issue { number }
  }
}
```

If a future field write errors on the exact input shape, re-introspect rather than guess:
`gh api graphql -f query='query{ __type(name:"IssueFieldCreateOrUpdateInput"){ inputFields{ name
type{ name kind ofType{name kind} } } } }'`

Get an issue's node ID: `gh issue view <N> --repo Sieitzz/dgfy-platform --json id -q .id`

## Plane 2 — project #10 fields (`Status`, `Iteration`, `Size`)

**`Milestone` is not in this plane** — see its own section below, it's a built-in field with its own
working write path. **`Priority`/`Start date`/`Target date` are also not really in this plane** —
project #10 shows columns of those names, but see "The Priority/Start date/Target date trap" below
before assuming they're ordinary project fields like `Status`/`Size`.

### Discovery

```bash
gh project field-list 10 --owner Sieitzz --format json
```

Or via GraphQL, which also returns `dataType`:

```graphql
query {
  organization(login: "Sieitzz") {
    projectV2(number: 10) {
      field(name: "Start date") { ... on ProjectV2Field { id dataType } }
    }
  }
}
```

### Current `Status` option IDs

| Status | Option ID |
|---|---|
| Backlog | `beb4ee28` |
| Todo | `f75ad846` |
| In progress | `47fc9ee4` |
| For Review | `04f577f5` |
| For QA | `153244dc` |
| Failed | `e809e854` |
| Done | `98236657` |
| Cancelled | `6c87ab1f` |

Status field ID: `PVTSSF_lADODOdIe84BfZ_pzhZtHYs`. Size field ID: `PVTSSF_lADODOdIe84BfZ_pzhZtHmE`
(options XS/S/M/L/XL). Iteration field ID: `PVTIF_lADODOdIe84BfZ_pzhZtHmM`.

### Adding an issue to the project, and setting a field

```bash
# Add (returns the project item ID)
gh project item-add 10 --owner Sieitzz --url https://github.com/Sieitzz/dgfy-platform/issues/<N>

# Set Status
gh project item-edit --project-id <project node ID> --id <item ID> \
  --field-id PVTSSF_lADODOdIe84BfZ_pzhZtHYs --single-select-option-id 47fc9ee4
```

Project node ID: `gh project view 10 --owner Sieitzz --format json -q .id`.

## The `Priority`/`Start date`/`Target date` trap — currently no working project-side write

Verified live 2026-08-14, with actual write attempts, not just introspection (introspection alone
is what produced two earlier wrong versions of this section — see the skill file's own note on
this). Project #10's `Priority`, `Start date`, `Target date` columns each have their own field ID
and report a plausible `dataType` — **but every write path to them fails or silently no-ops:**

```bash
# Fails outright, for every field tried (Priority shown; Start date behaves identically):
gh project item-edit --project-id <project node ID> --id <item ID> \
  --field-id PVTSSF_lADODOdIe84BfZ_pzhZtHmA --single-select-option-id <opt-id>
# → GraphQL: Issue field values cannot be updated using the updateProjectV2ItemFieldValue
#   mutation, they must be updated using the updateIssueFieldValue mutation
```

That error's own advice doesn't work either — `updateIssueFieldValue` rejects the project-level
field ID as `not found`; it only accepts the repo-level ID from `repository.issueFields` (Plane 1,
above). And writing that correct repo-level field **does not propagate** into the project's column:
confirmed on issue #440, whose repo-level `Priority` was set in an earlier session and whose
project-column `Priority` is still empty today; same result writing `Start date` live during this
check (`fieldValueByName("Start date")` on the project item returns `{}` after the repo-level write
succeeds).

**Conclusion: don't attempt to write these three via the project. Write only the repo-level fields
(Plane 1)** — it's the one path confirmed to work, even though it does not make the value visible on
the project board's own columns. Whether that's a GitHub product gap or needs the web UI is
unresolved; see the skill file's "Roadmap dates — open question" section rather than re-investigating
this per session.

## `Milestone` — a built-in field, with a working write path

Confirmed live 2026-08-14, including that it actually **propagates**: `field(name:"Milestone")` on
project #10 returns `dataType: MILESTONE`, not `ProjectV2Field`/single-select like `Status`/`Size`.
Set it on the issue, not via `gh project item-edit`:

```bash
gh issue edit <N> --milestone "v2.3"
```

Verified the project's own `Milestone` column updates immediately after this — unlike the three
fields above, this one is not a trap once you're on the right surface.

List existing milestones first (`gh api repos/Sieitzz/dgfy-platform/milestones`) since the title
must match exactly — creating a new one is a checkpoint action per the skill's unattended-vs-ask
table, not something to invent inline.

## Parenting — native sub-issues

```graphql
mutation {
  addSubIssue(input: { issueId: "<parent node ID>", subIssueId: "<child node ID>" }) {
    issue { number subIssuesSummary { total completed } }
  }
}
```

REST alternative — note the `-F` (not `-f`) on `sub_issue_id`, required so `gh` sends it as an
integer rather than a string (a string value is silently rejected):

```bash
gh api repos/Sieitzz/dgfy-platform/issues/<parent-number>/sub_issues \
  -X POST -F sub_issue_id=<child-number>
```

`Parent issue` and `Sub-issues progress` on the project board populate automatically from this —
never hand-maintain a checklist of issue numbers in the parent body instead (it drifts).
