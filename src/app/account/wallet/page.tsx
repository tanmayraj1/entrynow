import type { Metadata } from "next";
import { Wallet, Undo2 } from "lucide-react";
import { AccountPanel, PanelEmpty } from "@/components/marketplace/account-panel";
import { Money, Table, Td, Th, Tr } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatIstDate } from "@/lib/ist";

export const metadata: Metadata = { title: "Wallet & refunds" };

export default async function WalletPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [txns, refunds] = await Promise.all([
    db.walletTxn.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.refund.findMany({
      where: { booking: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { booking: { select: { bookingNumber: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <AccountPanel
        title="Wallet"
        description="Credit from refunds and referrals. Usable on any booking, up to the full amount. It cannot be withdrawn to a bank account."
      >
        <div className="bg-primary-tint rounded-[14px] px-5 py-4">
          <p className="text-[11.5px] font-extrabold text-primary-dark tracking-[0.06em]">
            AVAILABLE BALANCE
          </p>
          <Money
            paise={user.walletBalancePaise}
            className="text-[30px] font-extrabold text-primary-dark"
          />
        </div>

        <div className="mt-5">
          <h2 className="text-[14px] mb-2">Recent activity</h2>
          {txns.length === 0 ? (
            <PanelEmpty
              icon={Wallet}
              title="No wallet activity yet"
              body="Refund credits and referral rewards will show up here."
            />
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-border">
                  <Th>What</Th>
                  <Th>When</Th>
                  <Th numeric>Amount</Th>
                  <Th numeric>Balance</Th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <Tr key={t.id}>
                    <Td>{t.description}</Td>
                    <Td>{formatIstDate(t.createdAt)}</Td>
                    <Td numeric>
                      <span
                        className={
                          t.amountPaise >= 0 ? "text-primary" : "text-danger"
                        }
                      >
                        {t.amountPaise >= 0 ? "+ " : "− "}
                        <Money paise={Math.abs(t.amountPaise)} />
                      </span>
                    </Td>
                    <Td numeric>
                      <Money paise={t.balanceAfterPaise} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </AccountPanel>

      <AccountPanel
        title="Refunds"
        description="Refunds to your wallet are instant. Refunds to your original payment method follow your bank's timeline, usually 5–7 working days."
      >
        {refunds.length === 0 ? (
          <PanelEmpty
            icon={Undo2}
            title="No refunds"
            body="Cancel a booking and you can track its refund here, step by step."
          />
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-border">
                <Th>Booking</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.booking.bookingNumber}</Td>
                  <Td>{r.mode === "WALLET" ? "Wallet" : "Original method"}</Td>
                  <Td>{r.status}</Td>
                  <Td numeric>
                    <Money paise={r.amountPaise} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </AccountPanel>
    </div>
  );
}
