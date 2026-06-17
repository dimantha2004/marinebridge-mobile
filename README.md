# Marianbridge — Integrated Smart Maritime Service System

A full-stack maritime service-coordination mobile app. Vessel captains request port
services (bunkering, provisions, medical, crew exchange, fresh water, waste/sludge),
approvals flow through Charter Parties and Port Authorities, and exclusive 1:1
suppliers execute orders — all on a shared, real-time platform.

**Stack:** Expo (SDK 51, expo-router) · Supabase (Postgres, Auth, Realtime, Storage,
Edge Functions) · React Native Paper · Zustand · TanStack Query · Stripe · Expo Push.

> ⚠️ This app uses native modules (Stripe, push notifications). It will **not** run in
> Expo Go — you need a **dev build** (`expo-dev-client` / EAS). Push tokens require a
> **physical device** (no iOS Simulator).

---

## 1. Roles

| Role | Home | Does |
|---|---|---|
| `captain` | dashboard | creates orders, manages cart, pays, tracks, chats |
| `charter_party` | approvals | approves/rejects orders with comments |
| `ship_agent` | hub | coordinates, uploads docs, monitors timeline |
| `port_authority` | dashboard | approves port-related services |
| `supplier` | dashboard | accepts/declines + advances line status, uploads delivery docs |
| `admin` | users | verifies accounts, maps 1 supplier ⇄ 1 service ⇄ 1 port |

New accounts are **unverified** until an admin verifies them; unverified users are held
on the pending-verification screen.

---

## 2. Setup

### 2.1 Install
```bash
npm install
cp .env.example .env   # fill in the values below
```

### 2.2 Environment (`.env`)
Client (bundled): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

### 2.3 Supabase
```bash
supabase link --project-ref <your-ref>
supabase db push                      # applies supabase/migrations/0001_init.sql
supabase functions deploy             # deploys all edge functions
# Edge-function secrets (never client-exposed):
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SIGNING_SECRET=whsec_... \
  EXPO_PUSH_ACCESS_TOKEN=...
```
In the Supabase dashboard: **Auth → disable email confirmations** (admin verification
is the only gate). Confirm Realtime is on for `orders`, `order_line_items`, `messages`,
`notifications` (the migration adds them to the publication).

Register the Stripe webhook (`payment_intent.succeeded`) pointing at:
`https://<ref>.functions.supabase.co/stripe-webhook` and put its signing secret in
`STRIPE_WEBHOOK_SIGNING_SECRET`.

### 2.4 Bootstrap an admin
Register a user, then in SQL:
```sql
update public.profiles set role='admin', verified=true where id='<auth-uid>';
```

### 2.5 Run (dev build)
```bash
npx expo run:android   # or run:ios — builds the dev client
npm start              # then open in the dev client
```

---

## 3. Order lifecycle

```
draft (local cart)
  → submit  → pending_charter_approval
  → charter approve → pending_payment
  → pay (Stripe webhook / COD activate-order)
       → pending_port_approval (if any PA service) → active
       → active (otherwise)
  → suppliers accept & advance lines → in_execution → completed
```

Per line item: `pending_supplier → supplier_accepted → preparing → ready →
in_transit → delivered` (delivery requires a document). Suppliers may change only the
status (enforced by a DB guard trigger).

---

## 4. Architecture notes

- **RLS recursion** is solved with `SECURITY DEFINER` helper functions
  (`user_can_access_order`, `supplier_owns_line_item`, `current_user_role`, …) so
  policies stay thin and never recurse. See `supabase/migrations/0001_init.sql`.
- **Order numbers** (`HS-YYYY-NNNNN`) are assigned by a `BEFORE INSERT` trigger backed
  by a per-year counter table — not an edge function.
- **Drafts** live only in the Zustand `cartStore`; the `orders` row is created at submit.
- **Payments** activate via the **Stripe webhook** (server-trusted), with `activate-order`
  serving the COD path and manual fallback.

---

## 5. Project layout

```
app/            expo-router screens, grouped by role: (auth) (captain) (charter-party)
                (ship-agent) (port-authority) (supplier) (admin)
components/     shared/ + per-role UI
lib/            supabase client, auth, notifications, storage helpers
stores/         Zustand: auth, cart, notifications
hooks/          TanStack Query data hooks
constants/      theme, order statuses, service categories
types/          database.ts (regenerate with `npm run gen-types`)
supabase/       migrations/ + functions/ + config.toml
```
# marinebridge-mobile
