// ============================================================
// GOCARDLESS API HELPER
// ============================================================
// Wraps the GoCardless Node.js SDK.
// Required env var: GOCARDLESS_ACCESS_TOKEN
// Optional env var: GOCARDLESS_ENVIRONMENT ("sandbox" | "live")
//
// NOTE: You will also need a webhook endpoint so GoCardless can
// notify you when payments succeed / fail. See /app/api/webhooks/gocardless/route.ts

import GoCardless from "gocardless-nodejs";
import { Environments } from "gocardless-nodejs/constants";

let client: InstanceType<typeof GoCardless> | null = null;

export function getGoCardlessClient() {
  if (client) return client;

  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("GOCARDLESS_ACCESS_TOKEN environment variable is not set.");
  }

  const environment =
    process.env.GOCARDLESS_ENVIRONMENT === "live"
      ? Environments.Live
      : Environments.Sandbox;

  client = new GoCardless(accessToken, environment);
  return client;
}

// ----- Customer helpers -----

export async function createCustomer(params: {
  email: string;
  givenName: string;
  familyName: string;
  companyName?: string;
}) {
  const gc = getGoCardlessClient();
  // Split name into given/family if a single "name" is provided
  const customer = await gc.customers.create({
    email: params.email,
    given_name: params.givenName,
    family_name: params.familyName,
    company_name: params.companyName || undefined,
  });
  return customer;
}

// ----- Billing Request Flow (for initial mandate + first payment) -----
// GoCardless's Billing Request Flow lets a customer set up a
// Direct Debit mandate and optionally make an instant payment
// in the same hosted page.

export async function createBillingRequestWithPayment(params: {
  customerId: string;
  amount: number; // in pence / cents
  currency: string;
  description: string;
}) {
  const gc = getGoCardlessClient();

  // 1. Create a billing request (mandate + payment in one go)
  const billingRequest = await gc.billingRequests.create({
    mandate_request: {
      scheme: "bacs", // change to "sepa_core" for EUR, "ach" for USD, etc.
      currency: params.currency,
    },
    payment_request: {
      amount: params.amount,
      currency: params.currency,
      description: params.description,
    },
    links: {
      customer: params.customerId,
    },
  });

  // 2. Create a billing request flow (hosted page the customer visits)
  const flow = await gc.billingRequestFlows.create({
    redirect_uri:
      process.env.GOCARDLESS_REDIRECT_URI ||
      "https://your-domain.com/payment/success",
    exit_uri:
      process.env.GOCARDLESS_EXIT_URI ||
      "https://your-domain.com/payment/cancelled",
    links: {
      billing_request: billingRequest.id!,
    },
  });

  return {
    billingRequestId: billingRequest.id,
    paymentPageUrl: flow.authorisation_url, // <-- URL to embed in the email
  };
}

// ----- One-off Payment (for milestone invoices, once mandate exists) -----

export async function createPayment(params: {
  mandateId: string;
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, string>;
}) {
  const gc = getGoCardlessClient();

  const payment = await gc.payments.create({
    amount: params.amount,
    currency: params.currency,
    description: params.description,
    metadata: params.metadata || {},
    links: {
      mandate: params.mandateId,
    },
  });

  return payment;
}

// ----- Subscription (for maintenance) -----

export async function createSubscription(params: {
  mandateId: string;
  amount: number;
  currency: string;
  intervalUnit: "monthly";
  count: number; // total number of payments
  metadata?: Record<string, string>;
}) {
  const gc = getGoCardlessClient();

  const subscription = await gc.subscriptions.create({
    amount: params.amount,
    currency: params.currency,
    interval_unit: params.intervalUnit,
    count: params.count,
    metadata: params.metadata || {},
    links: {
      mandate: params.mandateId,
    },
  });

  return subscription;
}

export async function cancelSubscription(subscriptionId: string) {
  const gc = getGoCardlessClient();
  const result = await gc.subscriptions.cancel(subscriptionId);
  return result;
}
