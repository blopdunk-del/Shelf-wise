import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";

const todayISO = () => new Date().toISOString().split("T")[0];

export default function AddMedicine() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    batch_number: "",
    expiry_date: "",
    quantity: 1,
    purchase_date: todayISO(),
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.batch_number || !form.expiry_date) {
      toast.error("Name, batch, and expiry are required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/medicines", { ...form, quantity: parseInt(form.quantity, 10) });
      toast.success("Medicine added");
      navigate("/inventory");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to add");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="add-page">
      <h1 className="text-2xl font-bold">Add medicine</h1>
      <Card className="surface-card">
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Medicine name *</Label>
              <Input data-testid="add-name" value={form.name} onChange={update("name")} required className="tap-lg mt-1" placeholder="e.g. Paracetamol 500mg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Batch number *</Label>
                <Input data-testid="add-batch" value={form.batch_number} onChange={update("batch_number")} required className="tap-lg mt-1" />
              </div>
              <div>
                <Label>Quantity *</Label>
                <Input data-testid="add-qty" type="number" min={1} value={form.quantity} onChange={update("quantity")} required className="tap-lg mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expiry date *</Label>
                <Input data-testid="add-expiry" type="date" value={form.expiry_date} onChange={update("expiry_date")} required min={todayISO()} className="tap-lg mt-1" />
              </div>
              <div>
                <Label>Purchase date</Label>
                <Input data-testid="add-purchase" type="date" value={form.purchase_date} onChange={update("purchase_date")} className="tap-lg mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea data-testid="add-notes" value={form.notes} onChange={update("notes")} className="mt-1" rows={2} />
            </div>
            <Button data-testid="add-submit" type="submit" disabled={busy} className="w-full tap-xl text-base">
              {busy ? "Adding..." : "Save medicine"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
