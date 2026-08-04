import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { AccountPanel, PanelEmpty } from "@/components/marketplace/account-panel";
import { Button } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatIstDate, formatIstTime } from "@/lib/ist";
import { markAllNotificationsRead } from "../actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <AccountPanel
      title="Notifications"
      description="Booking confirmations, event reminders, and anything an organizer needs to tell you."
      action={
        unread > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read ({unread})
            </Button>
          </form>
        ) : undefined
      }
    >
      {notifications.length === 0 ? (
        <PanelEmpty
          icon={Bell}
          title="Nothing yet"
          body="Reminders arrive 24 hours and 2 hours before an event you've booked."
        />
      ) : (
        <ul className="flex flex-col">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={cn(
                "py-3.5 border-b border-divider last:border-0 flex gap-3",
                !n.readAt && "bg-selected-bg -mx-2 px-2 rounded-[10px]",
              )}
            >
              {!n.readAt && (
                <span
                  aria-label="Unread"
                  className="size-2 rounded-full bg-primary mt-1.5 shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="text-[13.5px] font-extrabold">{n.title}</p>
                <p className="text-[13px] text-body-soft mt-0.5 leading-relaxed">
                  {n.body}
                </p>
                <p className="text-[11px] text-ink-muted font-semibold mt-1">
                  {formatIstDate(n.createdAt)} · {formatIstTime(n.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AccountPanel>
  );
}
