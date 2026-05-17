---
name: spec-review
description: |
  Review a feature spec for completeness and feasibility before implementation.
  Use after /spec-create, or when handed a spec to implement.
  Flags gaps, risks, and ambiguities before any code is written.
argument-hint: [spec-name or path]
---

# Spec Review

Read the spec at `.claude/specs/$ARGUMENTS.md` (or if no argument, list available specs and ask which to review).

## Review Checklist

Work through each of these and flag any issues:

### Completeness
- [ ] Problem statement is clear and specific
- [ ] Goals are measurable
- [ ] Non-goals are stated
- [ ] User stories cover the main flows (enterprise node? supplier node? both?)
- [ ] Technical design is detailed enough to implement without guessing
- [ ] Acceptance criteria are testable

### Feasibility
- [ ] No dependency on unbuilt infrastructure
- [ ] Data model changes are backward-compatible (or migration is planned via `bun run db:push`)
- [ ] API changes don't break existing clients (or versioning is planned)
- [ ] No conflicts with constraints in `docs/constraints.md`

### Paxis Invariants
- [ ] Audit log: every new agent action has a corresponding `audit_log` write listed in acceptance criteria
- [ ] LLM calls: any new LLM calls route through `src/lib/llm.ts` (not hardcoded)
- [ ] Zod validation: any new LLM response has a Zod schema defined
- [ ] Document parsing: any PDF/image processing uses Gemini Flash (never text-only model)
- [ ] No `process.env` — `Bun.env` only
- [ ] Compliance: if CSRD/EU AI Act/CSDDD/CBAM data is involved, the regulatory requirement is named

### Risks
- [ ] Performance: any N+1 queries, unbounded loops, or large data transfers?
- [ ] Security: any new attack surfaces (auth, input validation, file upload)?
- [ ] Scope creep: does the task list match the stated goals?

## Output

Produce a short review report:

```
## Spec Review: [spec name]

### Status: Ready | Needs Revision

### Issues Found
[List blocking issues. If none, say "None."]

### Suggestions
[List non-blocking improvements]

### Estimated complexity
[Small (< 1 day) | Medium (1-3 days) | Large (3+ days)]
```

If issues are blocking, ask the user to update the spec before proceeding.

Do NOT begin implementation — that's the user's call after review.
