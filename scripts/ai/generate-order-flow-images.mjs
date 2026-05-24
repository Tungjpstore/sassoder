import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const projectRoot = process.cwd();
const defaultOutputDir = "public/customer/order-flow";

const assets = [
  {
    id: "payment-vietqr",
    title: "Thanh toán VietQR",
    scene: "A clean Vietnamese mobile checkout scene with a QR payment card, a small receipt, and a warm cafe counter hint."
  },
  {
    id: "payment-confirmation",
    title: "Quán xác nhận thanh toán",
    scene: "A restaurant owner reviewing a payment confirmation on a tablet, with a subtle check mark motif and calm trust cues."
  },
  {
    id: "restaurant-confirmation",
    title: "Quán xác nhận đơn",
    scene: "A compact restaurant order screen being approved by staff, with food order cards and a friendly kitchen handoff feeling."
  },
  {
    id: "preparing",
    title: "Chuẩn bị món",
    scene: "A Vietnamese cafe kitchen preparing drinks and food, with tidy ingredients, steam, and an efficient service counter."
  },
  {
    id: "delivery-handoff",
    title: "Giao hàng tận nơi",
    scene: "A delivery handoff moment outside a Vietnamese cafe, with a sealed food bag, scooter helmet, and route pin motif."
  },
  {
    id: "pickup-handoff",
    title: "Khách đến lấy",
    scene: "A takeaway pickup counter with a neatly packed order bag and staff handing it to a customer."
  },
  {
    id: "completed",
    title: "Hoàn tất",
    scene: "A completed order moment with a satisfied customer receiving food, a clean receipt, and a soft completion badge motif."
  },
  {
    id: "cancelled",
    title: "Đơn dừng xử lý",
    scene: "A polite service support scene showing an order paused or cancelled, with a calm customer support card and no alarmist tone."
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
    "Asset type: square illustration thumbnail for a Vietnamese restaurant online ordering timeline.",
    `Primary request: ${asset.scene}`,
    "Style: premium Apple-level simplicity mixed with GrabFood/ShopeeFood practicality; warm ivory background, emerald green and orange accents, soft natural lighting, clean rounded mobile-commerce shapes, professional SaaS polish.",
    "Composition: centered subject, clear empty padding, readable at small mobile size, no heavy detail, no clutter.",
    "Audience: Vietnamese cafes, milk tea shops, street-food stores, small restaurants.",
    "Strict visual constraints: do not render any text, letters, numbers, labels, captions, app words, signage, watermark, QR memo text, or brand names. Uniforms, bags, receipts, phones, and UI cards must be blank or abstract.",
    "Trademark safety: no third-party logos, no Grab, Shopee, Apple, bank, wallet, or restaurant brand marks. Use only generic shapes and blank symbols.",
    "Avoid: distorted hands, scary error visuals, dark stock-photo look, messy tiny UI, fake readable interface text.",
    `Internal label for intent only, do not render as text: ${asset.title}.`
  ].join("\n");
}

async function saveImageResult(result, outputPath) {
  const image = result.data?.[0];
  if (!image) throw new Error("OpenAI did not return an image payload.");

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

  throw new Error("OpenAI image payload has neither base64 nor URL output.");
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
      missingKeyMessage: "Missing XAI_API_KEY. Add it to .env.local or export it in the shell, then rerun npm run ai:grok:order-flow."
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: undefined,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    missingKeyMessage: "Missing OPENAI_API_KEY. Add it to .env.local or export it in the shell, then rerun npm run ai:image2:order-flow."
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
    assetSet: "logivn-customer-order-flow",
    size,
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
      src: `/customer/order-flow/${asset.id}.png`
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
