import { Request, Response, NextFunction } from "express";
import * as path from "path";
import * as fs from "fs";
import * as sharp from "sharp";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif"]);
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const CACHE_DIR = path.join(UPLOADS_DIR, ".webp-cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Middleware that serves WebP-converted images when the browser supports it.
 * - Checks Accept header for webp support
 * - Converts jpg/png/gif to webp on first request, caches the result
 * - Serves cached webp on subsequent requests
 * - Falls through to original image if conversion fails
 */
export function webpImageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Only handle GET requests
  if (req.method !== "GET") return next();

  // Check if browser supports webp
  const acceptHeader = req.headers.accept || "";
  if (!acceptHeader.includes("image/webp")) return next();

  // Get the file path relative to uploads
  const relPath = req.path; // e.g., /products/image-123.jpg
  const ext = path.extname(relPath).toLowerCase();

  // Only convert supported image types
  if (!SUPPORTED_EXTENSIONS.has(ext)) return next();

  const originalPath = path.join(UPLOADS_DIR, relPath);
  const cacheKey = relPath.replace(/\.[^.]+$/, ".webp");
  const cachedPath = path.join(CACHE_DIR, cacheKey);

  // Check if cached webp exists
  if (fs.existsSync(cachedPath)) {
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("X-Image-Optimized", "webp-cached");
    return res.sendFile(cachedPath);
  }

  // Check if original file exists
  if (!fs.existsSync(originalPath)) return next();

  // Convert to webp and cache
  const cachedDir = path.dirname(cachedPath);
  if (!fs.existsSync(cachedDir)) {
    fs.mkdirSync(cachedDir, { recursive: true });
  }

  (sharp as any)(originalPath)
    .webp({ quality: 80 })
    .toFile(cachedPath)
    .then(() => {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.setHeader("X-Image-Optimized", "webp-converted");
      res.sendFile(cachedPath);
    })
    .catch(() => {
      // Conversion failed — serve original
      next();
    });
}
