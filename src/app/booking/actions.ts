"use server";

import { startGuestCheckout } from "@/lib/auth/guest";

export interface GuestState {
  error?: string;
  field?: "name" | "phone" | "email";
  /** Echoed back so a failed submit does not empty the form. */
  values?: { name: string; phone: string; email: string };
  notice?: "ready";
}

/**
 * Collect the buyer's details and open a guest session.
 *
 * Returns rather than redirects: the form is rendered by `useActionState`, and
 * `redirect()` throws control-flow that a `try/catch` in a client action
 * handler would swallow (D-028). The client navigates on `notice: "ready"`.
 */
export async function beginGuestCheckout(
  _prev: GuestState,
  formData: FormData,
): Promise<GuestState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const result = await startGuestCheckout(values);
  if (!result.ok) {
    return { error: result.error, field: result.field, values };
  }

  return { notice: "ready", values };
}
