// Email delivery uses the Replit Gmail connector (blueprint id: google-mail).
// Requests are proxied with automatic OAuth2 token injection/refresh by the SDK,
// so no API key is stored — the connected Gmail account is the sender.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

/**
 * Out-of-band delivery for password-reset codes.
 *
 * The code is delivered exactly as issued so the existing two-step UI (request
 * code -> enter code + new password) keeps working: the recipient pastes the
 * code into step two.
 */

export interface ResetCodeRecipient {
  email?: string | null;
}

export interface DeliveryResult {
  email: boolean;
}

const SENDER_NAME = "Black Universe";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The connected Gmail address. Used so the From/Reply-To headers carry a real
// mailbox with a friendly display name — bare, identity-less automated mail is a
// strong spam signal, so this nudges messages toward the inbox. Resolved once
// and cached; on failure we fall back to letting Gmail fill the address in.
let cachedSender: string | null = null;
async function getSenderAddress(
  connectors: ReplitConnectors,
): Promise<string | null> {
  if (cachedSender) return cachedSender;
  try {
    const res = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/profile",
      { method: "GET" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { emailAddress?: string };
    cachedSender = data.emailAddress ?? null;
    return cachedSender;
  } catch {
    return null;
  }
}

function buildRawMessage(opts: {
  to: string;
  from: string | null;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = "bu_" + Math.random().toString(36).slice(2);
  const headers = [`To: ${opts.to}`];
  // A proper From display name + Reply-To make the message look like legitimate
  // transactional mail rather than an anonymous script.
  if (opts.from) {
    headers.push(`From: ${SENDER_NAME} <${opts.from}>`);
    headers.push(`Reply-To: ${opts.from}`);
  }
  // multipart/alternative (text + HTML) is expected of real mail; HTML-only
  // bodies are penalised by spam filters.
  const lines = [
    ...headers,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    opts.text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    opts.html,
    "",
    `--${boundary}--`,
  ];
  // Gmail's send endpoint expects a base64url-encoded RFC 2822 message.
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

async function sendEmail(to: string, code: string): Promise<boolean> {
  try {
    const safeCode = escapeHtml(code);
    const text =
      `Use this code to reset your ${SENDER_NAME} password. It expires in ` +
      `30 minutes and can be used once:\n\n${code}\n\n` +
      `If you did not request a password reset, you can ignore this email.`;
    const html =
      `<p>Use the code below to reset your ${SENDER_NAME} password. It expires ` +
      `in 30 minutes and can only be used once.</p>` +
      `<p style="font-family:monospace;font-size:16px;word-break:break-all">${safeCode}</p>` +
      `<p>If you did not request a password reset, you can ignore this message.</p>`;

    const connectors = new ReplitConnectors();
    const from = await getSenderAddress(connectors);
    const response = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw: buildRawMessage({
            to,
            from,
            subject: `Your ${SENDER_NAME} password reset code`,
            text,
            html,
          }),
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error(
        { status: response.status, body },
        "Failed to send reset code email via Gmail",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send reset code email via Gmail");
    return false;
  }
}

/**
 * Delivers the reset code by email when an address is on file. Never throws —
 * delivery failures are logged so the caller can keep the response generic and
 * not leak which accounts exist or whether delivery is wired up.
 */
export async function sendPasswordResetCode(
  recipient: ResetCodeRecipient,
  code: string,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { email: false };

  if (recipient.email) {
    result.email = await sendEmail(recipient.email, code);
  }

  if (!result.email) {
    logger.warn(
      { hasEmail: Boolean(recipient.email) },
      "Password reset code was not delivered by email",
    );
  }

  return result;
}
