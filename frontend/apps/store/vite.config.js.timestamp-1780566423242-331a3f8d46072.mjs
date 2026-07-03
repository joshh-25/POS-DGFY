// apps/store/vite.config.js
import { defineConfig } from "file:///C:/xampp/htdocs/POS-DGFY/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/xampp/htdocs/POS-DGFY/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import { fileURLToPath } from "url";
import path from "path";
var __vite_injected_original_import_meta_url = "file:///c:/xampp/htdocs/POS-DGFY/frontend/apps/store/vite.config.js";
var __filename = fileURLToPath(__vite_injected_original_import_meta_url);
var __dirname = path.dirname(__filename);
var apiProxyTarget = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:5000";
var configuredBasePath = process.env.VITE_STORE_BASE_PATH || "/";
var allowedHosts = true;
var normalizedBasePath = (() => {
  const trimmed = String(configuredBasePath).trim() || "/";
  if (trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
})();
var proxyTargets = {
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: false
  },
  "/uploads": {
    target: apiProxyTarget,
    changeOrigin: true,
    secure: false
  },
  "/openfreemap": {
    target: "https://tiles.openfreemap.org",
    changeOrigin: true,
    rewrite: (path2) => path2.replace(/^\/openfreemap/, ""),
    secure: false
  }
};
var vite_config_default = defineConfig({
  root: __dirname,
  base: normalizedBasePath,
  plugins: [react()],
  define: {
    "import.meta.env.VITE_BUILD_STAMP": JSON.stringify(process.env.VITE_BUILD_STAMP || (/* @__PURE__ */ new Date()).toISOString())
  },
  server: {
    host: true,
    port: 5175,
    allowedHosts,
    proxy: proxyTargets
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts,
    proxy: proxyTargets
  },
  build: {
    outDir: path.resolve(__dirname, "../../../dist-apps/store"),
    emptyOutDir: true,
    // MapLibre is lazy-loaded; keep chunk warnings focused on initial app/vendor regressions.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("commonjsHelpers.js")) return "vendor-react";
          if (!id.includes("node_modules")) return void 0;
          if (id.includes("scheduler")) return "vendor-react";
          if (id.includes("maplibre-gl")) return "vendor-maplibre";
          if (id.includes("qrcode")) return "vendor-qrcode";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
          return "vendor";
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiYXBwcy9zdG9yZS92aXRlLmNvbmZpZy5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcImM6XFxcXHhhbXBwXFxcXGh0ZG9jc1xcXFxQT1MtREdGWVxcXFxmcm9udGVuZFxcXFxhcHBzXFxcXHN0b3JlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJjOlxcXFx4YW1wcFxcXFxodGRvY3NcXFxcUE9TLURHRllcXFxcZnJvbnRlbmRcXFxcYXBwc1xcXFxzdG9yZVxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vYzoveGFtcHAvaHRkb2NzL1BPUy1ER0ZZL2Zyb250ZW5kL2FwcHMvc3RvcmUvdml0ZS5jb25maWcuanNcIjtcdUZFRkZpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAndXJsJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuXG5jb25zdCBfX2ZpbGVuYW1lID0gZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpO1xuY29uc3QgX19kaXJuYW1lID0gcGF0aC5kaXJuYW1lKF9fZmlsZW5hbWUpO1xuY29uc3QgYXBpUHJveHlUYXJnZXQgPSBwcm9jZXNzLmVudi5WSVRFX1BST1hZX1RBUkdFVCB8fCAnaHR0cDovLzEyNy4wLjAuMTo1MDAwJztcbmNvbnN0IGNvbmZpZ3VyZWRCYXNlUGF0aCA9IHByb2Nlc3MuZW52LlZJVEVfU1RPUkVfQkFTRV9QQVRIIHx8ICcvJztcbmNvbnN0IGFsbG93ZWRIb3N0cyA9IHRydWU7XG5jb25zdCBub3JtYWxpemVkQmFzZVBhdGggPSAoKCkgPT4ge1xuICBjb25zdCB0cmltbWVkID0gU3RyaW5nKGNvbmZpZ3VyZWRCYXNlUGF0aCkudHJpbSgpIHx8ICcvJztcbiAgaWYgKHRyaW1tZWQgPT09ICcvJykgcmV0dXJuICcvJztcbiAgY29uc3Qgd2l0aExlYWRpbmdTbGFzaCA9IHRyaW1tZWQuc3RhcnRzV2l0aCgnLycpID8gdHJpbW1lZCA6IGAvJHt0cmltbWVkfWA7XG4gIHJldHVybiB3aXRoTGVhZGluZ1NsYXNoLmVuZHNXaXRoKCcvJykgPyB3aXRoTGVhZGluZ1NsYXNoIDogYCR7d2l0aExlYWRpbmdTbGFzaH0vYDtcbn0pKCk7XG5jb25zdCBwcm94eVRhcmdldHMgPSB7XG4gICcvYXBpJzoge1xuICAgIHRhcmdldDogYXBpUHJveHlUYXJnZXQsXG4gICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgIHNlY3VyZTogZmFsc2VcbiAgfSxcbiAgJy91cGxvYWRzJzoge1xuICAgIHRhcmdldDogYXBpUHJveHlUYXJnZXQsXG4gICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgIHNlY3VyZTogZmFsc2VcbiAgfSxcbiAgJy9vcGVuZnJlZW1hcCc6IHtcbiAgICB0YXJnZXQ6ICdodHRwczovL3RpbGVzLm9wZW5mcmVlbWFwLm9yZycsXG4gICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9vcGVuZnJlZW1hcC8sICcnKSxcbiAgICBzZWN1cmU6IGZhbHNlXG4gIH1cbn07XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHJvb3Q6IF9fZGlybmFtZSxcbiAgYmFzZTogbm9ybWFsaXplZEJhc2VQYXRoLFxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIGRlZmluZToge1xuICAgICdpbXBvcnQubWV0YS5lbnYuVklURV9CVUlMRF9TVEFNUCc6IEpTT04uc3RyaW5naWZ5KHByb2Nlc3MuZW52LlZJVEVfQlVJTERfU1RBTVAgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKVxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiB0cnVlLFxuICAgIHBvcnQ6IDUxNzUsXG4gICAgYWxsb3dlZEhvc3RzLFxuICAgIHByb3h5OiBwcm94eVRhcmdldHNcbiAgfSxcbiAgcHJldmlldzoge1xuICAgIGhvc3Q6IHRydWUsXG4gICAgcG9ydDogNTE3NSxcbiAgICBhbGxvd2VkSG9zdHMsXG4gICAgcHJveHk6IHByb3h5VGFyZ2V0c1xuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uLy4uL2Rpc3QtYXBwcy9zdG9yZScpLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICAgIC8vIE1hcExpYnJlIGlzIGxhenktbG9hZGVkOyBrZWVwIGNodW5rIHdhcm5pbmdzIGZvY3VzZWQgb24gaW5pdGlhbCBhcHAvdmVuZG9yIHJlZ3Jlc3Npb25zLlxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogMTEwMCxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdjb21tb25qc0hlbHBlcnMuanMnKSkgcmV0dXJuICd2ZW5kb3ItcmVhY3QnO1xuICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnc2NoZWR1bGVyJykpIHJldHVybiAndmVuZG9yLXJlYWN0JztcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ21hcGxpYnJlLWdsJykpIHJldHVybiAndmVuZG9yLW1hcGxpYnJlJztcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3FyY29kZScpKSByZXR1cm4gJ3ZlbmRvci1xcmNvZGUnO1xuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcygnbHVjaWRlLXJlYWN0JykpIHJldHVybiAndmVuZG9yLWljb25zJztcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ3JlYWN0JykgfHwgaWQuaW5jbHVkZXMoJ3JlYWN0LWRvbScpKSByZXR1cm4gJ3ZlbmRvci1yZWFjdCc7XG4gICAgICAgICAgcmV0dXJuICd2ZW5kb3InO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVUsU0FBUyxvQkFBb0I7QUFDbFcsT0FBTyxXQUFXO0FBQ2xCLFNBQVMscUJBQXFCO0FBQzlCLE9BQU8sVUFBVTtBQUg0TCxJQUFNLDJDQUEyQztBQUs5UCxJQUFNLGFBQWEsY0FBYyx3Q0FBZTtBQUNoRCxJQUFNLFlBQVksS0FBSyxRQUFRLFVBQVU7QUFDekMsSUFBTSxpQkFBaUIsUUFBUSxJQUFJLHFCQUFxQjtBQUN4RCxJQUFNLHFCQUFxQixRQUFRLElBQUksd0JBQXdCO0FBQy9ELElBQU0sZUFBZTtBQUNyQixJQUFNLHNCQUFzQixNQUFNO0FBQ2hDLFFBQU0sVUFBVSxPQUFPLGtCQUFrQixFQUFFLEtBQUssS0FBSztBQUNyRCxNQUFJLFlBQVksSUFBSyxRQUFPO0FBQzVCLFFBQU0sbUJBQW1CLFFBQVEsV0FBVyxHQUFHLElBQUksVUFBVSxJQUFJLE9BQU87QUFDeEUsU0FBTyxpQkFBaUIsU0FBUyxHQUFHLElBQUksbUJBQW1CLEdBQUcsZ0JBQWdCO0FBQ2hGLEdBQUc7QUFDSCxJQUFNLGVBQWU7QUFBQSxFQUNuQixRQUFRO0FBQUEsSUFDTixRQUFRO0FBQUEsSUFDUixjQUFjO0FBQUEsSUFDZCxRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsWUFBWTtBQUFBLElBQ1YsUUFBUTtBQUFBLElBQ1IsY0FBYztBQUFBLElBQ2QsUUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLGdCQUFnQjtBQUFBLElBQ2QsUUFBUTtBQUFBLElBQ1IsY0FBYztBQUFBLElBQ2QsU0FBUyxDQUFDQSxVQUFTQSxNQUFLLFFBQVEsa0JBQWtCLEVBQUU7QUFBQSxJQUNwRCxRQUFRO0FBQUEsRUFDVjtBQUNGO0FBRUEsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLEVBQ04sU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFFBQVE7QUFBQSxJQUNOLG9DQUFvQyxLQUFLLFVBQVUsUUFBUSxJQUFJLHFCQUFvQixvQkFBSSxLQUFLLEdBQUUsWUFBWSxDQUFDO0FBQUEsRUFDN0c7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ047QUFBQSxJQUNBLE9BQU87QUFBQSxFQUNUO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRLEtBQUssUUFBUSxXQUFXLDBCQUEwQjtBQUFBLElBQzFELGFBQWE7QUFBQTtBQUFBLElBRWIsdUJBQXVCO0FBQUEsSUFDdkIsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBLFFBQ04sYUFBYSxJQUFJO0FBQ2YsY0FBSSxHQUFHLFNBQVMsb0JBQW9CLEVBQUcsUUFBTztBQUM5QyxjQUFJLENBQUMsR0FBRyxTQUFTLGNBQWMsRUFBRyxRQUFPO0FBQ3pDLGNBQUksR0FBRyxTQUFTLFdBQVcsRUFBRyxRQUFPO0FBQ3JDLGNBQUksR0FBRyxTQUFTLGFBQWEsRUFBRyxRQUFPO0FBQ3ZDLGNBQUksR0FBRyxTQUFTLFFBQVEsRUFBRyxRQUFPO0FBQ2xDLGNBQUksR0FBRyxTQUFTLGNBQWMsRUFBRyxRQUFPO0FBQ3hDLGNBQUksR0FBRyxTQUFTLE9BQU8sS0FBSyxHQUFHLFNBQVMsV0FBVyxFQUFHLFFBQU87QUFDN0QsaUJBQU87QUFBQSxRQUNUO0FBQUEsTUFDRjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicGF0aCJdCn0K
