// ============================================================
// /api/invoices
//
// POST /api/invoices/send     — Send a specific milestone invoice
// PATCH /api/invoices/checklist — Toggle a checklist item
// POST /api/invoices/activate-maintenance — Start maintenance sub
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import { createPayment, createSubscription } from "@/lib/gocardless";
import { sendInvoiceEmail } from "@/lib/make";
import type { Milestone, Client, MaintenanceSubscription } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "send") {
      return handleSendMilestone(body);
    }
    if (action === "activate-maintenance") {
      return handleActivateMaintenance(body);
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("POST /api/invoices error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    return handleToggleChecklist(body);
  } catch (error: unknown) {
    console.error("PATCH /api/invoices error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// ---------- Send a milestone invoice ----------

async function handleSendMilestone(body: {
  milestoneId: string;
  clientId: string;
}) {
  const { db } = getAdmin();
  const { milestoneId, clientId } = body;

  // Load milestone
  const mDoc = await db.collection("milestones").doc(milestoneId).get();
  if (!mDoc.exists) {
    return NextResponse.json(
      { success: false, error: "Milestone not found" },
      { status: 404 }
    );
  }
  const milestone = mDoc.data() as Milestone;

  if (milestone.status !== "draft") {
    return NextResponse.json(
      { success: false, error: "Milestone already sent or paid" },
      { status: 400 }
    );
  }

  // Load client
  const cDoc = await db.collection("clients").doc(clientId).get();
  const client = cDoc.data() as Client;

  if (!client.gocardlessMandateId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Client has no active mandate yet. They need to complete the initial payment first.",
      },
      { status: 400 }
    );
  }

  // Create GoCardless payment
  const payment = await createPayment({
    mandateId: client.gocardlessMandateId,
    amount: milestone.amount,
    currency: milestone.currency,
    description: `${client.projectTitle} — ${milestone.title}`,
    metadata: {
      clientId,
      milestoneId,
    },
  });

  const now = new Date().toISOString();

  // Update milestone in Firebase
  await db.collection("milestones").doc(milestoneId).update({
    status: "sent",
    invoiceId: payment.id,
    sentAt: now,
    updatedAt: now,
  });

  // Trigger Make.com to send the invoice email
  await sendInvoiceEmail({
    clientName: client.name,
    clientEmail: client.email,
    companyName: client.companyName,
    projectTitle: client.projectTitle,
    milestoneTitle: milestone.title,
    amount: milestone.amount,
    currency: milestone.currency,
    paymentUrl: `https://pay.gocardless.com/payments/${payment.id}`,
    invoiceType: "milestone",
  });

  return NextResponse.json({
    success: true,
    data: { paymentId: payment.id },
  });
}

// ---------- Toggle checklist item ----------

async function handleToggleChecklist(body: {
  milestoneId: string;
  checklistItemId: string;
  completed: boolean;
}) {
  const { db } = getAdmin();
  const { milestoneId, checklistItemId, completed } = body;

  const mDoc = await db.collection("milestones").doc(milestoneId).get();
  if (!mDoc.exists) {
    return NextResponse.json(
      { success: false, error: "Milestone not found" },
      { status: 404 }
    );
  }

  const milestone = mDoc.data() as Milestone;
  const updatedChecklist = milestone.checklist.map((item) =>
    item.id === checklistItemId ? { ...item, completed } : item
  );

  await db.collection("milestones").doc(milestoneId).update({
    checklist: updatedChecklist,
    updatedAt: new Date().toISOString(),
  });

  // Check if ALL milestones for this client are now paid — if so, activate maintenance
  const allMilestones = await db
    .collection("milestones")
    .where("clientId", "==", milestone.clientId)
    .get();

  const allCompleted = allMilestones.docs.every((d) => {
    const m = d.data() as Milestone;
    // order 0 is the initial deposit, check all are paid
    return m.status === "paid";
  });

  return NextResponse.json({
    success: true,
    data: { checklist: updatedChecklist, allMilestonesPaid: allCompleted },
  });
}

// ---------- Activate maintenance subscription ----------

async function handleActivateMaintenance(body: { clientId: string }) {
  const { db } = getAdmin();
  const { clientId } = body;

  // Load client
  const cDoc = await db.collection("clients").doc(clientId).get();
  const client = cDoc.data() as Client;

  if (!client.gocardlessMandateId) {
    return NextResponse.json(
      { success: false, error: "No mandate on file" },
      { status: 400 }
    );
  }

  // Load subscription record
  const subSnap = await db
    .collection("subscriptions")
    .where("clientId", "==", clientId)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (subSnap.empty) {
    return NextResponse.json(
      { success: false, error: "No pending subscription found" },
      { status: 404 }
    );
  }

  const subDoc = subSnap.docs[0];
  const sub = subDoc.data() as MaintenanceSubscription;

  // Create GoCardless subscription
  const gcSub = await createSubscription({
    mandateId: client.gocardlessMandateId,
    amount: sub.amount,
    currency: sub.currency,
    intervalUnit: "monthly",
    count: sub.totalMonths,
    metadata: { clientId },
  });

  const now = new Date().toISOString();
  await db.collection("subscriptions").doc(sub.id).update({
    status: "active",
    gocardlessSubscriptionId: gcSub.id,
    activatedAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    success: true,
    data: { subscriptionId: gcSub.id },
  });
}
