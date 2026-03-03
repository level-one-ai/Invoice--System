// ============================================================
// FIREBASE ADMIN SDK — for use in API routes (server-side only)
// ============================================================
// Store the service account JSON in FIREBASE_SERVICE_ACCOUNT env var
// as a base64-encoded string, or store each field individually.

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let adminApp: App;
let adminDb: Firestore;

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Option 1: Full service-account JSON as base64
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encoded) {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf-8")
    );
    return initializeApp({
      credential: cert(decoded),
    });
  }

  // Option 2: Individual env vars
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines for the private key
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdmin() {
  if (!adminApp) {
    adminApp = getAdminApp();
  }
  if (!adminDb) {
    adminDb = getFirestore(adminApp);
  }
  return { app: adminApp, db: adminDb };
}
