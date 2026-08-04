import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/** Toggle an event on the signed-in user's wishlist. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }

  const { eventId } = (await request.json()) as { eventId?: string };
  if (!eventId) {
    return NextResponse.json({ error: "eventId required" }, { status: 400 });
  }

  const existing = await db.wishlistItem.findUnique({
    where: { userId_eventId: { userId: user.id, eventId } },
  });

  if (existing) {
    await db.wishlistItem.delete({
      where: { userId_eventId: { userId: user.id, eventId } },
    });
    return NextResponse.json({ wishlisted: false });
  }

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.wishlistItem.create({ data: { userId: user.id, eventId } });
  return NextResponse.json({ wishlisted: true });
}

/** The signed-in user's wishlisted event ids, for hydrating card hearts. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ eventIds: [] });

  const items = await db.wishlistItem.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  });
  return NextResponse.json({ eventIds: items.map((i) => i.eventId) });
}
