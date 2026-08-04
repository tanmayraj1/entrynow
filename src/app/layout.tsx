import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Entry Now — Ahmedabad's festivals, one ticket away",
    template: "%s · Entry Now",
  },
  description:
    "Discover and book Garba, Navratri, Diwali, Holi and cultural events across India. Ahmedabad-first.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Booking and scanner use sticky bottom bars; letting the page zoom is fine,
  // locking it out is an accessibility failure.
  maximumScale: 5,
  themeColor: "#0D8A72",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // `data-theme` defaults to the marketplace palette. Each route group's own
  // layout overrides it on its wrapper element.
  return (
    <html
      lang="en"
      data-theme="market"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
