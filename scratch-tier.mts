import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0 && !(t.slice(0,i).trim() in process.env))
    process.env[t.slice(0,i).trim()] = t.slice(i+1).trim().replace(/^(['"])(.*)\1$/, "$2");
}
const { db } = await import("./src/lib/db");
const ev = await db.event.findFirstOrThrow({ where: { status: "LIVE" }, include: { tiers: true, sessions: { where: { isActive: true }, take: 1 } } });
console.log(`/booking/new?event=${ev.slug}&tiers=${ev.tiers[0].id}:1${ev.sessions[0] ? `&session=${ev.sessions[0].id}` : ""}`);
await db.$disconnect();
