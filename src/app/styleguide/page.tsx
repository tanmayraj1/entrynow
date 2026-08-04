import { Star } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardMeta,
  CardTitle,
  Chip,
  EmptyState,
  Field,
  Input,
  Logo,
  Money,
  StatusPill,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { toPaise } from "@/lib/money";
import { formatIstDate, formatIstTime } from "@/lib/ist";

/**
 * Phase 0 style guide. Every primitive rendered under each of the four theme
 * scopes, so a token regression is visible at a glance. Replaced by the real
 * homepage in Phase 2.
 */

const THEMES = [
  { key: "market", label: "Marketplace — shopper mode (teal)" },
  { key: "dash-organizer", label: "Organizer portal (lavender + pink)" },
  { key: "dash-admin", label: "Admin portal (lavender + navy sidebar)" },
  { key: "scanner", label: "Gate scanner (dark)" },
] as const;

const SAMPLE_DATE = new Date("2026-10-12T14:00:00.000Z"); // 7:30 PM IST

function Swatches() {
  const names = [
    "primary",
    "primary-dark",
    "primary-tint",
    "bg",
    "surface",
    "border",
    "ink",
    "ink-muted",
    "gold",
    "danger",
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {names.map((n) => (
        <div key={n} className="text-center">
          <div
            className="size-11 rounded-[10px] border border-border"
            style={{ background: `var(--color-${n})` }}
          />
          <span className="text-[9.5px] font-bold text-ink-muted block mt-1">
            {n}
          </span>
        </div>
      ))}
    </div>
  );
}

function Showcase() {
  return (
    <div className="bg-bg text-ink p-6 flex flex-col gap-6">
      <Swatches />

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary">Book now →</Button>
        <Button variant="secondary">Follow</Button>
        <Button variant="outline">Share</Button>
        <Button variant="ghost">Reset</Button>
        <Button variant="danger">Cancel booking</Button>
        <Button variant="primary" loading>
          Confirming…
        </Button>
        <Button variant="primary" disabled>
          Sold out
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip selected>Navratri 2026</Chip>
        <Chip>This weekend</Chip>
        <Chip>Under ₹500</Chip>
        <Chip>Near me</Chip>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusPill status="CONFIRMED" />
        <StatusPill status="PENDING_PAYMENT" />
        <StatusPill status="CANCELLED_BY_USER" />
        <StatusPill status="SCANNED" />
        <StatusPill status="LIVE" />
        <StatusPill status="IN_REVIEW" />
        <StatusPill status="SUSPENDED" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <Card hoverable>
          <div
            className="h-28"
            style={{ background: "var(--gradient-navratri)" }}
          />
          <CardBody>
            <CardTitle>Rangilo Re Garba Mahotsav 2026</CardTitle>
            <CardMeta className="mt-1">
              Rangmanch Events · Vastrapur · 4.2 km
            </CardMeta>
            <div className="flex items-center justify-between mt-2">
              <Money
                paise={toPaise(499)}
                className="font-extrabold text-primary"
              />
              <span className="text-[11.5px] font-bold flex items-center gap-1">
                <Star size={12} className="fill-gold text-gold" /> 4.8 (1,240)
              </span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-3">
            <Field label="Phone number" required hint="We'll send a 6-digit OTP">
              <Input placeholder="+91 98765 43210" inputMode="tel" />
            </Field>
            <Field label="Promo code" error="This code has expired">
              <Input defaultValue="RAAS26" invalid />
            </Field>
          </CardBody>
        </Card>
      </div>

      <Card className="max-w-2xl">
        <Table>
          <thead>
            <tr className="border-b border-border">
              <Th>Booking</Th>
              <Th>Attendee</Th>
              <Th numeric>Qty</Th>
              <Th numeric>Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>EN482100</Td>
              <Td>Meera Patel</Td>
              <Td numeric>2</Td>
              <Td numeric>
                <Money paise={94130} />
              </Td>
              <Td>
                <StatusPill status="CONFIRMED" />
              </Td>
            </Tr>
            <Tr>
              <Td>EN482101</Td>
              <Td>Anand Shah</Td>
              <Td numeric>1</Td>
              <Td numeric>
                <Money paise={toPaise(100000)} />
              </Td>
              <Td>
                <StatusPill status="PENDING_PAYMENT" />
              </Td>
            </Tr>
          </tbody>
        </Table>
        <EmptyState
          title="No bookings in this range"
          body="Try widening the date filter, or clear the locality facet."
        />
      </Card>
    </div>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="min-h-screen">
      <header className="bg-surface border-b border-border px-6 py-5 flex items-center justify-between flex-wrap gap-3">
        <Logo size="lg" />
        <p className="text-[12.5px] font-semibold text-ink-muted">
          Phase 0 style guide · {formatIstDate(SAMPLE_DATE)} ·{" "}
          {formatIstTime(SAMPLE_DATE)} IST
        </p>
      </header>

      {THEMES.map((t) => (
        <section key={t.key} data-theme={t.key}>
          <h2 className="bg-surface text-ink text-[13px] px-6 py-3 border-y border-border sticky top-0 z-10">
            {t.label}
          </h2>
          <Showcase />
        </section>
      ))}
    </main>
  );
}
