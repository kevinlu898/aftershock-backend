// Vercel serverless handler that sends a simple "test" email using the Resend API.
// Expects environment variables:
//   RESEND_API_KEY - your Resend API key
//   RESEND_FROM - email address to use as the sender (e.g. "onboarding@yourdomain.com")

const RESEND_URL = "https://api.resend.com/emails";

// simple JSON body parser usable in runtimes that don't auto-parse
async function parseJsonBody(req) {
  if (req.body) return req.body;
  return await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  // simple email regex (not perfect but ok for validation)
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    return res
      .status(400)
      .json({ error: "Invalid JSON body", details: err.message });
  }

  const toEmail = body && (body.email || body.to || body.recipient);
  if (!isValidEmail(toEmail)) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid "email" field in body' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = "aftershockapp@gmail.com";
  if (!RESEND_API_KEY) {
    return res
      .status(500)
      .json({ error: "RESEND_API_KEY is not configured in environment" });
  }

  try {
    const payload = {
      from: RESEND_FROM,
      to: toEmail,
      subject: "Test",
      html: "<p>test</p>",
      // you could also include 'text' property if desired
    };

    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ error: "Resend API error", status: r.status, details: data });
    }

    // success
    return res.status(200).json({ ok: true, providerResponse: data });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Failed to contact Resend API", details: err.message });
  }
}
