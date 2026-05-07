# Codex Project Guide

Use this repository guide as the first routing layer for Codex work.

## Operating Rules

- Start by classifying the request: planning, implementation, debugging, review, release, or documentation.
- Prefer the narrowest workflow that matches the task.
- Use focused subagents for bounded work instead of one broad parallel swarm.
- Load only the skills that materially improve the current task.
- Do not run risky scripts or destructive commands without explicit user approval.
- Use `check` before presenting a normal code change.
- Use `verify` before release, deployment, or large cross-cutting changes.

## Routing

When delegating to a subagent, include the preferred skill set in the task handoff when it is clear from the domain. Do not assume the subagent will guess the best skills from its name alone.

### Planning and Discovery

- Use `.agents/workflows/brainstorm.md` for vague or strategic requests.
- Use `.agents/workflows/plan.md` when the user wants a task breakdown before code changes.
- Prefer the `planner` subagent for decomposition, success criteria, and sequencing.
- Prefer the `explorer` subagent when repository mapping or dependency tracing is the immediate need.
- Load `repo-onboarding` when entering an unfamiliar repository and a fast, reliable codebase map is needed first.

### Implementation

- Use `.agents/workflows/create.md` for new features or structured code generation.
- Use `.agents/workflows/enhance.md` for iterative work inside an existing codebase.
- Use `.agents/workflows/ui-ux-pro-max.md` when the primary task is UI direction, redesign, or UX shaping.
- Use `.agents/workflows/figma-to-code.md` when the task is to implement an existing Figma frame or flow into the current codebase.
- Prefer the `implementer` subagent for scoped code changes after the task is clear.
- Use `frontend_specialist`, `backend_specialist`, `database_architect`, or `mobile_developer` when domain-specific implementation work is clearly separated.
- Load `clean-code`, `frontend-design`, `api-patterns`, `database-design`, or `nodejs-best-practices` only when they fit the stack.
  Preferred pairings:
  `frontend_specialist` -> `clean-code`, `frontend-design`, `nextjs-react-expert`, `tailwind-patterns`, `web-design-guidelines`
  `frontend_specialist` for Figma implementation -> `clean-code`, `frontend-design`, `web-design-guidelines`
  `backend_specialist` -> `clean-code`, `api-patterns`, `nodejs-best-practices`, `python-patterns`, `database-design`
  `database_architect` -> `database-design`, `clean-code`
  `mobile_developer` -> `mobile-design`, `clean-code`

### Debugging

- Use `.agents/workflows/debug.md` for bug investigation and root-cause isolation.
- Prefer the `debugger` subagent for evidence gathering before making changes.
- Load `bug-hunt`, `debugging`, `systematic-debugging`, and optionally `testing-patterns` to confirm the failure mode.
  Preferred pairings:
  `debugger` -> `bug-hunt`, `debugging`, `systematic-debugging`, `testing-patterns`
  `explorer` -> `repo-onboarding`, `architecture`, `plan-writing`, `systematic-debugging`

### Review and Documentation

- Use `.agents/workflows/review.md` for code review, patch review, and regression checks.
- Use the `reviewer` subagent for correctness, security, and missing tests.
- Use the `docs_researcher` subagent when framework or API behavior must be verified.
- Use `security_auditor`, `documentation_writer`, `performance_optimizer`, or `seo_specialist` when the task has a specialized review or improvement axis.
- Load `high-signal-review`, `code-review`, `code-review-checklist`, `docs-shipper`, `documentation-templates`, `mcp-onboarding`, or `mcp-builder` as needed.
  Preferred pairings:
  `reviewer` -> `high-signal-review`, `code-review`, `code-review-checklist`, `release-readiness`
  `security_auditor` -> `vulnerability-scanner`, `red-team-tactics`, `api-patterns`
  `performance_optimizer` -> `performance-profiling`, `nextjs-react-expert`
  `documentation_writer` -> `docs-shipper`, `documentation-templates`
  `docs_researcher` -> `mcp-onboarding`, `documentation-templates`, `mcp-builder`
  `seo_specialist` -> `seo-fundamentals`, `geo-fundamentals`, `web-design-guidelines`

### Validation and Release

- Use `.agents/workflows/check.md` for fast local validation.
- Use `.agents/workflows/test.md` when test execution or test authoring is the main task.
- Use `.agents/workflows/verify.md` for deeper release readiness checks.
- Use `.agents/workflows/deploy.md` for deployment preparation or execution.
- Use `.agents/workflows/ship.md` when preparing a merge, release, or deployment summary.
- Use `devops_engineer` for CI, environment, and deployment-specific work.
- Load `test-hardening`, `docs-shipper`, `mcp-onboarding`, and `release-readiness` when the task affects rollout, migrations, verification depth, or deploy risk.
  Preferred pairings:
  `test_writer` -> `test-hardening`, `testing-patterns`, `tdd-workflow`, `webapp-testing`
  `devops_engineer` -> `deployment-procedures`, `server-management`, `release-readiness`, `bash-linux`

## Subagent Matrix

| Agent | Purpose | Default Mode | Typical Skills |
| --- | --- | --- | --- |
| `planner` | Break work into decisions, steps, and risks | read-heavy | `planning`, `plan-writing`, `architecture` |
| `explorer` | Map unfamiliar code paths and dependency flow | read-only | `repo-onboarding`, `architecture`, `plan-writing`, `systematic-debugging` |
| `implementer` | Make the smallest defensible code change | workspace-write | `clean-code`, `frontend-design`, `api-patterns`, `database-design` |
| `frontend_specialist` | Build or refactor frontend UI and interaction layers | workspace-write | `frontend-design`, `nextjs-react-expert`, `tailwind-patterns` |
| `backend_specialist` | Implement APIs, services, and server-side logic | workspace-write | `api-patterns`, `nodejs-best-practices`, `python-patterns` |
| `database_architect` | Design schemas, migrations, and query strategy | workspace-write | `database-design` |
| `mobile_developer` | Build mobile-specific UX and application flows | workspace-write | `mobile-design` |
| `debugger` | Reproduce issues and isolate the failure mode | read-heavy first | `bug-hunt`, `debugging`, `systematic-debugging`, `testing-patterns` |
| `performance_optimizer` | Improve measured bottlenecks and runtime speed | workspace-write | `performance-profiling`, `nextjs-react-expert` |
| `reviewer` | Find correctness, security, and regression risks | read-only | `high-signal-review`, `code-review`, `release-readiness` |
| `security_auditor` | Review exploitability, auth, and risky code paths | read-only | `vulnerability-scanner`, `red-team-tactics`, `api-patterns` |
| `docs_researcher` | Verify external APIs and framework behavior | read-only | `mcp-onboarding`, `documentation-templates`, `mcp-builder` |
| `documentation_writer` | Write setup guides and technical handoff docs | workspace-write | `docs-shipper`, `documentation-templates` |
| `seo_specialist` | Improve SEO, GEO, and content discoverability | workspace-write | `seo-fundamentals`, `geo-fundamentals` |
| `devops_engineer` | Own CI, deploy, env, and operational changes | workspace-write | `deployment-procedures`, `server-management`, `release-readiness` |
| `test_writer` | Add or improve tests around known behavior | workspace-write | `test-hardening`, `testing-patterns`, `tdd-workflow`, `webapp-testing` |

## Skill Contract

Each skill may include:

- `SKILL.md` for the instruction contract
- `agents/openai.yaml` for invocation policy when the skill bundles deeper guidance
- task-specific files such as `verify.md`, `handoff.md`, or checklists for specialized proof
- `references/` for templates and deeper guidance
- `scripts/` for optional helpers
- `assets/` for supporting files

Scripts are optional helpers. They must be suggested explicitly and only run after user approval when they can modify state or invoke risky tooling.

## Shared Resources

Projects may also include shared tool packages under `.agents/.shared/` when multiple workflows need the same scripts or datasets.

Example:

- `.agents/.shared/ui-ux-pro-max/` for design-system search, style lookup, and stack-aware UI guidance

## MCP

Project-scoped MCP server configuration lives in `.codex/config.toml` under `[mcp_servers]`.

Use MCP when the project needs external tools or remote data sources that are better expressed as tool servers than as checked-in skills or local scripts.

Common cases:

- docs lookup
- issue trackers
- design systems
- internal developer platforms

Default scaffold:

- Context7 is preconfigured in `.codex/config.toml` using its remote MCP endpoint

## Validation Tiers

### Check

Use for normal development:

- targeted tests
- lint or typecheck for changed scope
- minimal manual verification

### Verify

Use for release-sensitive work:

- broader tests
- integration or end-to-end checks when available
- config or migration review
- release notes and rollback considerations
