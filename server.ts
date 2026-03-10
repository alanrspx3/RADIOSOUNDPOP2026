import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an HTTPS agent that ignores certificate errors (common in radio streaming servers)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Proxy for Radio Metadata to bypass CORS and handle certificate issues
  app.get("/api/radio-stats", async (req, res) => {
    const endpoints = [
      "https://streaming.fox.srv.br:2020/json/stream/8150",
      "https://streaming.fox.srv.br:8150/stats?json=1",
      "https://streaming.fox.srv.br:8150/status-json.xsl",
      "http://streaming.fox.srv.br:8150/stats?json=1"
    ];

    let lastError = null;

    for (const url of endpoints) {
      try {
        console.log(`Attempting to fetch metadata from: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "application/json, text/plain, */*"
          },
          agent: url.startsWith("https") ? httpsAgent : undefined,
          timeout: 4000
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            
            // Normalize the new endpoint format to be compatible with existing frontend logic
            if (data.nowplaying && !data.songtitle) {
              data.songtitle = data.nowplaying;
            }
            
            return res.json(data);
          } else {
            const text = await response.text();
            try {
              const data = JSON.parse(text);
              if (data.nowplaying && !data.songtitle) {
                data.songtitle = data.nowplaying;
              }
              return res.json(data);
            } catch (e) {
              console.warn(`Endpoint ${url} returned non-JSON content:`, text.substring(0, 100));
            }
          }
        } else {
          console.warn(`Endpoint ${url} returned status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error fetching from ${url}:`, error instanceof Error ? error.message : String(error));
        lastError = error;
      }
    }

    // If all endpoints fail, try the legacy 7.html format which is very common
    try {
      const url = "https://streaming.fox.srv.br:8150/7.html";
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        agent: httpsAgent,
        timeout: 3000
      });
      if (response.ok) {
        const text = await response.text();
        // Format: listeners,1,max,99,unique,128,Artist - Song
        const parts = text.split(",");
        if (parts.length >= 7) {
          return res.json({ songtitle: parts[6] });
        }
      }
    } catch (e) {
      console.error("Legacy 7.html fetch failed");
    }

    res.status(500).json({ 
      error: "Failed to fetch metadata from all sources", 
      details: lastError instanceof Error ? lastError.message : String(lastError) 
    });
  });

  // Proxy for Lyrics to bypass CORS
  app.get("/api/lyrics", async (req, res) => {
    const { artist, title } = req.query;
    if (!artist || !title) {
      return res.status(400).json({ error: "Artist and title are required" });
    }

    try {
      const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist as string)}/${encodeURIComponent(title as string)}`;
      const response = await fetch(url, { timeout: 5000 });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Lyrics proxy error:", error);
      res.status(500).json({ error: "Failed to fetch lyrics" });
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
