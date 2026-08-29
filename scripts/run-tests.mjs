import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const TEST_ROOTS = ["services", "lib", "features"];
const TEST_FILE_PATTERN = /\.test\.tsx?$/;
const TSX_IMPORT = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM"];

async function collectTestFiles(directory, testFiles) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectTestFiles(entryPath, testFiles);
    } else if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      testFiles.push(entryPath);
    }
  }
}

export async function discoverTestFiles(projectRoot) {
  const testFiles = [];

  for (const testRoot of TEST_ROOTS) {
    await collectTestFiles(path.join(projectRoot, testRoot), testFiles);
  }

  return testFiles.sort();
}

async function main() {
  const projectRoot = process.cwd();
  const testFiles = await discoverTestFiles(projectRoot);

  if (testFiles.length === 0) {
    throw new Error("No test files found under services, lib, or features");
  }

  const testProcess = spawn(
    process.execPath,
    ["--import", TSX_IMPORT, "--test", ...testFiles],
    { cwd: projectRoot, stdio: "inherit" },
  );
  let forwardedSignal = null;
  const signalHandlers = new Map(
    FORWARDED_SIGNALS.map((signal) => [
      signal,
      () => {
        forwardedSignal ??= signal;

        if (testProcess.exitCode === null && testProcess.signalCode === null) {
          testProcess.kill(signal);
        }
      },
    ]),
  );

  for (const [signal, handler] of signalHandlers) {
    process.on(signal, handler);
  }

  const cleanupSignalHandlers = () => {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
  };

  testProcess.on("error", (error) => {
    cleanupSignalHandlers();
    console.error(error);
    process.exitCode = 1;
  });

  testProcess.on("exit", (exitCode, signal) => {
    cleanupSignalHandlers();

    if (forwardedSignal || signal) {
      process.kill(process.pid, forwardedSignal ?? signal);
      return;
    }

    process.exit(exitCode ?? 1);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
