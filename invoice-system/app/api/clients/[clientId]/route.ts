// ============================================================
// GET /api/clients/[clientId] — Full client profile with milestones
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/firebase-admin";
import type { Client, Milestone, MaintenanceSubscription, ClientWithMilestones } from "../../../../lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const { db } = getAdmin();
    const clientId = params.clientId;

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: "Client ID is required" },
        { status: 400 }
      );
    }

    // Fetch client
    const clientDoc = await db.collection("clients").doc(clientId).get();
    if (!clientDoc.exists) {
      return NextResponse.json(
        { success: false, error: `Client not found with ID: ${clientId}` },
        { status: 404 }
      );
    }
    const client = clientDoc.data() as Client;

    // Fetch milestones — use just clientId filter first, sort in JS
    // This avoids needing a Firestore composite index
    let milestones: Milestone[] = [];
    try {
      const milestoneSnap = await db
        .collection("milestones")
        .where("clientId", "==", clientId)
        .get();
      milestones = milestoneSnap.docs
        .map((d) => d.data() as Milestone)
        .sort((a, b) => a.order - b.order);
    } catch (milestoneError) {
      console.error("Error fetching milestones:", milestoneError);
      // Continue without milestones rather than failing entirely
    }

    // Fetch subscription
    let maintenance: MaintenanceSubscription | null = null;
    try {
      const subSnap = await db
        .collection("subscriptions")
        .where("clientId", "==", clientId)
        .limit(1)
        .get();
      maintenance = subSnap.empty
        ? null
        : (subSnap.docs[0].data() as MaintenanceSubscription);
    } catch (subError) {
      console.error("Error fetching subscription:", subError);
    }

    const result: ClientWithMilestones = {
      ...client,
      milestones,
      maintenance,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("GET /api/clients/[clientId] error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
