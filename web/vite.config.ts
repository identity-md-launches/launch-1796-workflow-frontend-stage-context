import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "deployment-in-development",
      apply: "serve",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = req.url?.split("?")[0];
          if (path !== "/imd-deployment.json" && !path?.startsWith("/abi/"))
            return next();
          try {
            const template = JSON.parse(
              await readFile(
                resolve(import.meta.dirname, "deployment.template.json"),
                "utf8",
              ),
            );
            const contract = template.contracts.find(
              (c: { abiPath: string }) => "/" + c.abiPath === path,
            );
            const body =
              path === "/imd-deployment.json"
                ? JSON.stringify({ ...template, assets: [] })
                : contract
                  ? await readFile(
                      resolve(import.meta.dirname, "../docs", contract.abiPath),
                      "utf8",
                    )
                  : null;
            if (body === null) return next();
            res.setHeader("Content-Type", "application/json");
            res.end(body);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
