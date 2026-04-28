import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Boxes, Package, ScanLine, Plus, Calendar, AlertTriangle, Bell,
  ChevronLeft, ChevronRight, BadgeCheck, CheckCircle2, Sparkles, LogOut
} from "lucide-react";

const steps = [
  {
    icon: Boxes,
    title: "Welcome to ShelfWise",
    subtitle: "Track every item in your store",
    body: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed">
          ShelfWise helps any retailer — pharmacy, grocery, cosmetics, supermarket — keep
          track of stock and get alerted before items expire. No more dead inventory or
          surprise losses.
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Scan purchase receipts → auto-extract items with AI</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Get email + in-app alerts 10 days before expiry</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Search, filter and sort your inventory by expiry</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Mobile-first — works on any phone like an app</li>
        </ul>
      </div>
    ),
  },
  {
    icon: Package,
    title: "Your Dashboard",
    subtitle: "Everything at a glance",
    body: (
      <div className="space-y-4">
        <p className="text-sm">See total stock, items expiring in 10 days, and expired items — all in one screen.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="surface-cream p-3 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">128</div>
          </div>
          <div className="surface-cream p-3 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Qty</div>
            <div className="text-2xl font-bold">2,431</div>
          </div>
          <div className="bg-accent/15 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-accent">Expiring 10d</div>
            <div className="text-2xl font-bold text-accent">7</div>
          </div>
          <div className="bg-destructive/15 p-3 rounded-lg">
            <div className="text-[10px] uppercase font-bold text-destructive">Expired</div>
            <div className="text-2xl font-bold text-destructive">2</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground italic">Sample data — your real numbers appear after upgrade.</p>
      </div>
    ),
  },
  {
    icon: ScanLine,
    title: "Scan a receipt",
    subtitle: "AI extracts items in seconds",
    body: (
      <div className="space-y-3">
        <p className="text-sm">Snap a photo of any purchase invoice. ShelfWise reads each line and pre-fills:</p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Item name</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Batch number</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Expiry date</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Quantity</li>
        </ul>
        <p className="text-sm">You review & edit, then save — it's that fast.</p>
      </div>
    ),
  },
  {
    icon: Plus,
    title: "Add manually too",
    subtitle: "For items without receipts",
    body: (
      <div className="space-y-3">
        <p className="text-sm">Some items don't come with printed expiry? No problem.
        Add any item manually with a few taps — name, batch, expiry, quantity.</p>
        <div className="surface-cream p-3 rounded-lg space-y-2 text-sm">
          <div><span className="text-muted-foreground">Name:</span> <span className="font-semibold">Amul Butter 500g</span></div>
          <div><span className="text-muted-foreground">Batch:</span> <span className="mono">AMB-4421</span></div>
          <div><span className="text-muted-foreground">Expiry:</span> <span className="font-semibold text-accent">2026-08-15</span></div>
          <div><span className="text-muted-foreground">Quantity:</span> <span className="font-semibold">24</span></div>
        </div>
      </div>
    ),
  },
  {
    icon: Calendar,
    title: "Inventory & filters",
    subtitle: "Find anything in seconds",
    body: (
      <div className="space-y-3">
        <p className="text-sm">Search by name or batch. Filter by:</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1"><Package className="w-3 h-3" /> All inventory</Badge>
          <Badge variant="outline" className="gap-1 text-accent border-accent/40"><Calendar className="w-3 h-3" /> Expiring 10d</Badge>
          <Badge variant="outline" className="gap-1 text-destructive border-destructive/40"><AlertTriangle className="w-3 h-3" /> Expired</Badge>
        </div>
        <p className="text-sm">Sort by expiry (soonest first), name, or quantity. Edit and delete in one tap.</p>
      </div>
    ),
  },
  {
    icon: Bell,
    title: "Smart expiry alerts",
    subtitle: "Never lose money to dead stock",
    body: (
      <div className="space-y-3">
        <p className="text-sm">10 days before any item expires, you get a notification with full details:</p>
        <div className="surface-cream p-3 rounded-lg space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold">3 items expiring soon</span>
            <span className="text-muted-foreground">Today, 9:00 AM</span>
          </div>
          <div className="flex justify-between"><span><span className="font-semibold">Crocin 500mg</span> <span className="mono text-muted-foreground">· B-221 · Qty 40</span></span><span className="font-semibold text-accent">2026-05-08 (8d)</span></div>
          <div className="flex justify-between"><span><span className="font-semibold">Amul Curd 1L</span> <span className="mono text-muted-foreground">· AC-118 · Qty 12</span></span><span className="font-semibold text-accent">2026-05-09 (9d)</span></div>
          <div className="flex justify-between"><span><span className="font-semibold">Loreal Shampoo</span> <span className="mono text-muted-foreground">· LS-90 · Qty 6</span></span><span className="font-semibold text-accent">2026-05-10 (10d)</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Email + in-app — nothing slips through.</p>
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: "Unlock the full app",
    subtitle: "₹600/month. Cancel anytime.",
    body: (
      <div className="space-y-4">
        <p className="text-sm">Premium gives you everything you just saw — and more:</p>
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Unlimited items in inventory</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> AI receipt scanning</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Priority email + in-app alerts</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Search, filter, sort, edit, delete</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /> Pay once with UPI — instant activation</li>
        </ul>
        <div className="surface-cream p-4 rounded-lg flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground font-bold">Monthly</div>
            <div className="text-3xl font-bold">₹600</div>
          </div>
          <BadgeCheck className="w-10 h-10 text-primary" />
        </div>
      </div>
    ),
  },
];

export default function Tutorial() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const total = steps.length;
  const s = steps[step];
  const Icon = s.icon;
  const isLast = step === total - 1;

  const next = () => isLast ? navigate("/membership") : setStep(step + 1);
  const prev = () => setStep(Math.max(0, step - 1));

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="tutorial-page">
      <header className="bg-[#faf7ee]/90 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold leading-tight">ShelfWise</div>
              <div className="text-xs text-muted-foreground leading-tight">Free tour</div>
            </div>
          </div>
          <Button data-testid="tutorial-logout" variant="ghost" size="sm" onClick={handleLogout} className="gap-1">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span data-testid="tutorial-step-indicator">Step {step + 1} of {total}</span>
            <span>{Math.round(((step + 1) / total) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / total) * 100}%` }} />
          </div>
        </div>

        <Card className="surface-card fade-in-up" key={step}>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">{s.title}</h1>
                <p className="text-sm text-muted-foreground">{s.subtitle}</p>
              </div>
            </div>
            <div data-testid="tutorial-step-body">{s.body}</div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button data-testid="tutorial-prev" variant="outline" onClick={prev} disabled={step === 0} className="tap-xl gap-1">
            <ChevronLeft className="w-4 h-4" /> Previous
          </Button>
          <Button data-testid="tutorial-next" onClick={next} className="tap-xl gap-1">
            {isLast ? "Get Premium" : "Next"} <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {!isLast && (
          <div className="text-center mt-4">
            <Link to="/membership" data-testid="tutorial-skip" className="text-xs text-muted-foreground underline">
              Skip tour and upgrade now
            </Link>
          </div>
        )}

        <div className="mt-8 surface-cream p-4 rounded-lg text-center">
          <div className="text-xs text-muted-foreground">Hi {user?.name?.split(" ")[0]}, this is a preview only. Upgrade to start tracking your real stock.</div>
        </div>
      </main>
    </div>
  );
}
