import "server-only";

/**
 * Email adapter.
 *
 * Resolved by `EMAIL_DRIVER`, and shaped exactly like the SMS one so both
 * delivery channels are called the same way (D-008).
 *
 * The sandbox driver logs instead of sending. That is not a placeholder — it is
 * the whole point: the delivery *path* is real code that runs on every capture,
 * so when a provider is plugged in there is nothing new to wire, and until then
 * the log is an honest record of what would have gone out. What it cannot do is
 * put anything in an inbox, so nothing in the product may claim an email
 * arrived; the confirmation screen shows the ticket itself.
 */

export interface EmailAdapter {
  readonly name: string;
  send(message: {
    to: string;
    subject: string;
    /** Plain text. Templated HTML is a later concern than the send path. */
    body: string;
  }): Promise<{ id: string }>;
}

const sandbox: EmailAdapter = {
  name: "sandbox",
  async send({ to, subject, body }) {
    console.log(`[email:sandbox] -> ${to}\n  subject: ${subject}\n  ${body}`);
    return { id: `sandbox_${Date.now()}` };
  },
};

const notConfigured = (name: string): EmailAdapter => ({
  name,
  async send() {
    throw new Error(
      `Email driver "${name}" is selected but has no credentials configured. ` +
        `Set EMAIL_DRIVER=sandbox for local development.`,
    );
  },
});

export function getEmailAdapter(): EmailAdapter {
  const driver = process.env.EMAIL_DRIVER ?? "sandbox";
  switch (driver) {
    case "sandbox":
      return sandbox;
    default:
      return notConfigured(driver);
  }
}
