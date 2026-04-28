import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle, Copy, BadgeCheck, Smartphone } from "lucide-react";

export default function Membership() {
  const { user } = useAuth();
  const [bank, setBank] = useState(null);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ reference: "", method: "UPI", note: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [b, p] = await Promise.all([api.get("/payments/bank-details"), api.get("/payments/my")]);
      setBank(b.data);
      setPayments(p.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const copy = (t, label) => { navigator.clipboard.writeText(t); toast.success(`${label} copied`); };

  const openUpiApp = () => {
    if (!bank?.upi_deep_link) return;
    // Open the UPI deep-link — will launch GPay/PhonePe/Paytm/BHIM on mobile
    window.location.href = bank.upi_deep_link;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.reference.trim()) {
      toast.error("Enter your UPI / transaction reference (UTR)");
      return;
    }
    setBusy(true);
    try {
      await api.post("/payments/submit", { ...form, amount: 600 });
      toast.success("Payment submitted. Admin will verify shortly.");
      setForm({ reference: "", method: "UPI", note: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const StatusIcon = ({ s }) => s === "approved" ? <CheckCircle2 className="w-4 h-4 text-primary" /> : s === "rejected" ? <XCircle className="w-4 h-4 text-destructive" /> : <Clock className="w-4 h-4 text-accent" />;

  return (
    <div className="space-y-4" data-testid="membership-page">
      <h1 className="text-2xl font-bold">Membership</h1>

      <Card className="surface-card">
        <CardContent className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase font-bold text-muted-foreground">Current plan</div>
              <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                {user?.is_premium ? <><BadgeCheck className="text-primary" /> Premium</> : "Free"}
              </div>
              {user?.is_premium && user?.premium_expires_at && (
                <div className="text-xs text-muted-foreground mt-1">Active until {new Date(user.premium_expires_at).toLocaleDateString()}</div>
              )}
              {!user?.is_premium && <div className="text-xs text-muted-foreground mt-1">10 item limit · standard alerts</div>}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">₹600<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
              <div className="text-xs text-muted-foreground">Unlimited entries · Priority alerts</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {bank && (
        <Card className="surface-card">
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-bold">Pay ₹{bank.amount} to activate Premium</h2>
              <p className="text-sm text-muted-foreground">Scan the QR with any UPI app, or tap the button below to open your UPI app prefilled.</p>
            </div>

            {bank.upi_qr_url && (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-2xl border border-border shadow-sm">
                  <img
                    data-testid="upi-qr-image"
                    src={bank.upi_qr_url}
                    alt={`UPI QR for ${bank.account_name}`}
                    className="w-56 h-56 object-contain rounded-lg"
                  />
                </div>
                <div className="text-center">
                  <div className="font-semibold">{bank.account_name}</div>
                  <div className="text-xs mono text-muted-foreground">{bank.upi_id}</div>
                </div>
              </div>
            )}

            {bank.upi_deep_link && (
              <Button
                data-testid="open-upi-btn"
                onClick={openUpiApp}
                className="w-full tap-xl text-base gap-2"
              >
                <Smartphone className="w-5 h-5" /> Pay ₹{bank.amount} with UPI app
              </Button>
            )}

            <div className="surface-cream p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">UPI ID</span>
                <div className="flex items-center gap-1">
                  <span className="mono font-semibold">{bank.upi_id}</span>
                  <Button data-testid="copy-upi" size="icon" variant="ghost" className="h-6 w-6" onClick={()=>copy(bank.upi_id, "UPI")}><Copy className="w-3 h-3" /></Button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">₹{bank.amount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Note</span>
                <span>ShelfWise Premium</span>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3 pt-2 border-t border-border">
              <div className="text-sm font-semibold">After paying, submit your reference</div>
              <div>
                <Label>UPI / transaction reference (UTR) *</Label>
                <Input data-testid="pay-ref" value={form.reference} onChange={(e)=>setForm({...form, reference: e.target.value})} required className="tap-lg mt-1" placeholder="e.g. 412345678901" />
                <div className="text-[11px] text-muted-foreground mt-1">Find this in your UPI app's transaction history.</div>
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea data-testid="pay-note" value={form.note} onChange={(e)=>setForm({...form, note: e.target.value})} className="mt-1" rows={2} />
              </div>
              <Button data-testid="pay-submit" type="submit" disabled={busy} className="w-full tap-xl text-base">
                {busy ? "Submitting..." : "Submit payment for verification"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="surface-card">
        <CardContent className="p-4">
          <h2 className="font-bold mb-3">Your payment history</h2>
          {payments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No payments yet.</div>
          ) : (
            <ul className="divide-y divide-border" data-testid="payment-history">
              {payments.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold mono truncate">{p.reference}</div>
                    <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()} · {p.method}</div>
                  </div>
                  <Badge variant="outline" className="gap-1 capitalize"><StatusIcon s={p.status} />{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
