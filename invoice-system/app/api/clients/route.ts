// ============================================================
// POST /api/clients — Create a new client + initial invoice
// ============================================================
// This is the endpoint Make.com calls after receiving the
// proposal-signed webhook.  It:
//   1. Creates the customer in GoCardless
//   2. Creates a Billing Request Flow (mandate + first payment)
//   3. Saves the client profile in Firebase
//   4. Pre-generates all milestone records in Firebase
//   5. Saves the maintenance subscription record (pending)
//   6. Asks Make.com to send the first invoice email
//
// GET /api/clients — List all clients (for the dashboard)

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../lib/firebase-admin";
import {
  createBillingRequestWithPayment,
} from "../../../lib/gocardless";
import { sendInvoiceEmail } from "../../../lib/make";
import type {
  ProposalWebhookPayload,
  Client,
  Milestone,
  ChecklistItem,
  MaintenanceSubscription,
} from "../../../lib/types";

// ---------- Helpers ----------

function generateId(): string {
  return crypto.randomUUID();
}

function splitName(fullName: string): { given: string; family: string } {
  const parts = fullName.trim().split(/\s+/);
  const given = parts[0] || fullName;
  const family = parts.slice(1).join(" ") || "-";
  return { given, family };
}

// ---------- POST ----------

export async function POST(request: NextRequest) {
  try {
    let payload: ProposalWebhookPayload;

    // Parse the request body — handle both direct JSON and string-wrapped JSON
    const raw = await request.json();

    // If the payload is a string (e.g. Make.com forwarded invoiceData as a string),
    // parse it. Otherwise use it directly.
    if (typeof raw === "string") {
      try {
        payload = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON string in request body" },
          { status: 400 }
        );
      }
    } else {
      payload = raw;
    }

    // Validate required fields
    const errors: string[] = [];
    if (!payload.client?.name) errors.push("client.name is required");
    if (!payload.client?.email) errors.push("client.email is required");
    if (!payload.client?.companyName) errors.push("client.companyName is required");
    if (!payload.projectTitle) errors.push("projectTitle is required");
    if (!payload.initialInvoice?.amount) errors.push("initialInvoice.amount is required");
    if (!payload.initialInvoice?.currency) errors.push("initialInvoice.currency is required");
    if (!Array.isArray(payload.milestones)) errors.push("milestones must be an array");
    if (!payload.maintenance?.amount) errors.push("maintenance.amount is required");
    if (!payload.maintenance?.currency) errors.push("maintenance.currency is required");
    if (!payload.maintenance?.months) errors.push("maintenance.months is required");

    if (errors.length > 0) {
      console.error("Validation failed:", errors);
      console.error("Received payload:", JSON.stringify(payload, null, 2));
      return NextResponse.json(
        { success: false, error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    const { db } = getAdmin();
    const now = new Date().toISOString();

    // 1. Create billing request flow (customer + mandate + first payment all in one)
    // In live mode, GoCardless requires everything to go through the Billing Requests API.
    // Customer details are pre-filled so the client doesn't have to re-enter them.
    const { given, family } = splitName(payload.client.name);
    const billingResult = await createBillingRequestWithPayment({
      email: payload.client.email,
      givenName: given,
      familyName: family,
      companyName: payload.client.companyName,
      amount: payload.initialInvoice.amount,
      currency: payload.initialInvoice.currency,
      description: `${payload.projectTitle} — Initial deposit`,
    });

    // 2. Save client in Firebase
    // Note: GoCardless customer ID will be available after the client completes
    // the billing request flow — we'll capture it via the webhook.
    const clientId = generateId();
    const client: Client = {
      id: clientId,
      name: payload.client.name,
      email: payload.client.email,
      companyName: payload.client.companyName,
      projectTitle: payload.projectTitle,
      gocardlessCustomerId: "",
      billingRequestId: billingResult.billingRequestId || "",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("clients").doc(clientId).set(client);

    // 3. Save initial invoice as milestone order=0
    const initialMilestone: Milestone = {
      id: generateId(),
      clientId,
      title: "Initial Deposit",
      description: payload.initialInvoice.description,
      amount: payload.initialInvoice.amount,
      currency: payload.initialInvoice.currency,
      order: 0,
      status: "sent",
      checklist: [],
      invoiceUrl: billingResult.paymentPageUrl,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection("milestones")
      .doc(initialMilestone.id)
      .set(initialMilestone);

    // 4. Pre-generate future milestone invoices
    for (let i = 0; i < payload.milestones.length; i++) {
      const m = payload.milestones[i];
      const checklistItems: ChecklistItem[] = m.checklist.map((label) => ({
        id: generateId(),
        label,
        completed: false,
      }));

      const milestone: Milestone = {
        id: generateId(),
        clientId,
        title: m.title,
        description: m.description,
        amount: m.amount,
        currency: m.currency,
        order: i + 1,
        status: "draft",
        checklist: checklistItems,
        createdAt: now,
        updatedAt: now,
      };

      await db.collection("milestones").doc(milestone.id).set(milestone);
    }

    // 5. Save maintenance subscription record (pending — activates later)
    const maintenance: MaintenanceSubscription = {
      id: generateId(),
      clientId,
      amount: payload.maintenance.amount,
      currency: payload.maintenance.currency,
      intervalUnit: "monthly",
      totalMonths: payload.maintenance.months,
      monthsCompleted: 0,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("subscriptions").doc(maintenance.id).set(maintenance);

    // 6. Trigger Make.com to send the initial invoice email
    await sendInvoiceEmail({
      clientName: client.name,
      clientEmail: client.email,
      companyName: client.companyName,
      projectTitle: client.projectTitle,
      milestoneTitle: "Initial Deposit",
      amount: payload.initialInvoice.amount,
      currency: payload.initialInvoice.currency,
      paymentUrl: billingResult.paymentPageUrl!,
      invoiceType: "initial",
      sendInvoice: true,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          clientId,
          billingRequestId: billingResult.billingRequestId,
          paymentPageUrl: billingResult.paymentPageUrl,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/clients error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ---------- GET ----------

export async function GET() {
  try {
    const { db } = getAdmin();
    const snapshot = await db
      .collection("clients")
      .orderBy("createdAt", "desc")
      .get();

    const clients: Client[] = snapshot.docs.map(
      (doc) => doc.data() as Client
    );

    return NextResponse.json({ success: true, data: clients });
  } catch (error: unknown) {
    console.error("GET /api/clients error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
