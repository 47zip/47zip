import "server-only";

export function paypalBase() {
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}
export async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal configuration is missing.");
  const response = await fetch(paypalBase() + "/v1/oauth2/token", {
    method: "POST", cache: "no-store",
    headers: { Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PayPal authentication failed.");
  const body = await response.json();
  return body.access_token as string;
}

export async function verifyPaypalWebhook(request: Request, event: unknown) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  if (!webhookId || !transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false;
  const token = await paypalToken();
  const response = await fetch(paypalBase() + "/v1/notifications/verify-webhook-signature", {
    method: "POST", cache: "no-store",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      transmission_id: transmissionId, transmission_time: transmissionTime, cert_url: certUrl,
      auth_algo: authAlgo, transmission_sig: transmissionSig, webhook_id: webhookId, webhook_event: event,
    }),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.verification_status === "SUCCESS";
}

export async function capturePaypalOrder(orderId: string) {
  const token = await paypalToken();
  const response = await fetch(paypalBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId) + "/capture", {
    method: "POST", cache: "no-store",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "PayPal-Request-Id": orderId + "-capture" },
    body: "{}",
  });
  const data = await response.json();
  if (!response.ok && data.status !== "COMPLETED") throw new Error("PayPal capture failed.");
  return data;
}

export async function paypalOrderDetails(orderId: string) {
  const token = await paypalToken();
  const response = await fetch(paypalBase() + "/v2/checkout/orders/" + encodeURIComponent(orderId), {
    headers: { Authorization: "Bearer " + token }, cache: "no-store",
  });
  if (!response.ok) throw new Error("PayPal order lookup failed.");
  return response.json();
}
