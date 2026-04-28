import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import { Boxes } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", shop_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await register(form);
      toast.success("Account created");
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Create your ShelfWise account</h1>
            <p className="text-sm text-muted-foreground">Start free — upgrade when you need</p>
          </div>
        </div>

        <Card className="surface-card">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Full name</Label>
                <Input data-testid="register-name-input" value={form.name} onChange={update("name")} required className="tap-lg mt-1" />
              </div>
              <div>
                <Label>Store / business name (optional)</Label>
                <Input data-testid="register-shop-input" value={form.shop_name} onChange={update("shop_name")} className="tap-lg mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input data-testid="register-email-input" type="email" value={form.email} onChange={update("email")} required className="tap-lg mt-1" />
              </div>
              <div>
                <Label>Password</Label>
                <Input data-testid="register-password-input" type="password" value={form.password} onChange={update("password")} required minLength={6} className="tap-lg mt-1" />
              </div>
              <Button data-testid="register-submit-btn" type="submit" disabled={busy} className="w-full tap-lg text-base">
                {busy ? "Creating..." : "Create account"}
              </Button>
            </form>
            <p className="text-sm text-center mt-5 text-muted-foreground">
              Already have account?{" "}
              <Link to="/login" data-testid="go-login-link" className="text-primary font-semibold">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
