"use client";

/**
 * The last resort — an error thrown in the **root layout itself**.
 *
 * This boundary replaces the entire document, so it must render its own
 * `<html>` and `<body>`. That is also why it imports nothing: the root layout
 * has already failed, so the fonts, the theme variables and the component
 * library may all be part of why. Every style here is inline and every colour
 * is a literal — a boundary that depends on the thing that broke is not a
 * boundary.
 *
 * `error.tsx` next door handles the ordinary case and is what people will
 * actually see; this exists so the ordinary case failing is still a page and
 * not a blank tab.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "14px",
          padding: "48px 24px",
          textAlign: "center",
          background: "#f6f7fb",
          color: "#16264c",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <p
          style={{
            fontSize: "22px",
            fontWeight: 800,
            letterSpacing: "-0.4px",
            margin: 0,
          }}
        >
          Entry Now is having a moment
        </p>
        <p
          style={{
            fontSize: "14px",
            maxWidth: "420px",
            lineHeight: 1.55,
            margin: 0,
            color: "#47547a",
          }}
        >
          The page failed to load entirely. Nothing you had in progress was
          charged.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "8px",
            border: 0,
            borderRadius: "999px",
            padding: "12px 26px",
            fontSize: "14px",
            fontWeight: 800,
            color: "#ffffff",
            background: "#ed2c63",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        {error.digest && (
          <p style={{ fontSize: "11.5px", color: "#7b87a9", marginTop: "10px" }}>
            Reference {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
