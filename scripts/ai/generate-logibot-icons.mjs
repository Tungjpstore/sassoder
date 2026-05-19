import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const projectRoot = process.cwd();
const defaultOutputDir = "public/brand/logivn/logibot-icons";

const assets = [
  {
    id: "operator",
    title: "LogiBot operator mark",
    prompt:
      "A premium AI operator app icon for a Vietnamese restaurant SaaS assistant. Symbol: calm AI control node combined with a small restaurant order tile, deep emerald green, warm orange accent, ivory paper background, minimal vector, soft rounded geometry, high-end Apple and Linear style, no text."
  },
  {
    id: "file",
    title: "Attach file and menu scan",
    prompt:
      "A premium minimal vector icon for attaching and scanning restaurant menu or receipt files. Symbol: paperclip plus simple menu sheet, deep emerald green outline, tiny warm orange scan sparkle, ivory background, clean SaaS control icon, no text."
  },
  {
    id: "voice",
    title: "Voice input",
    prompt:
      "A premium minimal vector icon for Vietnamese voice input in an AI assistant. Symbol: microphone with two calm sound waves, deep emerald green outline, warm orange listening dot, ivory background, clean SaaS control icon, no text."
  },
  {
    id: "command",
    title: "AI command palette",
    prompt:
      "A premium minimal vector icon for an AI command palette and workflow tools. Symbol: command key merged with a small automation wand, deep emerald green outline, warm orange accent, ivory background, clean SaaS control icon, no text."
  },
  {
    id: "send",
    title: "Send command",
    prompt:
      "A premium minimal vector icon for sending an AI command. Symbol: paper plane moving toward a tiny operations checkpoint, deep emerald green outline, warm orange accent, ivory background, clean SaaS control icon, no text."
  }
];

function readArg(name, fallback) {
  const exactIndex = process.argv.indexOf(`--${name}`);
  if (exactIndex >= 0) return process.argv[exactIndex + 1] ?? fallback;

  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

async function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = await readFile(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function imageProviderConfig() {
  const envBaseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  const baseURL = envBaseUrl.endsWith("/v1") ? envBaseUrl : `${envBaseUrl.replace(/\/$/, "")}/v1`;
  const configuredModel = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";

  return {
    apiKey: process.env.XAI_API_KEY,
    baseURL,
    model: configuredModel === "grok-imagine-image" ? "grok-imagine-image-quality" : configuredModel,
    missingKeyMessage: "Missing XAI_API_KEY. Add it to .env.local or export it in the shell, then rerun npm run ai:grok:logibot-icons."
  };
}

function buildPrompt(asset) {
  return [
    "Use case: production UI asset for LogiBot AI in LogiVN restaurant SaaS.",
    `Primary request: ${asset.prompt}`,
    "Composition: centered glyph, balanced negative space, simple enough to read at 20px and 48px, no busy illustration.",
    "Style: premium flat vector icon, soft Japanese SaaS restraint, Apple-level clarity, Arc and Linear calmness.",
    "Palette: deep green #0F5132, warm orange #F59E0B, ivory #F8F7F4, near black #111827 only if needed.",
    "Strict constraints: no letters, no numbers, no words, no logo text, no watermark, no decorative blobs, no neon gradient, no cartoon mascot, no circular green blob.",
    "Trademark safety: no third-party brand marks.",
    `Internal label only, do not render as text: ${asset.title}.`
  ].join("\n");
}

function imageRequest(model, prompt) {
  return {
    model,
    prompt,
    response_format: "b64_json",
    aspect_ratio: "1:1",
    resolution: "1k"
  };
}

async function saveImageResult(result, outputPath) {
  const image = result.data?.[0];
  if (!image) throw new Error("x.ai did not return an image payload.");

  const base64 = image.b64_json ?? image.image_base64;
  if (base64) {
    await writeFile(outputPath, Buffer.from(base64, "base64"));
    return;
  }

  if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error(`Could not download generated image: ${response.status}`);
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
    return;
  }

  throw new Error("x.ai image payload has neither base64 nor URL output.");
}

async function main() {
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, ".env"));

  const providerConfig = imageProviderConfig();
  if (!providerConfig.apiKey) throw new Error(providerConfig.missingKeyMessage);

  const model = readArg("model", providerConfig.model);
  const outputDir = path.resolve(projectRoot, readArg("out", defaultOutputDir));
  const only = readArg("only", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedAssets = only.length ? assets.filter((asset) => only.includes(asset.id)) : assets;

  if (selectedAssets.length === 0) {
    throw new Error(`No matching LogiBot icon assets for --only=${only.join(",")}`);
  }

  await mkdir(outputDir, { recursive: true });

  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL
  });
  const manifest = {
    assetSet: "logivn-logibot-icons",
    provider: "xai",
    model,
    updatedAt: new Date().toISOString().slice(0, 10),
    assets: []
  };

  for (const asset of selectedAssets) {
    const outputPath = path.join(outputDir, `${asset.id}.png`);
    const result = await client.images.generate(imageRequest(model, buildPrompt(asset)));

    await saveImageResult(result, outputPath);
    manifest.assets.push({
      id: asset.id,
      title: asset.title,
      src: `/brand/logivn/logibot-icons/${asset.id}.png`
    });
    console.log(`Generated ${asset.id} -> ${path.relative(projectRoot, outputPath)}`);
  }

  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Done. Manifest -> ${path.relative(projectRoot, path.join(outputDir, "manifest.json"))}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
