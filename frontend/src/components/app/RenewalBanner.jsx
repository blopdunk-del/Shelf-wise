import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { AlertTriangle } from "lucide-react";

const RenewalBanner = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    api.get("/membership/status").then((r) => { if (mounted) setStatus(r.data); }).catch(() => {});
    return () => { mounted = false; };
  }, [user]);

  if (!status?.needs_renewal) return null;

  const days = status.days_left;
  const tone = days <= 1 ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground";

  return (
    <div data-testid="renewal-banner" className={`${tone} text-sm`}>
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="truncate">
            <span className="font-semibold">Premium expires in {days} day{days === 1 ? "" : "s"}</span>
            {" — renew ₹600 to keep tracking your stock."}
          </span>
        </div>
        <Link to="/membership">
          <Button data-testid="renew-now-btn" size="sm" variant="secondary" className="shrink-0">Renew now</Button>
        </Link>
      </div>
    </div>
  );
};

export default RenewalBanner;
