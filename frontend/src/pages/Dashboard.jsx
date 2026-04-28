import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { AlertTriangle, Calendar, Package, Plus, ScanLine, BadgeCheck, Bell } from "lucide-react";
import { toast } from "sonner";

const StatCard = ({ icon: Icon, label, value, accent, testid }) => (
  <Card data-testid={testid} className="surface-card fade-in-up">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className="text-3xl font-bold mt-1">{value}</div>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const daysUntil = (d) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.round((new Date(d) - today) / (1000*60*60*24));
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [recent, setRecent] = useState([]);

  const load = async () => {
    try {
      const [s, e, a] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/medicines", { params: { filter: "expiring" } }),
        api.get("/alerts/recent"),
      ]);
      setStats(s.data);
      setExpiring(e.data);
      setRecent(a.data);
    } catch {
      toast.error("Failed to load dashboard");
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Hello, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted-foreground">{user?.shop_name || "Your store at a glance"}</p>
      </div>

      {!user?.is_premium && (
        <Card className="border-accent/40 bg-accent/10">
          <CardContent className="p-4 flex items-start gap-3">
            <BadgeCheck className="w-5 h-5 text-accent mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">You're on the Free plan</div>
              <div className="text-xs text-muted-foreground">Limited to 10 items. Upgrade for unlimited entries + priority alerts.</div>
            </div>
            <Link to="/membership"><Button data-testid="upgrade-btn" size="sm" className="tap-lg">Upgrade</Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard testid="stat-total" icon={Package} label="Total" value={stats?.total ?? "-"} accent="bg-primary/10 text-primary" />
        <StatCard testid="stat-quantity" icon={Package} label="Total Qty" value={stats?.total_quantity ?? "-"} accent="bg-primary/10 text-primary" />
        <StatCard testid="stat-expiring" icon={Calendar} label="Expiring 10d" value={stats?.expiring_soon ?? "-"} accent="bg-accent/15 text-accent" />
        <StatCard testid="stat-expired" icon={AlertTriangle} label="Expired" value={stats?.expired ?? "-"} accent="bg-destructive/15 text-destructive" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/upload">
          <Button data-testid="quick-upload-btn" variant="outline" className="w-full h-20 flex flex-col gap-1 tap-xl">
            <ScanLine className="w-5 h-5" />
            <span className="text-sm font-semibold">Scan Receipt</span>
          </Button>
        </Link>
        <Link to="/add">
          <Button data-testid="quick-add-btn" className="w-full h-20 flex flex-col gap-1 tap-xl">
            <Plus className="w-5 h-5" />
            <span className="text-sm font-semibold">Add Manually</span>
          </Button>
        </Link>
      </div>

      <Card className="surface-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base md:text-lg font-bold">Expiring soon (next 10 days)</h2>
            <Link to="/inventory?filter=expiring" className="text-xs text-primary font-semibold">View all</Link>
          </div>
          {expiring.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No items expiring soon. 🎉</div>
          ) : (
            <ul className="divide-y divide-border" data-testid="expiring-list">
              {expiring.slice(0, 6).map((m) => {
                const d = daysUntil(m.expiry_date);
                const tone = d < 0 ? "text-destructive" : d <= 3 ? "text-destructive" : "text-accent";
                return (
                  <li key={m.id} data-testid={`expiring-item-${m.id}`} className="py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground mono">Batch: {m.batch_number} · Qty {m.quantity}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-semibold ${tone}`}>{m.expiry_date}</div>
                      <div className="text-xs text-muted-foreground">{d < 0 ? `Expired ${-d}d` : `${d}d left`}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="surface-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2"><Bell className="w-4 h-4" />Recent notifications</h2>
            <span className="text-xs text-muted-foreground">{recent.length} sent</span>
          </div>
          {recent.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No notifications yet. We'll alert you 10 days before any item expires and 5 days before your membership renews.</div>
          ) : (
            <ul className="space-y-3" data-testid="recent-alerts">
              {recent.slice(0, 5).map((a) => {
                if (a.type === "renewal_reminder") {
                  return (
                    <li key={a.id} data-testid={`alert-${a.id}`} className="surface-cream p-3 rounded-lg border-l-4 border-accent">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-semibold text-accent">Membership renewal due</div>
                        <div className="text-xs text-muted-foreground">{new Date(a.sent_at).toLocaleString()}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Premium expires in {a.days_left} day{a.days_left === 1 ? "" : "s"}. Tap "Renew now" at the top to pay ₹600.
                      </div>
                    </li>
                  );
                }
                // default: item_expiry
                return (
                  <li key={a.id} data-testid={`alert-${a.id}`} className="surface-cream p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">{a.count} item(s) expiring soon</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.sent_at).toLocaleString()}</div>
                    </div>
                    {a.items && a.items.length > 0 && (
                      <ul className="space-y-1">
                        {a.items.slice(0, 4).map((it, i) => {
                          const d = daysUntil(it.expiry_date);
                          return (
                            <li key={i} className="text-xs flex items-center justify-between gap-2">
                              <span className="truncate"><span className="font-semibold">{it.name}</span> <span className="mono text-muted-foreground">· {it.batch_number} · Qty {it.quantity}</span></span>
                              <span className={`shrink-0 font-semibold ${d < 0 ? "text-destructive" : "text-accent"}`}>{it.expiry_date}{d>=0?` (${d}d)`:" (expired)"}</span>
                            </li>
                          );
                        })}
                        {a.items.length > 4 && <li className="text-xs text-muted-foreground">+ {a.items.length - 4} more</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
