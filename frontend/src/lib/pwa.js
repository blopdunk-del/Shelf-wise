/* PWA helpers: register service worker + manage Web Push subscription. */
import { api } from "./api";

const urlBase64ToUint8Array = (b64) => {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const registerServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("SW register failed", e);
    return null;
  }
};

export const getSubscription = async () => {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
};

export const subscribePush = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push not supported on this browser");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied");

  const reg = await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/vapid-public-key");
  if (!data.public_key) throw new Error("Push not configured on server");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.public_key),
    });
  }
  const json = sub.toJSON();
  await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
  return sub;
};

export const unsubscribePush = async () => {
  const sub = await getSubscription();
  if (!sub) return;
  try { await api.delete("/push/unsubscribe", { params: { endpoint: sub.endpoint } }); } catch (_) {}
  try { await sub.unsubscribe(); } catch (_) {}
};

export const sendTestPush = async () => {
  await api.post("/push/test");
};
