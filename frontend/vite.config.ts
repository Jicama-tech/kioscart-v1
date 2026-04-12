import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import viteCompression from "vite-plugin-compression";

export default defineConfig(({ mode }) => {
  // Load env variables based on `mode` (development or production)
  const env = loadEnv(mode, process.cwd(), "");

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
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL),
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            ui: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-select",
              "@radix-ui/react-popover",
              "@radix-ui/react-accordion",
            ],
            charts: ["recharts"],
            motion: ["framer-motion"],
            icons: ["lucide-react"],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});
