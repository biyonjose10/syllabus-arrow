import nodemailer from "nodemailer";

/**
 * Outbound email over Gmail SMTP with an app password.
 *
 * Not Resend: Resend's shared sending domain only delivers to the account
 * owner's own address, and a verified domain costs money. Gmail delivers to
 * anyone, free, up to its daily sending cap — enough for a judging period.
 */

type Transport = ReturnType<typeof nodemailer.createTransport>;

let transport: Transport | undefined;

function getTransport(): Transport {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set to send email.");
  }
  transport ??= nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return transport;
}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  await getTransport().sendMail({
    from: `Syllabus→ <${process.env.GMAIL_USER}>`,
    ...message,
  });
}

export function verificationEmail(name: string, url: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    subject: "Confirm your email for Syllabus→",
    text: `${greeting}\n\nConfirm your email to start planning your course:\n${url}\n\nThis link expires in one hour. If you did not sign up, ignore this email.`,
    html: `<p>${greeting}</p><p>Confirm your email to start planning your course.</p><p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Confirm email</a></p><p style="color:#666;font-size:13px">This link expires in one hour. If you did not sign up, ignore this email.</p>`,
  };
}
