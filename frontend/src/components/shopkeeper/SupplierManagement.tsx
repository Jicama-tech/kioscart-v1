import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Truck, PackageCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const apiURL = __API_URL__;

interface ProductLink {
  productId: string;
  costPrice: number;
}

interface Supplier {
  _id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  products: ProductLink[];
}

interface Product {
  _id: string;
  name: string;
}

interface POItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

interface PurchaseOrder {
  _id: string;
  supplier: { _id: string; name: string } | string;
  items: POItem[];
  totalAmount: number;
  status: "draft" | "ordered" | "received";
  receivedAt?: string;
  createdAt: string;
}

const emptySupplierForm = { name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "" };

export function SupplierManagement() {
  const { toast } = useToast();
  const token = sessionStorage.getItem("token") || "";
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [view, setView] = useState<"suppliers" | "orders">("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [linkedProducts, setLinkedProducts] = useState<ProductLink[]>([]);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [showPoDialog, setShowPoDialog] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [savingPo, setSavingPo] = useState(false);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [supRes, prodRes, poRes] = await Promise.all([
        fetch(`${apiURL}/suppliers`, { headers: authHeaders }),
        fetch(`${apiURL}/products/shopkeeper-products`, { headers: authHeaders }),
        fetch(`${apiURL}/purchase-orders`, { headers: authHeaders }),
      ]);
      setSuppliers(supRes.ok ? await supRes.json() : []);
      const prodData = prodRes.ok ? await prodRes.json() : [];
      setProducts(Array.isArray(prodData) ? prodData : prodData.products || []);
      setPurchaseOrders(poRes.ok ? await poRes.json() : []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // --- Supplier CRUD ---
  const resetSupplierForm = () => {
    setSupplierForm(emptySupplierForm);
    setLinkedProducts([]);
  };

  const addProductLink = () => setLinkedProducts((l) => [...l, { productId: "", costPrice: 0 }]);
  const updateProductLink = (idx: number, patch: Partial<ProductLink>) =>
    setLinkedProducts((l) => l.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removeProductLink = (idx: number) => setLinkedProducts((l) => l.filter((_, i) => i !== idx));

  const saveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setSavingSupplier(true);
    try {
      const res = await fetch(`${apiURL}/suppliers`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...supplierForm,
          products: linkedProducts.filter((p) => p.productId),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to save supplier");
      toast({ title: "Supplier added" });
      setShowSupplierDialog(false);
      resetSupplierForm();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingSupplier(false);
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/suppliers/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error("Failed to delete supplier");
      toast({ title: "Supplier removed" });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // --- Purchase orders ---
  const resetPoForm = () => {
    setPoSupplierId("");
    setPoItems([]);
  };

  const addPoItem = () => setPoItems((l) => [...l, { productId: "", productName: "", quantity: 1, unitCost: 0 }]);
  const updatePoItem = (idx: number, patch: Partial<POItem>) =>
    setPoItems((l) =>
      l.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        if (patch.productId) {
          merged.productName = products.find((p) => p._id === patch.productId)?.name || "";
        }
        return merged;
      }),
    );
  const removePoItem = (idx: number) => setPoItems((l) => l.filter((_, i) => i !== idx));

  const savePurchaseOrder = async () => {
    if (!poSupplierId || poItems.length === 0 || poItems.some((i) => !i.productId)) {
      toast({ title: "Select a supplier and at least one product", variant: "destructive" });
      return;
    }
    setSavingPo(true);
    try {
      const res = await fetch(`${apiURL}/purchase-orders`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ supplier: poSupplierId, items: poItems }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create purchase order");
      toast({ title: "Purchase order created" });
      setShowPoDialog(false);
      resetPoForm();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingPo(false);
    }
  };

  const receivePo = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/purchase-orders/${id}/received`, {
        method: "PATCH",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to mark received");
      toast({ title: "Stock received", description: "Inventory updated and a Purchases/COGS expense was recorded." });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const supplierName = (s: PurchaseOrder["supplier"]) => (typeof s === "string" ? s : s?.name || "—");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" /> Suppliers
          </h2>
          <p className="text-sm text-muted-foreground">Manage vendors, product costs, and stock purchase orders.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "suppliers" ? "default" : "outline"} size="sm" onClick={() => setView("suppliers")}>
            Suppliers
          </Button>
          <Button variant={view === "orders" ? "default" : "outline"} size="sm" onClick={() => setView("orders")}>
            Purchase Orders
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : view === "suppliers" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Supplier directory</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetSupplierForm();
                setShowSupplierDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Supplier
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {suppliers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No suppliers yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left">
                      <th className="p-3">Name</th>
                      <th className="p-3">Contact</th>
                      <th className="p-3">GSTIN</th>
                      <th className="p-3">Linked products</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s._id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3">
                          {s.contactPerson && <div>{s.contactPerson}</div>}
                          <div className="text-muted-foreground text-xs">{s.phone || s.email || "—"}</div>
                        </td>
                        <td className="p-3">{s.gstin || "—"}</td>
                        <td className="p-3">
                          <Badge variant="secondary">{s.products?.length || 0} product(s)</Badge>
                        </td>
                        <td className="p-3">
                          <Button size="sm" variant="ghost" onClick={() => deleteSupplier(s._id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Purchase orders / stock-in</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetPoForm();
                setShowPoDialog(true);
              }}
              disabled={suppliers.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" /> New Purchase Order
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {purchaseOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No purchase orders yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-left">
                      <th className="p-3">Date</th>
                      <th className="p-3">Supplier</th>
                      <th className="p-3">Items</th>
                      <th className="p-3">Total</th>
                      <th className="p-3">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((po) => (
                      <tr key={po._id} className="border-b last:border-0">
                        <td className="p-3 whitespace-nowrap">{new Date(po.createdAt).toLocaleDateString()}</td>
                        <td className="p-3">{supplierName(po.supplier)}</td>
                        <td className="p-3">{po.items.length} item(s)</td>
                        <td className="p-3">₹{po.totalAmount.toLocaleString()}</td>
                        <td className="p-3">
                          <Badge
                            className={
                              po.status === "received"
                                ? "bg-emerald-100 text-emerald-700"
                                : po.status === "ordered"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 text-slate-700"
                            }
                          >
                            {po.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {po.status !== "received" && (
                            <Button size="sm" variant="outline" onClick={() => receivePo(po._id)}>
                              <PackageCheck className="h-4 w-4 mr-1" /> Mark received
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Supplier dialog */}
      <Dialog open={showSupplierDialog} onOpenChange={setShowSupplierDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>Name</Label>
              <Input value={supplierForm.name} onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact person</Label>
                <Input
                  value={supplierForm.contactPerson}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, contactPerson: e.target.value }))}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={supplierForm.phone} onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={supplierForm.email} onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>GSTIN</Label>
                <Input value={supplierForm.gstin} onChange={(e) => setSupplierForm((f) => ({ ...f, gstin: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={supplierForm.address} onChange={(e) => setSupplierForm((f) => ({ ...f, address: e.target.value }))} />
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between">
                <Label>Linked products (cost price)</Label>
                <Button size="sm" variant="outline" onClick={addProductLink}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2 mt-2">
                {linkedProducts.map((link, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select value={link.productId} onValueChange={(v) => updateProductLink(idx, { productId: v })}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p._id} value={p._id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Cost price"
                      className="w-28"
                      value={link.costPrice}
                      onChange={(e) => updateProductLink(idx, { costPrice: Number(e.target.value) })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeProductLink(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSupplierDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveSupplier} disabled={savingSupplier}>
              {savingSupplier ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Purchase Order dialog */}
      <Dialog open={showPoDialog} onOpenChange={setShowPoDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <Label>Supplier</Label>
              <Select value={poSupplierId} onValueChange={setPoSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addPoItem}>
                <Plus className="h-3 w-3 mr-1" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {poItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Select value={item.productId} onValueChange={(v) => updatePoItem(idx, { productId: v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p._id} value={p._id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Qty"
                    className="w-20"
                    value={item.quantity}
                    onChange={(e) => updatePoItem(idx, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    placeholder="Unit cost"
                    className="w-28"
                    value={item.unitCost}
                    onChange={(e) => updatePoItem(idx, { unitCost: Number(e.target.value) })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removePoItem(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {poItems.length > 0 && (
              <div className="text-right font-semibold">
                Total: ₹{poItems.reduce((sum, i) => sum + i.quantity * i.unitCost, 0).toLocaleString()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPoDialog(false)}>
              Cancel
            </Button>
            <Button onClick={savePurchaseOrder} disabled={savingPo}>
              {savingPo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Purchase Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
