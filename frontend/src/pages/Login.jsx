import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import { Pill } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome ${u.name}`);
      navigate(u.is_admin ? "/admin" : "/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">MedStore</h1>
            <p className="text-sm text-muted-foreground">Track stock & expiry the easy way</p>
          </div>
        </div>

        <Card className="surface-card">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-1">Welcome back</h2>
            <p className="text-sm text-muted-foreground mb-6">Sign in to continue</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  data-testid="login-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="tap-lg mt-1"
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="tap-lg mt-1"
                />
              </div>
              <Button data-testid="login-submit-btn" type="submit" disabled={busy} className="w-full tap-lg text-base">
                {busy ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <p className="text-sm text-center mt-5 text-muted-foreground">
              New here?{" "}
              <Link to="/register" data-testid="go-register-link" className="text-primary font-semibold">
                Create account
              </Link>
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 surface-cream p-4 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">Admin demo</div>
          admin@medstore.com / Admin@12345
        </div>
      </div>
    </div>
  );
}
