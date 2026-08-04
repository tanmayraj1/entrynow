# Handoff: Shiv Events — Communal Event Ticketing Marketplace (India)

## Overview
Shiv Events is a BookMyShow-style web marketplace for discovering and booking communal/cultural events across India, launching Ahmedabad-first. Three portals + one utility in one responsive web app:
1. **Public Marketplace** (teal) — discover, filter, book, hold tickets
2. **Organizer Portal** (lavender/pink "back-office" mode) — create events, track sales, payouts
3. **Super Admin Portal** (lavender + dark navy sidebar) — approvals, KYC, CMS
4. **Gate Scanner** (dark mobile-web PWA) — QR entry validation at the venue

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component .dc.html prototypes). They show intended look and behavior — they are NOT production code to copy directly. Your task is to **recreate these designs in the target codebase's environment** (React/Next.js, Vue, etc.) using its established patterns. If no codebase exists yet, a sensible default: Next.js + Tailwind + a component library you can theme (the design uses two coordinated palettes, so pick a system that supports theming per app-section).

Each .dc.html file contains a plain-HTML template (inside <x-dc>) with ALL styling inline, plus a small JS class with the demo state/interactions. Read the inline styles as the spec — every color, radius, padding is literal in the markup.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy and interaction states are final intent. Recreate pixel-faithfully; substitute the photo placeholders (image-slot elements / gradient blocks) with real festival photography.

## Design Tokens

### Marketplace ("shopper mode" — teal)
- primary: #0D8A72 · primary-dark (hover): #0A6B59 · primary-tint: #E6F4F1 · selected-bg: #F0F9F6
- ink (headings/body): #16302B · ink-muted: #5C6B68 · body-soft: #3C4E4A
- bg: #F7FAF9 · surface: #FFFFFF · border: #E3EBE8 · border-strong: #C8D6D1 · divider: #EDF1EF
- accent-gold: #F5B301 (date badges, stars) · accent-red: #F04438 / dark #B42318 (hearts, cancel, urgency) · red-tint: #FDEBEA
- Festival gradients allowed ONLY on promo banners/event image placeholders, never core UI. Examples used: Navratri linear-gradient(115deg,#F97316,#E9358F); Diwali (#4C1D95,#F5B301); Holi (#0D8A72,#E9358F,#F5B301).

### Dashboards ("business mode" — Ventixe-style)
- canvas: #EEEDFB · sidebar: #E9E7FA (organizer) / #1E2249 dark (admin) · card: #FFFFFF
- primary-pink: #E935C1 · pink-hover: #C41FA2 · pink-tint: #FDEBF7
- navy ink: #1E2249 · navy accent: #37437D · muted: #8A8FB5 / #5A5F87 · border: #E4E2F5 / row divider #F4F3FB
- status: Confirmed #FDEBF7/#C41FA2 · Pending #EEEDFB/#37437D · Cancelled #F1F1F4/#7A7F9E · success #E8F6EE/#0B8A55 · warning #FBF4E6/#92400E · danger #FDEBEA/#B42318

### Scanner (dark)
- bg: #0B1512 · card: #122019 · border: #1E332A · accent: #2BD4A7 · warn: #F5C94A · error: #FF6B5E/#E5483C
- Result flashes: valid rgba(11,138,85,.94) · duplicate rgba(180,120,10,.95) · invalid rgba(190,40,30,.95)

### Shared
- Font: 'Plus Jakarta Sans' (Google Fonts), weights 400–800. Headings 800, sentence case.
- Radii: cards 16–22px · inputs 11–13px · buttons/chips 999px (pill) · thumbs 8–14px
- Shadows: card hover 0 16px 40px rgba(22,48,43,.14) · CTA 0 8px 20px rgba(13,138,114,.35) · modal 0 24px 60px rgba(22,48,43,.35)
- Currency: ₹ with Indian digit grouping — use toLocaleString('en-IN') (₹1,00,000). Tabular numerals in tables.
- Type scale (desktop): page title 24px/800 · section 22–24px · card title 15–16.5px · body 13–14px · meta 11–12.5px. Minimum hit target 44px on mobile.
- Multilingual: leave ~15% width headroom for Devanagari/Gujarati strings.

## Files & Screens

| File | Screens inside | Notes |
|---|---|---|
| Shiv-Events-Home.dc.html | Homepage; city-picker modal; search-suggestions overlay | Hero search (What/Where/When), category rail, festival calendar strip, featured tabs (All/Weekend/Big/Small), offers, organizers, how-it-works, stats band, FAQ, footer |
| Shiv-Events-Listing.dc.html | Search results: Grid / List / Map views + full filter sidebar | Working filters (category, price slider, size, language, locality, near-me radius, verified). Map = teal price pins + popover card + radius circle. Deep links: ?view=map, ?near=1 |
| Shiv-Events-Event.dc.html | Event details | Gallery, 9-night day picker, zone plan (concentric garba rings + legend), tier steppers w/ live total, venue map modal (car/metro/bus/auto), schedule, prohibited grid, T&C, reviews, similar rail, sticky book bar |
| Shiv-Events-Booking.dc.html | 4-step checkout: Select → Attendees → Payment → Confirmation | 8-min hold countdown; UPI-first methods; promo code (RAAS26 = −₹250); fee math: fee = 3.5% of discounted subtotal, GST = 18% of fee; simulated payment failure → retry; confirmation w/ confetti + QR ticket cards |
| Shiv-Events-Tickets.dc.html | My Tickets + e-voucher detail; cancel modal; refund stepper | Tabs Upcoming/Past/Cancelled; QR states: ACTIVE / SCANNED (greyed + "Scanned at 7:42 PM · Gate 2") / EXPIRED / CANCELLED |
| Shiv-Events-Auth.dc.html | Phone login → OTP → Pick interests → Follow organizers | OTP resend countdown; chip multiselect; follow toggles |
| Shiv-Events-Account.dc.html | Account hub: Profile, Wallet & refunds, Coupons, Notifications, Wishlist, Invite friends, Help center | Left-menu master-detail, all sections switchable |
| Shiv-Events-Organizer-Profile.dc.html | Public organizer profile | Banner, verified seal, follow, stats, Upcoming/Past/Reviews tabs, rating breakdown, organizer replies |
| Shiv-Events-Festival.dc.html | Festival SEO landing ("Navratri in Ahmedabad") | Night navigator (9 chips), vibe grid, top events, first-timer guide, FAQs |
| Shiv-Events-Organizer.dc.html | Organizer portal: Dashboard, Performance (live), Create Event, Bookings, Financials | Sidebar view-switching. Performance = live scanned-vs-expected, per-gate throughput, scans/half-hour, tier sell-through |
| Shiv-Events-Organizer-Onboarding.dc.html | KYC wizard: Business → KYC docs → Bank (penny-drop) → Plan & fee (Basic ₹10k / Pro ₹25k + 18% GST) → Under review | |
| Shiv-Events-Admin.dc.html | Admin: Dashboard, Approval queue (approve / reject-with-reason modal), Organizers (KYC/suspend/freeze), Promotions/CMS | CMS = per-city banner manager (drag order, Live/Scheduled/Draft), featured curation (pinned), festival calendar editor |
| Shiv-Events-Scanner.dc.html | Gate scanner (430px dark mobile) | Viewfinder + animated scan line; VALID/ALREADY-SCANNED/INVALID full-screen flashes (2s auto-dismiss); live counters; manual booking-ID fallback; offline banner ("syncing 12 pending scans") |
| Shiv-Events-Mobile.dc.html | 390px reference: Home, Event Details, Booking + written responsive rules | THE responsive spec — read the notes panel |
| Shiv-Events-404.dc.html | 404 / empty state | |
| image-slot.js | Drag-drop image placeholder web component used by the prototypes | Replace with real <img> in production |

## Key Interactions & Behavior
- **Card hover**: translateY(-4px) + shadow, 180ms. Buttons darken to the hover color above.
- **Booking hold**: 8:00 countdown chip (red tint) ticks during steps 1–3; release hold on expiry.
- **Payment**: methods = UPI (VPA field + collect request), Card, Netbanking, Wallet. Failure state shows red banner + Retry; success advances to confirmation with a small falling-confetti burst (festival colors) and pop-in check (spring, ~500ms).
- **QR lifecycle**: one scan only → state ACTIVE→SCANNED; scanned QR renders at 18% opacity with overlay pill. Wristband note shown to user.
- **Scanner**: result flash auto-dismisses after 2s back to viewfinder; counters increment; offline mode queues scans.
- **Filters**: all client-side facets combine with AND; Reset restores defaults; result count updates live.
- **Deep links**: listing accepts ?view=map and ?near=1 (used by "Near Me" chips).
- **Approvals (admin)**: Approve removes card; Reject opens reason modal (reason is sent to organizer and shown on their draft).
- Respect prefers-reduced-motion: disable confetti, scan-line and hover-lift animations.

## State Management (per screen, minimal)
- Listing: view (grid|list|map), facet selections, price max, radius, activePin
- Event: selectedDay (0–8), qty per tier, modals (map, T&C)
- Booking: step (1–4), qty, method, promoApplied, paying|failed, holdSeconds
- Tickets: tab, selectedTicket, cancelModal
- Organizer/Admin portals: activeView (sidebar), plus per-view table filters
- Auth: step (phone|otp|interests|organizers), picked[], followed[]

## Data & Content Rules
- All content is Indian communal events (Garba/Navratri, Diwali melas, Holi, Uttarayan, food fests, comedy, concerts) with real Ahmedabad localities (Vastrapur, Bopal, Thaltej, SG Highway, Navrangpura, Maninagar) and plausible Gujarati titles ("Rangilo Re Garba Mahotsav 2026").
- Prices in ₹ (en-IN grouping); languages EN/हिंदी/ગુજરાતી in the switcher.
- Commission model shown: Pro 6% / Basic 8% + 18% GST on commission; weekly Friday settlements.

## Assets
- No binary assets. Photo areas are <image-slot> drop-targets or CSS gradients — replace with licensed festival photography (warm grade to complement teal). Icons are inline SVG (lucide-style, stroke 2–2.4, currentColor) — swap for your icon library 1:1.
- Logo: teal rounded square "S" + lowercase wordmark "shiv events" + gold period.

## Screens NOT designed (build from established patterns)
My Events list, Invoices split view, Inbox, Calendar, Reviews mgmt, Announcements composer, Gallery (organizer); Users, Global bookings, Commission config, Refunds/disputes, CRUD screens, Audit logs, Roles (admin); ticket-transfer modal; legal pages. All follow the table/form/modal patterns in Bookings, Organizers and the CMS view.
