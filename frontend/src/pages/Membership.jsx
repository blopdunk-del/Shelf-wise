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
import { CheckCircle2, Clock, XCircle, Copy, BadgeCheck } from "lucide-react";

export default function Membership() {
  const { user, refresh } = useAuth();
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

  const submit = async (e) => {
    e.preventDefault();
    if (!form.reference.trim()) {
      toast.error("Enter UPI/transaction reference");
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
              {!user?.is_premium && <div className="text-xs text-muted-foreground mt-1">10 medicine limit · standard alerts</div>}
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
          <CardContent className="p-5 space-y-3">
            <h2 className="font-bold">Pay manually to owner</h2>
            <p className="text-sm text-muted-foreground">Use any UPI app or bank transfer, then submit your reference number below.</p>
            <div className="surface-cream p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">UPI ID</span><div className="flex items-center gap-2"><span className="mono font-semibold">{bank.upi_id}</span><Button data-testid="copy-upi" size="icon" variant="ghost" onClick={()=>copy(bank.upi_id, "UPI")}><Copy className="w-3 h-3" /></Button></div></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">₹{bank.amount}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Bank</span><span>{bank.bank_name}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Account</span><div className="flex items-center gap-2"><span className="mono">{bank.account_number}</span><Button size="icon" variant="ghost" onClick={()=>copy(bank.account_number, "Account")}><Copy className="w-3 h-3" /></Button></div></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">IFSC</span><span className="mono">{bank.ifsc}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Holder</span><span>{bank.account_name}</span></div>
            </div>

            <form onSubmit={submit} className="space-y-3 pt-2">
              <div>
                <Label>UPI / transaction reference *</Label>
                <Input data-testid="pay-ref" value={form.reference} onChange={(e)=>setForm({...form, reference: e.target.value})} required className="tap-lg mt-1" placeholder="e.g. UTR/Txn ID" />
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
