// ============================================================
// POST /api/webhooks/gocardless
// ============================================================
// GoCardless sends webhook events here when payments succeed,
// fail, mandates are created, subscriptions complete, etc.
//
// You MUST register this URL in your GoCardless Dashboard under
//   Settings → Webhooks → Create Webhook Endpoint
//   URL: https://your-vercel-domain.com/api/webhooks/gocardless
//
// GoCardless signs every webhook with a secret. Store it as:
//   GOCARDLESS_WEBHOOK_SECRET

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebase-admin";
import crypto from "crypto";
import type { Milestone, MaintenanceSubscription, Client } from "@/lib/types";
import { createSubscription } from "@/lib/gocardless";

// ---------- Signature verification ----------

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("GOCARDLESS_WEBHOOK_SECRET not set — skipping verification");
    return true; // In production, always verify!
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );
}

// ---------- Handler ----------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("webhook-signature") || "";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { db } = getAdmin();
  const payload = JSON.parse(rawBody);
  const events: Array<{
    id: string;
    resource_type: string;
    action: string;
    links: Record<string, string>;
  }> = payload.events || [];

  for (const event of events) {
    try {
      switch (event.resource_type) {
        // --- Mandate created (after first billing request flow completes) ---
        case "mandates": {
          if (event.action === "created" || event.action === "active") {
            const mandateId = event.links.mandate;
            const customerId = event.links.customer;

            // Find the client by GoCardless customer ID and save the mandate
            const clientSnap = await db
              .collection("clients")
              .where("gocardlessCustomerId", "==", customerId)
              .limit(1)
              .get();

            if (!clientSnap.empty) {
              await clientSnap.docs[0].ref.update({
                gocardlessMandateId: mandateId,
                updatedAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        // --- Payment confirmed / failed ---
        case "payments": {
          const paymentId = event.links.payment;

          if (event.action === "confirmed") {
            // Find the milestone with this payment ID
            const mSnap = await db
              .collection("milestones")
              .where("invoiceId", "==", paymentId)
              .limit(1)
              .get();

            if (!mSnap.empty) {
              const milestoneDoc = mSnap.docs[0];
              const milestone = milestoneDoc.data() as Milestone;

              await milestoneDoc.ref.update({
                status: "paid",
                paidAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              // Check if ALL milestones for this client are now paid
              const allSnap = await db
                .collection("milestones")
                .where("clientId", "==", milestone.clientId)
                .get();

              const allPaid = allSnap.docs.every(
                (d) => {
                  const m = d.data() as Milestone;
                  return m.id === milestone.id ? true : m.status === "paid";
                }
              );

              // If all milestones are paid, auto-activate maintenance subscription
              if (allPaid) {
                await autoActivateMaintenance(db, milestone.clientId);
              }
            }
          }

          if (event.action === "failed") {
            const mSnap = await db
              .collection("milestones")
              .where("invoiceId", "==", paymentId)
              .limit(1)
              .get();

            if (!mSnap.empty) {
              // You could send a notification here via Make.com
              console.warn(`Payment ${paymentId} failed for milestone ${mSnap.docs[0].id}`);
            }
          }
          break;
        }

        // --- Subscription completed (all payments collected) ---
        case "subscriptions": {
          if (event.action === "finished" || event.action === "cancelled") {
            const subId = event.links.subscription;

            const subSnap = await db
              .collection("subscriptions")
              .where("gocardlessSubscriptionId", "==", subId)
              .limit(1)
              .get();

            if (!subSnap.empty) {
              await subSnap.docs[0].ref.update({
                status: "completed",
                updatedAt: new Date().toISOString(),
              });

              // Also mark the client as completed
              const sub = subSnap.docs[0].data() as MaintenanceSubscription;
              await db.collection("clients").doc(sub.clientId).update({
                status: "completed",
                updatedAt: new Date().toISOString(),
              });
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error(`Error processing event ${event.id}:`, err);
      // Continue processing other events
    }
  }

  // Always respond 2xx to acknowledge receipt
  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------- Auto-activate maintenance ----------

async function autoActivateMaintenance(
  db: FirebaseFirestore.Firestore,
  clientId: string
) {
  const clientDoc = await db.collection("clients").doc(clientId).get();
  const client = clientDoc.data() as Client;

  if (!client.gocardlessMandateId) return;

  const subSnap = await db
    .collection("subscriptions")
    .where("clientId", "==", clientId)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (subSnap.empty) return;

  const subDoc = subSnap.docs[0];
  const sub = subDoc.data() as MaintenanceSubscription;

  const gcSub = await createSubscription({
    mandateId: client.gocardlessMandateId,
    amount: sub.amount,
    currency: sub.currency,
    intervalUnit: "monthly",
    count: sub.totalMonths,
    metadata: { clientId },
  });

  await subDoc.ref.update({
    status: "active",
    gocardlessSubscriptionId: gcSub.id,
    activatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(
    `Maintenance subscription activated for client ${clientId}: ${gcSub.id}`
  );
}
