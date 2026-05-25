import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const projectRoot = process.cwd();
const defaultOutputDir = "public/brand/logivn/telegram-setup";

const assets = [
  {
    id: "secure-link",
    title: "Tạo link bảo mật",
    symbol: "restaurant owner dashboard creates a secure Telegram connection link, one focused button, branch selector, subtle shield"
  },
  {
    id: "telegram-start",
    title: "Mở Telegram",
    symbol: "Telegram chat opens with a start action and a calm confirmation message, no brand logo, no readable text"
  },
  {
    id: "ops-command",
    title: "Điều hành từ Telegram",
    symbol: "restaurant operator controls order and payment signals from a phone, using blank notification cards, check icons, receipt icons, and no written words anywhere"
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
    missingKeyMessage: "Missing XAI_API_KEY. Add it to .env.local or export it before running this script."
  };
}

function buildPrompt(asset) {
  return [
    "Use case: owner-facing setup illustration for LogiVN, a Vietnamese restaurant and cafe SaaS.",
    `Step: ${asset.title}.`,
    `Scene: ${asset.symbol}.`,
    "Style: premium minimal product illustration, quiet SaaS operations center, warm Vietnamese F&B context, realistic object proportions, soft but crisp lighting.",
    "Composition: one clear scene, no marketing hero, no clutter, enough negative space for a compact setup card, professional and trustworthy.",
    "Palette: ivory background, deep green operational accents, warm amber micro accent, charcoal details, no purple-blue gradient.",
    "Strict constraints: no readable text, no letters, no words, no numbers, no UI labels, no button labels, no visible third-party logos, no fake Telegram logo, no watermark, no mascots, no decorative blobs.",
    "If the scene includes a phone UI, every card and button must be blank or icon-only.",
    "Output should work as a 4:3 rounded rectangle image in a dashboard card."
  ].join("\n");
}

function imageRequest(model, prompt) {
  return {
    model,
    prompt,
    response_format: "b64_json",
    aspect_ratio: "4:3",
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

  if (selectedAssets.length === 0) throw new Error(`No matching assets for --only=${only.join(",")}`);

  await mkdir(outputDir, { recursive: true });

  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL
  });
  const manifest = {
    assetSet: "logivn-telegram-setup",
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
      src: `/brand/logivn/telegram-setup/${asset.id}.png`
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
