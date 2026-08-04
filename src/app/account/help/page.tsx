import Link from "next/link";
import type { Metadata } from "next";
import { AccountPanel } from "@/components/marketplace/account-panel";

export const metadata: Metadata = { title: "Help centre" };

const TOPICS = [
  {
    q: "My QR won't scan at the gate",
    a: "Turn your screen brightness up — that fixes most of them. If it still fails, gate staff can look you up by booking ID, which is on the ticket. Your ticket is also cached on your phone, so it works even with no network at the venue.",
  },
  {
    q: "I didn't get my tickets",
    a: "They're always in My Tickets, immediately, whether or not the WhatsApp or email arrived. If the message didn't reach you, check that your number and email are correct in your profile.",
  },
  {
    q: "Can I cancel and get my money back?",
    a: "It depends on the organizer's policy, which is shown on every event page before you pay. Most allow a full refund of the ticket value up to 72 hours before. The booking fee isn't refunded unless the organizer cancels.",
  },
  {
    q: "Can I send a ticket to someone else?",
    a: "If the organizer allows transfers, yes — once per ticket, up to 2 hours before the event. Open the ticket and choose Transfer. The original QR stops working the moment they accept.",
  },
  {
    q: "My payment was taken but I have no ticket",
    a: "Give it a minute — we confirm against the payment gateway, not the app screen, so a slow UPI confirmation can lag. If the seats had already been released to someone else, the full amount is refunded automatically and we message you.",
  },
  {
    q: "Where's my refund?",
    a: "Wallet refunds are instant. Refunds to your original payment method follow your bank's timeline, usually 5–7 working days. Track either from Wallet & refunds.",
  },
  {
    q: "The event was cancelled",
    a: "You're refunded in full, including the booking fee, without needing to ask. You'll get a message when it's sent.",
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <AccountPanel
        title="Help centre"
        description="The questions we get most. If yours isn't here, we answer on WhatsApp and email."
      >
        <div className="flex flex-col gap-2">
          {TOPICS.map((t) => (
            <details
              key={t.q}
              className="border border-border rounded-[12px] px-4 py-3 group"
            >
              <summary className="font-extrabold text-[13.5px] cursor-pointer list-none flex justify-between gap-3">
                {t.q}
                <span className="text-ink-muted group-open:rotate-45 transition-transform text-[17px] leading-none">
                  +
                </span>
              </summary>
              <p className="text-[13px] text-body-soft mt-2 leading-relaxed">
                {t.a}
              </p>
            </details>
          ))}
        </div>
      </AccountPanel>

      <AccountPanel title="Still stuck?">
        <div className="flex flex-col gap-2 text-[13.5px] text-body-soft">
          <p>
            Email{" "}
            <a href="mailto:support@entrynow.in">support@entrynow.in</a> —
            we reply within a working day.
          </p>
          <p>
            Call <a href="tel:18001213687">1800-121-ENTRY</a>, 10am–8pm IST. On
            event days we run until the gates close.
          </p>
          <p className="text-[12.5px] text-ink-muted mt-2">
            Our <Link href="/legal/refunds">refund policy</Link> and{" "}
            <Link href="/legal/terms">terms of use</Link> spell out the rules in
            full.
          </p>
        </div>
      </AccountPanel>
    </div>
  );
}
