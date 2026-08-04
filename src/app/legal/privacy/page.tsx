import type { Metadata } from "next";
import { LegalPage } from "@/components/marketplace/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Entry Now collects, why, and what we do not do with it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="4 August 2026"
      intro="We collect what is needed to sell you a ticket and get you through the gate. This page is specific about what that is."
      sections={[
        {
          heading: "What we collect",
          body: (
            <ul>
              <li>
                <b>Your mobile number</b> — required. It verifies your account
                and is how tickets are delivered.
              </li>
              <li>
                <b>Your name and email</b> — if you give them, for the ticket
                and the receipt.
              </li>
              <li>
                <b>Attendee names</b> — the names you enter for each ticket, so
                gate staff can match a person to a booking.
              </li>
              <li>
                <b>Your bookings and scans</b> — what you bought, and whether
                the QR was used.
              </li>
            </ul>
          ),
        },
        {
          heading: "Location",
          body: (
            <p>
              &quot;Near me&quot; asks your browser for a position and uses it
              to sort events by distance. It is used for that request and{" "}
              <b>never written to our database</b>. Declining it costs you
              nothing except that sort order — pick a locality instead.
            </p>
          ),
        },
        {
          heading: "Payment details",
          body: (
            <p>
              We never see or store your card number, UPI PIN or bank
              credentials. Payment is handled entirely by the payment gateway;
              we keep only the gateway&apos;s reference, the amount, and whether
              it succeeded.
            </p>
          ),
        },
        {
          heading: "Who else sees your data",
          body: (
            <ul>
              <li>
                <b>The organizer of an event you booked</b> sees the attendee
                names and the booking, because they run the gate. They do not
                get your payment details.
              </li>
              <li>
                <b>Our payment, SMS and messaging providers</b> get only what
                they need to deliver that one thing.
              </li>
              <li>
                We do not sell your data, and we do not share it with
                advertisers.
              </li>
            </ul>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <p>
              Booking and payment records are retained as long as Indian tax and
              accounting rules require. If you delete your account we remove
              your profile, but financial and audit records survive in a form
              that is no longer linked to your public profile.
            </p>
          ),
        },
        {
          heading: "Deleting your account",
          body: (
            <p>
              You can delete your account from your profile at any time, unless
              you hold tickets to an event that has not happened yet — cancel or
              transfer those first, so you are not left without entry to
              something you paid for.
            </p>
          ),
        },
        {
          heading: "Contacting us",
          body: (
            <p>
              For any request about your data, write to{" "}
              <a href="mailto:support@entrynow.in">support@entrynow.in</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
