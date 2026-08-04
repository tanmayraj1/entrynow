import type { Metadata } from "next";
import { LegalPage } from "@/components/marketplace/legal-page";
import { DEFAULT_BUSINESS_CONFIG } from "@/lib/config";
import { inr } from "@/lib/money";

export const metadata: Metadata = {
  title: "Refund policy",
  description:
    "How cancellations, refunds and the booking fee work on Entry Now.",
};

const cfg = DEFAULT_BUSINESS_CONFIG;

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund policy"
      updated="4 August 2026"
      intro="Each organizer sets the refund policy for their own event, and it is shown on the event page before you pay. This page explains the rules that apply on top of whichever policy an organizer has chosen."
      sections={[
        {
          heading: "The three policies an organizer can choose",
          body: (
            <ul>
              <li>
                <b>Full refund until 72 hours before</b> — the ticket value is
                returned in full up to 72 hours before the session starts, and
                nothing after that. This is the most common choice.
              </li>
              <li>
                <b>Tiered</b> — a sliding scale, for example 90% if you cancel
                a week ahead and 50% inside 72 hours. The exact percentage is
                shown to you before you confirm.
              </li>
              <li>
                <b>No refund</b> — the booking is final once confirmed.
              </li>
            </ul>
          ),
        },
        {
          heading: "When the clock is measured",
          body: (
            <p>
              Against the moment you submit the cancellation, in Indian Standard
              Time — not when we finish processing it. A request made at 72
              hours and one minute is inside the window even if it takes us a
              moment to handle.
            </p>
          ),
        },
        {
          heading: "The booking fee",
          body: (
            <p>
              The booking fee ({cfg.bookingFeePct}% of the ticket subtotal,
              minimum {inr(cfg.bookingFeeMinPaise)} and capped at{" "}
              {inr(cfg.bookingFeeMaxPaise)}) and the GST charged on it are{" "}
              <b>not refunded</b> when you choose to cancel. They <b>are</b>{" "}
              refunded in full when the organizer or we cancel the event, or
              when a dispute is resolved in your favour.
            </p>
          ),
        },
        {
          heading: "If the organizer cancels",
          body: (
            <p>
              You are refunded the full amount you paid, including the booking
              fee and its GST, without needing to ask. Refunds are processed in
              batches and you are notified when yours is sent.
            </p>
          ),
        },
        {
          heading: "If the date or venue changes",
          body: (
            <p>
              Every booked attendee is notified, and you get a{" "}
              <b>72-hour window to cancel free of charge</b> regardless of the
              event&apos;s normal refund policy.
            </p>
          ),
        },
        {
          heading: "Where the money goes",
          body: (
            <ul>
              <li>
                <b>To your wallet</b> — instant, and usable on any future
                booking. Wallet balance cannot be withdrawn to a bank account.
              </li>
              <li>
                <b>To your original payment method</b> — subject to your bank or
                UPI provider, typically 5–7 working days.
              </li>
            </ul>
          ),
        },
        {
          heading: "Tickets you have already used",
          body: (
            <p>
              A ticket that has been scanned at the gate cannot be cancelled or
              refunded. If you cancel within 6 hours of the session starting,
              the seats are not returned to sale.
            </p>
          ),
        },
        {
          heading: "If something goes wrong",
          body: (
            <p>
              If a refund fails at your bank we retry it automatically, and if
              it still fails our finance team picks it up directly. You can
              raise a dispute from any booking in My Tickets, and both you and
              the organizer are told the outcome.
            </p>
          ),
        },
      ]}
    />
  );
}
