import "server-only";

/**
 * SMS adapter.
 *
 * Resolved by `SMS_DRIVER`. The sandbox driver is fully functional — it uses a
 * fixed OTP so the whole auth path can be exercised end to end without a
 * provider account, while the rate limits, expiry and lockout around it stay
 * real (decision D-008).
 */

export interface SmsAdapter {
  readonly name: string;
  /** Fixed code, when the driver has one. Sandbox only. */
  readonly fixedCode?: string;
  send(to: string, message: string): Promise<{ id: string }>;
}

const sandbox: SmsAdapter = {
  name: "sandbox",
  fixedCode: process.env.SANDBOX_OTP_CODE ?? "123456",
  async send(to, message) {
    // Logged rather than sent, so a developer can see exactly what a user
    // would have received.
    console.log(`[sms:sandbox] -> +${to}: ${message}`);
    return { id: `sandbox_${Date.now()}` };
  },
};

const notConfigured = (name: string): SmsAdapter => ({
  name,
  async send() {
    throw new Error(
      `SMS driver "${name}" is selected but has no credentials configured. ` +
        `Set SMS_DRIVER=sandbox for local development.`,
    );
  },
});

export function getSmsAdapter(): SmsAdapter {
  const driver = process.env.SMS_DRIVER ?? "sandbox";
  switch (driver) {
    case "sandbox":
      return sandbox;
    default:
      return notConfigured(driver);
  }
}
