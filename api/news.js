const NEWS_URL = "https://api.thenewsapi.com/v1/news/top";

let cachedNews = null;
let lastFetched = null;
let lastError = null;

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchNews() {
  const key = process.env.THENEWSAPI_KEY;
  if (!key) {
    lastError = { message: "THENEWSAPI_KEY is not set", time: new Date() };
    return;
  }

  try {
    const url = `${NEWS_URL}?language=en&limit=3&search=earthquake&api_token=${encodeURIComponent(
      key
    )}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "aftershock-backend/1.0 (youremail@example.com)",
      },
    });
    if (!res.ok) throw new Error(`thenewsapi responded with ${res.status}`);
    const json = await res.json();
    cachedNews = json;
    lastFetched = new Date();
    lastError = null;
  } catch (err) {
    lastError = { message: err.message, time: new Date() };
  }
}

fetchNews();

setInterval(() => {
  fetchNews();
}, DAY_MS);

async function parseJsonBody(req) {
  if (req.body) return req.body;
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    await parseJsonBody(req).catch(() => null);
  } catch (err) {}

  if (!cachedNews) await fetchNews();

  if (!cachedNews) {
    return res.status(503).json({ error: "No news available", lastError });
  }

  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({
    lastFetched: lastFetched ? lastFetched.toISOString() : null,
    data: cachedNews,
  });
}
