import type { Metadata } from "next";
import { AccountPanel } from "@/components/marketplace/account-panel";
import { Button, Field, Input } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";
import { updateProfile } from "./actions";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null; // layout already renders the sign-in prompt

  return (
    <div className="flex flex-col gap-4">
      <AccountPanel
        title="Profile"
        description="Your number is verified and cannot be changed here — it is how tickets reach you and how you are identified at the gate."
      >
        <form action={updateProfile} className="flex flex-col gap-4 max-w-md">
          <Field label="Name" hint="Printed on your tickets">
            <Input name="name" defaultValue={user.name ?? ""} placeholder="Your name" />
          </Field>

          <Field label="Email" hint="For receipts and booking confirmations">
            <Input
              name="email"
              type="email"
              defaultValue={user.email ?? ""}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Mobile number">
            <Input value={`+${user.phone}`} readOnly disabled />
          </Field>

          <Button type="submit" className="self-start">
            Save changes
          </Button>
        </form>
      </AccountPanel>

      <AccountPanel
        title="Delete account"
        description="Removes your profile. Financial and audit records are retained as Indian tax rules require, no longer linked to your public profile."
      >
        <p className="text-[13px] text-body-soft leading-relaxed">
          You cannot delete while you hold tickets to an event that has not
          happened yet — cancel or transfer those first, so you are not left
          without entry to something you paid for.
        </p>
        <Button variant="danger" size="sm" className="mt-3" disabled>
          Delete account
        </Button>
      </AccountPanel>
    </div>
  );
}
