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
import { getAdmin } from "../../../../lib/firebase-admin";
import crypto from "crypto";
import type { Milestone, MaintenanceSubscription, Client } from "../../../../lib/types";
import { createSubscription } from "../../../../lib/gocardless";
import { updateCrmClientStage } from "../../../../lib/crm-update";

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

  // Ensure both buffers are the same length before comparing
  const computedBuf = Buffer.from(computed, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");

  if (computedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, signatureBuf);
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
        // --- Billing request fulfilled (customer + mandate created via hosted flow) ---
        case "billing_requests": {
          if (event.action === "fulfilled") {
            const billingRequestId = event.links.billing_request;
            const customerId = event.links.customer;
            const mandateId = event.links.mandate_request_mandate;

            // Find the client by billingRequestId
            const clientSnap = await db
              .collection("clients")
              .where("billingRequestId", "==", billingRequestId)
              .limit(1)
              .get();

            if (!clientSnap.empty) {
              const updateData: Record<string, string> = {
                updatedAt: new Date().toISOString(),
              };

              if (customerId) {
                updateData.gocardlessCustomerId = customerId;
              }
              if (mandateId) {
                updateData.gocardlessMandateId = mandateId;
              }

              await clientSnap.docs[0].ref.update(updateData);
              console.log(
                `Billing request ${billingRequestId} fulfilled — customer: ${customerId}, mandate: ${mandateId}`
              );
            }
          }
          break;
        }

        // --- Mandate created/active (backup — in case billing_request event doesn't carry mandate) ---
        case "mandates": {
          if (event.action === "created" || event.action === "active") {
            const mandateId = event.links.mandate;
            const customerId = event.links.customer;

            if (customerId) {
              // Find the client by GoCardless customer ID
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
                console.log(`Mandate ${mandateId} saved for customer ${customerId}`);
              }
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

              // Look up the client to get their email for CRM update
              const clientDoc = await db.collection("clients").doc(milestone.clientId).get();
              const clientData = clientDoc.exists ? (clientDoc.data() as Client) : null;

              // Update CRM client stage to "Invoice Paid"
              if (clientData?.email) {
                updateCrmClientStage(clientData.email, "Invoice Paid").catch(err =>
                  console.warn("CRM stage update (Invoice Paid) failed:", err)
                );
              }

              // Check if ALL milestones for this client are now paid
              const allSnap = await db
                .collection("milestones")
                .where("clientId", "==", milestone.clientId)
                .get();

              const allPaid = allSnap.docs.every((d) => {
                const m = d.data() as Milestone;
                return m.id === milestone.id ? true : m.status === "paid";
              });

              // If all milestones are paid, auto-activate maintenance subscription
              if (allPaid) {
                await autoActivateMaintenance(db, milestone.clientId);

                // Update CRM to "Completed"
                if (clientData?.email) {
                  updateCrmClientStage(clientData.email, "Completed").catch(err =>
                    console.warn("CRM stage update (Completed) failed:", err)
                  );
                }
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
              console.warn(
                `Payment ${paymentId} failed for milestone ${mSnap.docs[0].id}`
              );
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
  if (!clientDoc.exists) return;

  const client = clientDoc.data() as Client;

  if (!client.gocardlessMandateId) {
    console.warn(
      `Cannot activate maintenance for client ${clientId} — no mandate ID`
    );
    return;
  }

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
