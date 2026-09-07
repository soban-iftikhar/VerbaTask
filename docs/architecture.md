# VerbaTask — architecture brief for Claude Code

Use this document to scaffold the VerbaTask repository: create the folder
structure below, and inside **every folder**, create a `README.md` containing
just the 1-2 line description given for that folder (nothing more — keep
those short).

## Project summary

VerbaTask is a WhatsApp-first, no-code automation bot for small Pakistani
merchants. A single shared WhatsApp number is the merchant's entire
interface. It handles logging sales (via guided button menus or an Urdu/
Roman-Urdu voice note), stock deduction, plain-language automations, and
optional high-value approval prompts. A lightweight web dashboard mirrors the
same data for merchants who want to see it visually.

## Stack (MERN only — no Next.js, no Python/FastAPI anywhere)

- Backend: Node.js + Express + MongoDB (Mongoose)
- Frontend: React (Vite) + Tailwind CSS, built as an installable PWA
- WhatsApp: Meta Cloud API (Developer/test mode) via webhooks
- AI: Qwen LLM for language understanding and command parsing — hosted on
  Groq (default; free tier, e.g. qwen/qwen3.8-27b) or Alibaba Cloud
  DashScope, switchable via the LLM_PROVIDER env var; Alibaba Cloud Visual
  Intelligence for OCR (optional fallback path, not the primary flow)
- Hosting: Alibaba Cloud Function Compute (backend), static hosting or
  Vercel-equivalent (frontend)

## Two ways a merchant logs a sale — both must produce the same internal
## command shape, so downstream code (stock deduction, dashboard, workflow
## triggers) never needs to know which path was used:

1. **Guided path** — WhatsApp interactive buttons: pick item from the
   merchant's existing stock list → pick payment method (EasyPaisa,
   JazzCash, bank, cash) → confirm. No free text.
2. **Voice path** — merchant sends an Urdu/Roman-Urdu voice note describing
   the sale in one sentence. The voice agent transcribes it and the same
   Qwen command-parsing step used elsewhere turns it into the identical
   structured command as the guided path.

## Folder structure and per-folder README content

```
verbatask/
├── README.md                        (already written separately — skip)
├── backend/
│   README: "Express + MongoDB API — owns all business logic, the WhatsApp
│   webhook, and every call out to Alibaba Cloud's AI services."
│   ├── src/
│   │   ├── routes/
│   │   │   README: "One file per resource. Thin — just maps HTTP verbs to
│   │   │   controller functions, no logic here."
│   │   ├── controllers/
│   │   │   README: "Request handling per route: validate input, call the
│   │   │   right service or model, shape the response."
│   │   ├── services/
│   │   │   README: "External integrations — WhatsApp send/receive, Qwen-2.5
│   │   │   calls, OCR calls. Nothing here knows about Express."
│   │   ├── models/
│   │   │   README: "Mongoose schemas: Merchant, InventoryItem, Order,
│   │   │   Payment, Workflow, LinkCode."
│   │   ├── agent/
│   │   │   README: "Voice-note-to-command pipeline: transcribe the Urdu/
│   │   │   Roman-Urdu voice note, then parse it into the same structured
│   │   │   command shape the guided-button flow produces."
│   │   ├── crm/
│   │   │   README: "Stock and order management logic — the source of truth
│   │   │   for what a merchant sells, current stock levels, and order
│   │   │   history, shared by both the guided and voice logging paths."
│   │   ├── workflows/
│   │   │   README: "Evaluates and runs merchant-defined automations —
│   │   │   message-triggered, scheduled, or stock-threshold-triggered."
│   │   └── config/
│   │       README: "Environment setup and the MongoDB connection."
│   └── tests/
│       README: "Backend tests — one file per route/service, run with
│       npm test before every merge to dev."
├── frontend/
│   README: "React (Vite) PWA dashboard — a read/write window into the same
│   data the WhatsApp bot uses. Not the primary interface, WhatsApp is."
│   ├── src/
│   │   ├── pages/
│   │   │   README: "One folder per dashboard screen: overview, inventory,
│   │   │   orders, payments, workflows, signup/account-linking."
│   │   ├── components/
│   │   │   README: "Shared, reusable UI pieces used across more than one
│   │   │   page — buttons, cards, tables, form inputs."
│   │   ├── api/
│   │   │   README: "One function per backend endpoint from the API
│   │   │   contract — the only place that calls fetch/axios directly."
│   │   └── assets/
│   │       README: "Images, icons, and the PWA manifest/app icons."
└── docs/
    README: "Planning docs: architecture notes, the frozen API contract
    between backend and frontend, and this brief."
```

## Conventions Claude Code should follow while scaffolding

- Stub every controller/service function with a clear `// TODO:` comment
  describing exactly what it needs to do — don't leave empty function bodies
  with no guidance.
- The guided-button order flow and the voice-note order flow must both call
  into the same `crm/` functions to create an order and deduct stock — do
  not duplicate that logic per input path.
- Every route file should only import from `controllers/`, never reach into
  `services/` or `models/` directly.
- Add `.env.example` (backend) and `.env.local.example` (frontend) listing
  every required environment variable with a one-line comment each, but no
  real secrets.
- Keep dependencies minimal and boring — this ships in days, not weeks.
