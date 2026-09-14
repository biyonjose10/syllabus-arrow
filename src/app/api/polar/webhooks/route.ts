import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { applySubscription } from "@/lib/tenancy";

/**
 * Polar subscription webhooks.
 *
 * Not the `@polar-sh/better-auth` webhooks plugin: Polar endpoints created on
 * API version 2026-04 sign with a Standard Webhooks `whsec_` secret, and the
 * SDK's `validateEvent` base64-encodes the secret a second time, so every
 * delivery failed with "No matching signature found". `standardwebhooks`
 * accepts the `whsec_` secret as issued.
 */

type SubscriptionData = {
  id: string;
  status: string;
  current_period_end?: string | null;
  ended_at?: string | null;
  customer?: { external_id?: string | null };
};

const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
]);

export async function POST(request: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhooks are not configured" }, { status: 503 });

  const body = await request.text();
  let event: { type: string; data: unknown };
  try {
    event = new Webhook(secret).verify(body, {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    }) as { type: string; data: unknown };
  } catch (err) {
    const message = err instanceof WebhookVerificationError ? err.message : "Invalid payload";
    return Response.json({ error: message }, { status: 400 });
  }

  // Orders and customer state changes also arrive; the subscription events
  // carry everything the plan needs, so the rest are acknowledged and ignored.
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return new Response(null, { status: 202 });

  const s = event.data as SubscriptionData;
  // Polar holds the Better Auth user id as the customer's external id.
  const userId = s.customer?.external_id;
  if (!userId) return new Response(null, { status: 202 });

  await applySubscription(userId, {
    id: s.id,
    status: s.status,
    currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end) : null,
    endedAt: s.ended_at ? new Date(s.ended_at) : null,
  });
  return new Response(null, { status: 200 });
}
