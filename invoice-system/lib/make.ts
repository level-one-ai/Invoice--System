// ============================================================
// MAKE.COM WEBHOOK HELPER
// ============================================================
// Sends data back to Make.com scenarios via webhook URLs.
//
// You'll set up two Make.com webhooks:
//   1. MAKE_WEBHOOK_SEND_INVOICE — triggers the "send invoice email" scenario
//   2. (The inbound webhook that receives proposal data is configured in Make.com
//      and calls YOUR Vercel API at /api/clients — see that route.)

export async function triggerMakeWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Make.com webhook failed (${response.status}): ${text}`);
  }

  return response;
}

/**
 * Ask Make.com to send an invoice email to the client.
 * The Make.com scenario should:
 *   1. Receive this JSON
 *   2. Build the custom HTML email (with the paymentUrl embedded)
 *   3. Send it via its Email module
 */
export async function sendInvoiceEmail(params: {
  clientName: string;
  clientEmail: string;
  companyName: string;
  projectTitle: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  paymentUrl: string;
  invoiceType: "initial" | "milestone" | "maintenance";
}) {
  const webhookUrl = process.env.MAKE_WEBHOOK_SEND_INVOICE;
  if (!webhookUrl) {
    throw new Error("MAKE_WEBHOOK_SEND_INVOICE environment variable is not set.");
  }
  return triggerMakeWebhook(webhookUrl, params);
}
