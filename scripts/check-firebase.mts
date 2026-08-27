/**
 * Is Firebase phone sign-in actually ready?
 *
 *     npx dotenv -e .env -- npx tsx scripts/check-firebase.mts
 *     CHECK_DOMAIN=entrynow.in npx tsx scripts/check-firebase.mts
 *
 * Every failure this catches is one that otherwise shows up as a user staring
 * at a sign-in form that does nothing:
 *
 *   - Phone provider left disabled — the SDK throws `auth/operation-not-allowed`
 *     in the browser, and the server never hears about it at all.
 *   - The domain missing from the authorised list — reCAPTCHA refuses, and the
 *     error surfaces as `auth/captcha-check-failed`, which reads like a bug in
 *     our code rather than a line missing from a console.
 *   - `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` disagreeing,
 *     which passes every local test and rejects every real token in production,
 *     because the server verifies the audience against a different project than
 *     the browser signed into.
 *
 * The config endpoint is public by design — a Firebase web API key identifies a
 * project, it does not authorise anything — so this needs no service account.
 */

const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const publicProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const serverProject = process.env.FIREBASE_PROJECT_ID;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const driver = process.env.PHONE_VERIFY_DRIVER ?? "otp";
const expectDomain = process.env.CHECK_DOMAIN ?? "entrynow.in";

let failed = 0;
const ok = (label: string, good: boolean, detail = "") => {
  if (!good) failed++;
  console.log(`  ${good ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

console.log(`\n── FIREBASE PHONE SIGN-IN ──`);
console.log(`  PHONE_VERIFY_DRIVER = ${driver}`);
if (driver !== "firebase") {
  console.log("  (the app is on server-issued OTP; this checks readiness only)\n");
}

ok("NEXT_PUBLIC_FIREBASE_API_KEY is set", Boolean(key));
ok("NEXT_PUBLIC_FIREBASE_PROJECT_ID is set", Boolean(publicProject));
ok("FIREBASE_PROJECT_ID is set", Boolean(serverProject));
ok("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is set", Boolean(authDomain));
ok(
  "the two project ids match",
  Boolean(serverProject) && serverProject === publicProject,
  serverProject === publicProject ? "" : `server=${serverProject} client=${publicProject}`,
);

if (!key || !serverProject) {
  console.log("\n  Set the four variables, then run this again.\n");
  process.exit(1);
}

const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(key)}`,
);
if (!res.ok) {
  const body = await res.text();
  ok("the API key is accepted by Firebase", false, `${res.status} ${body.slice(0, 140)}`);
  process.exit(1);
}

const cfg = (await res.json()) as {
  projectId?: string;
  authorizedDomains?: string[];
  signIn?: { phoneNumber?: { enabled?: boolean } };
};

ok("the API key is accepted by Firebase", true);
ok(
  "the key belongs to the project the server verifies against",
  cfg.projectId === serverProject,
  cfg.projectId === serverProject ? "" : `key is for ${cfg.projectId}`,
);
ok(
  "Phone is enabled as a sign-in provider",
  cfg.signIn?.phoneNumber?.enabled === true,
  cfg.signIn?.phoneNumber?.enabled ? "" : "Authentication > Sign-in method > Phone",
);

const domains = cfg.authorizedDomains ?? [];
ok(
  `${expectDomain} is an authorised domain`,
  domains.includes(expectDomain),
  domains.includes(expectDomain) ? "" : `has: ${domains.join(", ")}`,
);
ok(
  "localhost is an authorised domain (for development)",
  domains.includes("localhost"),
);

console.log(
  failed === 0
    ? `\n✅ READY — set PHONE_VERIFY_DRIVER=firebase and redeploy\n`
    : `\n❌ ${failed} thing${failed === 1 ? "" : "s"} to fix before switching the driver\n`,
);
process.exit(failed === 0 ? 0 : 1);
