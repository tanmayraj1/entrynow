import { FlaskConical } from "lucide-react";

/**
 * The demo build's own warning label.
 *
 * Deliberately unmissable and not dismissible. This build accepts a fixed OTP,
 * creates accounts from unverified email addresses, and simulates payment —
 * any of which a visitor could reasonably mistake for the real thing if the
 * page did not say otherwise. A banner is cheap; someone entering a real card
 * number into a fake gateway is not.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="bg-[#16264c] text-white px-4 md:px-6 lg:px-12 py-2 flex items-center justify-center gap-2 text-center"
    >
      <FlaskConical size={14} strokeWidth={2.4} className="shrink-0 text-gold" />
      <p className="text-[12px] font-semibold leading-snug">
        <b className="font-extrabold">Demo build.</b> No real payments, no real
        tickets. OTP is <b>123456</b>; test cards are on the payment screen.
      </p>
    </div>
  );
}
