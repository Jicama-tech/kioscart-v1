import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import viteCompression from "vite-plugin-compression";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const apiUrl = env.VITE_API_URL || (mode === "production" ? "" : "http://localhost:3000");
  if (mode === "production" && !apiUrl) {
    throw new Error(
      "VITE_API_URL is not set. Set it in frontend/.env or export it before running `npm run build` (e.g. VITE_API_URL=https://kioscart.com/api).",
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      mode === "production" && viteCompression({ algorithm: "gzip", threshold: 1024 }),
      mode === "production" && viteCompression({ algorithm: "brotliCompress", ext: ".br", threshold: 1024 }),
      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /\/uploads\/.*/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "uploads-cache",
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: /\/shopkeeper-stores\/storefront-bundle\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-storefront",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
                networkTimeoutSeconds: 5,
              },
            },
          ],
        },
        manifest: {
          name: "KiosCart",
          short_name: "KiosCart",
          theme_color: "#6366f1",
          background_color: "#ffffff",
          display: "standalone",
          icons: [
            { src: "/KiosCart.png", sizes: "192x192", type: "image/png" },
            { src: "/KiosCart.png", sizes: "512x512", type: "image/png" },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __API_URL__: JSON.stringify(apiUrl),
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/")) {
                return "vendor";
              }
              if (id.includes("@radix-ui")) {
                return "ui";
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});
