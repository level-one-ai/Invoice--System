// ============================================================
// CRM STAGE UPDATER
// ============================================================
// Updates client lead stages in the CRM's Firebase (level-one-crm)
// Uses the Firebase REST API so we don't need to add the CRM's
// Firebase Admin credentials to the invoice system.

const CRM_PROJECT_ID = "level-one-crm";
const CRM_API_KEY = "AIzaSyDyrpKTKqzwJCyGkDnDp4dr3XwYQUQhReM";

// Find a CRM client by email and update their leadStage
export async function updateCrmClientStage(
  clientEmail: string,
  newStage: string
): Promise<void> {
  if (!clientEmail) return;

  const email = clientEmail.toLowerCase().trim();

  try {
    // 1. Query CRM Firestore for client with this email
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${CRM_PROJECT_ID}/databases/(default)/documents:runQuery?key=${CRM_API_KEY}`;

    const queryRes = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "clients" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "email" },
              op: "EQUAL",
              value: { stringValue: email },
            },
          },
          limit: 1,
        },
      }),
    });

    const results = await queryRes.json();

    // Check if we got a result
    if (!Array.isArray(results) || !results[0]?.document?.name) {
      console.warn(`[CRM] No CRM client found with email: ${email}`);
      return;
    }

    const docPath = results[0].document.name;

    // 2. PATCH the document to update leadStage
    const patchUrl = `https://firestore.googleapis.com/v1/${docPath}?key=${CRM_API_KEY}&updateMask.fieldPaths=leadStage&updateMask.fieldPaths=updatedAt`;

    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          leadStage: { stringValue: newStage },
          updatedAt: { integerValue: String(Date.now()) },
        },
      }),
    });

    if (patchRes.ok) {
      console.log(`[CRM] Updated ${email} → ${newStage}`);
    } else {
      const err = await patchRes.text();
      console.warn(`[CRM] PATCH failed for ${email}:`, err);
    }
  } catch (err) {
    console.warn(`[CRM] Stage update failed for ${email}:`, err);
  }
}
