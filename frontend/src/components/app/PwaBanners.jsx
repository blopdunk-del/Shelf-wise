import React, { useEffect, useState } from "react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Bell, BellOff, Download, X } from "lucide-react";
import { toast } from "sonner";
import { subscribePush, unsubscribePush, getSubscription, sendTestPush } from "../../lib/pwa";

const PwaBanners = () => {
  const [pushState, setPushState] = useState("loading"); // "subscribed" | "default" | "denied" | "unsupported"
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("shelfwise_pwa_banner_dismissed") === "1");

  // Detect push status
  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      try {
        if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          if (!cancelled) setPushState("unsupported");
          return;
        }
        if (Notification.permission === "denied") { if (!cancelled) setPushState("denied"); return; }
        const sub = await getSubscription();
        if (!cancelled) setPushState(sub ? "subscribed" : "default");
      } catch {
        if (!cancelled) setPushState("default");
      }
    };
    detect();
    return () => { cancelled = true; };
  }, []);

  // Capture install prompt + listen for installed
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const enable = async () => {
    try {
      await subscribePush();
      setPushState("subscribed");
      toast.success("Notifications enabled");
      try { await sendTestPush(); } catch (_) {}
    } catch (e) {
      if (e.message === "Permission denied") {
        toast.error("Permission denied. Enable notifications from your browser settings.");
        setPushState("denied");
      } else {
        toast.error(e.message || "Failed to enable notifications");
      }
    }
  };

  const disable = async () => {
    try {
      await unsubscribePush();
      setPushState("default");
      toast.success("Notifications disabled");
    } catch (e) {
      toast.error("Failed");
    }
  };

  const installNow = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstallEvent(null);
  };

  const dismiss = () => {
    sessionStorage.setItem("shelfwise_pwa_banner_dismissed", "1");
    setDismissed(true);
  };

  // Decide whether to show the prompt card
  const showPushPrompt = pushState === "default";
  const showInstallPrompt = !!installEvent && !installed;
  if (dismissed || (!showPushPrompt && !showInstallPrompt && pushState !== "subscribed")) return null;

  return (
    <Card className="surface-card fade-in-up" data-testid="pwa-banner">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {showPushPrompt ? <Bell className="w-5 h-5" /> : showInstallPrompt ? <Download className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          {showPushPrompt && (
            <>
              <div className="font-semibold text-sm">Get instant alerts</div>
              <div className="text-xs text-muted-foreground">
                Allow notifications so we can alert you the moment something is about to expire — even when the app is closed.
              </div>
            </>
          )}
          {!showPushPrompt && showInstallPrompt && (
            <>
              <div className="font-semibold text-sm">Install ShelfWise</div>
              <div className="text-xs text-muted-foreground">
                Add to your home screen for one-tap access — works offline.
              </div>
            </>
          )}
          {!showPushPrompt && !showInstallPrompt && pushState === "subscribed" && (
            <>
              <div className="font-semibold text-sm flex items-center gap-2">
                <span>Notifications on</span>
                <span className="text-xs text-primary">●</span>
              </div>
              <div className="text-xs text-muted-foreground">You'll get push alerts for expiring items and renewals.</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showPushPrompt && (
            <Button data-testid="enable-push-btn" size="sm" onClick={enable}>Enable</Button>
          )}
          {!showPushPrompt && showInstallPrompt && (
            <Button data-testid="install-app-btn" size="sm" onClick={installNow}>Install</Button>
          )}
          {pushState === "subscribed" && !showInstallPrompt && (
            <Button data-testid="disable-push-btn" size="sm" variant="ghost" onClick={disable}>
              <BellOff className="w-4 h-4" />
            </Button>
          )}
          <Button data-testid="dismiss-pwa-banner" size="icon" variant="ghost" className="h-7 w-7" onClick={dismiss}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PwaBanners;
