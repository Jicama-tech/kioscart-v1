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
      // Pre-transform the most likely first-load files on dev start so Chrome
      // doesn't have to discover them lazily on first navigation. Keeps cold
      // dev opens snappy without forcing a full reload mid-load.
      warmup: {
        clientFiles: [
          "./index.html",
          "./src/main.tsx",
          "./src/App.tsx",
          "./src/index.css",
          "./src/pages/LandingPage.tsx",
          "./src/components/auth/shopKeeperLogin.tsx",
          "./src/components/user/shopkeeperStoreFront.tsx",
        ],
      },
    },
    // Pre-bundle the heaviest third-party deps. In dev, Vite normally discovers
    // these on first import then triggers a full reload to optimise them, which
    // Chrome surfaces as a long blank-page stall. Listing them here makes the
    // first dev open ~one big bundle instead of hundreds of round-trips.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "react-helmet-async",
        "@tanstack/react-query",
        "framer-motion",
        "recharts",
        "lucide-react",
        "react-icons/fa",
        "qrcode",
        "qrcode.react",
        "react-qr-code",
        "html5-qrcode",
        "jsqr",
        "jspdf",
        "react-hook-form",
        "@hookform/resolvers",
        "zod",
        "date-fns",
        "jwt-decode",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
      ],
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      mode === "production" && viteCompression({ algorithm: "gzip", threshold: 1024 }),
      mode === "production" && viteCompression({ algorithm: "brotliCompress", ext: ".br", threshold: 1024 }),
      VitePWA({
        registerType: "autoUpdate",
        // Service worker only runs in the production build — keep dev fast.
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
          // Don't precache giant chunks (charts/editor/pdf) — let them stream
          // on demand and only cache after first use. Chrome was blocking the
          // initial page on a SW install that downloaded everything.
          maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
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
      // Modern browsers all support modulepreload — the polyfill ships ~1KB of
      // inline script on every page; not worth it for our target.
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          // Split the heaviest libs into their own chunks so they're cached
          // long-term and don't bloat the entry bundle. Anything not matched
          // here goes into Rollup's automatic per-route chunks.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("react-dom") || id.includes("react-router") || id.includes("/react/") || id.includes("react-helmet-async")) {
              return "vendor";
            }
            if (id.includes("@radix-ui")) return "ui";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("jspdf") || id.includes("pdfkit")) return "pdf";
            if (id.includes("qrcode") || id.includes("jsqr") || id.includes("html5-qrcode") || id.includes("paynowqr")) return "qr";
            if (id.includes("lucide-react") || id.includes("react-icons")) return "icons";
            if (id.includes("@capacitor")) return "capacitor";
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});
