import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = "https://streaming.fox.srv.br:8150/status-json.xsl";

    const response = await fetch(url);
    const data = await response.json();

    const song = data?.icestats?.source?.title || "Desconhecido";
    const [artist, title] = song.includes(" - ") ? song.split(" - ") : ["", song];

    const coverUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(
      song
    )}&limit=1`;

    let cover = null;

    const coverResponse = await fetch(coverUrl);
    const coverData = await coverResponse.json();

    if (coverData?.results?.length > 0) {
      cover = coverData.results[0].artworkUrl100
        ?.replace("100x100bb", "300x300bb") || null;
    }

    res.status(200).json({
      artist: artist.trim(),
      title: title.trim(),
      cover,
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: "Erro ao obter dados da rádio" });
  }
}
