import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Users, Package, IndianRupee } from "lucide-react";

const Stat = ({ icon: I, label, value, testid }) => (
  <Card className="surface-card" data-testid={testid}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><I className="w-5 h-5" /></div>
      <div>
        <div className="text-xs uppercase font-semibold text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value ?? "-"}</div>
      </div>
    </CardContent>
  </Card>
);

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [users, setUsers] = useState([]);

  const load = async () => {
    try {
      const [s, p, u] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/payments"),
        api.get("/admin/users"),
      ]);
      setStats(s.data); setPayments(p.data); setUsers(u.data);
    } catch { toast.error("Failed to load admin"); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    try { await api.post(`/admin/payments/${id}/approve`); toast.success("Approved"); load(); }
    catch { toast.error("Failed"); }
  };
  const reject = async (id) => {
    try { await api.post(`/admin/payments/${id}/reject`); toast.success("Rejected"); load(); }
    catch { toast.error("Failed"); }
  };
  const grant = async (id) => {
    try { await api.post(`/admin/users/${id}/grant`); toast.success("Granted 1 month"); load(); }
    catch { toast.error("Failed"); }
  };
  const revoke = async (id) => {
    if (!window.confirm("Revoke premium?")) return;
    try { await api.post(`/admin/users/${id}/revoke`); toast.success("Revoked"); load(); }
    catch { toast.error("Failed"); }
  };
  const delUser = async (id) => {
    if (!window.confirm("Delete user permanently?")) return;
    try { await api.delete(`/admin/users/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed"); }
  };

  const StatusBadge = ({ s }) => {
    const map = { approved: ["bg-primary/15 text-primary", CheckCircle2], rejected: ["bg-destructive/15 text-destructive", XCircle], pending: ["bg-accent/15 text-accent", Clock] };
    const [cls, I] = map[s] || map.pending;
    return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full capitalize ${cls}`}><I className="w-3 h-3" /> {s}</span>;
  };

  return (
    <div className="space-y-5" data-testid="admin-page">
      <h1 className="text-2xl font-bold">Admin panel</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat testid="adm-users" icon={Users} label="Users" value={stats?.total_users} />
        <Stat testid="adm-meds" icon={Package} label="Medicines" value={stats?.total_medicines} />
        <Stat testid="adm-pending" icon={Clock} label="Pending pay" value={stats?.pending_payments} />
        <Stat testid="adm-approved" icon={IndianRupee} label="Approved pay" value={stats?.approved_payments} />
      </div>

      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger data-testid="tab-payments" value="payments">Payments</TabsTrigger>
          <TabsTrigger data-testid="tab-users" value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <Card className="surface-card">
            <CardContent className="p-0">
              {payments.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No payments.</div> : (
                <ul className="divide-y divide-border">
                  {payments.map((p) => (
                    <li key={p.id} data-testid={`pay-row-${p.id}`} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.user_name} <span className="text-xs text-muted-foreground">({p.user_email})</span></div>
                        <div className="text-xs text-muted-foreground mono">Ref: {p.reference} · ₹{p.amount} · {p.method}</div>
                        {p.note && <div className="text-xs text-muted-foreground italic mt-1">"{p.note}"</div>}
                        <div className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge s={p.status} />
                        {p.status === "pending" && (
                          <>
                            <Button data-testid={`approve-${p.id}`} size="sm" onClick={() => approve(p.id)}>Approve</Button>
                            <Button data-testid={`reject-${p.id}`} size="sm" variant="outline" onClick={() => reject(p.id)}>Reject</Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users">
          <Card className="surface-card">
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {users.map((u) => (
                  <li key={u.id} data-testid={`user-row-${u.id}`} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{u.name} {u.is_admin && <Badge>Admin</Badge>} {u.is_premium && <Badge variant="outline" className="text-primary border-primary">Premium</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{u.email} · {u.shop_name || "-"}</div>
                      {u.premium_expires_at && <div className="text-xs text-muted-foreground">Premium until {new Date(u.premium_expires_at).toLocaleDateString()}</div>}
                    </div>
                    {!u.is_admin && (
                      <div className="flex items-center gap-2">
                        <Button data-testid={`grant-${u.id}`} size="sm" variant="outline" onClick={() => grant(u.id)}>+1 mo</Button>
                        {u.is_premium && <Button data-testid={`revoke-${u.id}`} size="sm" variant="ghost" onClick={() => revoke(u.id)}>Revoke</Button>}
                        <Button data-testid={`delete-${u.id}`} size="sm" variant="ghost" className="text-destructive" onClick={() => delUser(u.id)}>Delete</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
