import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketplace/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that govern buying and selling tickets on Entry Now.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="4 August 2026"
      intro="Entry Now is a marketplace. Organizers run the events; we sell the tickets, take the payment and provide the entry system. These terms cover what each of us is responsible for."
      sections={[
        {
          heading: "What we are, and what we are not",
          body: (
            <p>
              We are the ticketing platform. The organizer is the one running
              the event and is responsible for it actually happening, for the
              line-up, for safety at the venue, and for the conditions of entry.
              Where an event is cancelled or misrepresented, we act as your
              route to a refund — see the{" "}
              <Link href="/legal/refunds">refund policy</Link>.
            </p>
          ),
        },
        {
          heading: "Your account",
          body: (
            <p>
              An account needs a verified Indian mobile number. That number is
              how tickets reach you and how your identity is confirmed at the
              gate, so keep it current. You are responsible for what happens
              under your account.
            </p>
          ),
        },
        {
          heading: "Tickets and entry",
          body: (
            <ul>
              <li>
                Each ticket carries a QR that admits <b>one person, once</b>. It
                stops working the moment it is scanned.
              </li>
              <li>
                Screenshots work. Sharing that screenshot does not create a
                second entry — whoever presents it first gets in, and the other
                person does not.
              </li>
              <li>
                Where an organizer allows transfers, a ticket may be transferred
                once, up to two hours before the session. The original QR dies
                immediately.
              </li>
              <li>
                Reselling tickets above face value, or through any channel other
                than a transfer, is not permitted and will void them.
              </li>
            </ul>
          ),
        },
        {
          heading: "Prices and payment",
          body: (
            <p>
              Prices are set by the organizer and shown in rupees, inclusive of
              the ticket price. A booking fee and the GST on it are added at
              checkout and shown before you pay. When you begin checkout your
              seats are held for eight minutes; if payment is not completed in
              that time the hold is released and they return to sale.
            </p>
          ),
        },
        {
          heading: "Conduct at the venue",
          body: (
            <p>
              Organizers may refuse entry or remove anyone for unsafe or abusive
              behaviour, or for breaching the venue&apos;s conditions — dress
              code, prohibited items, and so on, all listed on the event page.
              No refund is due in that case.
            </p>
          ),
        },
        {
          heading: "For organizers",
          body: (
            <ul>
              <li>
                Listing requires a verified business identity, PAN, and a bank
                account in the business&apos;s name.
              </li>
              <li>
                Events are reviewed before going live, and may be paused or
                removed if they turn out to be misdescribed.
              </li>
              <li>
                Settlement is made after the event completes, net of commission
                and GST, to the verified bank account.
              </li>
            </ul>
          ),
        },
        {
          heading: "Reviews",
          body: (
            <p>
              Reviews can be left only by attendees whose ticket was actually
              scanned, within 14 days of the event. Organizers may reply once.
              We remove reviews that are abusive or clearly not about the event,
              and we log every removal.
            </p>
          ),
        },
        {
          heading: "Governing law",
          body: (
            <p>
              These terms are governed by Indian law, and the courts at
              Ahmedabad, Gujarat have jurisdiction.
            </p>
          ),
        },
      ]}
    />
  );
}
