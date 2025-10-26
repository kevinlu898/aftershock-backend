import nodemailer from "nodemailer";

// Vercel serverless handler that sends a simple "test" email using nodemailer via Gmail.
// Accepts POST with JSON body: { "email": "recipient@example.com" }
// Environment variables required:
// - GMAIL_USER - the Gmail address to send from (e.g. aftershockapp@gmail.com)
// - GMAIL_APP_PASSWORD - an app password for the Gmail account
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render plan object to a simple HTML and plain-text representation
function renderPlanToHtml(plan, contacts, medical) {
  if (
    (!plan || typeof plan !== "object") &&
    (!Array.isArray(contacts) || contacts.length === 0) &&
    (!Array.isArray(medical) || medical.length === 0)
  )
    return "<p>No plan provided.</p>";
  plan = plan || {};
  medical = medical || [];
  const parts = [];
  parts.push(
    '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">'
  );
  parts.push('<h2 style="margin-bottom:6px">Evacuation Plan</h2>');

  // _meta
  if (plan._meta && plan._meta.evacuateRoute) {
    try {
      const d = new Date(plan._meta.evacuateRoute);
      if (!isNaN(d))
        parts.push(
          `<p><strong>Route timestamp:</strong> ${d.toLocaleString()}</p>`
        );
    } catch (e) {}
  }

  // helper to normalize small HTML fragments: convert divs to paragraphs and keep basic breaks
  const normalizeHtmlFragment = (s) => {
    if (!s) return "<p><em>None provided</em></p>";
    // if string contains HTML tags, convert <div> to <p> to create paragraphs
    let out = String(s);
    out = out.replace(/<div[^>]*>/gi, "<p>");
    out = out.replace(/<\/div>/gi, "</p>");
    // ensure lone <br> are self-closed
    out = out.replace(/<br\s*\/?>/gi, "<br/>");
    // wrap plain text without paragraphs
    if (!/<p/i.test(out)) out = `<p>${out}</p>`;
    return out;
  };

  const sections = [
    ["Evacuate Route", plan.evacuateRoute || plan["evacuateRoute"] || ""],
    ["Aftermath Procedures", plan.aftermathProcedures || ""],
    ["Meet Up Points", plan.meetUpPoints || plan.meetUpPoints || ""],
    ["Other", plan.other || ""],
  ];

  for (const [title, value] of sections) {
    parts.push(`<h3 style="margin:10px 0 4px; font-size:16px">${title}</h3>`);
    parts.push(normalizeHtmlFragment(value));
  }

  // Emergency contacts
  if (Array.isArray(contacts) && contacts.length > 0) {
    parts.push(
      '<section style="padding:12px;background:#fff9f0;border-left:4px solid #ff9900;border-radius:6px;margin-bottom:18px">'
    );
    parts.push(
      '<h3 style="margin:10px 0 4px; font-size:16px">Emergency Contacts</h3>'
    );
    parts.push('<ul style="padding-left:18px;margin-top:6px">');
    for (const c of contacts) {
      const name = c && c.name ? String(c.name) : "(no name)";
      const phone = c && c.phone ? String(c.phone) : "(no phone)";
      const rel = c && c.relation ? String(c.relation) : "";
      parts.push(
        `<li style="margin-bottom:6px"><strong>${escapeHtml(name)}</strong>${
          rel ? ` — ${escapeHtml(rel)}` : ""
        }<br/><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></li>`
      );
    }
    parts.push("</ul>");
    parts.push("</section>");
  }

  // Medical info
  if (Array.isArray(medical) && medical.length > 0) {
    parts.push(
      '<section style="padding:12px;background:#f7fff5;border-left:4px solid #2ecc71;border-radius:6px;margin-bottom:18px">'
    );
    parts.push(
      '<h3 style="margin:10px 0 4px; font-size:16px">Medical Info</h3>'
    );
    parts.push('<ul style="padding-left:18px;margin-top:6px">');
    for (const m of medical) {
      const name = m && m.name ? String(m.name) : "(no name)";
      const allergies = m && m.allergies ? String(m.allergies) : "";
      const meds = m && m.medications ? String(m.medications) : "";
      const blood = m && m.bloodType ? String(m.bloodType) : "";
      const notes = m && m.notes ? String(m.notes) : "";
      const updated =
        m && m.updatedAt ? new Date(m.updatedAt).toLocaleString() : "";
      parts.push(
        `<li style="margin-bottom:8px"><strong>${escapeHtml(name)}</strong>${
          blood ? ` — Blood: ${escapeHtml(blood)}` : ""
        }<br/>${
          allergies
            ? `<strong>Allergies:</strong> ${escapeHtml(allergies)}<br/>`
            : ""
        }${
          meds ? `<strong>Medications:</strong> ${escapeHtml(meds)}<br/>` : ""
        }${notes ? `<strong>Notes:</strong> ${escapeHtml(notes)}<br/>` : ""}${
          updated
            ? `<small style="color:#666">Updated: ${escapeHtml(
                updated
              )}</small>`
            : ""
        }</li>`
      );
    }
    parts.push("</ul>");
    parts.push("</section>");
  }

  parts.push("</div>");
  return parts.join("\n");
}

function renderPlanToText(plan, contacts, medical) {
  if (
    (!plan || typeof plan !== "object") &&
    (!Array.isArray(contacts) || contacts.length === 0) &&
    (!Array.isArray(medical) || medical.length === 0)
  )
    return "No plan provided.";
  plan = plan || {};
  medical = medical || [];
  const lines = [];
  const sections = [
    ["Evacuate Route", plan.evacuateRoute || ""],
    ["Aftermath Procedures", plan.aftermathProcedures || ""],
    ["Meet Up Points", plan.meetUpPoints || ""],
    ["Other", plan.other || ""],
  ];
  for (const [title, value] of sections) {
    lines.push(`\n${title}:`);
    if (!value) lines.push("  (none)");
    else {
      // strip HTML tags for plain text
      const text = String(value)
        .replace(/<[^>]*>/g, "")
        .trim();
      lines.push(
        text
          .split("\n")
          .map((l) => "  " + l)
          .join("\n")
      );
    }
  }

  // Emergency contacts (plain text)
  if (contacts && Array.isArray(contacts) && contacts.length > 0) {
    lines.push("\nEmergency Contacts:");
    for (const c of contacts) {
      const name = c && c.name ? String(c.name) : "(no name)";
      const phone = c && c.phone ? String(c.phone) : "(no phone)";
      const rel = c && c.relation ? String(c.relation) : "";
      lines.push(`  - ${name}${rel ? ` (${rel})` : ""}: ${phone}`);
    }
  }
  // Medical info (plain text)
  if (medical && Array.isArray(medical) && medical.length > 0) {
    lines.push("\nMedical Info:");
    for (const m of medical) {
      const name = m && m.name ? String(m.name) : "(no name)";
      const allergies = m && m.allergies ? String(m.allergies) : "";
      const meds = m && m.medications ? String(m.medications) : "";
      const blood = m && m.bloodType ? String(m.bloodType) : "";
      const notes = m && m.notes ? String(m.notes) : "";
      const updated =
        m && m.updatedAt ? new Date(m.updatedAt).toLocaleString() : "";
      lines.push(`  - ${name}${blood ? ` (Blood: ${blood})` : ""}`);
      if (allergies) lines.push(`      Allergies: ${allergies}`);
      if (meds) lines.push(`      Medications: ${meds}`);
      if (notes) lines.push(`      Notes: ${notes}`);
      if (updated) lines.push(`      Updated: ${updated}`);
    }
  }
  return lines.join("\n");
}

function createTransporter() {
  // Use Gmail with an app password. This simplifies configuration and avoids
  // requiring raw SMTP host/port settings.
  const gmailUser = "aftershockapp@gmail.com";
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailPass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });
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
        "No Gmail app password configured. Set GMAIL_APP_PASSWORD in environment.",
    });
  }

  const from = "aftershockapp@gmail.com";

  try {
    // Render plan content if provided in the request body, and include emergency_contact
    const plan = body && body.plan;
    const contacts =
      body &&
      (body.emergency_contact || body.emergencyContacts || body.contacts)
        ? body.emergency_contact || body.emergencyContacts || body.contacts
        : [];
    const medical =
      body && (body.medicalinfo || body.medical_info || body.medicalInfo)
        ? body.medicalinfo || body.medical_info || body.medicalInfo
        : [];
    const htmlBody = renderPlanToHtml(plan, contacts, medical);
    const textBody = renderPlanToText(plan, contacts, medical);

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: "Your Evacuation Plan",
      text: textBody,
      html: htmlBody,
    });

    return res.status(200).json({ ok: true, messageId: info.messageId, info });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Failed to send email", details: err.message });
  }
}
