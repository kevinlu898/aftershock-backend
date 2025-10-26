let cachedData = null;
let lastFetched = null;
let lastError = null;

async function fetchFeed() {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
      { method: "GET" }
    );
    if (!res.ok) throw new Error(`USGS error: ${res.status}`);
    const json = await res.json();
    cachedData = json;
    lastFetched = new Date();
    lastError = null;
  } catch (err) {
    lastError = { message: err.message, time: new Date() };
  }
}

const POLL_INTERVAL_MS = 10 * 60 * 1000;
setInterval(fetchFeed, POLL_INTERVAL_MS);

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    function toRad(n) {
      return (n * Math.PI) / 180;
    }
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function simplifyFeature(f, center) {
    const coords = (f.geometry && f.geometry.coordinates) || [];
    const lon = typeof coords[0] === "number" ? coords[0] : null;
    const lat = typeof coords[1] === "number" ? coords[1] : null;
    const depth = typeof coords[2] === "number" ? coords[2] : null;
    const timeMs =
      f.properties && typeof f.properties.time === "number"
        ? f.properties.time
        : null;
    const base = {
      id: f.id || (f.properties && f.properties.code) || null,
      lat,
      lon,
      depth,
      timeMs,
      timeISO: timeMs ? new Date(timeMs).toISOString() : null,
      mag: f.properties ? f.properties.mag : null,
      place: f.properties ? f.properties.place : null,
    };
    if (center && lat != null && lon != null) {
      base.distanceKm = haversineKm(center.lat, center.lon, lat, lon);
    }
    return base;
  }

  if (req.method === "POST") {
    const body = req.body;

    const postalCode =
      (body && (body.postalCode || body.postal_code || body.postal)) || null;
    const radiusKm =
      body && typeof body.radiusKm === "number"
        ? body.radiusKm
        : body && typeof body.radius_km === "number"
        ? body.radius_km
        : 100;

    if (!cachedData) {
      await fetchFeed();
    }

    try {
      const q = encodeURIComponent(postalCode);
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?postalcode=${q}&format=json&limit=1`;
      const geoRes = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "aftershock-backend/1.0 (aftershockapp@gmail.com)",
        },
      });
      if (!geoRes.ok)
        throw new Error(`Geocode failed with status ${geoRes.status}`);
      const geoJson = await geoRes.json();
      if (!Array.isArray(geoJson) || geoJson.length === 0) {
        return res.status(404).json({ error: "Postal code not found" });
      }
      const loc = geoJson[0];
      const center = { lat: parseFloat(loc.lat), lon: parseFloat(loc.lon) };

      if (!cachedData) {
        return res
          .status(503)
          .json({ error: "No earthquake data available", lastError });
      }

      const results = (cachedData.features || [])
        .map((f) => simplifyFeature(f, center))
        .filter(
          (f) =>
            f.lat != null &&
            f.lon != null &&
            typeof f.distanceKm === "number" &&
            f.distanceKm <= radiusKm
        );

      res.setHeader("Content-Type", "application/json");
      return res.status(200).json({
        postalCode,
        center,
        radiusKm,
        lastFetched: lastFetched ? lastFetched.toISOString() : null,
        count: results.length,
        results,
      });
    } catch (err) {
      return res
        .status(502)
        .json({ error: "Failed to geocode postal code", details: err.message });
    }
  }
}
