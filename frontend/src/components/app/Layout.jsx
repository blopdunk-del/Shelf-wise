import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { LayoutDashboard, Package, Plus, ScanLine, CreditCard, Shield, LogOut, Pill } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/upload", label: "Scan", icon: ScanLine },
  { to: "/add", label: "Add", icon: Plus },
  { to: "/membership", label: "Plan", icon: CreditCard },
];

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[#faf7ee]/90 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
            <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold leading-tight">MedStore</div>
              <div className="text-xs text-muted-foreground leading-tight">Stock & Expiry Tracker</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {user?.is_premium && (
              <span data-testid="premium-badge" className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-1 rounded-full">PREMIUM</span>
            )}
            {user?.is_admin && (
              <Link to="/admin">
                <Button variant="outline" size="sm" data-testid="admin-link" className="gap-1">
                  <Shield className="w-4 h-4" /> Admin
                </Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="logout-btn" className="gap-1">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:block border-t border-border">
          <nav className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
            {navItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                data-testid={`nav-${it.label.toLowerCase()}-desktop`}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 ${
                    isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                <it.icon className="w-4 h-4" /> {it.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 has-bottom-nav md:pb-10">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border">
        <div className="grid grid-cols-5">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              data-testid={`nav-${it.label.toLowerCase()}-mobile`}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[11px] font-medium tap-lg justify-center ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <it.icon className="w-5 h-5" />
              {it.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
