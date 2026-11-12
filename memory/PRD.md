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
