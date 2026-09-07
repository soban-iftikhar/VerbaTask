# VerbaTask — Design Guide (0 → working product)

This is the single reference doc for how the whole system fits together:
every schema, every route that frontend and backend must agree on, auth,
environment variables, conventions, and who owns what. If backend and
frontend ever disagree on a shape, this file is the tiebreaker — update it
first, then code to match it, not the other way round.

---

## 1. Modules and ownership

Code is organized by module, not by "backend team did whatever." Each
module is a folder with a single clear job. Team split stays as agreed:
Soban + Ali (backend, all modules below), Shiraz + Talal (frontend, consumes
the "Frontend-facing API" in section 3 only).

| Module | Folder | Job | Talks to HTTP? |
|---|---|---|---|
| **auth** | `backend/src/auth/` | Signup, login, JWT issuing/verification, WhatsApp-number linking codes | Yes — frontend calls it directly |
| **onboarding** | `backend/src/onboarding/` | First-time language/business-details/inventory capture | Yes |
| **crm** | `backend/src/crm/` | Stock (inventory) and order creation — the single place both the guided-button flow and the voice flow call into | Yes (inventory CRUD, orders) — internal calls too |
| **agent** | `backend/src/agent/` | Voice note → transcription (Whisper) → Qwen-2.5 → command-contract JSON | No — called in-process by `whatsapp/`, never by the frontend |
| **workflows** | `backend/src/workflows/` | Stores and evaluates automations (message/schedule/threshold triggers) | Yes (list/create/update) — evaluation itself is internal |
| **approvals** | `backend/src/approvals/` | Human-in-the-loop: pending high-value actions, approve/reject | Yes |
| **whatsapp** | `backend/src/whatsapp/` | Webhook in, message/button/media sending out | No — Meta calls the webhook, nothing else does |
| **ocr** | `backend/src/ocr/` | Optional: parse a forwarded payment screenshot, try to reconcile against a pending order | Internal only, one exposed test route |
| **dashboard** | `backend/src/dashboard/` | Read-heavy aggregate endpoint the frontend polls | Yes |

Rule: only the modules marked "frontend calls it directly" need routes that
appear in section 3. Everything else is a plain function import — don't
build HTTP routes for module-to-module calls inside one Express app, it's
unnecessary indirection for a 7-day build.

---

## 2. Schemas (Mongoose)

### Merchant
```js
{
  whatsappNumber: { type: String, required: true, unique: true },
  email:          { type: String, required: true, unique: true },
  passwordHash:   { type: String, required: true },
  businessName:   String,
  location:       String,
  sells:          String,
  language:       { type: String, enum: ['ur', 'en'], default: 'ur' },
  onboardingComplete: { type: Boolean, default: false },
  createdAt, updatedAt // timestamps: true
}
```

### LinkCode
```js
{
  whatsappNumber: { type: String, required: true },
  code:           { type: String, required: true },
  expiresAt:      { type: Date, required: true },
  usedAt:         Date,
  createdAt, updatedAt
}
```

### InventoryItem
```js
{
  merchantId: { type: ObjectId, ref: 'Merchant', required: true },
  name:       { type: String, required: true },
  quantity:   { type: Number, default: 0 },
  price:      Number,
  unit:       String, // e.g. "bag", "kg", "piece"
  createdAt, updatedAt
}
```

### Order
The single record produced by **both** the guided-button flow and the voice
flow — see the command contract in section 6.
```js
{
  merchantId:   { type: ObjectId, ref: 'Merchant', required: true },
  items: [{
    inventoryItemId: ObjectId,
    name: String,
    quantity: Number,
    price: Number,
  }],
  total:         Number,
  paymentMethod: { type: String, enum: ['easypaisa', 'jazzcash', 'bank', 'cash'], required: true },
  source:        { type: String, enum: ['guided', 'voice', 'dashboard'], required: true },
  status:        { type: String, enum: ['pending_approval', 'approved', 'completed', 'rejected'], default: 'completed' },
  createdAt, updatedAt
}
```
`status` starts as `pending_approval` only when the approvals module flags
it as high-value; otherwise it's `completed` immediately — most sales never
touch the approvals module at all.

### Payment (optional — only used if a screenshot gets forwarded)
```js
{
  merchantId:    { type: ObjectId, ref: 'Merchant', required: true },
  orderId:       { type: ObjectId, ref: 'Order' }, // null until matched
  transactionId: String,
  amount:        Number,
  provider:      { type: String, enum: ['easypaisa', 'jazzcash', 'bank'] },
  screenshotUrl: String,
  matchStatus:   { type: String, enum: ['matched', 'unmatched'], default: 'unmatched' },
  createdAt, updatedAt
}
```

### Workflow
```js
{
  merchantId:     { type: ObjectId, ref: 'Merchant', required: true },
  rawInstruction: String, // what the merchant actually typed/said
  trigger:        { type: String, enum: ['message', 'schedule', 'threshold'], required: true },
  condition:      Schema.Types.Mixed, // e.g. { item: 'rice bag', operator: '<', value: 5 }
  action:         Schema.Types.Mixed, // e.g. { type: 'notify_merchant' }
  active:         { type: Boolean, default: true },
  nextRunAt:      Date, // only relevant for schedule triggers
  createdAt, updatedAt
}
```

### Approval (HITL)
Generic so it can cover both a large order and a risky workflow action
without two separate systems.
```js
{
  merchantId: { type: ObjectId, ref: 'Merchant', required: true },
  type:       { type: String, enum: ['order', 'workflow_action'], required: true },
  refId:      { type: ObjectId, required: true }, // points at the Order or the Workflow
  summary:    String, // plain-language text sent to the merchant, e.g. "Approve Rs. 15,000 order for 40 units of Item X?"
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  respondedAt: Date,
  createdAt, updatedAt
}
```

---

## 3. Frontend-facing API (the part that must stay in sync)

Base URL: `http://localhost:8080` locally. All routes below except
`/api/auth/signup` and `/api/auth/login` require `Authorization: Bearer <token>`.

Every response uses one envelope, success or failure — the frontend should
only ever need to check `success`:
```json
{ "success": true, "data": { } }
{ "success": false, "error": { "message": "..." } }
```

### Auth
| Method | Path | Body | `data` on success |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password }` | `{ token, merchantId }` |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, merchantId }` |
| POST | `/api/auth/link-code/confirm` | `{ email, code }` | `{ linked: true }` |
| GET | `/api/auth/me` | — | `Merchant` |

### Onboarding
| Method | Path | Body |
|---|---|---|
| POST | `/api/onboarding/language` | `{ language: "ur" \| "en" }` |
| POST | `/api/onboarding/business-details` | `{ businessName, location, sells }` |
| POST | `/api/onboarding/inventory` | `{ items: [{ name, quantity, price, unit }] }` |

### Inventory
| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/api/inventory` | — | `InventoryItem[]` |
| POST | `/api/inventory` | `{ name, quantity, price, unit }` | `InventoryItem` |
| PATCH | `/api/inventory/:id` | partial `InventoryItem` | `InventoryItem` |
| DELETE | `/api/inventory/:id` | — | `{ deleted: true }` |

### Orders
| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/api/orders` | — | `Order[]` |
| GET | `/api/orders/:id` | — | `Order` |
| POST | `/api/orders` | command-contract shape, `source: "dashboard"` | `Order` |

### Workflows
| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/api/workflows` | — | `Workflow[]` |
| POST | `/api/workflows` | `{ rawInstruction, trigger, condition, action }` | `Workflow` |
| PATCH | `/api/workflows/:id` | `{ active }` | `Workflow` |
| DELETE | `/api/workflows/:id` | — | `{ deleted: true }` |

### Approvals
| Method | Path | Body | `data` |
|---|---|---|---|
| GET | `/api/approvals?status=pending` | — | `Approval[]` |
| PATCH | `/api/approvals/:id/respond` | `{ decision: "approved" \| "rejected" }` | `Approval` |

### Dashboard
| Method | Path | `data` |
|---|---|---|
| GET | `/api/dashboard/overview` | `{ todaySales, itemsSoldToday, todayOrdersCount, lowStockItems, pendingApprovals, recentOrders, activeWorkflows }` |

### OCR (optional path, exposed for testing)
| Method | Path | Body | `data` |
|---|---|---|---|
| POST | `/api/ocr/payment-screenshot` | `{ imageUrl }` | `{ transactionId, amount, provider, matchedOrderId \| null }` |

---

## 4. WhatsApp webhook (not a frontend concern, listed for completeness)

| Method | Path | Purpose |
|---|---|---|
| GET | `/webhook/whatsapp` | Meta's one-time verification handshake |
| POST | `/webhook/whatsapp` | All inbound events: text, voice note media, images, button replies |

---

## 5. Auth module, in full

- **Password storage**: bcrypt, 10 salt rounds. Never store or log plain
  passwords, ever, including in dev.
- **Token**: JWT, signed with `JWT_SECRET`, `{ merchantId }` payload,
  7-day expiry is fine for a hackathon prototype — no refresh-token flow,
  it's not worth the time this week.
- **Middleware** (`backend/src/auth/requireAuth.js`):
  ```js
  export function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: { message: 'Missing token' } });
    try {
      req.merchantId = jwt.verify(token, process.env.JWT_SECRET).merchantId;
      next();
    } catch {
      res.status(401).json({ success: false, error: { message: 'Invalid or expired token' } });
    }
  }
  ```
  Apply it per-router: `router.use(requireAuth)` at the top of every
  frontend-facing router except `auth.routes.js`'s signup/login.
- **WhatsApp linking**: when a new number messages the bot, `whatsapp/`
  calls `auth/generateLinkCode(whatsappNumber)` in-process (not HTTP) to
  create a `LinkCode` and send it back over WhatsApp. The merchant enters it
  on the web signup page, which hits `POST /api/auth/link-code/confirm`.
  Codes expire in 15 minutes; regenerate rather than reusing an expired one.

---

## 6. The command contract (recap, this is the seam between input paths)

Both `agent/` (voice) and the guided WhatsApp button flow must produce this
shape before calling `crm.createOrder()`:
```json
{
  "type": "log_sale",
  "item": { "name": "rice bag", "quantity": 2 },
  "paymentMethod": "easypaisa",
  "amount": 1500,
  "source": "guided",
  "merchantId": "..."
}
```
And this shape before calling `workflows.createWorkflow()`:
```json
{
  "type": "create_workflow",
  "trigger": "threshold",
  "condition": { "item": "rice bag", "operator": "<", "value": 5 },
  "action": { "type": "notify_merchant" },
  "source": "voice",
  "merchantId": "..."
}
```
If `agent/`'s Qwen call can't confidently produce one of these two shapes,
it should return `{ "type": "unknown", "rawText": "..." }` and `whatsapp/`
replies asking the merchant to rephrase — never guess and create a bad order.

---

## 7. Environment variables

### `backend/.env.example`
```bash
PORT=8080

# MongoDB Atlas connection string
MONGODB_URI=

# Meta WhatsApp Cloud API — Developer/test mode (instant, no business verification)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=choose-any-string-and-reuse-it-in-the-meta-console

# LLM provider for the NLP layer (intent parsing + onboarding extraction)
# 'groq' (default, free tier, no card — hosts current Qwen models) or
# 'dashscope' (Alibaba Model Studio; needs an activated key, see below)
LLM_PROVIDER=groq
LLM_MODEL=qwen/qwen3.8-27b

# Alibaba Cloud DashScope (Qwen-2.5) — only used when LLM_PROVIDER=dashscope.
# IMPORTANT: intl (sk-ws-...) keys only work on dashscope-intl.aliyuncs.com;
# new accounts must activate the model / free quota or calls return 403.
DASHSCOPE_API_KEY=

# Alibaba Cloud Visual Intelligence (OCR) — only needed if you build the OCR module
ALIBABA_ACCESS_KEY_ID=
ALIBABA_ACCESS_KEY_SECRET=

# Groq (free tier, no card) — Whisper voice-note transcription AND the NLP
# chat layer when LLM_PROVIDER=groq (console.groq.com)
GROQ_API_KEY=

# Meta webhook signature verification — App Secret from the Meta app dashboard
WHATSAPP_APP_SECRET=

# Auth
JWT_SECRET=change-me-to-something-long-and-random
```

### `frontend/.env.local.example`
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```
(If frontend is plain Vite+React rather than Next.js, use `VITE_API_BASE_URL`
instead — Vite only exposes env vars prefixed `VITE_`.)

---

## 8. `.gitignore` (root)
```
node_modules/
.env
.env.local
.next/
dist/
build/
*.log
.DS_Store
```

---

## 9. Conventions

- **Response envelope**: every controller returns `{ success, data }` or
  `{ success: false, error: { message } }` — never a bare array or object,
  it keeps frontend error-handling identical across every call.
- **File naming**: `camelCase.js` for files, `PascalCase` for Mongoose model
  files (`Merchant.js`), one export per file where reasonable.
- **Routes stay thin**: a route file only wires `method + path → controller
  function`. All logic lives in the controller or the module it calls into.
- **Never log secrets**: no `console.log` of tokens, passwords, or full
  `.env` contents, even temporarily while debugging — it's easy to forget to
  remove before a commit.
- **Commits**: small and frequent, one logical change each. Merge to `dev`
  same-day; `main` only gets updated after a smoke test.
- **Every new frontend-facing route** gets added to section 3 of this file
  in the same PR that adds the code — this doc drifting out of sync with
  reality is the single easiest way to waste a day this week.

---

## 10. Zero → working product, in order

1. Accounts: Meta Developer app + WhatsApp test number, MongoDB Atlas
   cluster, Groq key (free, no card — covers Whisper + the Qwen NLP layer),
   Alibaba Cloud account + DashScope key (optional, only if using the
   dashscope LLM provider).
2. `cp backend/.env.example backend/.env` and fill it in.
3. `cd backend && npm install && npm run dev` → confirm `/health` responds
   and Mongo connects.
4. `ngrok http 8080` (or equivalent) → register the webhook URL in the Meta
   dashboard → confirm the GET verification handshake succeeds.
5. `cp frontend/.env.local.example frontend/.env.local`, `cd frontend &&
   npm install && npm run dev`.
6. Build `auth` module first (both sides need it before anything else is
   reachable) — signup/login working end-to-end, frontend can get a token.
7. Build `crm` (inventory + `createOrder`) next — nothing else has data to
   show without it.
8. Build `whatsapp` webhook + guided button flow, calling into `crm`.
9. Build `agent` (voice path) — same `crm` entry point, different input.
10. Build `workflows`, then `approvals`, then `dashboard` last, since
    dashboard is purely a read layer over everything above it.
11. Deploy backend to Alibaba Cloud Function Compute, deploy frontend,
    smoke-test every flow end to end.
