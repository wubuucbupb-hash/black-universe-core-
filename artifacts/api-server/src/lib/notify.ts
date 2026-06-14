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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRawMessage(to: string, subject: string, html: string): string {
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
  // Gmail's send endpoint expects a base64url-encoded RFC 2822 message.
  return Buffer.from(message, "utf-8").toString("base64url");
}

async function sendEmail(to: string, code: string): Promise<boolean> {
  try {
    const safeCode = escapeHtml(code);
    const html =
      `<p>Use the code below to reset your password. It expires in 30 ` +
      `minutes and can only be used once.</p>` +
      `<p style="font-family:monospace;font-size:16px;word-break:break-all">${safeCode}</p>` +
      `<p>If you did not request a password reset, you can ignore this message.</p>`;

    const connectors = new ReplitConnectors();
    const response = await connectors.proxy(
      "google-mail",
      "/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw: buildRawMessage(to, "Your password reset code", html),
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
