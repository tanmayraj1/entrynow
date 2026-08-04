"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

export async function updateProfile(formData: FormData) {
  const user = await getSessionUser();
  if (!user) return;

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : null;

  await db.user.update({
    where: { id: user.id },
    data: {
      name: name || null,
      // Changing the address invalidates any prior verification of it.
      ...(email !== user.email ? { email, emailVerifiedAt: null } : {}),
    },
  });

  revalidatePath("/account");
}

export async function markAllNotificationsRead() {
  const user = await getSessionUser();
  if (!user) return;

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/account/notifications");
}
