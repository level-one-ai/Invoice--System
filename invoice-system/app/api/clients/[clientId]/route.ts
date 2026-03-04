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
    const { clientId } = params;

    // Fetch client
    const clientDoc = await db.collection("clients").doc(clientId).get();
    if (!clientDoc.exists) {
      return NextResponse.json(
        { success: false, error: "Client not found" },
        { status: 404 }
      );
    }
    const client = clientDoc.data() as Client;

    // Fetch milestones
    const milestoneSnap = await db
      .collection("milestones")
      .where("clientId", "==", clientId)
      .orderBy("order", "asc")
      .get();
    const milestones: Milestone[] = milestoneSnap.docs.map(
      (d) => d.data() as Milestone
    );

    // Fetch subscription
    const subSnap = await db
      .collection("subscriptions")
      .where("clientId", "==", clientId)
      .limit(1)
      .get();
    const maintenance: MaintenanceSubscription | null = subSnap.empty
      ? null
      : (subSnap.docs[0].data() as MaintenanceSubscription);

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
