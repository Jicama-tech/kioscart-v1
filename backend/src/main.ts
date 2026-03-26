import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";
import { AppModule } from "./app.module";
import * as path from "path";
import * as express from "express";
import * as compression from "compression";
import { webpImageMiddleware } from "./middleware/webp-image.middleware";

dotenv.config();

// Cache allowed domains - no need to recompute on every request
const ALLOWED_DOMAINS = new Set([
  "https://kioscart.com",
  "https://www.kioscart.com",
  "https://thefoxsg.com",
  "https://www.thefoxsg.com",
  "https://xcionasia.com",
  "https://www.xcionasia.com",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  "http://localhost:8080",
  "http://localhost:8081",
]);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable gzip compression for all responses
  app.use(compression());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_DOMAINS.has(origin)) {
        callback(null, true);
      } else {
        callback(
          new Error(`CORS policy: The origin '${origin}' is not allowed.`),
        );
      }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  // Auto-convert images to WebP when browser supports it (before static serving)
  app.use("/uploads", webpImageMiddleware);

  // Serve static files with caching headers (fallback for non-image files and unsupported browsers)
  app.use(
    "/uploads",
    express.static(path.join(__dirname, "..", "uploads"), {
      maxAge: "7d",
      etag: true,
      lastModified: true,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
