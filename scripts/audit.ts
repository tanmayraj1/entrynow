/**
 * Navigation & interaction audit.
 *
 *   npm run audit            static checks only
 *   npm run audit -- --http  also crawl the running dev server
 *
 * The loop's instrument: it turns "does the app actually work when you click
 * things" into a number that must go down. Findings are written to
 * audit-report.json so two runs can be diffed and a fixed issue cannot
 * silently regress.
 *
 * Deliberately dependency-free regex analysis rather than a TS AST walk. It is
 * a lint for a specific, well-known set of mistakes in this codebase, not a
 * general-purpose analyser — and it must stay fast enough to run every
 * iteration without thinking about it.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const BASE_URL = process.env.AUDIT_URL ?? "http://localhost:3000";
const WITH_HTTP = process.argv.includes("--http");

/**
 * `incomplete` is deliberately non-fatal: it means "this part of the system is
 * not built yet", which is the normal state mid-loop. Only `blocker` and
 * `broken` fail the exit code — those mean something that exists is wrong.
 */
type Severity = "blocker" | "broken" | "control" | "incomplete" | "polish";

type Check =
  | "A1" | "A2" | "A3" | "A4" | "A5" | "A6"
  | "A7" | "A8" | "A9" | "A10" | "A11"
  | "A12" | "A13" | "A14" | "A15" | "A16" | "A17";

interface Finding {
  check: Check;
  severity: Severity;
  file: string;
  line: number;
  detail: string;
}

const findings: Finding[] = [];
const add = (f: Finding) => findings.push(f);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Generated Prisma client is vendored output, not our source.
    if (entry === "generated" || entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const rel = (p: string) => relative(ROOT, p);
const lineOf = (src: string, index: number) =>
  src.slice(0, index).split("\n").length;

// ---------------------------------------------------------------------------
// Route table — derived from the App Router file tree
// ---------------------------------------------------------------------------

interface Route {
  /** URL pattern with dynamic segments, e.g. /[city]/events/[slug] */
  pattern: string;
  segments: string[];
  kind: "page" | "api";
}

function collectRoutes(dir: string, urlParts: string[] = [], out: Route[] = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      // (group) folders and @slots do not contribute a URL segment.
      const isGroup = entry.startsWith("(") || entry.startsWith("@");
      collectRoutes(p, isGroup ? urlParts : [...urlParts, entry], out);
    } else if (entry === "page.tsx" || entry === "route.ts") {
      const pattern = "/" + urlParts.join("/");
      out.push({
        pattern: pattern === "/" ? "/" : pattern,
        segments: urlParts,
        kind: entry === "route.ts" ? "api" : "page",
      });
    }
  }
  return out;
}

const routes = collectRoutes(APP);

/**
 * Top-level segments that are app surfaces, not cities.
 *
 * `/[city]` is a single dynamic segment, so it structurally "matches" any
 * one-segment path — `/tickets` included. Without this list the audit would
 * declare `/tickets` healthy while a user actually lands on a
 * city-not-found 404. Anything here must resolve to a *static* route.
 */
const RESERVED_TOP_LEVEL = new Set([
  "tickets",
  "account",
  "auth",
  "organizer",
  "admin",
  "scan",
  "booking",
  "legal",
  "api",
  "styleguide",
  "settings",
]);

/** Does a concrete path match any route, honouring dynamic segments? */
function routeExists(path: string): boolean {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const parts = clean === "/" ? [] : clean.slice(1).split("/");

  if (parts.length > 0 && RESERVED_TOP_LEVEL.has(parts[0])) {
    // Must match a route whose first segment is literally this word — matching
    // via [city] is the bug, not the fix.
    return routes.some(
      (r) =>
        r.segments.length === parts.length &&
        r.segments[0] === parts[0] &&
        r.segments.every(
          (seg, i) => seg.startsWith("[") || seg === parts[i],
        ),
    );
  }

  return routes.some((r) => {
    if (r.segments.length !== parts.length) return false;
    return r.segments.every((seg, i) => {
      if (seg.startsWith("[...") || seg.startsWith("[[...")) return true;
      if (seg.startsWith("[")) return true; // dynamic — matches anything
      return seg === parts[i];
    });
  });
}

/**
 * Normalise an href literal into a concrete probe path.
 * `/${citySlug}/events/${slug}` -> `/x/events/x`, so it can be matched against
 * the route table without knowing runtime values.
 */
function normalise(href: string): string | null {
  if (!href.startsWith("/")) return null; // external, anchor, mailto, tel
  return href
    .replace(/\$\{[^}]*\}/g, "x") // template holes
    .replace(/\/{2,}/g, "/");
}

// ---------------------------------------------------------------------------
// A1 — Link integrity
// ---------------------------------------------------------------------------

/** JSX attribute: href="/x" · href={`/x`} · href={"/x"} */
const HREF_ATTR_RE = /href=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
/** Object property: { href: "/x" } — how the nav, footer and tab-bar arrays
 *  declare their links. Missing this form hid most of the dead links. */
const HREF_PROP_RE = /\bhref:\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
const NAV_RE =
  /(?:router\.(?:push|replace)|redirect)\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");

  for (const re of [HREF_ATTR_RE, HREF_PROP_RE, NAV_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (!raw) continue;
      const path = normalise(raw);
      if (!path) continue;
      if (routeExists(path)) continue;
      add({
        check: "A1",
        // A dead link out of the booking flow blocks revenue; everything else
        // is "merely" broken navigation.
        severity: /booking|checkout/.test(path) ? "blocker" : "broken",
        file: rel(file),
        line: lineOf(src, m.index),
        detail: `dead link -> ${raw}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// A2 — Control wiring
// ---------------------------------------------------------------------------

/**
 * Slice out each `<tag ...>` opening tag with its attributes.
 *
 * Brace-aware on purpose: a naive `[^>]*` stops at the `>` inside
 * `onChange={(e) => …}` and silently truncates the attribute list, which made
 * the audit miss aria-labels that were plainly there.
 */
function openingTags(
  src: string,
  tag: string,
): { attrs: string; index: number }[] {
  const out: { attrs: string; index: number }[] = [];
  const re = new RegExp(`<${tag}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + tag.length + 1;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ attrs: src.slice(m.index, i), index: m.index });
  }
  return out;
}

for (const file of files) {
  const src = readFileSync(file, "utf8");
  // The style guide exists to render every variant; its buttons are samples.
  if (file.includes("styleguide")) continue;

  for (const { attrs, index } of openingTags(src, "button")) {
    const wired =
      /onClick|onSubmit|formAction|type=["']submit["']|\{\.\.\.props\}/.test(
        attrs,
      );
    if (!wired) {
      add({
        check: "A2",
        severity: "control",
        file: rel(file),
        line: lineOf(src, index),
        detail: "button has no onClick / type=submit / formAction",
      });
    }

    // An icon-only control needs an accessible name. A primitive that renders
    // {children} gets its name from the call site, so it is not the primitive's
    // failure — skip those or every generic Button/Chip reports forever.
    //
    // Scanned from the END of the opening tag, not from `<button`: the tag's
    // own className is a long quoted string, and including it made every
    // button in the codebase look like it had a text label.
    const body = src.slice(index + attrs.length, index + attrs.length + 800);
    const hasText =
      />\s*[A-Za-z0-9]/.test(body) ||
      /\{children\}/.test(body) ||
      // A label supplied entirely by an expression — `{p.name}`, or a ternary
      // of two string literals. Both are real labels; only a regex confuses
      // them with an icon.
      /\{[^}]*["'][A-Za-z0-9][^"']*["']/.test(body) ||
      /\{\s*[a-zA-Z_$][\w$.]*\s*\}/.test(body);
    const named = /aria-label|aria-labelledby|title=/.test(attrs);
    if (!named && !hasText) {
      add({
        check: "A2",
        severity: "polish",
        file: rel(file),
        line: lineOf(src, index),
        detail: "icon-only button has no accessible name",
      });
    }
  }

  // A <span>/<div> styled as clickable is not keyboard reachable. Ignore ones
  // that only inherit the cursor from an ancestor link.
  const fakeRe = /<(span|div)\b([^>]*cursor-pointer[^>]*)>/g;
  let f: RegExpExecArray | null;
  while ((f = fakeRe.exec(src))) {
    if (/onClick/.test(f[2])) {
      add({
        check: "A2",
        severity: "control",
        file: rel(file),
        line: lineOf(src, f.index),
        detail: `<${f[1]}> has onClick but is not a button — not keyboard reachable`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// A3 — Form integrity
// ---------------------------------------------------------------------------

for (const file of files) {
  // Comments are blanked (offsets preserved, so lineOf stays truthful). A doc
  // comment that says "keeps a real <input> in the DOM" is prose, not markup,
  // and was being reported as an unlabelled control on the components whose
  // whole job is to BE the labelled control.
  const src = stripComments(readFileSync(file, "utf8"));
  for (const tag of ["input", "select", "textarea"]) {
    for (const { attrs, index } of openingTags(src, tag)) {
      if (/type=["'](hidden|submit|range|checkbox|radio)["']/.test(attrs)) continue;
      if (/aria-label|aria-labelledby|id=/.test(attrs)) continue;
      // A <label> or <Field> wrapper counts; look back a little for one.
      const before = src.slice(Math.max(0, index - 400), index);
      if (/<label\b/.test(before) || /<Field\b/.test(before)) continue;
      add({
        check: "A3",
        severity: "polish",
        file: rel(file),
        line: lineOf(src, index),
        detail: "form control has no associated label",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// A6 — Model write coverage
//
// The read surface can look complete while the transactional core is missing.
// This check exists because a green A1–A5 once sat happily over 18 models that
// nothing in src/ ever wrote.
// ---------------------------------------------------------------------------

/** Models that are legitimately never written by application code, with the
 *  reason. Anything not listed here must eventually be written somewhere. */
const READ_ONLY_MODELS: Record<string, string> = {
  WebhookEvent: "written only by the gateway webhook handler's dedup INSERT",
};

const schemaSrc = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
const modelNames = [...schemaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
  (m) => m[1],
);

/** Prisma exposes `model Foo` as `db.foo`. */
const accessor = (model: string) => model[0].toLowerCase() + model.slice(1);

/** The Postgres table behind a model — its `@@map`, which every model here has. */
function tableNameOf(model: string): string | null {
  const block = new RegExp(
    `^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`,
    "m",
  ).exec(schemaSrc);
  if (!block) return null;
  return /@@map\("([^"]+)"\)/.exec(block[1])?.[1] ?? null;
}

const allSrc = files.map((f) => readFileSync(f, "utf8")).join("\n");

const unwrittenModels: string[] = [];
for (const model of modelNames) {
  if (model in READ_ONLY_MODELS) continue;
  const a = accessor(model);
  // db.foo.create / createMany / update / updateMany / upsert / delete /
  // deleteMany, plus raw SQL against the mapped table name.
  //
  // The raw-SQL half is not optional cleverness: the concurrency-critical
  // writes — tier inventory, the ticket claim, session scans, the webhook
  // dedup — CANNOT go through Prisma, because the fluent API has nowhere to
  // put the guard clause that makes them safe (see booking/inventory.ts).
  // Matching only `db.foo.` reported the safest code in the codebase as dead.
  const table = tableNameOf(model);
  const written =
    new RegExp(`\\bdb\\.${a}\\.(create|update|upsert|delete)`).test(allSrc) ||
    new RegExp(`\\btx\\.${a}\\.(create|update|upsert|delete)`).test(allSrc) ||
    (table !== null &&
      new RegExp(
        `(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${table}\\b`,
        "i",
      ).test(allSrc));
  if (!written) {
    unwrittenModels.push(model);
    add({
      check: "A6",
      severity: "incomplete",
      file: "prisma/schema.prisma",
      line: 0,
      detail: `model ${model} is never written by application code`,
    });
  }
}

// ---------------------------------------------------------------------------
// A7 — Invariant tests exist
// ---------------------------------------------------------------------------

const INVARIANT_TESTS: { id: string; file: string; why: string }[] = [
  {
    id: "I1",
    file: "tests/invariants/hold.test.ts",
    why: "concurrent hold — sold + held <= total",
  },
  {
    id: "I2",
    file: "tests/invariants/scan.test.ts",
    why: "concurrent scan — a ticket is claimed at most once",
  },
  {
    id: "I3",
    file: "src/lib/money.test.ts",
    why: "ledger sums to zero",
  },
];

for (const t of INVARIANT_TESTS) {
  if (!existsSync(join(ROOT, t.file))) {
    add({
      check: "A7",
      severity: "incomplete",
      file: t.file,
      line: 0,
      detail: `${t.id} has no test — ${t.why}`,
    });
  }
}

// ---------------------------------------------------------------------------
// A8 — Spec-clause coverage
// ---------------------------------------------------------------------------

interface Clause {
  id: string;
  part: string;
  kind: "invariant" | "behaviour" | "ui" | "data" | "job";
  rule: string;
  impl: string | null;
  test: string | null;
  /**
   * A decision id (e.g. "D-036") that deliberately relaxes this clause.
   *
   * Some clauses are overruled on purpose — the spec wins on conflict, but the
   * product owner outranks the spec, and Part J requires the call to be
   * written down. Without this field such a clause sits in the "not built yet"
   * bucket forever, which is a lie in the other direction: it reads as pending
   * work nobody has got to, when in fact it was decided against.
   *
   * The waiver is only accepted if the decision it names actually exists in
   * DECISIONS.md, so no clause can be waved away without a written rationale.
   */
  relaxed?: string;
}

const spec = JSON.parse(
  readFileSync(join(ROOT, "spec-coverage.json"), "utf8"),
) as { clauses: Clause[] };

/** Behaviour and invariants must be tested; UI, data and jobs need only an
 *  implementation to count. */
const needsTest = (c: Clause) =>
  c.kind === "invariant" || c.kind === "behaviour";

const isCovered = (c: Clause) =>
  Boolean(c.relaxed) || (Boolean(c.impl) && (!needsTest(c) || Boolean(c.test)));

const decisionsDoc = readFileSync(join(ROOT, "DECISIONS.md"), "utf8");

/** A reference that points at a file which no longer exists is worse than no
 *  reference — it reads as covered. */
for (const c of spec.clauses) {
  for (const ref of [c.impl, c.test]) {
    if (!ref) continue;
    const path = ref.split(":")[0];
    if (!existsSync(join(ROOT, path))) {
      add({
        check: "A8",
        severity: "broken",
        file: "spec-coverage.json",
        line: 0,
        detail: `${c.id} references a missing file: ${path}`,
      });
    }
  }
  if (c.relaxed && !decisionsDoc.includes(`## ${c.relaxed} `)) {
    add({
      check: "A8",
      severity: "broken",
      file: "spec-coverage.json",
      line: 0,
      detail: `${c.id} is relaxed by ${c.relaxed}, which is not in DECISIONS.md`,
    });
  }
  if (!isCovered(c)) {
    add({
      check: "A8",
      severity: "incomplete",
      file: `spec ${c.part}`,
      line: 0,
      detail: `${c.id} ${!c.impl ? "unimplemented" : "untested"} — ${c.rule.slice(0, 76)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// A9 — Scheduled job coverage (spec Part H)
// ---------------------------------------------------------------------------

const JOB_NAMES = [
  "hold-release",
  "payment-reconcile",
  "reminders",
  "ticket-expiry",
  "trending-recompute",
  "payout-run",
  "review-invites",
  "refund-retry",
  "kyc-reminders",
  "manifest-refresh",
  "digest",
];

const jobsDir = join(SRC, "lib", "jobs");
const jobsSrc = existsSync(jobsDir)
  ? walk(jobsDir)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";

for (const job of JOB_NAMES) {
  if (!jobsSrc.includes(job)) {
    add({
      check: "A9",
      severity: "incomplete",
      file: "src/lib/jobs",
      line: 0,
      detail: `job "${job}" is not registered`,
    });
  }
}

// ---------------------------------------------------------------------------
// A10 — Config and env liveness
//
// A key nobody reads is a promise the code does not keep. QR_JWT_SECRET is the
// cautionary example: documented as invalidating every ticket on rotation,
// while the QR carried a raw token.
// ---------------------------------------------------------------------------

const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");
const envKeys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);

// Application source, the seed, and the prisma config — deliberately NOT this
// file. Naming a key in the audit's own comments must not count as reading it,
// or the audit silences its own findings.
const envReaders =
  allSrc +
  readFileSync(join(ROOT, "prisma", "seed.ts"), "utf8") +
  readFileSync(join(ROOT, "prisma.config.ts"), "utf8");

for (const key of envKeys) {
  if (!envReaders.includes(key)) {
    add({
      check: "A10",
      severity: "incomplete",
      file: ".env.example",
      line: 0,
      detail: `env key ${key} is never read`,
    });
  }
}

const configSrc = readFileSync(join(SRC, "lib", "config.ts"), "utf8");
const configBlock =
  configSrc.split("DEFAULT_BUSINESS_CONFIG")[1]?.split("};")[0] ?? "";
const configKeys = [...configBlock.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

for (const key of configKeys) {
  // Reads outside config.ts itself. A key that only config.ts mentions is a
  // constant nothing consumes.
  const readElsewhere = files
    .filter((f) => !f.endsWith("lib/config.ts"))
    .some((f) => readFileSync(f, "utf8").includes(key));
  if (!readElsewhere) {
    add({
      check: "A10",
      severity: "incomplete",
      file: "src/lib/config.ts",
      line: 0,
      detail: `config key ${key} is never read`,
    });
  }
}

// ---------------------------------------------------------------------------
// A11 — Adapter completeness
// ---------------------------------------------------------------------------

// `PAYMENTS_DRIVER="sandbox"   # sandbox | razorpay` -> family + declared drivers
const driverDecls = [
  ...envExample.matchAll(/^([A-Z]+)_DRIVER="[^"]*"\s*#\s*(.+)$/gm),
].map((m) => ({
  family: m[1].toLowerCase(),
  drivers: m[2].split("|").map((d) => d.trim()).filter(Boolean),
}));

for (const decl of driverDecls) {
  const file = join(SRC, "lib", "adapters", `${decl.family}.ts`);
  if (!existsSync(file)) {
    add({
      check: "A11",
      severity: "incomplete",
      file: `src/lib/adapters/${decl.family}.ts`,
      line: 0,
      detail: `no adapter for ${decl.family} (declares: ${decl.drivers.join(", ")})`,
    });
    continue;
  }
  const src = readFileSync(file, "utf8");
  for (const driver of decl.drivers) {
    if (!src.includes(`"${driver}"`)) {
      add({
        check: "A11",
        severity: "incomplete",
        file: `src/lib/adapters/${decl.family}.ts`,
        line: 0,
        detail: `driver "${driver}" is declared in .env.example but not implemented`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// A4 / A5 — HTTP crawl (opt-in)
// ---------------------------------------------------------------------------

/** Concrete URLs to probe, with the status each is expected to return. */
const PROBES: { url: string; expect: number; note?: string }[] = [
  { url: "/", expect: 307, note: "redirects to default city" },
  { url: "/ahmedabad", expect: 200 },
  { url: "/ahmedabad/events", expect: 200 },
  { url: "/ahmedabad/events?view=list", expect: 200 },
  { url: "/ahmedabad/events?view=map", expect: 200 },
  { url: "/ahmedabad/events?near=1", expect: 200 },
  { url: "/ahmedabad/events?category=garba-navratri", expect: 200 },
  { url: "/ahmedabad/events?q=garba", expect: 200 },
  // `{event}` is resolved against the live listing when the crawl runs. It was
  // a hardcoded slug, which meant curating the catalogue — removing one demo
  // event — failed the route check for a reason that had nothing to do with
  // routing.
  { url: "/ahmedabad/events/{event}", expect: 200 },
  { url: "/ahmedabad/festivals", expect: 200 },
  { url: "/ahmedabad/festivals/navratri-2026", expect: 200 },
  { url: "/ahmedabad/organizers/rangmanch-events", expect: 200 },
  { url: "/auth", expect: 200 },
  { url: "/tickets", expect: 200 },
  { url: "/account", expect: 200 },
  { url: "/organizer", expect: 200 },
  { url: "/organizer/onboarding", expect: 200 },
  { url: "/organizer/pricing", expect: 200 },
  { url: "/legal/terms", expect: 200 },
  { url: "/legal/refunds", expect: 200 },
  { url: "/legal/privacy", expect: 200 },
  { url: "/api/search?city=ahmedabad&q=garba", expect: 200 },
  { url: "/styleguide", expect: 200 },
  // Deliberate negatives — these SHOULD fail, and the audit proves they do.
  { url: "/mars", expect: 404, note: "unknown city" },
  { url: "/ahmedabad/events/does-not-exist", expect: 404 },
];

/** Leaks that mean a value reached the page without passing through a formatter. */
const LEAKS: { re: RegExp; what: string }[] = [
  { re: />\s*undefined\s*</, what: "literal 'undefined'" },
  { re: />\s*NaN\s*</, what: "literal 'NaN'" },
  { re: /\[object Object\]/, what: "[object Object]" },
  { re: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, what: "raw ISO timestamp" },
  // A paise integer that escaped inr() — ₹ followed by 6+ digits and no comma.
  { re: /₹\d{6,}(?![\d,])/, what: "unformatted paise amount" },
];

/** The slug of any event currently on the listing, for the `{event}` probe. */
async function anyEventSlug(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/ahmedabad/events`);
    if (!res.ok) return null;
    const m = /\/ahmedabad\/events\/([a-z0-9-]+)/.exec(await res.text());
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function crawl() {
  const eventSlug = await anyEventSlug();

  for (let probe of PROBES) {
    if (probe.url.includes("{event}")) {
      if (!eventSlug) {
        add({
          check: "A4",
          severity: "broken",
          file: probe.url,
          line: 0,
          detail: "no event found on /ahmedabad/events to probe a detail page with",
        });
        continue;
      }
      probe = { ...probe, url: probe.url.replace("{event}", eventSlug) };
    }
    let res: Response;
    try {
      res = await fetch(BASE_URL + probe.url, { redirect: "manual" });
    } catch {
      add({
        check: "A4",
        severity: "blocker",
        file: probe.url,
        line: 0,
        detail: `request failed — is the dev server running at ${BASE_URL}?`,
      });
      continue;
    }

    if (res.status !== probe.expect) {
      add({
        check: "A4",
        severity: res.status >= 500 ? "blocker" : "broken",
        file: probe.url,
        line: 0,
        detail: `expected ${probe.expect}${probe.note ? ` (${probe.note})` : ""}, got ${res.status}`,
      });
      continue;
    }

    if (res.status === 200 && !probe.url.startsWith("/api")) {
      const raw = await res.text();
      // Strip <script> blocks first. The RSC flight payload legitimately
      // serialises Date objects as ISO strings and props as JSON; scanning it
      // would flag every page that passes a date to a client component.
      // Only what a user can actually read counts as a leak.
      const html = raw.replace(/<script\b[\s\S]*?<\/script>/g, "");
      for (const leak of LEAKS) {
        if (leak.re.test(html)) {
          add({
            check: "A5",
            severity: "broken",
            file: probe.url,
            line: 0,
            detail: `rendered ${leak.what}`,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A12 — Tenant scoping
//
// The organizer portal is multi-tenant, and the single worst bug it can have is
// organizer A reading or writing organizer B's rows. Isolation is a property of
// EVERY query, so it cannot be spot-checked in review — one forgotten
// `organizerId` in one `where` is the whole breach.
//
// These findings are `broken`, not `incomplete`: they mean code that exists is
// wrong, so they fail the build.
// ---------------------------------------------------------------------------

/** Models that belong to exactly one organizer. Global catalog (city, category,
 *  venue, festival, locality) is deliberately absent — those are shared. */
const TENANT_MODELS = [
  "event",
  "ticketTier",
  "eventSession",
  "gate",
  "eventImage",
  "eventFaq",
  "scheduleItem",
  "booking",
  "ticket",
  "payout",
  "payoutItem",
  "announcement",
  "staffAssignment",
  "promo",
];

const ORGANIZER_DIRS = [
  join(SRC, "lib", "queries", "organizer"),
  join(SRC, "lib", "organizer"),
];

/**
 * Blank out comments, preserving offsets so `lineOf` still reports truthfully.
 *
 * Needed because these checks look for identifiers, and this codebase's doc
 * comments *discuss* those identifiers by name — the comment explaining that
 * `organizerScope()` may only be called in one place would otherwise be
 * reported as a call to it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/**
 * Prisma write payloads — the `data:` object or array of every create/update/
 * upsert — brace-matched so a nested object does not end the slice early.
 *
 * `select:` and `where:` blocks are deliberately excluded: they read.
 */
function prismaDataPayloads(src: string): { body: string; index: number }[] {
  const out: { body: string; index: number }[] = [];
  // Also the scoped writers in `queries/organizer/scope.ts`, whose data
  // argument is a bare object literal with no `data:` key in front of it —
  // their `NoInventory<>` types already reject these columns at compile time,
  // and this keeps the grep from disagreeing with the compiler.
  const re = /(?:\bdata:\s*|updateOwned(?:Event|Tier|Session)\([^)]*?,\s*)[[{]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const closer = src[open] === "{" ? "}" : "]";
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (src[i] !== closer && depth !== 0) continue;
    out.push({ body: src.slice(open, i + 1), index: open });
  }
  return out;
}

/** Bodies of the top-level `export function`s in a file, brace-matched. */
function exportedFunctionBodies(
  src: string,
): { name: string; body: string; index: number }[] {
  const out: { name: string; body: string; index: number }[] = [];
  const re = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = src.indexOf("{", m.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    out.push({ name: m[1], body: src.slice(open, i + 1), index: m.index });
  }
  return out;
}

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // Identifier checks run against code only — see stripComments above.
  const src = stripComments(raw);
  const inOrganizerLib = ORGANIZER_DIRS.some((d) => file.startsWith(d));

  // 12a — the brand may only be minted in the guards. Anywhere else means an
  // id from a request is being laundered into a "trusted" type.
  //
  // `(?<!function )` excludes the declaration in scope.ts itself — otherwise
  // the check flags the very file it is protecting.
  const mint = /(?<!function )\borganizerScope\s*\(/.exec(src);
  if (mint && !file.endsWith("auth/rbac.ts")) {
    add({
      check: "A12",
      severity: "broken",
      file: rel(file),
      line: lineOf(src, mint.index),
      detail:
        "organizerScope() may only be called in src/lib/auth/rbac.ts — " +
        "minting the brand elsewhere defeats tenant isolation",
    });
  }
  if (/as\s+(?:unknown\s+as\s+)?OrganizerId\b/.test(src) && !file.endsWith("organizer/scope.ts")) {
    add({
      check: "A12",
      severity: "broken",
      file: rel(file),
      line: lineOf(src, src.search(/as\s+(?:unknown\s+as\s+)?OrganizerId\b/)),
      detail: "casting to OrganizerId bypasses the session-derived brand",
    });
  }

  // 12b — every Prisma-touching export in the scoped layer must actually
  // filter by the organizer. Gated on the body touching Prisma at all, so pure
  // helpers and formatters are not flagged.
  if (inOrganizerLib) {
    for (const fn of exportedFunctionBodies(src)) {
      if (!/\b(db|tx)\./.test(fn.body)) continue;
      // An explicit, written justification is the only way out.
      if (/tenant-ok:/.test(fn.body)) continue;
      const scoped =
        /organizerId/.test(fn.body) || /organizer:\s*\{/.test(fn.body);
      if (!scoped) {
        add({
          check: "A12",
          severity: "broken",
          file: rel(file),
          line: lineOf(src, fn.index),
          detail: `${fn.name}() queries the database without an organizerId filter`,
        });
      }
    }

    // 12c — `update`/`delete`/`findUnique` take a UNIQUE where, which has
    // nowhere to put the ownership filter. The plural forms accept an
    // arbitrary filter and return a count, which is the check we need.
    // The trailing `\(` matters: without it this also matches updateMany.
    const single = new RegExp(
      `\\b(?:db|tx)\\.(${TENANT_MODELS.join("|")})\\.(update|delete|findUnique)\\(`,
      "g",
    );
    let s: RegExpExecArray | null;
    while ((s = single.exec(src))) {
      add({
        check: "A12",
        severity: "broken",
        file: rel(file),
        line: lineOf(src, s.index),
        detail:
          `${s[1]}.${s[2]}() cannot express an ownership filter — use ` +
          `${s[2]}Many/findFirst with organizerId in the where`,
      });
    }
  }

  // 12d — catalog rows deactivate, never delete: events reference them (G2).
  const catalogDelete = /\b(?:db|tx)\.(city|locality|category|festival)\.delete/.exec(src);
  if (catalogDelete) {
    add({
      check: "A12",
      severity: "broken",
      file: rel(file),
      line: lineOf(src, catalogDelete.index),
      detail: `${catalogDelete[1]} must deactivate, never delete — events reference it (spec G2)`,
    });
  }
}

// ---------------------------------------------------------------------------
// A13 — Audit coverage
//
// Invariant I6: every admin or organizer mutation writes an AuditLog row with
// before/after JSON. Without a check this is a rule people mean to follow.
// ---------------------------------------------------------------------------

const PORTAL_ACTION_DIRS = [
  join(APP, "organizer"),
  join(APP, "admin"),
];

for (const file of files) {
  const src = readFileSync(file, "utf8");

  // 13a — a portal server action that mutates must audit.
  const isPortalAction =
    PORTAL_ACTION_DIRS.some((d) => file.startsWith(d)) &&
    /^\s*["']use server["']/m.test(src);
  if (isPortalAction) {
    const mutates = /\b(?:db|tx)\.\w+\.(create|update|upsert|delete)/.test(src);
    if (mutates && !/writeAudit\s*\(/.test(src)) {
      add({
        check: "A13",
        severity: "broken",
        file: rel(file),
        line: 1,
        detail:
          "portal server action mutates without writeAudit() — invariant I6 " +
          "requires an audit row per admin/organizer mutation",
      });
    }
    // 13b — the audit row must share the mutation's transaction, or a
    // rollback leaves a record of something that never happened.
    if (/writeAudit\s*\(\s*db\b/.test(src)) {
      add({
        check: "A13",
        severity: "broken",
        file: rel(file),
        line: lineOf(src, src.search(/writeAudit\s*\(\s*db\b/)),
        detail: "writeAudit(db, …) must be writeAudit(tx, …) — inside the transaction",
      });
    }
  }

  // 13c — inventory columns move ONLY through the guarded raw SQL (I1). The
  // likeliest new bug is a tier edit form that round-trips the whole row.
  //
  // Scoped to Prisma `data:` payloads rather than the whole file, because
  // READING these columns is normal and necessary — the live gate board and
  // the capacity error message both need `quantitySold`. Flagging a `select:`
  // trained people to work around the check, which is worse than not having
  // it. A write is what breaks I1, so a write is what this matches.
  if (!file.endsWith("booking/inventory.ts")) {
    for (const payload of prismaDataPayloads(src)) {
      const inv = /(quantitySold|quantityHeld|ticketSeq)\s*:/.exec(payload.body);
      if (!inv) continue;
      add({
        check: "A13",
        severity: "broken",
        file: rel(file),
        line: lineOf(src, payload.index + inv.index),
        detail:
          `${inv[1]} is written in a Prisma data: block — it may only move ` +
          `through the guarded SQL in src/lib/booking/inventory.ts (invariant I1)`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// A14–A17 — Multi-country guardrails
//
// Added BEFORE the migration that makes them pass, on purpose. Each one is the
// machine-checked definition of done for a later stage, so "we finished the
// currency work" stops being a judgement call.
//
// They ship at `incomplete`, which is non-fatal. A14 has ~21 real violations on
// day one and a red build on the first commit of a multi-week migration is how
// a team learns to ignore its own harness. **Each check is promoted to `broken`
// in the stage that makes it green** — that is what locks the gain in and stops
// the next contributor quietly reintroducing a rupee sign.
// ---------------------------------------------------------------------------

/** Where a hardcoded locale, currency symbol or IANA zone is legitimate. */
const I18N_ALLOWLIST = [
  join(SRC, "lib", "money.ts"),
  join(SRC, "lib", "ist.ts"),
  join(SRC, "lib", "countries.ts"),
  join(SRC, "components", "ui", "money.tsx"),
  // Renders outside the root layout, so no CSS vars and no app helpers exist.
  join(SRC, "app", "global-error.tsx"),
];

const inAllowlist = (p: string) => I18N_ALLOWLIST.some((a) => p === a);

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = stripComments(raw);
  const path = rel(file);

  // --- A14: currency and locale only at the formatting boundary ------------
  if (!inAllowlist(file)) {
    for (const m of src.matchAll(/₹/g)) {
      add({
        check: "A14",
        severity: "incomplete",
        file: path,
        line: lineOf(src, m.index),
        detail:
          "hardcoded ₹ — money must render through <Money currency=…> so a " +
          "CAD event does not display rupees",
      });
    }
    for (const m of src.matchAll(/["'`]en-IN["'`]/g)) {
      add({
        check: "A14",
        severity: "incomplete",
        file: path,
        line: lineOf(src, m.index),
        detail:
          "hardcoded en-IN — locale follows the content's country (lakh " +
          "grouping is correct for INR and wrong for CAD)",
      });
    }
  }

  // --- A15: one place may name a timezone ----------------------------------
  if (!inAllowlist(file)) {
    for (const m of src.matchAll(/Asia\/Kolkata/g)) {
      add({
        check: "A15",
        severity: "incomplete",
        file: path,
        line: lineOf(src, m.index),
        detail:
          "hardcoded Asia/Kolkata — the zone belongs to the event's city, " +
          "not to the code reading it",
      });
    }
  }

  // --- A17: exact fractions, never truncating differences (D-013) ----------
  for (const m of src.matchAll(/\bdifferenceIn(Hours|Days|Minutes)\b/g)) {
    add({
      check: "A17",
      severity: "incomplete",
      file: path,
      line: lineOf(src, m.index),
      detail:
        `${m[0]} truncates toward zero — a cancellation 6h30m out reads as 6h ` +
        "and silently fails a `> 6` check against the attendee (D-013)",
    });
  }
}

// --- A16: the gate may not do calendar arithmetic ---------------------------
//
// D-012 in executable form. `isSessionScannable` is an *instant* comparison and
// must stay one: a Garba night running 8PM–1AM belongs to its start date but
// stays scannable until it ends, so the moment the scan path starts comparing
// date keys it stops admitting people after midnight. The rule used to live in
// a comment inside `ist.ts` — a file the time migration deletes.
// Two different hazards, so two different messages. A calendar *decision* in
// the scan path breaks D-012 outright. A calendar *display* is milder but still
// wrong once events are not all in one zone — staff at a Toronto gate reading
// an IST time is a queue arguing at the door.
const ZONED_DECISION = [
  "istDateKey", "istStartOfDay", "istEndOfDay", "isSameIstDay", "isTodayIst",
  "sessionDateKey", "isSessionToday",
  "dateKey", "startOfDayIn", "endOfDayIn", "isTodayIn",
];
const ZONED_DISPLAY = [
  "formatIstDate", "formatIstTime", "formatIstShortDate", "formatIstDateRange",
  "formatDate", "formatTime",
];
const ZONED_SYMBOLS = [...ZONED_DECISION, ...ZONED_DISPLAY];

const SCAN_DIRS = [
  join(SRC, "lib", "scan"),
  join(SRC, "app", "scan"),
  join(SRC, "app", "api", "scan"),
];

for (const file of files) {
  if (!SCAN_DIRS.some((d) => file.startsWith(d))) continue;
  const src = stripComments(readFileSync(file, "utf8"));
  // Only the import statement matters — a local variable named `dateKey` is
  // not the hazard.
  for (const imp of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*(?:ist|time)["']/g)) {
    for (const name of imp[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0])) {
      if (!ZONED_SYMBOLS.includes(name)) continue;
      add({
        check: "A16",
        severity: "incomplete",
        file: rel(file),
        line: lineOf(src, imp.index),
        detail: ZONED_DECISION.includes(name)
          ? `the scan path imports ${name} — gate validity is an instant ` +
            "comparison, never a date-key comparison, or a session running " +
            "past midnight stops admitting (D-012)"
          : `the scan path imports ${name}, which formats in one fixed zone — ` +
            "it must use the event's city zone, or staff at a Toronto gate " +
            "read an IST time",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const CHECK_NAMES: Record<Check, string> = {
  A1: "Link integrity",
  A2: "Control wiring",
  A3: "Form integrity",
  A4: "Route health",
  A5: "Content sanity",
  A6: "Model coverage",
  A7: "Invariant tests",
  A8: "Spec coverage",
  A9: "Job coverage",
  A10: "Config liveness",
  A11: "Adapters",
  A12: "Tenant scoping",
  A13: "Audit coverage",
  A14: "Currency & locale",
  A15: "Timezone literals",
  A16: "Gate calendar ban",
  A17: "Exact time deltas",
};

const ALL_CHECKS = Object.keys(CHECK_NAMES) as Check[];

const SEV_ORDER: Severity[] = [
  "blocker",
  "broken",
  "control",
  "incomplete",
  "polish",
];

async function main() {
  if (WITH_HTTP) await crawl();

  const bySeverity = Object.fromEntries(
    SEV_ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length]),
  ) as Record<Severity, number>;

  console.log("\n\x1b[1mEntry Now — navigation & interaction audit\x1b[0m");
  console.log(
    `${routes.length} routes · ${files.length} source files · HTTP crawl ${WITH_HTTP ? "on" : "off (pass --http)"}\n`,
  );

  for (const check of ALL_CHECKS) {
    const hits = findings.filter((f) => f.check === check);
    if (!WITH_HTTP && (check === "A4" || check === "A5")) {
      console.log(
        `  ${check.padEnd(3)} ${CHECK_NAMES[check].padEnd(17)} \x1b[2mskipped\x1b[0m`,
      );
      continue;
    }
    // A check with only `incomplete` findings is not failing — it is unbuilt.
    const fatal = hits.filter(
      (h) => h.severity !== "incomplete" && h.severity !== "polish",
    ).length;
    const mark =
      hits.length === 0
        ? "\x1b[32mPASS\x1b[0m"
        : fatal > 0
          ? "\x1b[31mFAIL\x1b[0m"
          : "\x1b[33mTODO\x1b[0m";
    console.log(
      `  ${check.padEnd(3)} ${CHECK_NAMES[check].padEnd(17)} ${mark}  ${hits.length === 0 ? "" : `${hits.length}`}`,
    );
  }

  // --- Completion meter ---------------------------------------------------
  const covered = spec.clauses.filter(isCovered).length;
  const relaxedCount = spec.clauses.filter((c) => c.relaxed).length;
  const pct = Math.round((covered / spec.clauses.length) * 100);
  const writtenModels = modelNames.length - unwrittenModels.length;
  const bar =
    "█".repeat(Math.round(pct / 4)) + "░".repeat(25 - Math.round(pct / 4));

  console.log(
    `\n  \x1b[1mCompletion\x1b[0m  ${bar}  \x1b[1m${pct}%\x1b[0m` +
      `   spec ${covered}/${spec.clauses.length} · models written ${writtenModels}/${modelNames.length}` +
      (relaxedCount ? ` · ${relaxedCount} relaxed by decision` : ""),
  );

  if (findings.length > 0) {
    console.log("");
    for (const sev of SEV_ORDER) {
      const hits = findings.filter((f) => f.severity === sev);
      if (hits.length === 0) continue;
      console.log(`\x1b[1m  ${sev.toUpperCase()} (${hits.length})\x1b[0m`);
      for (const f of hits.slice(0, 30)) {
        const loc = f.line ? `${f.file}:${f.line}` : f.file;
        console.log(`    ${f.check}  ${loc}  \x1b[2m${f.detail}\x1b[0m`);
      }
      if (hits.length > 30) console.log(`    … and ${hits.length - 30} more`);
      console.log("");
    }
  }

  const total = findings.length;
  const fatalTotal = bySeverity.blocker + bySeverity.broken;

  console.log(
    total === 0
      ? "\x1b[32m✔ audit green\x1b[0m\n"
      : `${fatalTotal > 0 ? "\x1b[31m✖" : "\x1b[33m•"} ${total} finding${total === 1 ? "" : "s"}\x1b[0m  ` +
          SEV_ORDER.filter((s) => bySeverity[s])
            .map((s) => `${bySeverity[s]} ${s}`)
            .join(" · ") +
          (fatalTotal === 0 ? "  \x1b[2m(none fatal)\x1b[0m" : "") +
          "\n",
  );

  writeFileSync(
    join(ROOT, "audit-report.json"),
    JSON.stringify(
      {
        routes: routes.map((r) => r.pattern).sort(),
        completion: {
          pct,
          specCovered: covered,
          specTotal: spec.clauses.length,
          modelsWritten: writtenModels,
          modelsTotal: modelNames.length,
          unwrittenModels,
        },
        counts: { total, ...bySeverity },
        findings,
      },
      null,
      2,
    ),
  );

  // Only blockers and broken navigation fail the build; control/polish are
  // tracked but must not stop an iteration mid-flight.
  const fatal = bySeverity.blocker + bySeverity.broken;
  process.exit(fatal > 0 ? 1 : 0);
}

main();
