# Codex Agent Flow

This document explains how a user request should move through the Codex Kit structure from intake to result delivery.

## High-Level Flow

```text
User Request
  -> Request Classification
  -> Workflow Selection
  -> Skill Selection
  -> Optional Subagent Assignment
  -> Execution
  -> Validation
  -> Result Delivery
```

## 1. Request Classification

Start by classifying the task into one primary mode:

- planning or discovery
- implementation
- debugging
- review
- documentation or research
- release or validation

Classification should be done before loading extra skills or spawning subagents.

## 2. Workflow Selection

Once the primary mode is clear, route to the narrowest workflow:

| Request Type | Workflow |
| --- | --- |
| vague feature or strategy request | `brainstorm.md` |
| user asks for an implementation plan | `plan.md` |
| new feature or structured code work | `create.md` |
| iterative change to an existing feature | `enhance.md` |
| bug or regression investigation | `debug.md` |
| review or audit request | `review.md` |
| UI or UX design direction work | `ui-ux-pro-max.md` |
| implement an existing Figma design in code | `figma-to-code.md` |
| test creation or test execution | `test.md` |
| local preview management | `preview.md` |
| project or task status request | `status.md` |
| quick validation | `check.md` |
| deeper release validation | `verify.md` |
| deployment preparation or execution | `deploy.md` |
| multi-subagent coordination | `orchestrate.md` |
| release or handoff summary | `ship.md` |

The workflow gives the process skeleton for the task.

## 3. Skill Selection

After workflow selection, load only the skills that improve the current task.

Examples:

- `planning` for decomposition and sequencing
- `repo-onboarding` for first-pass repository mapping
- `bug-hunt` for reproduction-led debugging
- `debugging` for reproduction and evidence gathering
- `clean-code` for scoped implementation quality
- `frontend-design` for UI-heavy work
- `frontend-design` plus `web-design-guidelines` for Figma-to-code work
- `tailwind-patterns` for Tailwind-first implementation details
- `nextjs-react-expert` for React or Next.js UI performance concerns
- `api-patterns` or `database-design` for server-side structure changes
- `test-hardening`, `testing-patterns`, or `tdd-workflow` for focused validation
- `high-signal-review` or `code-review` for review passes
- `docs-shipper`, `documentation-templates`, or `mcp-builder` for docs or protocol-heavy work
- `mcp-onboarding` for MCP evaluation and rollout decisions
- `release-readiness` for rollout-sensitive work

The default rule is minimal loading. Do not load broad stacks of skills without evidence they are needed.

## 4. Subagent Assignment

Use a subagent only when it sharpens the role:

| Need | Subagent |
| --- | --- |
| task decomposition | `planner` |
| repository first-pass map | `explorer` |
| implementation after scope is clear | `implementer` |
| failure isolation | `debugger` |
| patch review | `reviewer` |
| external docs verification | `docs_researcher` |
| focused test authoring | `test_writer` |

Subagents should stay bounded. Avoid unnecessary parallelism.

## 5. Execution Rules

During execution:

- inspect the real code or repository state first
- keep the change scoped to the confirmed problem
- avoid hidden policy invention
- do not run risky scripts or destructive commands without explicit approval

If a skill includes helper scripts, they are optional and should be proposed, not silently executed.
If a skill includes `verify.md`, `handoff.md`, or a checklist file, use it as the output contract for that task shape.

## 6. Validation Layer

Validation happens in two tiers, with optional `test.md` when test authoring or targeted execution is the main task.

### Check

Use `check.md` for normal development:

- smallest relevant automated test scope
- targeted lint or type checks
- minimal manual verification when needed

### Verify

Use `verify.md` for higher-risk work:

- broader automated coverage
- config and migration review
- release-readiness review
- explicit note of anything still unverified

## 7. Result Delivery

The final response should include:

- what changed
- what was validated
- what remains risky or unverified
- the next practical step if more work remains

The goal is not just to finish execution, but to leave the repository in a state that is easy to understand and continue.

---

## 🔗 Quick Reference Links

- **Architecture**: `ARCHITECTURE.md`
- **Agents**: `.codex/agents/`
- **Skills**: `.agents/skills/`
- **Shared Tools**: `.agents/.shared/`
- **Workflows**: `.agents/workflows/`
