import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectDocumentTextWithAwsTextract } from "../../services/aws-textract-ocr";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [match[1], value.replace(/\\n/g, "\n")] as const;
}

async function loadEnvFile(filename: string) {
  try {
    const content = await fs.readFile(path.join(projectRoot, filename), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const imagePath = readArg("image");
  if (!imagePath) {
    console.error("Usage: npm run aws:textract:check -- --image=/absolute/or/relative/path/to/menu-or-invoice.jpg");
    process.exit(1);
  }

  const absoluteImagePath = path.isAbsolute(imagePath) ? imagePath : path.join(projectRoot, imagePath);
  const bytes = await fs.readFile(absoluteImagePath);

  console.log("AWS Textract OCR check");
  console.log(`- image: ${absoluteImagePath}`);
  console.log(`- bytes: ${bytes.byteLength}`);
  console.log(`- provider: ${process.env.OCR_PROVIDER || process.env.AI_OCR_PROVIDER || "missing"}`);
  console.log(`- region: ${process.env.AWS_TEXTRACT_REGION || process.env.TEXTRACT_REGION || process.env.AWS_REGION || "us-east-1"}`);
  console.log(`- access key: ${process.env.AWS_TEXTRACT_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID ? "present (redacted)" : "missing"}`);

  const started = Date.now();
  const result = await detectDocumentTextWithAwsTextract({ bytes });
  console.log(`- DetectDocumentText: ok (${Date.now() - started}ms)`);
  console.log(`- lines: ${result.lines.length}`);
  console.log(result.text || "(no text detected)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
