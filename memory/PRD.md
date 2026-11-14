# SIDRA — Private Jet Charter (Expo + FastAPI + MongoDB)

## Original problem statement
Build a mobile app: slick modern minimalist charter app for ad-hoc charter members, called SIDRA, using Bombardier Global, Challenger and Gulfstream fleets. New jet images on white backgrounds, flight maps, concierge. User logo mark used in silver with no background.

## User choices
Clean minimal jet illustrations (AI-generated, bundled) · AI concierge chat (Claude Sonnet 5.5, Emergent LLM key, SSE streaming) · Quote request (no payments) · Minimal SVG route map · USD.

## Implemented (2026-06)
- Fleet tab: 9 jets (Global 7500/6500/5500, Challenger 650/3500, G700/G650ER/G500/G280), filter chips, jet detail
- Charter tab: airport picker (30 airports), route arc map, live estimate (distance, time, fuel stops, price), one-way/return, dates, time window, guests, aircraft, member details, request quote
- Trips tab: quote list, trip detail with map, cancel request
- Concierge tab: streaming AI chat with persistent history, suggestions, clear
- Silver SIDRA mark: header, concierge hero, app icon & splash
- No login: member = device id stored locally

## Backlog
- P1: Member sign-in so trips follow members across devices
- P1: Admin/ops view to confirm quotes and send final prices
- P2: Empty-leg deals, deposit payments, membership tiers

## Iteration 2 (2026-06)
- 145 business-jet airports (OurAirports coordinates) incl. Las Vegas, Liverpool, Manchester, Milan Linate
- Real world map (Natural Earth land, pale silver on white) behind great-circle flight routes
- Emergent Google Sign-In; trips & concierge chats tied to member; pre-sign-in device data claimed
- Shareable itinerary image card (native share sheet; phone only)
- Team dashboard for ADMIN_EMAILS staff: filter, confirm with final price + message, mark unavailable; members see results

## Iteration 3 (2026-06)
- Team access: ADMIN_EMAILS = joshua@flysidra.com (+ test account)
- Branded emails via Emergent managed Resend (from name SIDRA, reply-to joshua@flysidra.com): quote request received, flight confirmed with final price & team message; email_status shown on team request screen

## Iteration 4 (2026-06)
- New request alerts: branded "New quote request" email to TEAM_ALERT_EMAILS (joshua@flysidra.com) on every member request
- Guest manifest: members add name, nationality, DOB, passport number & expiry per guest (up to pax); validated (DOB past, passport valid past trip end); team sees full manifest

## Iteration 5 (2026-06)
- Manifest reminder: backend sweep every 30 min emails members (once per trip) when departure (date + window hour, UTC) is within 72h, status Requested/Confirmed, and guests < pax; skips requests < 1h old. Field manifest_reminder_sent_at.

## Iteration 6 (2026-06)
- Testing mode: AUTO_CONFIRM_TESTING=true auto-confirms new requests at estimated price (+ confirmation email). Set false to restore team confirmation.
- Lead passenger (name, nationality, DOB, passport no. & expiry) required on the Charter booking form; stored as guest 1; shown on trip detail, manifest, team screens

## Iteration 7 (2026-06)
- XO style Book home tab (search widget, hero carousel, referral benefits card, popular routes), Fleet tab with search + Boeing filter, BBJ added with illustration, Charter moved to stack screen
- Corporate copy throughout (no hyphens), Manrope font
- Invite only access: code 2893159 then create account (email + password, JWT); Google sign in removed
- Stripe Checkout (card + Apple Pay) for confirmed charters, full price; needs STRIPE_API_KEY

## Iteration 8 (2026-06)
- Payment receipt email to member + payment alert to team, sent once when Stripe payment verified
- Saved travellers (auto saved from lead passenger + manifest), one tap pickers on Charter + Manifest, Profile > Saved travellers
- Client access codes: team issues codes per client, referral performance ranking (members, charters, confirmed, paid revenue), activate/deactivate
- BLOCKER: STRIPE_API_KEY is a publishable key (pk_test); needs secret key sk_test_ for payments

## Iteration 9 (2026-06)
- Company accounts: owner creates company (billing address, VAT), invites colleagues/assistants by email (existing users join; new emails auto join on sign up), shared bookings, remove members
- Branded PDF invoices (reportlab) with company billing details; signed link in receipt email + Download invoice on paid trips
- Change password in Profile; admin cannot edit paid charters; login screen fixed (no scroll)
- Admin account joshua@flysidra.com created with temporary password (change in Profile)

## Publish readiness review (Jun 2026)
- Deployment health check: pass with warnings. Lint is clean.
- Store review blockers: no in-app account deletion; no privacy policy link; no in-app AI disclosure for the concierge.
- Warnings: no in-app support contact.

## Admin trip editing (Jun 2026)
- Admin joshua@flysidra.com. Team can edit route/aircraft/dates/time/pax (/team/edit/[id]) and the manifest (/trip/guests/[id]?team=1). They can also record an offline payment (mark-paid sends a receipt and invoice).
- Changing route, aircraft or trip type on a confirmed, unpaid trip sends it back to Requested with no price.
- Login screen scrolls only while the keyboard is open or the form overflows a small screen.

## Jun 2026 updates
- Auto-confirm removed: bookings stay Requested until an admin confirms them with a price.
- Date of birth and passport expiry use a calendar picker, and nationality uses a searchable list (src/components/PickerFields.tsx).
- Open issues: STRIPE_API_KEY is publishable (pk_test), so checkout returns 503 and a secret key is needed (user skipped the request). The admin password on the live app is unresolved because the production DB is separate.
