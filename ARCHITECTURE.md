# Codex Kit Architecture

This document describes the project-level structure installed by Codex Kit and how the main pieces work together.

## Overview

The scaffold is built around four layers:

- `AGENTS.md` as the routing and operating contract
- `.agents/skills/` for reusable capability modules
- `.agents/workflows/` for task playbooks
- `.codex/agents/` for focused subagents

Some projects may also include `.agents/.shared/` for reusable script-and-data packages that support multiple workflows.

The goal is to keep the system small, composable, and explicit. Skills provide knowledge, workflows provide process, and subagents provide bounded execution roles.

## Directory Structure

```text
.
├── AGENTS.md
├── ARCHITECTURE.md
├── AGENT_FLOW.md
├── .agents/
│   ├── skills/
│   │   ├── clean-code/
│   │   ├── code-review/
│   │   ├── debugging/
│   │   ├── frontend-design/
│   │   ├── api-patterns/
│   │   ├── database-design/
│   │   ├── planning/
│   │   ├── release-readiness/
│   │   └── testing-patterns/
│   ├── .shared/
│   │   └── ui-ux-pro-max/
│   │       ├── data/
│   │       └── scripts/
│   └── workflows/
│       ├── brainstorm.md
│       ├── check.md
│       ├── create.md
│       ├── debug.md
│       ├── deploy.md
│       ├── enhance.md
│       ├── orchestrate.md
│       ├── plan.md
│       ├── preview.md
│       ├── review.md
│       ├── ship.md
│       ├── status.md
│       ├── test.md
│       ├── ui-ux-pro-max.md
│       └── verify.md
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── backend-specialist.toml
│       ├── database-architect.toml
│       ├── debugger.toml
│       ├── devops-engineer.toml
│       ├── docs-researcher.toml
│       ├── documentation-writer.toml
│       ├── explorer.toml
│       ├── frontend-specialist.toml
│       ├── implementer.toml
│       ├── mobile-developer.toml
│       ├── performance-optimizer.toml
│       ├── planner.toml
│       ├── reviewer.toml
│       ├── security-auditor.toml
│       ├── seo-specialist.toml
│       └── test-writer.toml
└── .codex-kit/
    └── manifest.json
```

## Responsibilities

### AGENTS.md

`AGENTS.md` is the main control document. It defines:

- request classification
- routing from task type to workflow
- routing from workflow to subagent or skill
- validation expectations
- approval boundaries for risky execution

This is the first file Codex should consult when deciding how to approach work in the repository.

### Skills

Skills live in `.agents/skills/<name>/SKILL.md`.

Each skill should stay narrow and reusable. A skill may optionally include:

- `agents/openai.yaml` for invocation policy and explicit agent behavior
- task-specific companion files such as `verify.md`, `handoff.md`, and rollout checklists
- `references/` for templates, examples, or detailed guidance
- `scripts/` for optional helpers
- `assets/` for support files

Skills are knowledge modules. They should not act like hidden automation.

### Workflows

Workflows live in `.agents/workflows/*.md`.

They define repeatable playbooks for common task types such as:

- brainstorming
- planning
- creating
- enhancing
- debugging
- reviewing
- testing
- UI and UX design
- checking
- verifying
- deploying
- previewing
- status reporting
- orchestrating
- shipping

Workflows should encode process, not domain knowledge.

### Shared Packages

Shared packages live in `.agents/.shared/`.

Use them when a workflow needs executable tooling or structured datasets that do not naturally belong to a single skill. The imported `ui-ux-pro-max` package is an example: it bundles CSV knowledge bases and Python search scripts used by the UI workflow.

### Subagents

Subagents live in `.codex/agents/*.toml`.

Each subagent should own a bounded role:

- `planner` for decomposition and sequencing
- `explorer` for repository mapping and codebase discovery
- `implementer` for small focused code changes
- `frontend_specialist` for UI and interaction work
- `backend_specialist` for server-side implementation
- `database_architect` for schema and migration design
- `mobile_developer` for mobile-specific work
- `debugger` for evidence gathering and root-cause isolation
- `performance_optimizer` for measured performance improvements
- `reviewer` for correctness and regression review
- `security_auditor` for threat-focused review
- `docs_researcher` for external API verification
- `documentation_writer` for technical guides and handoff docs
- `seo_specialist` for discoverability and content structure
- `devops_engineer` for CI, deploy, and operational changes
- `test_writer` for focused test additions

Subagents should be specialized enough that routing is predictable.

### MCP Configuration

Project-scoped MCP server definitions live in `.codex/config.toml` under `[mcp_servers]`.

Use this layer for external tool servers and remote context providers. Keep checked-in defaults conservative: include examples and disabled templates, but avoid baking in environment-specific secrets or required third-party services unless the project truly depends on them.

The default scaffold includes a ready-to-use Context7 MCP entry and commented examples for additional servers.

### Manifest

`.codex-kit/manifest.json` tracks kit-managed files. It enables:

- `status` to report missing, modified, and outdated managed files
- `update` to refresh only safe targets
- preservation of local customizations unless overwrite is explicitly requested

## Design Principles

- Keep responsibilities separate: knowledge, process, and execution should not be mixed together casually.
- Prefer a small core that teams can extend, instead of a large catalog with overlapping instructions.
- Make risky behavior explicit and approval-gated.
- Optimize for maintainability of the kit itself, not just first-run convenience.

## Extension Model

Projects can extend the starter by:

- adding new skills under `.agents/skills`
- adding new workflows under `.agents/workflows`
- adding new subagents under `.codex/agents`
- updating `AGENTS.md` to route new request types cleanly

The expected pattern is additive extension, not replacement of the core contract.
