import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "aftershockapp@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

await transporter.sendMail({
  from: "Earthquake Alerts <aftershockapp@gmail.com>",
  to: user.email,
  subject: "⚠️ Earthquake Nearby!",
  text: "A magnitude 5.0 quake was detected close to your location.",
});
