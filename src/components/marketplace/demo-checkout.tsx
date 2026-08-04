"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark, Loader2, Smartphone, Wallet } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DEMO_CARDS, DEMO_CARD_HINT, DEMO_UPI_SUCCESS } from "@/lib/demo";

/**
 * The demo gateway's card screen.
 *
 * UPI first, because that is how India pays — the design's method order is not
 * cosmetic. Submitting posts to `/api/demo/pay`, which asks the sandbox
 * adapter to deliver a webhook; this component never confirms a booking
 * itself. That keeps the demo honest: the confirmation path a reviewer
 * exercises is the same signed-webhook path a real gateway would use.
 */

type Method = "upi" | "card" | "netbanking" | "wallet";

const METHODS: { key: Method; label: string; Icon: typeof CreditCard }[] = [
  { key: "upi", label: "UPI", Icon: Smartphone },
  { key: "card", label: "Card", Icon: CreditCard },
  { key: "netbanking", label: "Netbanking", Icon: Landmark },
  { key: "wallet", label: "Wallet", Icon: Wallet },
];

export function DemoCheckout({
  bookingNumber,
  bookingId,
  gatewayOrderId,
  amountPaise,
}: {
  bookingNumber: string;
  bookingId: string;
  gatewayOrderId: string | null;
  amountPaise: number;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("upi");
  const [reference, setReference] = useState(DEMO_UPI_SUCCESS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId, gatewayOrderId, method, reference }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "The demo gateway could not be reached.");
        setBusy(false);
        return;
      }
      // The webhook lands on its own connection; the booking page polls for it
      // rather than this screen pretending to know the outcome.
      router.push(`/booking/${bookingNumber}`);
    } catch {
      setError("Could not reach the demo gateway.");
      setBusy(false);
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-1.5">
        {METHODS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMethod(key);
              setReference(key === "upi" ? DEMO_UPI_SUCCESS : "");
            }}
            aria-pressed={method === key}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[13px] border py-3 cursor-pointer transition-colors",
              method === key
                ? "border-primary bg-selected-bg text-primary"
                : "border-border text-ink-muted hover:text-ink",
            )}
          >
            <Icon size={18} strokeWidth={2.2} />
            <span className="text-[11.5px] font-bold">{label}</span>
          </button>
        ))}
      </div>

      {method === "upi" && (
        <Field label="UPI ID" hint="Try success@upi or failure@upi." required>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="yourname@upi"
            autoComplete="off"
          />
        </Field>
      )}

      {method === "card" && (
        <>
          <Field label="Card number" hint={DEMO_CARD_HINT} required>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              inputMode="numeric"
              placeholder="4111 1111 1111 1111"
              autoComplete="off"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry">
              <Input placeholder="12/29" autoComplete="off" />
            </Field>
            <Field label="CVV">
              <Input placeholder="123" autoComplete="off" />
            </Field>
          </div>
          <div className="rounded-[13px] border border-border bg-bg p-3">
            <p className="text-[11.5px] font-extrabold tracking-[0.06em] text-ink-muted mb-2">
              DEMO TEST CARDS — TAP TO FILL
            </p>
            <div className="flex flex-col gap-1.5">
              {DEMO_CARDS.map((c) => (
                <button
                  key={c.number}
                  type="button"
                  onClick={() => setReference(c.number)}
                  className="flex items-center justify-between gap-3 text-left cursor-pointer rounded-[9px] px-2 py-1.5 hover:bg-surface"
                >
                  <span className="text-[12.5px] font-bold tabular">
                    {c.number}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-extrabold",
                      c.outcome === "success"
                        ? "text-status-success-fg"
                        : "text-danger-dark",
                    )}
                  >
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {(method === "netbanking" || method === "wallet") && (
        <Field
          label={method === "netbanking" ? "Bank" : "Wallet"}
          hint="Any value succeeds in the demo."
        >
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "netbanking" ? "HDFC Bank" : "Paytm"}
            autoComplete="off"
          />
        </Field>
      )}

      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      )}

      <Button size="lg" fullWidth onClick={pay} disabled={busy}>
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Contacting the bank…
          </span>
        ) : (
          `Pay ₹${(amountPaise / 100).toLocaleString("en-IN")}`
        )}
      </Button>

      <p className="text-[11.5px] text-ink-muted text-center leading-relaxed">
        Simulated gateway — no real money moves. The confirmation still arrives
        as a signed webhook, exactly as a live gateway would send it.
      </p>
    </div>
  );
}
