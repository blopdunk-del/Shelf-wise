import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Upload, Trash2, Plus } from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];

export default function UploadReceipt() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);

  const onPick = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!["image/jpeg","image/jpg","image/png","image/webp"].includes(f.type)) {
      toast.error("Please pick JPG, PNG, or WEBP");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const extract = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/ocr/extract", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const meds = (data.medicines || []).map((m) => ({
        name: m.name || "",
        batch_number: m.batch_number || "",
        expiry_date: m.expiry_date || "",
        quantity: m.quantity || 1,
      }));
      if (meds.length === 0) {
        toast.warning("No items extracted. Add manually below.");
        meds.push({ name: "", batch_number: "", expiry_date: "", quantity: 1 });
      } else {
        toast.success(`Extracted ${meds.length} item(s). Please review.`);
      }
      setItems(meds);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "OCR failed");
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (i, k, v) => {
    const next = [...items];
    next[i] = { ...next[i], [k]: v };
    setItems(next);
  };

  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const addItem = () => setItems([...items, { name: "", batch_number: "", expiry_date: "", quantity: 1 }]);

  const saveAll = async () => {
    const valid = items.filter((m) => m.name && m.batch_number && m.expiry_date);
    if (valid.length === 0) {
      toast.error("Please fill name, batch, and expiry for at least one item");
      return;
    }
    setBusy(true);
    let saved = 0, failed = 0;
    for (const m of valid) {
      try {
        await api.post("/medicines", {
          name: m.name,
          batch_number: m.batch_number,
          expiry_date: m.expiry_date,
          quantity: parseInt(m.quantity, 10) || 1,
          purchase_date: todayISO(),
        });
        saved++;
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (saved) toast.success(`Saved ${saved} item(s)`);
    if (failed) toast.error(`${failed} failed (check limits)`);
    if (saved) navigate("/inventory");
  };

  return (
    <div className="space-y-4" data-testid="upload-page">
      <h1 className="text-2xl font-bold">Scan receipt</h1>
      <p className="text-sm text-muted-foreground -mt-2">Upload a photo of your purchase receipt. We'll extract every item using AI — review before saving.</p>

      <Card className="surface-card">
        <CardContent className="p-5">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl py-8 cursor-pointer hover:bg-muted/40 transition" data-testid="upload-zone">
            {preview ? (
              <img src={preview} alt="preview" className="max-h-56 rounded-lg" />
            ) : (
              <>
                <Upload className="w-8 h-8 text-primary mb-2" />
                <div className="font-semibold">Tap to choose receipt photo</div>
                <div className="text-xs text-muted-foreground">JPG, PNG, WEBP</div>
              </>
            )}
            <input data-testid="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} className="hidden" />
          </label>
          <Button data-testid="extract-btn" onClick={extract} disabled={!file || busy} className="w-full tap-xl mt-4 text-base">
            {busy ? "Extracting..." : "Extract with AI"}
          </Button>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card className="surface-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Review & edit</h2>
              <Button data-testid="add-row-btn" size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" />Add row</Button>
            </div>
            {items.map((m, i) => (
              <div key={i} data-testid={`row-${i}`} className="surface-cream p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-bold text-muted-foreground">Item {i + 1}</div>
                  <Button data-testid={`row-del-${i}`} size="icon" variant="ghost" onClick={() => removeItem(i)} className="h-7 w-7"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input data-testid={`row-name-${i}`} value={m.name} onChange={(e) => updateItem(i, "name", e.target.value)} className="tap-lg mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Batch *</Label>
                    <Input data-testid={`row-batch-${i}`} value={m.batch_number} onChange={(e) => updateItem(i, "batch_number", e.target.value)} className="tap-lg mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input data-testid={`row-qty-${i}`} type="number" min={1} value={m.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="tap-lg mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Expiry *</Label>
                  <Input data-testid={`row-exp-${i}`} type="date" value={m.expiry_date} onChange={(e) => updateItem(i, "expiry_date", e.target.value)} className="tap-lg mt-1" />
                </div>
              </div>
            ))}
            <Button data-testid="save-all-btn" onClick={saveAll} disabled={busy} className="w-full tap-xl text-base">
              {busy ? "Saving..." : `Save ${items.length} item(s)`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
