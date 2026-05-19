import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const projectRoot = process.cwd();
const defaultOutputDir = "public/brand/logivn/dashboard-icons";

const assets = [
  {
    id: "today-shift",
    title: "Ca bán hôm nay",
    symbol: "daily sales shift overview: a clean service counter tile with a small check mark and sun signal"
  },
  {
    id: "logibot-ai",
    title: "LogiBot AI",
    symbol: "AI operator for restaurant operations: calm control node over an order sheet"
  },
  {
    id: "orders",
    title: "Đơn hàng",
    symbol: "restaurant order queue: stacked receipt cards with one active order line"
  },
  {
    id: "kitchen",
    title: "Bếp",
    symbol: "kitchen pass: chef cloche with a small flame and ticket rail"
  },
  {
    id: "tables-qr",
    title: "Bàn & QR",
    symbol: "dining table with QR ordering: square QR tile beside a small table marker"
  },
  {
    id: "payments",
    title: "Thanh toán",
    symbol: "payment reconciliation: card, coin dot, and completed check"
  },
  {
    id: "online-orders",
    title: "Đặt online",
    symbol: "online takeaway order: phone order card with compact delivery bag"
  },
  {
    id: "reservations",
    title: "Đặt bàn",
    symbol: "table reservation: calendar tile with a small table and confirmed mark"
  },
  {
    id: "promotions",
    title: "Khuyến mãi",
    symbol: "promotion campaign: voucher tag with subtle spark and percent motif without numbers"
  },
  {
    id: "menu-items",
    title: "Menu món",
    symbol: "restaurant menu management: menu sheet with chopsticks and dish marker"
  },
  {
    id: "inventory",
    title: "Kho hàng",
    symbol: "inventory stock: tidy ingredient box with level bars and warehouse shelf"
  },
  {
    id: "staff",
    title: "Nhân viên",
    symbol: "staff management: apron badge with two calm team dots"
  },
  {
    id: "analytics",
    title: "Báo cáo",
    symbol: "business report: small chart sheet with upward service signal"
  },
  {
    id: "settings",
    title: "Cài đặt",
    symbol: "settings control: slider knobs and small secure gear-like control without a heavy cog"
  },
  {
    id: "more",
    title: "Menu thêm",
    symbol: "more dashboard menu: compact navigation stack with three clean modules"
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
    missingKeyMessage: "Missing XAI_API_KEY. Add it to .env.local or export it in the shell, then rerun npm run ai:grok:dashboard-icons."
  };
}

function buildPrompt(asset) {
  return [
    "Use case: production dashboard navigation icon for LogiVN, a Vietnamese restaurant and cafe SaaS.",
    `Navigation item: ${asset.title}.`,
    `Primary symbol: ${asset.symbol}.`,
    "Style: cohesive premium flat vector pictogram, modern Japanese SaaS restraint, Apple and Linear clarity, clean line-and-fill hybrid.",
    "Composition: centered single glyph in a square tile, balanced negative space, readable at 18px, 24px, and 36px, not a dashboard screenshot.",
    "Palette: deep green #0F5132 linework, warm orange #F59E0B micro accent, ivory #F8F7F4 background, near black #111827 only for tiny contrast.",
    "Strict constraints: no text, no letters, no numbers, no readable UI, no brand words, no watermark, no cartoon mascot, no decorative blob, no neon gradient, no generic green circle.",
    "Trademark safety: no third-party brand marks, no real bank, wallet, delivery, or restaurant logos.",
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
    throw new Error(`No matching dashboard icon assets for --only=${only.join(",")}`);
  }

  await mkdir(outputDir, { recursive: true });

  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL
  });
  const manifest = {
    assetSet: "logivn-dashboard-icons",
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
      src: `/brand/logivn/dashboard-icons/${asset.id}.png`
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
