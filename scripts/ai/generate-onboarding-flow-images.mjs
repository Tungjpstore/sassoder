import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const projectRoot = process.cwd();
const defaultOutputDir = "public/onboarding/flow";

const assets = [
  {
    id: "store-profile",
    title: "Tạo hồ sơ quán",
    scene: "A Vietnamese cafe owner setting up a new restaurant profile on a clean tablet dashboard, with a storefront card, location pin, phone contact card, and warm welcoming counter."
  },
  {
    id: "plan-selection",
    title: "Chọn gói vận hành",
    scene: "A simple SaaS plan selection moment for a small restaurant owner, showing two clean abstract pricing cards, a confident check mark, and a practical business setup feeling."
  },
  {
    id: "setup-checklist",
    title: "Kiểm tra sẵn sàng",
    scene: "A tidy onboarding readiness checklist for a Vietnamese restaurant, with completed cards for brand, location, tables, menu, and launch, displayed as abstract UI without readable text."
  },
  {
    id: "table-qr",
    title: "Tạo bàn và QR",
    scene: "A professional QR ordering setup scene inside a cafe: table tent QR cards on tables, a tablet showing table grid cards, staff preparing printed QR stands."
  },
  {
    id: "menu-import",
    title: "Nhập menu đầu tiên",
    scene: "A menu onboarding scene where a paper Vietnamese cafe menu is scanned into clean digital menu item cards on a mobile screen, with drinks and food illustrations around it."
  },
  {
    id: "launch-dashboard",
    title: "Sẵn sàng vận hành",
    scene: "A small Vietnamese restaurant owner viewing a clean operations dashboard with new orders, revenue cards, table status, and a calm launch-ready confirmation badge."
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

function buildPrompt(asset) {
  return [
    "Use case: productivity-visual",
    "Asset type: square illustration thumbnail for LogiVN restaurant onboarding after signup.",
    `Primary request: ${asset.scene}`,
    "Style: premium, calm, practical SaaS illustration for Vietnamese F&B owners; warm ivory background, emerald green and soft orange accents, clean mobile-first commerce UI shapes, subtle restaurant details, friendly but professional.",
    "Composition: centered subject, clear silhouette, generous padding, readable at small mobile size, no clutter, no oversized hero text area.",
    "Audience: Vietnamese cafes, milk tea shops, restaurants, street-food stores, small and medium F&B owners, including older owners using low-end Android phones.",
    "Strict visual constraints: absolutely no readable text, no pseudo text, no English words, no Vietnamese words, no letters, no numbers, no percent signs, no labels, no captions, no brand names, no bank names, no app words, no UI copy, no watermarks, and no signage. Use only icons, blank cards, colored bars, dots, check marks, and abstract placeholders. QR codes must be abstract patterns only, not scannable or readable.",
    "Trademark safety: no third-party logos, no Grab, Shopee, Apple, bank, wallet, or restaurant brand marks. Use only generic abstract UI and generic restaurant objects.",
    "Avoid: messy tiny interface details, distorted hands, dark stock-photo look, one-color purple/blue palette, scary error visuals, fake readable text.",
    `Internal label for intent only, do not render as text: ${asset.title}.`
  ].join("\n");
}

async function saveImageResult(result, outputPath) {
  const image = result.data?.[0];
  if (!image) throw new Error("Image provider did not return an image payload.");

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

  throw new Error("Image payload has neither base64 nor URL output.");
}

function imageProviderConfig(provider) {
  if (provider === "xai") {
    const envBaseUrl = process.env.XAI_BASE_URL || "https://api.x.ai/v1";
    const baseURL = envBaseUrl.endsWith("/v1") ? envBaseUrl : `${envBaseUrl.replace(/\/$/, "")}/v1`;
    const configuredModel = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";

    return {
      apiKey: process.env.XAI_API_KEY,
      baseURL,
      model: configuredModel === "grok-imagine-image" ? "grok-imagine-image-quality" : configuredModel,
      missingKeyMessage: "Missing XAI_API_KEY. Add it to .env.local or export it in the shell, then rerun with --provider=xai."
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: undefined,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    missingKeyMessage: "Missing OPENAI_API_KEY. Add it to .env.local or export it in the shell, then rerun with --provider=openai."
  };
}

function imageRequest(provider, model, prompt, size) {
  if (provider === "xai") {
    return {
      model,
      prompt,
      response_format: "b64_json",
      aspect_ratio: "1:1",
      resolution: "1k"
    };
  }

  return {
    model,
    prompt,
    size,
    quality: "high"
  };
}

async function main() {
  await loadEnvFile(path.join(projectRoot, ".env.local"));
  await loadEnvFile(path.join(projectRoot, ".env"));

  const provider = readArg("provider", process.env.AI_IMAGE_PROVIDER || "openai").toLowerCase();
  if (provider !== "openai" && provider !== "xai") {
    throw new Error(`Unsupported image provider "${provider}". Use --provider=openai or --provider=xai.`);
  }

  const providerConfig = imageProviderConfig(provider);
  if (!providerConfig.apiKey) throw new Error(providerConfig.missingKeyMessage);

  const model = readArg("model", providerConfig.model);
  const size = readArg("size", process.env.OPENAI_IMAGE_SIZE || "1024x1024");
  const outputDir = path.resolve(projectRoot, readArg("out", defaultOutputDir));
  const only = readArg("only", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedAssets = only.length ? assets.filter((asset) => only.includes(asset.id)) : assets;

  if (selectedAssets.length === 0) {
    throw new Error(`No matching assets for --only=${only.join(",")}`);
  }

  await mkdir(outputDir, { recursive: true });

  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    ...(providerConfig.baseURL ? { baseURL: providerConfig.baseURL } : {})
  });
  const manifest = {
    assetSet: "logivn-onboarding-flow",
    size: provider === "xai" ? "1k" : size,
    updatedAt: new Date().toISOString().slice(0, 10),
    assets: []
  };

  for (const asset of selectedAssets) {
    const outputPath = path.join(outputDir, `${asset.id}.png`);
    const result = await client.images.generate(imageRequest(provider, model, buildPrompt(asset), size));

    await saveImageResult(result, outputPath);
    manifest.assets.push({
      id: asset.id,
      title: asset.title,
      src: `/onboarding/flow/${asset.id}.png`
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
