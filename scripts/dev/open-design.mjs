import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const openDesignRoot = path.resolve(process.env.OPEN_DESIGN_ROOT || path.join(projectRoot, "..", "open-design"));
const nodeBin = process.env.OPEN_DESIGN_NODE || "/opt/homebrew/opt/node@24/bin/node";
const pnpmBin = process.env.OPEN_DESIGN_PNPM || "pnpm";
const cliPath = path.join(openDesignRoot, "apps", "daemon", "dist", "cli.js");
const dataDir = process.env.OPEN_DESIGN_DATA_DIR || path.join(openDesignRoot, ".od");
const sidecarIpcPath = process.env.OPEN_DESIGN_SIDECAR_IPC_PATH || "/tmp/open-design/ipc/default/daemon.sock";

const command = process.argv[2] || "doctor";

function usage() {
  console.log(`Usage: npm run open-design:<command>

Commands:
  setup         Install/rebuild Open Design 0.8 dependencies and daemon CLI
  start         Start Open Design daemon + web in the background
  stop          Stop Open Design runtimes
  restart       Restart Open Design daemon + web
  status        Print tools-dev status
  health        Check the running daemon health endpoint
  install-info  Print Open Design MCP install-info payload
  mcp-smoke     Verify MCP initialize/tools/list/list_projects
  doctor        Run local path checks, status, health, and MCP smoke
  config        Print the Codex MCP server snippet for this project

Environment:
  OPEN_DESIGN_ROOT=${openDesignRoot}
  OPEN_DESIGN_NODE=${nodeBin}
`);
}

function env() {
  return {
    ...process.env,
    PATH: `${path.dirname(nodeBin)}:${process.env.PATH || ""}`,
    OD_DATA_DIR: dataDir,
    OD_SIDECAR_IPC_PATH: sidecarIpcPath
  };
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: options.cwd || openDesignRoot,
    env: env(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${bin} ${args.join(" ")} exited with ${result.status}`);
  }
  return result;
}

function assertPath(label, filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
}

function nodeVersion() {
  const result = run(nodeBin, ["-v"], { capture: true });
  return result.stdout.trim();
}

function repoVersion() {
  const result = run(nodeBin, ["-p", "JSON.parse(require('fs').readFileSync('package.json','utf8')).version"], {
    capture: true
  });
  return result.stdout.trim();
}

function toolsDev(args, options = {}) {
  return run(pnpmBin, ["tools-dev", ...args], options);
}

function statusText() {
  const result = toolsDev(["status"], { capture: true, allowFailure: true });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function daemonUrlFromStatus(text) {
  return text.match(/daemon:\s+running\s+.+?(http:\/\/127\.0\.0\.1:\d+)/)?.[1] || null;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 160)}`);
  }
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 160)}`);
  return json;
}

async function health() {
  const status = statusText();
  const daemonUrl = daemonUrlFromStatus(status);
  if (!daemonUrl) {
    throw new Error(`Open Design daemon is not running.\n${status.trim()}`);
  }
  const json = await fetchJson(`${daemonUrl}/api/health`);
  console.log(JSON.stringify({ daemonUrl, health: json }, null, 2));
  return daemonUrl;
}

async function installInfo() {
  const status = statusText();
  const daemonUrl = daemonUrlFromStatus(status);
  if (!daemonUrl) {
    throw new Error(`Open Design daemon is not running.\n${status.trim()}`);
  }
  const json = await fetchJson(`${daemonUrl}/api/mcp/install-info`);
  console.log(JSON.stringify(json, null, 2));
  return json;
}

function sendMcpMessage(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function mcpSmoke() {
  assertPath("Open Design daemon CLI", cliPath);

  const child = spawn(nodeBin, [cliPath, "mcp"], {
    cwd: openDesignRoot,
    env: env(),
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  const messages = [];

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    let index;
    while ((index = stdout.indexOf("\n")) >= 0) {
      const line = stdout.slice(0, index).trim();
      stdout = stdout.slice(index + 1);
      if (!line) continue;
      try {
        messages.push(JSON.parse(line));
      } catch {
        stderr += `Non-JSON MCP stdout: ${line}\n`;
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  sendMcpMessage(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "logivn-open-design-smoke", version: "1.0.0" }
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 350));
  sendMcpMessage(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  sendMcpMessage(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  sendMcpMessage(child, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_projects", arguments: {} }
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  child.kill("SIGTERM");

  const initialize = messages.find((message) => message.id === 1);
  const tools = messages.find((message) => message.id === 2);
  const projects = messages.find((message) => message.id === 3);
  const errors = messages.filter((message) => message.error).map((message) => message.error);

  if (!initialize?.result?.serverInfo) {
    throw new Error(`MCP initialize failed. ${stderr}`.trim());
  }
  if (!Array.isArray(tools?.result?.tools)) {
    throw new Error(`MCP tools/list failed. ${stderr}`.trim());
  }
  if (projects?.error) {
    throw new Error(`MCP list_projects failed: ${JSON.stringify(projects.error)} ${stderr}`.trim());
  }

  const projectText = projects?.result?.content?.find((item) => item.type === "text")?.text || "{}";
  const projectPayload = JSON.parse(projectText);
  const summary = {
    serverInfo: initialize.result.serverInfo,
    tools: tools.result.tools.map((tool) => tool.name),
    projectCount: projectPayload.projects?.length ?? 0,
    errors
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function printConfig() {
  console.log(`[mcp_servers.open_design]
command = "${nodeBin}"
args = [
  "${cliPath}",
  "mcp"
]
cwd = "${openDesignRoot}"
startup_timeout_sec = 20.0
tool_timeout_sec = 120.0

[mcp_servers.open_design.env]
OD_DATA_DIR = "${dataDir}"
OD_SIDECAR_IPC_PATH = "${sidecarIpcPath}"`);
}

async function doctor() {
  assertPath("Open Design root", openDesignRoot);
  assertPath("Node 24 binary", nodeBin);
  assertPath("Open Design daemon CLI", cliPath);

  console.log("Open Design integration");
  console.log(`- root: ${openDesignRoot}`);
  console.log(`- node: ${nodeBin} (${nodeVersion()})`);
  console.log(`- version: ${repoVersion()}`);
  console.log(`- cli: ${cliPath}`);
  console.log("");
  console.log(statusText().trim());
  console.log("");
  await health();
  console.log("");
  await mcpSmoke();
}

try {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    case "setup":
      assertPath("Open Design root", openDesignRoot);
      assertPath("Node 24 binary", nodeBin);
      run(pnpmBin, ["install", "--frozen-lockfile"]);
      run(pnpmBin, ["--filter", "@open-design/daemon", "rebuild", "better-sqlite3", "--pending"]);
      run(pnpmBin, ["--filter", "@open-design/daemon", "build"]);
      break;
    case "start":
      toolsDev(["start", "web"]);
      break;
    case "stop":
      toolsDev(["stop"]);
      break;
    case "restart":
      toolsDev(["restart"]);
      break;
    case "status":
      toolsDev(["status"]);
      break;
    case "health":
      await health();
      break;
    case "install-info":
      await installInfo();
      break;
    case "mcp-smoke":
      await mcpSmoke();
      break;
    case "config":
      printConfig();
      break;
    case "doctor":
      await doctor();
      break;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
