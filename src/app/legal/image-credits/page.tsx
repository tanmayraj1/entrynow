import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketplace/legal-page";

export const metadata: Metadata = {
  title: "Image credits",
  description: "Photographers and licences for the photography used on Entry Now.",
};

interface Credit {
  file: string;
  title: string;
  artist: string;
  licence: string;
  source: string;
}

/**
 * Attribution for the event photography.
 *
 * This page is not optional politeness. Most of these images are CC BY or
 * CC BY-SA, which grant free commercial use **on condition of credit** — a
 * site that uses them without naming the photographer and the licence is
 * simply using them without a licence. Generated from the manifest that
 * `scripts/fetch-event-images.mts` writes, so it cannot drift from what is
 * actually on disk (D-026).
 */
export default function ImageCreditsPage() {
  const manifestPath = join(
    process.cwd(),
    "public",
    "images",
    "events",
    "credits.json",
  );
  const credits: Credit[] = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : [];

  return (
    <LegalPage
      title="Image credits"
      updated="4 August 2026"
      intro="Event photography on Entry Now comes from Wikimedia Commons under open licences. Each photograph below is credited to its author with the licence it was released under. Organizer-uploaded artwork is not listed here — that remains the organizer's own."
      sections={[
        {
          heading: "Photography",
          body:
            credits.length === 0 ? (
              <p>
                No sourced photography is currently in use. Run{" "}
                <code>npx tsx scripts/fetch-event-images.mts</code> to populate
                it.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {credits.map((c) => (
                  <li key={c.file}>
                    <a href={c.source} target="_blank" rel="noreferrer noopener">
                      {c.title}
                    </a>{" "}
                    — {c.artist} · {c.licence}
                  </li>
                ))}
              </ul>
            ),
        },
        {
          heading: "Everything else",
          body: (
            <p>
              The Entry Now logo, category glyphs, illustrations and ticket
              artwork are original to this product. They are not licensed for
              reuse.
            </p>
          ),
        },
      ]}
    />
  );
}
