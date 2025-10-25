import nodemailer from "nodemailer";

// Vercel serverless handler that sends a simple "test" email using nodemailer.
// Accepts POST with JSON body: { "email": "recipient@example.com" }
// Environment variables accepted (one of these setups must be present):
// - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// - or GMAIL_USER and GMAIL_APP_PASSWORD (for Gmail SMTP)
// Optionally set SENDER_FROM to override the sender address.

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
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function createTransporter() {
  // Prefer explicit SMTP settings
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT, 10)
    : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Fallback to Gmail app password
  const gmailUser = "aftershockapp@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailPass) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
  }

  return null;
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

  const transporter = createTransporter();
  if (!transporter) {
    return res.status(500).json({
      error:
        "No SMTP configuration found. Set SMTP_HOST/SMTP_USER/SMTP_PASS or GMAIL_APP_PASSWORD.",
    });
  }

  const from = "aftershockapp@gmail.com";

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: "Test",
      text: "test",
      html: "<p>test</p>",
    });

    return res.status(200).json({ ok: true, messageId: info.messageId, info });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Failed to send email", details: err.message });
  }
}
