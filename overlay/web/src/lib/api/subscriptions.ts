import { apiFetch } from "./client";

export interface SubscriptionPackage {
  id: string;
  slug: string;
  name: string;
  role_id: string;
  price: number;
  currency: string;
  image_url: string;
  description: string;
  features: string[];
  access_days: number;
  published: boolean;
  public_url: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPackageBody {
  slug: string;
  name: string;
  role_id: string;
  price: number;
  currency: string;
  image_url: string;
  description: string;
  features: string[];
  access_days: number;
  published: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  package_id: string;
  role_id: string;
  provider: string;
  provider_ref: string;
  status: string;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayPalOrder {
  order_id: string;
  status: string;
  approve_url: string;
  links: { href: string; rel: string }[];
}

export interface WhopCheckout {
  checkout_id: string;
  plan_id: string;
  purchase_url: string;
}

export interface PaystackInitialize {
  authorization_url: string;
  access_code: string;
  reference: string;
  public_key: string;
}

export interface StripeCheckoutSession {
  session_id: string;
  checkout_url: string;
  publishable_key: string;
}

export const subscriptionsApi = {
  listPackages: () => apiFetch<SubscriptionPackage[]>("/admin/subscriptions/packages"),
  createPackage: (body: SubscriptionPackageBody) =>
    apiFetch<SubscriptionPackage>("/admin/subscriptions/packages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updatePackage: (id: string, body: SubscriptionPackageBody) =>
    apiFetch<SubscriptionPackage>(`/admin/subscriptions/packages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deletePackage: (id: string) =>
    apiFetch<void>(`/admin/subscriptions/packages/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listRecords: () => apiFetch<UserSubscription[]>("/admin/subscriptions/records"),
  grant: (body: { user_id: string; package_id: string; provider?: string; provider_ref?: string }) =>
    apiFetch<UserSubscription>("/admin/subscriptions/grant", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getPublicPackage: (slug: string) =>
    apiFetch<SubscriptionPackage>(`/public/packages/${encodeURIComponent(slug)}`),
  createPayPalOrder: (body: { package_id: string; return_url?: string; cancel_url?: string }) =>
    apiFetch<PayPalOrder>("/subscriptions/paypal/create-order", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  capturePayPalOrder: (order_id: string) =>
    apiFetch<UserSubscription>("/subscriptions/paypal/capture", {
      method: "POST",
      body: JSON.stringify({ order_id }),
    }),
  createWhopCheckout: (body: { package_id: string; redirect_url?: string }) =>
    apiFetch<WhopCheckout>("/subscriptions/whop/create-checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  initializePaystack: (body: { package_id: string; email?: string; callback_url?: string }) =>
    apiFetch<PaystackInitialize>("/subscriptions/paystack/initialize", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyPaystack: (reference: string) =>
    apiFetch<UserSubscription>(`/subscriptions/paystack/verify/${encodeURIComponent(reference)}`, {
      method: "POST",
    }),
  createStripeCheckoutSession: (body: { package_id: string; success_url?: string; cancel_url?: string }) =>
    apiFetch<StripeCheckoutSession>("/subscriptions/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyStripeCheckoutSession: (sessionID: string) =>
    apiFetch<UserSubscription>(`/subscriptions/stripe/verify/${encodeURIComponent(sessionID)}`, {
      method: "POST",
    }),
};
