import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { discoverTestFiles } from "../scripts/run-tests.mjs";

const RUNNER_PATH = fileURLToPath(new URL("../scripts/run-tests.mjs", import.meta.url));

async function createProjectFixture(t: test.TestContext) {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "logivn-test-runner-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  await Promise.all(
    ["services", "lib", "features"].map((root) =>
      mkdir(path.join(projectRoot, root), { recursive: true }),
    ),
  );

  return projectRoot;
}

async function writeFixtureFile(projectRoot: string, relativePath: string, contents: string) {
  const filePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function cliEnvironment() {
  const { NODE_TEST_CONTEXT: _nodeTestContext, ...env } = process.env;

  return env;
}

function runCli(projectRoot: string) {
  return spawnSync(process.execPath, [RUNNER_PATH], {
    cwd: projectRoot,
    encoding: "utf8",
    env: cliEnvironment(),
  });
}

async function waitForPid(pidFile: string) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      const pid = Number.parseInt(await readFile(pidFile, "utf8"), 10);

      if (Number.isInteger(pid) && pid > 0) {
        return pid;
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }

    await delay(25);
  }

  throw new Error("Timed out waiting for fixture test PID");
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }

    throw error;
  }
}

async function waitForProcessToStop(pid: number) {
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return true;
    }

    await delay(25);
  }

  return !isProcessRunning(pid);
}

test("discovers supported tests recursively from the three test roots in stable order", async (t) => {
  const projectRoot = await createProjectFixture(t);
  const files = [
    "services/z/deep/service.test.ts",
    "features/staff/components/widget.test.tsx",
    "lib/a/library.test.ts",
    "services/root.test.tsx",
    "features/activity/nested/activity.test.ts",
    "other/outside-root.test.ts",
    "services/z/deep/helper.ts",
    "lib/a/library.spec.ts",
  ];

  for (const relativePath of files) {
    await writeFixtureFile(projectRoot, relativePath, "// fixture\n");
  }

  assert.deepEqual(await discoverTestFiles(projectRoot), [
    path.join(projectRoot, "features/activity/nested/activity.test.ts"),
    path.join(projectRoot, "features/staff/components/widget.test.tsx"),
    path.join(projectRoot, "lib/a/library.test.ts"),
    path.join(projectRoot, "services/root.test.tsx"),
    path.join(projectRoot, "services/z/deep/service.test.ts"),
  ]);
});

test("CLI executes discovered TypeScript tests and returns status 0", async (t) => {
  const projectRoot = await createProjectFixture(t);
  await writeFixtureFile(
    projectRoot,
    "services/nested/passing.test.ts",
    `import assert from "node:assert/strict";
import test from "node:test";

test("fixture TypeScript passes", () => {
  const answer: number = 42;
  assert.equal(answer, 42);
});
`,
  );

  const result = runCli(projectRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /fixture TypeScript passes/);
});

test("CLI returns status 1 when a discovered TypeScript test fails", async (t) => {
  const projectRoot = await createProjectFixture(t);
  await writeFixtureFile(
    projectRoot,
    "features/nested/failing.test.ts",
    `import assert from "node:assert/strict";
import test from "node:test";

test("fixture TypeScript fails", () => {
  const actual: string = "wrong";
  assert.equal(actual, "expected");
});
`,
  );

  const result = runCli(projectRoot);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /fixture TypeScript fails/);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  test(
    `CLI forwards ${signal} and does not leave the test process running`,
    { skip: process.platform === "win32" },
    async (t) => {
      const projectRoot = await createProjectFixture(t);
      const pidFile = path.join(projectRoot, "fixture-test.pid");
      await writeFixtureFile(
        projectRoot,
        "lib/nested/hanging.test.ts",
        `import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("fixture waits for cancellation", async () => {
  await writeFile(path.join(process.cwd(), "fixture-test.pid"), String(process.pid), "utf8");
  await new Promise((resolve) => setTimeout(resolve, 30_000));
});
`,
      );

      const cliProcess = spawn(process.execPath, [RUNNER_PATH], {
        cwd: projectRoot,
        detached: true,
        env: cliEnvironment(),
        stdio: "ignore",
      });

      t.after(() => {
        if (!cliProcess.pid) return;

        try {
          process.kill(-cliProcess.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
            throw error;
          }
        }
      });

      const fixturePid = await waitForPid(pidFile);
      const exitPromise = once(cliProcess, "exit");
      cliProcess.kill(signal);

      const [exitCode, exitSignal] = await exitPromise;
      assert.equal(exitCode, null);
      assert.equal(exitSignal, signal);
      assert.equal(
        await waitForProcessToStop(fixturePid),
        true,
        `fixture test process ${fixturePid} survived ${signal}`,
      );
    },
  );
}
