# VerbaTask — Complete Frontend + Backend Handoff

> **Purpose:** This document gives a frontend designer/developer everything needed to build out the dashboard UI/UX. It covers the full stack: React + Vite frontend, Express + MongoDB backend, all routes, all APIs, design tokens, and current gaps.
>
> **Stack headline:** Frontend is **React 19 + Vite 8 + Tailwind CSS v4** with React Router 7, TanStack Query, Zustand, Recharts, and Sonner. Backend is **Express 4 + Mongoose 8**.

---

## 1. Product Overview

VerbaTask is a **WhatsApp-first sales and inventory automation tool** for small Pakistani merchants.

- **Primary interface:** WhatsApp — merchants log sales, check stock, and create workflows by voice/text message.
- **Secondary interface:** The React dashboard — a read/write window into the same data (inventory, orders, approvals, workflows, analytics).
- **Core flows:**
  - Log a sale by sending a voice/text message to the WhatsApp bot.
  - Stock is deducted automatically; low-stock workflows fire alerts.
  - High-value orders (≥ Rs. 10,000) create an approval request.
  - Merchant approves/rejects from WhatsApp buttons or the dashboard.

---

## 2. Tech Stack

### Frontend (`/frontend`)

| Layer | Choice |
|-------|--------|
| Build tool | **Vite 8** (React plugin, PWA plugin) |
| Framework | **React 19** |
| Router | **React Router 7** (`createBrowserRouter`) |
| Styling | **Tailwind CSS v4** (no `tailwind.config.js`; tokens via `@theme` + CSS custom properties) |
| Font | **Geist** + **Geist Mono** (self-hosted from `node_modules/geist/dist/fonts`) |
| Icons | `@tabler/icons-react` |
| Server state | **TanStack Query 5** |
| Client state | **Zustand 5** |
| Forms | React Hook Form 7 + Zod 3 (auth pages only) |
| Tables | TanStack Table 8 |
| Charts | Recharts 2 |
| Toasts | Sonner |
| Motion | `motion` (Framer Motion v13, imported as `motion/react`) |
| PWA | `vite-plugin-pwa` |

### Backend (`/backend`)

| Layer | Choice |
|-------|--------|
| Runtime | Node.js, ESM (`"type": "module"`) |
| Server | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Auth | bcryptjs + JWT (7-day expiry) |
| LLM | Groq-hosted Qwen (default) or Alibaba DashScope Qwen (switchable) |
| Voice | Groq Whisper |
| WhatsApp | Meta Cloud API (Graph v20.0) |

---

## 3. Project Structure

```
VerbaTask/
├── README.md              # Product pitch
├── architecture.md        # Original scaffolding brief
├── DESIGN_GUIDE.md        # Backend-ish design conventions
├── VERBATASK_HANDOFF.md   # This file
├── backend/
│   ├── index.js           # Entry point, port 8080
│   ├── package.json
│   └── src/
│       ├── routes/        # Route definitions
│       ├── controllers/   # HTTP handlers
│       ├── services/      # Business logic (WhatsApp, LLM, media)
│       ├── models/        # Mongoose schemas
│       ├── middleware/    # requireAuth, webhook signature verify
│       ├── agent/         # Voice transcription + parsing
│       ├── crm/           # Inventory/order logic + fuzzy matching
│       ├── workflows/     # Workflow engine + scheduler
│       ├── approvals/     # Approval service
│       └── dashboard/     # Overview aggregation
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js     # Vite + PWA config
    ├── api-spec.md        # Frozen HTTP contract
    ├── DESIGN.md          # 517-line design-token spec
    └── src/
        ├── app.css        # Tailwind v4 theme + tokens
        ├── main.jsx       # React root, QueryClient, Toaster
        ├── pages/         # Route-level page components
        ├── components/
        │   ├── ui/        # Reusable primitives
        │   ├── layout/    # DashboardLayout, Sidebar, TopBar, AuthLayout
        │   └── AuthGuard.jsx
        ├── hooks/         # TanStack Query resource hooks
        └── lib/           # api, store, router, queryKeys, formatters
```

---

## 4. Frontend Routes

Defined in `frontend/src/lib/router.jsx` using `createBrowserRouter`.

| Path | Page Component | Layout / Auth |
|------|----------------|---------------|
| `/login` | `LoginPage` | Public, `AuthLayout` |
| `/signup` | `SignupPage` | Public, `AuthLayout` |
| `/link-code` | `LinkCodePage` | Public, `AuthLayout` |
| `/` | `OverviewPage` | Protected → `DashboardLayout` |
| `/inventory` | `InventoryPage` | Protected → `DashboardLayout` |
| `/orders` | `OrdersPage` | Protected → `DashboardLayout` |
| `/workflows` | `WorkflowsPage` | Protected → `DashboardLayout` |
| `/approvals` | `ApprovalsPage` | Protected → `DashboardLayout` |
| `*` | Redirect to `/` | Catch-all |

> **Important:** Adding a new dashboard route currently requires editing **three files**:
> 1. `frontend/src/lib/router.jsx` — add the route.
> 2. `frontend/src/components/layout/Sidebar.jsx` — add to `NAV_ITEMS`.
> 3. `frontend/src/components/layout/TopBar.jsx` — add to `ROUTE_TITLES`.

### Sidebar navigation (`NAV_ITEMS`)

```jsx
[
  { to: '/',         label: 'Overview',  icon: IconLayoutDashboard, end: true },
  { to: '/inventory', label: 'Inventory', icon: IconBoxSeam },
  { to: '/orders',    label: 'Orders',    icon: IconReceipt },
  { to: '/workflows', label: 'Workflows', icon: IconGitBranch },
  { to: '/approvals', label: 'Approvals', icon: IconClipboardCheck },
]
```

### AuthGuard behavior

- If no token in localStorage → redirect to `/login`, preserving intended path in `state.from`.
- If token exists → fetch `/api/auth/me` via `useMerchant()`. Show skeleton while loading.
- 401 from any API call auto-logs the user out (see `api.js`).

---

## 5. Backend API Reference

Base URL: `http://localhost:8080`

All endpoints use this envelope:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "message": "..." } }
```

Auth-required routes need header: `Authorization: Bearer <token>`.

### 5.1 System

| Method | Path | Auth | Response `data` |
|--------|------|------|-----------------|
| GET | `/health` | No | `{ "status": "healthy" }` |

### 5.2 Auth — `/api/auth`

| Method | Path | Auth | Body | Response `data` |
|--------|------|------|------|-----------------|
| POST | `/signup` | No | `{ email, password }` | `{ token, merchantId }` |
| POST | `/login` | No | `{ email, password }` | `{ token, merchantId }` |
| POST | `/link-code/confirm` | No | `{ email, code }` | `{ linked: true }` |
| GET | `/me` | Yes | — | `Merchant` (no `passwordHash`) |

### 5.3 Inventory — `/api/inventory` (auth required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/` | — | Array of `InventoryItem` |
| POST | `/` | `{ name, quantity, price?, unit? }` | `InventoryItem` (201 new, 200 upsert) |
| PATCH | `/:id` | Partial | Updated `InventoryItem` |
| DELETE | `/:id` | — | `{ deleted: true }` |

**Notes:**
- `POST /` **upserts by name** (case-insensitive). If the item exists, `quantity` is **added** to current stock; `price`/`unit` are updated only if provided.
- 404 on PATCH/DELETE if item does not belong to the merchant.

### 5.4 Orders — `/api/orders` (auth required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/` | — | Array of `Order` (newest-first) |
| GET | `/:id` | — | Single `Order` |
| POST | `/` | See below | Created `Order` |

**Dashboard POST body:**

```json
{
  "items": [
    { "inventoryItemId": "...", "name": "rice bag", "quantity": 2, "price": 750 }
  ],
  "total": 1500,
  "paymentMethod": "cash",
  "source": "dashboard"
}
```

**Enums:**
- `paymentMethod`: `easypaisa` | `jazzcash` | `bank` | `cash`
- `source`: `guided` | `voice` | `dashboard`

**Business logic:**
- Stock is deducted per line item.
- Active `threshold` workflows are evaluated after deduction.
- If `total >= 10,000`, order status is `pending_approval` and an `Approval` record is created.
- Otherwise status is `completed` immediately.

**Errors:**
- `400 ITEM_NOT_FOUND: ...`
- `400 INSUFFICIENT_STOCK: ...`

### 5.5 Approvals — `/api/approvals` (auth required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/` | — | Pending `Approval` array only |
| PATCH | `/:id/respond` | `{ decision: "approved" | "rejected" }` | Updated `Approval` |

**Notes:**
- `GET /` hardcodes `status: "pending"` filter.
- Rejection restores deducted stock automatically.
- Returns 400 for invalid decision; 404 if approval already actioned.

### 5.6 Workflows — `/api/workflows` (auth required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/` | — | All merchant workflows |
| POST | `/` | `{ trigger, condition, action, rawInstruction }` | Created `Workflow` |
| PATCH | `/:id` | Partial | Updated `Workflow` |
| DELETE | `/:id` | — | Deleted `Workflow` |

**Trigger types:**

| Trigger | Condition shape | When it fires |
|---------|-----------------|---------------|
| `threshold` | `{ item?: "...", quantityThreshold: 5, operator?: "<" }` | After any stock deduction that matches the condition. |
| `schedule` | `{ intervalMinutes?: 1440 }` | Background runner checks every 60s; `nextRunAt` auto-advances. |
| `message` | `{ keywords: ["promo", "sale"], keyword?: "..." }` | Incoming WhatsApp text matches keyword substring before NLP. |

**Action types:**
- `notify` / `notify_merchant` / `send_message` → sends WhatsApp text.
- `auto_reorder` → stub, logs only.

### 5.7 Dashboard — `/api/dashboard` (auth required)

| Method | Path | Response `data` |
|--------|------|-----------------|
| GET | `/overview` | Dashboard aggregate object |

**Response shape:**

```json
{
  "todaySales": 15000,
  "itemsSoldToday": 12,
  "todayOrdersCount": 4,
  "lowStockItems": [ /* InventoryItem docs */ ],
  "pendingApprovals": 1,
  "recentOrders": [ /* last 5 Order docs */ ],
  "activeWorkflows": 3
}
```

### 5.8 WhatsApp Webhook — `/webhook/whatsapp` (not frontend-facing)

- `GET /webhook/whatsapp` — Meta verification handshake.
- `POST /webhook/whatsapp` — Inbound events with HMAC signature verification.
- `GET/POST /webhook/whatsapp/debug` — Debug endpoint; only active in `development` or when `ENABLE_DEBUG_WEBHOOK=true`.

---

## 6. Database Models

All models live in `backend/src/models/` and include `{ timestamps: true }`.

### Merchant

```js
{
  whatsappNumber:     String (required, unique) // temp "unlinked_<ts>" until linked
  email:              String (required, unique)
  passwordHash:       String (required) // bcrypt
  businessName:       String
  location:           String
  sells:              String
  language:           String enum ['ur','en'], default 'ur'
  onboardingComplete: Boolean, default false
}
```

### InventoryItem

```js
{
  merchantId: ObjectId -> Merchant (required)
  name:       String (required)
  quantity:   Number, default 0
  price:      Number
  unit:       String // e.g. "bag", "kg", "piece"
}
```

### Order

```js
{
  merchantId:    ObjectId -> Merchant (required)
  items: [{
    inventoryItemId: ObjectId -> InventoryItem
    name:            String
    quantity:        Number
    price:           Number
  }],
  total:         Number
  paymentMethod: String enum ['easypaisa','jazzcash','bank','cash'] (required)
  source:        String enum ['guided','voice','dashboard'] (required)
  status:        String enum ['pending_approval','approved','completed','rejected'], default 'completed'
}
```

### Approval

```js
{
  merchantId: ObjectId -> Merchant (required)
  type:       String enum ['order','workflow_action'], default 'order'
  refId:      ObjectId (required) // currently points to Order
  summary:    String
  status:     String enum ['pending','approved','rejected'], default 'pending'
  respondedAt: Date
}
```

### Workflow

```js
{
  merchantId:     ObjectId -> Merchant (required)
  rawInstruction: String
  trigger:        String enum ['message','schedule','threshold'] (required)
  condition:      Mixed // shape depends on trigger
  action:         Mixed
  active:         Boolean, default true
  nextRunAt:      Date
}
```

### ConversationState

One document per WhatsApp number.

```js
{
  whatsappNumber: String (required, unique)
  merchantId:     ObjectId
  flow:           String enum ['onboarding','guided_order','item_disambiguation'] or null
  step:           String
  data:           Mixed
}
```

### LinkCode

```js
{
  whatsappNumber: String (required)
  code:           String (required) // 6-digit
  expiresAt:      Date (required) // 15 min TTL
  usedAt:         Date
}
```

### Payment *(schema exists, not used yet)*

```js
{
  merchantId:    ObjectId (required)
  orderId:       ObjectId
  transactionId: String
  amount:        Number
  provider:      String enum ['easypaisa','jazzcash','bank']
  screenshotUrl: String
  matchStatus:   String enum ['matched','unmatched'], default 'unmatched'
}
```

---

## 7. Frontend State Management & Data Flow

### 7.1 Server state — TanStack Query

Configured in `frontend/src/main.jsx`:

```jsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Query keys (`frontend/src/lib/queryKeys.js`):

```js
export const queryKeys = {
  merchant: () => ['merchant'],
  inventory: () => ['inventory'],
  orders: () => ['orders'],
  order: (id) => ['orders', id],
  workflows: () => [' workflows'],
  approvals: () => ['approvals'],
  dashboard: () => ['dashboard'],
};
```

Custom hooks in `frontend/src/hooks/`:

| Hook | Exports | Notes |
|------|---------|-------|
| `useMerchant.js` | `useMerchant` | 5 min staleTime; syncs into Zustand via `useEffect`. |
| `useDashboard.js` | `useDashboard` | 30s staleTime + `refetchInterval: 30s` (live polling). |
| `useInventory.js` | `useInventory`, `useCreateInventoryItem`, `useUpdateInventoryItem`, `useDeleteInventoryItem` | 60s staleTime. |
| `useOrders.js` | `useOrders`, `useOrder(id)`, `useCreateOrder` | 60s staleTime. |
| `useApprovals.js` | `useApprovals`, `useRespondApproval` | 30s staleTime. |
| `useWorkflows.js` | `useWorkflows`, `useCreateWorkflow`, `useUpdateWorkflow`, `useDeleteWorkflow` | 60s staleTime. |

Mutations invalidate related keys (e.g., creating an order invalidates orders, dashboard, inventory, approvals).

### 7.2 Client state — Zustand

`frontend/src/lib/store.js`:

```js
export const useAuthStore = create((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  merchantId: localStorage.getItem(MERCHANT_ID_KEY) || null,
  merchant: null,
  setAuth: (token, merchantId) => { ... },
  setMerchant: (merchant) => set({ merchant }),
  logout: () => { ... },
}));

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  theme: initialTheme, // 'light' | 'dark' | 'system'
  toggleSidebar: () => set(...),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setTheme: (theme) => { ... },
}));
```

Theme is applied at module load before React mounts (prevents flash). `localStorage` keys: `verbatask_token`, `verbatask_merchant_id`, `verbatask_theme`.

### 7.3 API client — `frontend/src/lib/api.js`

Thin `fetch` wrapper, no axios.

```js
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export const api = {
  get:  (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  patch:(path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  del:  (path, options) => request(path, { method: 'DELETE', ...options }),
};
```

- Injects `Authorization: Bearer <token>`.
- Unwraps `json.data`.
- Throws `json.error.message`.
- **Auto-logout on 401.**

### 7.4 Forms

- **Auth pages** use React Hook Form + Zod.
- **Dashboard modals** currently use plain `useState` (forms refactor candidate).

### 7.5 Toasts

`<Toaster position="top-right" richColors closeButton />` mounted in `main.jsx`.

---

## 8. UI Components

Located in `frontend/src/components/ui/`.

| Component | Key props / behavior |
|-----------|----------------------|
| `Button` | `variant`: primary / secondary / ghost / danger / outline; `size`: sm / md / lg; `loading`, `leftIcon`, `rightIcon`; `forwardRef` |
| `Badge` | `variant` accepts semantic names (`success`, `warning`, `danger`, `neutral`, `primary`) **and** raw API status values (`completed`, `approved`, `pending`, `pending_approval`, `rejected`, `voice`, `guided`, `dashboard`); `dot` prop |
| `Card` | `padding`: none / sm / md / lg; `hoverEffect` |
| `Table` | Accepts a TanStack Table instance as `table` prop; `onRowClick`, `emptyText`, `getRowClassName`; auto-sort chevrons |
| `Input` | `label`, `error`, `helperText`, `leftIcon`, `rightIcon`; `forwardRef`; auto-derives `id` from label |
| `Modal` | `isOpen`, `onClose`, `title`, `description`, `maxWidth`, `showCloseButton`; AnimatePresence, Escape close, body scroll lock |
| `Skeleton` | `variant`: text / title / circle / stat / card / button / tableRow; `count` |
| `EmptyState` | `icon`, `title`, `description`, `actionLabel`, `onAction`, `actionIcon` |

### Layout components

- `DashboardLayout.jsx` — flex shell; owns `mobileOpen` state; main max-width `1400px`, responsive padding.
- `Sidebar.jsx` — animated width 240px ↔ 64px; mobile drawer; footer shows merchant info + collapse toggle + sign out.
- `TopBar.jsx` — sticky header; hamburger (mobile), page title, "System Live" pill, theme toggle.
- `AuthLayout.jsx` — centered auth card on `.mesh-gradient-bg`.

---

## 9. Design System

Tokens live in `frontend/src/app.css` using Tailwind v4 `@theme` + `:root`/`.dark` custom properties.

### Semantic color tokens

```css
:root {
  --color-canvas: #ffffff;
  --color-canvas-soft: #f6f9fc;
  --color-ink: #0a0a0a;
  --color-ink-secondary: #4a4a4a;
  --color-ink-mute: #8a8a8a;
  --color-hairline: #e8edf2;
  --color-hairline-input: #d0d7de;
  --color-primary: #533afd;
  --color-on-primary: #ffffff;
  --color-ruby: #e11d48;
  --color-lemon: #f59e0b;
  --color-magenta: #d946ef;
}
```

Dark mode flips the canvas/ink scale; primary becomes `#665efd`.

### Tailwind classes in use

- Backgrounds: `bg-canvas`, `bg-canvas-soft`, `bg-primary`, `bg-primary/10`
- Text: `text-ink`, `text-ink-secondary`, `text-ink-mute`, `text-on-primary`, `text-ruby`, `text-lemon`, `text-magenta`
- Borders: `border-hairline`, `border-hairline-input`
- Shadows: `shadow-card`, `shadow-float`
- Radius: `rounded-xs`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-pill`
- Font: `font-sans` (Geist), `font-mono` (Geist Mono), `font-tabular` (`tnum`, `ss01`)

### Typography

- Headings use `font-light tracking-tight`.
- Tabular numbers on every price/quantity cell.
- Geist variable woff2 self-hosted from `node_modules/geist/dist/fonts/`.

---

## 10. External Integrations

### 10.1 Meta WhatsApp Cloud API

- **Outbound:** `backend/src/services/whatsapp.service.js` — text, interactive buttons (max 3, title 20 chars), interactive list (max 10 rows), templates, read receipts.
- **Inbound:** `backend/src/routes/whatsapp.route.js` + `backend/src/controllers/whatsapp.controller.js`.
- **Signature verification:** `backend/src/middleware/verifyWhatsappSignature.js` — HMAC-SHA256 over raw body vs `x-hub-signature-256`.
- **Media download:** `backend/src/services/media.service.js` — two-step fetch (media ID → short URL → authenticated download).

### 10.2 Groq (default)

- **Voice transcription:** `backend/src/agent/transcribeAndParse.js` — Whisper `whisper-large-v3-turbo`, 8 MB cap, 20s timeout.
- **Chat/NLP:** `backend/src/services/qwen.service.js` via Groq — model `qwen/qwen3.8-27b`, `temperature: 0`, 15s timeout.

### 10.3 Alibaba DashScope (optional)

Set `LLM_PROVIDER=dashscope` and provide `DASHSCOPE_API_KEY`. Uses `dashscope-intl.aliyuncs.com` with `qwen2.5-72b-instruct`.

### 10.4 Not yet wired

- Alibaba Cloud Visual Intelligence / OCR — env vars exist, no code.
- Payment screenshot matching — `Payment` model exists, no UI or flow.
- `auto_reorder` workflow action — stub only.

---

## 11. Environment Variables

### Backend (`/backend/.env`)

```env
PORT=8080
MONGODB_URI=

# Meta WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Auth / URLs
JWT_SECRET=
SIGNUP_BASE_URL=http://localhost:3000/signup

# LLM
LLM_PROVIDER=groq
LLM_MODEL=qwen/qwen3.8-27b
GROQ_API_KEY=
DASHSCOPE_API_KEY=
# DASHSCOPE_BASE_URL=        # optional
# QWEN_MODEL=                # optional

# Unused / future
ALIBABA_ACCESS_KEY_ID=
ALIBABA_ACCESS_KEY_SECRET=

# Dev-only
# ENABLE_DEBUG_WEBHOOK=true
```

### Frontend (`/frontend/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:8080
```

> ⚠️ **Known issue:** The current `/frontend/.env.local` uses `NEXT_PUBLIC_API_BASE_URL` (wrong prefix for Vite). `import.meta.env.VITE_API_BASE_URL` falls back to the hardcoded `http://localhost:8080`. Rename to `VITE_API_BASE_URL` for deployment.

---

## 12. Running the Project

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill values
npm run dev            # node --watch index.js
```

Runs on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # set VITE_API_BASE_URL
npm run dev
```

Vite dev server runs on `http://localhost:5173` by default.

### Build

```bash
cd frontend
npm run build     # outputs to dist/
npm run preview   # preview production build
```

---

## 13. Special Features Already Implemented

### Backend intelligence

- **Fuzzy item matching** — Levenshtein + token overlap + containment + space-stripped comparison; handles Urdu script and transliteration (`chawal` ↔ `rice` ↔ `چاول`).
- **Three-tier resolution** — exact regex → fuzzy with gap rule → LLM fallback → "Did you mean?" buttons.
- **Guided WhatsApp order flow** — state machine (`awaiting_item → awaiting_quantity → awaiting_payment_method → finalize`), 30-min idle expiry, free-text shortcuts ("2 daal maash"), pagination at 9 rows.
- **Workflow engine** — threshold / schedule / message triggers.
- **Approval HITL** — high-value orders spawn WhatsApp Approve/Reject buttons; rejection restores stock.
- **Webhook robustness** — immediate 200 response, in-memory idempotency FIFO (1000 IDs), swallow-and-log outbound sends.

### Frontend polish

- Dashboard live-polling every 30s with animated "Live Updates" indicator.
- Recharts AreaChart + donut PieChart from `recentOrders`.
- Payment-method logos rendered in tables and legend.
- Status filter tabs with live count badges on Orders.
- Global search on Inventory and Orders tables.
- Low-stock ruby left-border row highlight.
- PKR formatting (`Intl.NumberFormat('en-PK')`) and relative dates.
- Full light/dark theming.
- PWA installable with `vite-plugin-pwa`.

---

## 14. Known Gaps & TODOs for Frontend Design

1. **Add a route requires 3 edits** — `router.jsx`, `Sidebar.jsx`, `TopBar.jsx`. Consider centralizing route config.
2. **Workflows page only creates threshold + notify workflows** — schedule and message triggers are backend-only. The dashboard form needs expanded UI for trigger selection, interval pickers, keyword input, etc.
3. **No pagination** — all list endpoints return full sets; backend hardcodes some `.limit(50)`/`.limit(100)`. Dashboard tables will need pagination/infinite scroll as data grows.
4. **Payments UI missing** — `Payment` model and screenshot/OCR flow are not exposed in the dashboard.
5. **No profile/settings page** — merchant can only see business name/email in sidebar.
6. **Auth forms only use RHF+Zod** — dashboard modals still use `useState`; consider standardizing.
7. **Frontend `.env.local` wrong prefix** — fix `NEXT_PUBLIC_API_BASE_URL` → `VITE_API_BASE_URL`.
8. **No tests** — both `frontend/` and `backend/tests/` are empty of actual tests.
9. **React Compiler installed but not wired** — babel plugins exist but not added to `vite.config.js`.
10. **CORS is wide open** — acceptable for local dev, needs origin lock before production.

---

## 15. Quick Reference for New Frontend Pages

When adding a new dashboard page:

1. Create the page component in `frontend/src/pages/YourPage.jsx`.
2. Add the route in `frontend/src/lib/router.jsx` under the `DashboardLayout` children.
3. Add a nav item in `frontend/src/components/layout/Sidebar.jsx` (`NAV_ITEMS`).
4. Add a title in `frontend/src/components/layout/TopBar.jsx` (`ROUTE_TITLES`).
5. If it needs server data, create a hook in `frontend/src/hooks/useYourResource.js` using TanStack Query and add a key to `frontend/src/lib/queryKeys.js`.
6. Use the UI primitives in `frontend/src/components/ui/` and the design tokens in `frontend/src/app.css`.
7. Format money with `formatPKR` and dates with `formatDate` from `frontend/src/lib/format.js`.

---

*Document generated for handoff. For the source of truth on any specific endpoint or component, see the linked files above.*
