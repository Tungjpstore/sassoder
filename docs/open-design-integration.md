# Open Design Integration

LogiVN uses Open Design as a local, read-only design-source MCP for agent-assisted UI work. It lets Codex pull live Open Design project files, artifacts, and tokens without manually exporting ZIP files.

## Current Setup

| Item | Value |
| --- | --- |
| Open Design root | `/Users/tunbee27/Documents/open-design` |
| Open Design version | `open-design-v0.8.0` |
| Required Node runtime | `/opt/homebrew/opt/node@24/bin/node` |
| Data directory | `/Users/tunbee27/Documents/open-design/.od` |
| MCP server name | `open_design` |
| Codex project config | `.codex/config.toml` |

Open Design 0.8 requires Node `~24`. The Homebrew `node@24` keg is used directly so the global `node` used by LogiVN does not need to change.

## Quick Commands

Run from the LogiVN repo root.

```bash
npm run open-design:start
npm run open-design:doctor
```

Useful lifecycle commands:

```bash
npm run open-design:setup
npm run open-design:status
npm run open-design:health
npm run open-design:mcp-smoke
npm run open-design:restart
npm run open-design:stop
```

Print the Codex MCP config snippet:

```bash
npm run open-design:config
```

## Codex MCP Config

The project-local `.codex/config.toml` includes:

```toml
[mcp_servers.open_design]
command = "/opt/homebrew/opt/node@24/bin/node"
args = [
  "/Users/tunbee27/Documents/open-design/apps/daemon/dist/cli.js",
  "mcp"
]
cwd = "/Users/tunbee27/Documents/open-design"
startup_timeout_sec = 20.0
tool_timeout_sec = 120.0

[mcp_servers.open_design.env]
OD_DATA_DIR = "/Users/tunbee27/Documents/open-design/.od"
OD_SIDECAR_IPC_PATH = "/tmp/open-design/ipc/default/daemon.sock"
```

After changing MCP config, restart or reload Codex so the `open_design` tools appear in a new session.

## Verification

`npm run open-design:doctor` checks:

- Open Design root exists
- Node 24 binary exists
- daemon CLI exists
- Open Design daemon is running
- `/api/health` returns `ok: true`
- MCP initializes successfully
- MCP exposes `list_projects`, `get_active_context`, `get_artifact`, `get_project`, `get_file`, `search_files`, `list_files`, and `create_artifact`
- MCP `list_projects` can read the local Open Design database

## Trust Boundary

Open Design MCP is intended for design handoff and local artifact reads. The upstream MCP is mostly read-oriented, but version `0.8.0` also exposes `create_artifact`, which can create an artifact entry in the active Open Design project. Treat it as a local design workspace tool, not as a production data connector.

The daemon binds locally and uses `OD_SIDECAR_IPC_PATH` so the MCP process can discover the current daemon port even when `tools-dev` starts on an ephemeral port.

## Updating Open Design

```bash
cd /Users/tunbee27/Documents/open-design
git fetch --tags origin
git switch --detach open-design-v0.8.0
cd /Users/tunbee27/Documents/New\ project
npm run open-design:setup
npm run open-design:restart
npm run open-design:doctor
```

Replace `open-design-v0.8.0` with a newer upstream tag after reviewing release notes.

## Troubleshooting

If `tools-dev must run with Node ~24` appears, confirm:

```bash
/opt/homebrew/opt/node@24/bin/node -v
```

If native SQLite fails after changing Node versions:

```bash
npm run open-design:setup
```

If Codex cannot see `open_design`, restart Codex after confirming:

```bash
npm run open-design:doctor
```
