// Vercel-compatible serverless handler for returning the latest USGS earthquake feed.
// It polls the USGS `all_hour.geojson` feed every 10 minutes and caches the result in
// memory so requests can return quickly. Note: on serverless platforms this in-memory
// cache persists only while the instance is warm; consider using an external cache or
// scheduled function for guaranteed polling.

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

// In-memory cache
let cachedData = null;
let lastFetched = null;
let lastError = null;

async function fetchFeed() {
  if (!fetch) {
    lastError = {
      message: "fetch is not available in this runtime",
      time: new Date(),
    };
    return;
  }

  try {
    const res = await fetch(USGS_URL, { method: "GET" });
    if (!res.ok) throw new Error(`USGS responded with status ${res.status}`);
    const json = await res.json();
    cachedData = json;
    lastFetched = new Date();
    lastError = null;
  } catch (err) {
    lastError = { message: err.message, time: new Date() };
    // keep existing cachedData if present
  }
}

// Initial fetch
// await fetchFeed();

// Poll every 10 minutes (600000 ms)
const POLL_INTERVAL_MS = 10 * 60 * 1000;
setInterval(fetchFeed, POLL_INTERVAL_MS);

// Vercel serverless function entrypoint
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  // Support GET (return cached data) and POST (trigger an on-demand refresh and return data)
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET,POST");
    return res.status(405).end("Method Not Allowed");
  }

  // If POST, trigger a fresh fetch. If GET, just return cached data (fetch on-demand if empty).
  if (req.method === "POST") {
    if (!cachedData) {
      await fetchFeed();
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      refreshed: true,
      lastFetched: lastFetched ? lastFetched.toISOString() : null,
      data: cachedData,
    });
  }
}
