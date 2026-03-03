# Invoice & Client Tracking System

Automated invoice generation, client management, and milestone tracking — powered by Next.js, Firebase, GoCardless, and Make.com.

---

## How the System Works

```
Proposal signed
      │
      ▼
 Make.com receives webhook
      │
      ▼
 Calls YOUR Vercel API ──► Creates GoCardless customer
  /api/clients (POST)  ──► Creates billing request (mandate + first payment)
                        ──► Saves client + milestones in Firebase
                        ──► Tells Make.com to send the first invoice email
      │
      ▼
 Client pays via GoCardless hosted page
      │
      ▼
 GoCardless webhook ──► /api/webhooks/gocardless
                    ──► Saves mandate ID on client
                    ──► Marks payments as "paid"
                    ──► Auto-activates maintenance when all milestones are paid
      │
      ▼
 Dashboard (Vercel) ──► View clients, milestones, checklists
                    ──► Click "Send Invoice" to trigger milestone payments
                    ──► Track completion progress per milestone
```

---

## Setup Guide (Step by Step)

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Enable **Firestore Database** (start in test mode for development).
3. Go to **Project Settings → General** and copy the web app config values into your environment variables (`NEXT_PUBLIC_FIREBASE_*`).
4. Go to **Project Settings → Service Accounts → Generate New Private Key**. Base64-encode the JSON file:
   ```bash
   cat serviceAccountKey.json | base64
   ```
   Paste the output as `FIREBASE_SERVICE_ACCOUNT_BASE64`.
5. In Firestore, create these **indexes** (Firestore will prompt you if missing):
   - Collection `milestones`: composite index on `clientId` (ASC) + `order` (ASC)
   - Collection `subscriptions`: composite index on `clientId` (ASC) + `status` (ASC)

### 2. GoCardless Setup

1. Sign in to [GoCardless Dashboard](https://manage.gocardless.com/).
2. Go to **Developers → Create → Access Token**. Copy it to `GOCARDLESS_ACCESS_TOKEN`.
3. **Create a webhook endpoint**:
   - Go to **Developers → Webhooks → Create Webhook Endpoint**
   - URL: `https://your-vercel-domain.com/api/webhooks/gocardless`
   - Copy the **webhook secret** to `GOCARDLESS_WEBHOOK_SECRET`
4. **Yes, you need the webhook endpoint.** It's how GoCardless tells your system when:
   - A mandate is created (so you can charge future milestones)
   - A payment succeeds or fails
   - The maintenance subscription finishes

### 3. Make.com Setup

You need **two Make.com scenarios**:

#### Scenario A: "Receive Proposal & Create Client"
1. **Trigger**: Custom Webhook (receives the proposal-signed payload)
2. **Action**: HTTP Request module → POST to `https://your-vercel-domain.com/api/clients` with the webhook data as the JSON body.

#### Scenario B: "Send Invoice Email"
1. **Trigger**: Custom Webhook (this is the URL you put in `MAKE_WEBHOOK_SEND_INVOICE`)
2. **Action**: Email module → Send an email using a custom HTML template.
   - The webhook payload includes: `clientName`, `clientEmail`, `companyName`, `projectTitle`, `milestoneTitle`, `amount`, `currency`, `paymentUrl`, `invoiceType`.
   - Embed the `paymentUrl` as a button/link in the HTML email.

### 4. Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [Vercel](https://vercel.com/) → Import Project → Select your GitHub repo.
3. Add all environment variables from `.env.example` in Vercel's dashboard.
4. Deploy. Your dashboard will be at `https://your-domain.vercel.app/dashboard`.
5. Update the GoCardless webhook URL and Make.com HTTP Request URL to use your actual Vercel domain.

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── clients/
│   │   │   ├── route.ts              # POST: create client, GET: list clients
│   │   │   └── [clientId]/
│   │   │       └── route.ts          # GET: single client with milestones
│   │   ├── invoices/
│   │   │   └── route.ts              # POST: send invoice / activate maintenance
│   │   │                             # PATCH: toggle checklist item
│   │   └── webhooks/
│   │       └── gocardless/
│   │           └── route.ts          # GoCardless webhook handler
│   ├── dashboard/
│   │   ├── page.tsx                  # Client list
│   │   └── [clientId]/
│   │       └── page.tsx              # Client detail + milestones + checklist
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Redirects to /dashboard
├── lib/
│   ├── types.ts                      # TypeScript type definitions
│   ├── firebase.ts                   # Firebase client SDK
│   ├── firebase-admin.ts             # Firebase Admin SDK
│   ├── gocardless.ts                 # GoCardless API helpers
│   └── make.ts                       # Make.com webhook helpers
├── .env.example
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

---

## Webhook Payload Format

When your proposal system sends data to Make.com, it should use this JSON structure:

```json
{
  "client": {
    "name": "Jane Smith",
    "email": "jane@acmecorp.com",
    "companyName": "Acme Corp"
  },
  "projectTitle": "Website Redesign",
  "initialInvoice": {
    "amount": 150000,
    "currency": "GBP",
    "description": "Initial deposit for Website Redesign"
  },
  "milestones": [
    {
      "title": "Design Phase",
      "description": "Complete wireframes and visual design",
      "amount": 200000,
      "currency": "GBP",
      "checklist": [
        "Wireframes approved",
        "Visual mockups delivered",
        "Design system created"
      ]
    },
    {
      "title": "Development Phase",
      "description": "Build the website",
      "amount": 300000,
      "currency": "GBP",
      "checklist": [
        "Homepage built",
        "Inner pages built",
        "CMS integrated",
        "Testing complete"
      ]
    }
  ],
  "maintenance": {
    "amount": 50000,
    "currency": "GBP",
    "months": 3
  }
}
```

> **Note**: All amounts are in **minor currency units** (pence for GBP, cents for USD). So £1,500.00 = `150000`.

---

## Notes

- The GoCardless scheme is set to `bacs` (UK Direct Debit) by default in `lib/gocardless.ts`. Change to `sepa_core` for EUR or `ach` for USD.
- The maintenance subscription uses GoCardless's `count` parameter to automatically stop after the specified number of months.
- Milestone invoices are pre-generated in Firebase as `draft` status and only sent to GoCardless when you click "Send Invoice" in the dashboard.
