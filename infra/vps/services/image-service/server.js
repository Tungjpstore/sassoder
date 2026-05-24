import PDFDocument from "pdfkit";
import sharp from "sharp";
import { z } from "zod";
import { servicePort } from "../shared/env.js";
import { createHttpApp, listen, requireInternalApiKey } from "../shared/http.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("image-service");
const app = createHttpApp({ logger, serviceName: "image-service" });

const optimizeSchema = z.object({
  imageBase64: z.string().min(1),
  width: z.number().int().min(64).max(4096).optional(),
  quality: z.number().int().min(40).max(95).default(82),
  format: z.enum(["webp", "jpeg", "png"]).default("webp")
});

const invoiceSchema = z.object({
  invoiceNo: z.string().min(1),
  restaurantName: z.string().min(1),
  customerName: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      total: z.number()
    })
  ),
  total: z.number()
});

app.post("/images/optimize", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = optimizeSchema.parse(req.body);
    let pipeline = sharp(Buffer.from(payload.imageBase64, "base64")).rotate();
    if (payload.width) pipeline = pipeline.resize({ width: payload.width, withoutEnlargement: true });
    const output = await pipeline[payload.format]({ quality: payload.quality }).toBuffer();
    res.json({
      ok: true,
      format: payload.format,
      imageBase64: output.toString("base64"),
      bytes: output.length
    });
  } catch (error) {
    next(error);
  }
});

app.post("/pdf/invoice", requireInternalApiKey, async (req, res, next) => {
  try {
    const payload = invoiceSchema.parse(req.body);
    const chunks = [];
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.fontSize(18).text(payload.restaurantName);
    doc.moveDown(0.5).fontSize(12).text(`Invoice: ${payload.invoiceNo}`);
    if (payload.customerName) doc.text(`Customer: ${payload.customerName}`);
    doc.moveDown();
    for (const item of payload.items) {
      doc.text(`${item.name} x ${item.quantity} - ${item.total.toLocaleString("vi-VN")} VND`);
    }
    doc.moveDown().fontSize(14).text(`Total: ${payload.total.toLocaleString("vi-VN")} VND`);
    doc.end();

    await new Promise((resolve) => doc.on("end", resolve));
    const pdf = Buffer.concat(chunks);
    res.json({ ok: true, pdfBase64: pdf.toString("base64"), bytes: pdf.length });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  logger.error({ error }, "image-service request failed");
  res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "image_request_failed" });
});

listen(app, servicePort(3400), logger);
