import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Proxy for Radio Metadata to bypass CORS
  app.get("/api/radio-stats", async (req, res) => {
    try {
      const response = await fetch("https://streaming.fox.srv.br:8150/stats?json=1", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        timeout: 5000
      });
      if (!response.ok) {
        console.error(`Streaming server returned status: ${response.status}`);
        throw new Error("Failed to fetch from streaming server");
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error details:", error);
      res.status(500).json({ error: "Failed to fetch metadata", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
