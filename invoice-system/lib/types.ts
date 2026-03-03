// ============================================================
// TYPE DEFINITIONS — Invoice & Client Tracking System
// ============================================================

// --- Client ---
export interface Client {
  id: string; // Firebase document ID
  name: string;
  email: string;
  companyName: string;
  projectTitle: string;
  gocardlessCustomerId: string; // GoCardless customer ID
  gocardlessMandateId?: string; // GoCardless mandate ID (set after mandate is created)
  status: "active" | "completed" | "archived";
  createdAt: string; // ISO date
  updatedAt: string;
}

// --- Checklist item within a milestone ---
export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

// --- Milestone ---
export interface Milestone {
  id: string;
  clientId: string;
  title: string;
  description: string;
  amount: number; // in pence/cents (minor currency unit)
  currency: string; // e.g. "GBP"
  order: number; // sequence: 0 = initial invoice, 1+ = milestones
  status: "draft" | "sent" | "paid";
  checklist: ChecklistItem[];
  invoiceId?: string; // GoCardless payment ID once created
  invoiceUrl?: string; // GoCardless hosted payment page URL
  sentAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Maintenance Subscription ---
export interface MaintenanceSubscription {
  id: string;
  clientId: string;
  amount: number; // in pence/cents
  currency: string;
  intervalUnit: "monthly";
  totalMonths: number; // e.g. 3
  monthsCompleted: number;
  gocardlessSubscriptionId?: string;
  status: "pending" | "active" | "completed" | "cancelled";
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Webhook payload from the proposal system (received by Make.com) ---
export interface ProposalWebhookPayload {
  client: {
    name: string;
    email: string;
    companyName: string;
  };
  projectTitle: string;
  initialInvoice: {
    amount: number; // in pence/cents
    currency: string;
    description: string;
  };
  milestones: Array<{
    title: string;
    description: string;
    amount: number;
    currency: string;
    checklist: string[]; // labels for each checklist item
  }>;
  maintenance: {
    amount: number;
    currency: string;
    months: number; // how many months the subscription should run
  };
}

// --- API response shapes ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Dashboard view models ---
export interface ClientWithMilestones extends Client {
  milestones: Milestone[];
  maintenance: MaintenanceSubscription | null;
}

export interface DashboardStats {
  totalClients: number;
  activeProjects: number;
  pendingInvoices: number;
  totalRevenue: number;
}
