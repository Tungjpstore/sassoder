import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultRetries = 4;
const defaultDelayMs = 50;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolvePath(file, root = process.cwd()) {
  return path.isAbsolute(file) ? file : path.join(root, file);
}

export async function readJsonReport(file, options = {}) {
  const root = options.root || process.cwd();
  const fullPath = resolvePath(file, root);
  if (!existsSync(fullPath)) return null;

  const retries = options.retries ?? defaultRetries;
  const delayMs = options.delayMs ?? defaultDelayMs;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const text = await readFile(fullPath, "utf8");
      if (!text.trim()) throw new SyntaxError("Empty JSON report");
      return JSON.parse(text);
    } catch (error) {
      const isRetryable = error instanceof SyntaxError || error?.code === "ENOENT";
      if (!isRetryable || attempt === retries) return null;
      await sleep(delayMs * (attempt + 1));
    }
  }

  return null;
}

async function writeAtomic(file, contents, root = process.cwd()) {
  const fullPath = resolvePath(file, root);
  const dir = path.dirname(fullPath);
  const tempPath = path.join(dir, `.${path.basename(fullPath)}.${process.pid}.${Date.now()}.tmp`);

  await mkdir(dir, { recursive: true });

  try {
    await writeFile(tempPath, contents);
    await rename(tempPath, fullPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJsonReport(file, data, options = {}) {
  await writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`, options.root);
}

export async function writeTextReport(file, text, options = {}) {
  await writeAtomic(file, text, options.root);
}
