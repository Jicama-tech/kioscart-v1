import { Request, Response, NextFunction } from "express";
import * as path from "path";
import * as fs from "fs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif"]);
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
const CACHE_DIR = path.join(UPLOADS_DIR, ".webp-cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log("[webp-middleware] uploads dir:", UPLOADS_DIR);
console.log("[webp-middleware] cache dir:", CACHE_DIR);
console.log("[webp-middleware] sharp loaded:", typeof sharp === "function");

export function webpImageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method !== "GET") return next();

  const acceptHeader = req.headers.accept || "";
  if (!acceptHeader.includes("image/webp")) return next();

  const relPath = req.path;
  const ext = path.extname(relPath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) return next();

  const originalPath = path.join(UPLOADS_DIR, relPath);
  const cacheKey = relPath.replace(/\.[^.]+$/, ".webp");
  const cachedPath = path.join(CACHE_DIR, cacheKey);

  // Serve cached webp if exists
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

  sharp(originalPath)
    .webp({ quality: 80 })
    .toFile(cachedPath)
    .then(() => {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      res.setHeader("X-Image-Optimized", "webp-converted");
      res.sendFile(cachedPath);
    })
    .catch((err: Error) => {
      console.error("[webp-middleware] conversion failed:", err.message);
      next();
    });
}
