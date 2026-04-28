import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Search, Pencil, Trash2 } from "lucide-react";

const todayISO = () => new Date().toISOString().split("T")[0];
const daysUntil = (d) => {
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((new Date(d) - today) / (1000*60*60*24));
};

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const initialFilter = params.get("filter") || "all";
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [sort, setSort] = useState("expiry_asc");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/medicines", { params: { filter, search } });
      setItems(data);
    } catch {
      toast.error("Failed to load inventory");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, search]);

  useEffect(() => {
    setParams(filter === "all" ? {} : { filter });
    // eslint-disable-next-line
  }, [filter]);

  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === "expiry_asc") arr.sort((a,b) => a.expiry_date.localeCompare(b.expiry_date));
    if (sort === "expiry_desc") arr.sort((a,b) => b.expiry_date.localeCompare(a.expiry_date));
    if (sort === "name") arr.sort((a,b) => a.name.localeCompare(b.name));
    if (sort === "qty") arr.sort((a,b) => b.quantity - a.quantity);
    return arr;
  }, [items, sort]);

  const remove = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.delete(`/medicines/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/medicines/${editing.id}`, {
        name: editing.name,
        batch_number: editing.batch_number,
        expiry_date: editing.expiry_date,
        quantity: parseInt(editing.quantity, 10),
      });
      toast.success("Updated");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update");
    }
  };

  return (
    <div className="space-y-4" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <span className="text-xs text-muted-foreground">{sorted.length} item(s)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative md:col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="inventory-search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search item or batch" className="pl-9 tap-lg" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger data-testid="inventory-filter" className="tap-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All inventory</SelectItem>
            <SelectItem value="expiring">Expiring in 10 days</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger data-testid="inventory-sort" className="tap-lg"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="expiry_asc">Expiry: soonest first</SelectItem>
            <SelectItem value="expiry_desc">Expiry: latest first</SelectItem>
            <SelectItem value="name">Name (A→Z)</SelectItem>
            <SelectItem value="qty">Quantity (high→low)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="surface-card">
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No items yet. Add items or scan a receipt.</div>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((m) => {
                const d = daysUntil(m.expiry_date);
                const tone = d < 0 ? "text-destructive" : d <= 10 ? "text-accent" : "text-foreground";
                const tag = d < 0 ? "Expired" : d <= 10 ? `${d}d left` : `${d}d`;
                return (
                  <li key={m.id} data-testid={`inv-item-${m.id}`} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground mono truncate">Batch: {m.batch_number} · Qty {m.quantity}</div>
                      <div className={`text-xs font-semibold mt-1 ${tone}`}>Exp: {m.expiry_date} · {tag}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button data-testid={`edit-${m.id}`} size="icon" variant="ghost" onClick={()=>setEditing({...m})}><Pencil className="w-4 h-4" /></Button>
                      <Button data-testid={`del-${m.id}`} size="icon" variant="ghost" onClick={()=>remove(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent data-testid="edit-dialog">
          <DialogHeader><DialogTitle>Edit item</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input data-testid="edit-name" value={editing.name} onChange={(e)=>setEditing({...editing, name: e.target.value})} className="tap-lg mt-1" /></div>
              <div><Label>Batch</Label><Input data-testid="edit-batch" value={editing.batch_number} onChange={(e)=>setEditing({...editing, batch_number: e.target.value})} className="tap-lg mt-1" /></div>
              <div><Label>Expiry</Label><Input data-testid="edit-expiry" type="date" value={editing.expiry_date} min={todayISO()} onChange={(e)=>setEditing({...editing, expiry_date: e.target.value})} className="tap-lg mt-1" /></div>
              <div><Label>Quantity</Label><Input data-testid="edit-qty" type="number" min={0} value={editing.quantity} onChange={(e)=>setEditing({...editing, quantity: e.target.value})} className="tap-lg mt-1" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button>
            <Button data-testid="edit-save" onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
