import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

/** Toggle following an organizer. Returns the resulting state. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }

  const { organizerId } = (await request.json()) as { organizerId?: string };
  if (!organizerId) {
    return NextResponse.json({ error: "organizerId required" }, { status: 400 });
  }

  const organizer = await db.organizerProfile.findUnique({
    where: { id: organizerId },
    select: { id: true },
  });
  if (!organizer) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const existing = await db.follow.findUnique({
    where: { userId_organizerId: { userId: user.id, organizerId } },
  });

  // followerCount is denormalised for the profile header, so it moves with the
  // row in one transaction rather than being recounted on every render.
  const following = !existing;
  await db.$transaction(
    existing
      ? [
          db.follow.delete({
            where: { userId_organizerId: { userId: user.id, organizerId } },
          }),
          db.organizerProfile.update({
            where: { id: organizerId },
            data: { followerCount: { decrement: 1 } },
          }),
        ]
      : [
          db.follow.create({ data: { userId: user.id, organizerId } }),
          db.organizerProfile.update({
            where: { id: organizerId },
            data: { followerCount: { increment: 1 } },
          }),
        ],
  );

  return NextResponse.json({ following });
}
