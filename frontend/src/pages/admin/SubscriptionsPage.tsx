import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  Package,
  Loader2,
  ShoppingCart,
  Globe,
  BarChart3,
  CreditCard,
  Users,
  Tag,
  Monitor,
  UserPlus,
  MessageCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const apiURL = __API_URL__;

interface ModuleConfig {
  enabled: boolean;
  limit?: number;
}

interface PlanModules {
  [key: string]: ModuleConfig | undefined;
}

interface Plan {
  _id: string;
  planName: string;
  price: number;
  features: string[];
  moduleType: string;
  validityInDays: number;
  isActive: boolean;
  isDefault?: boolean;
  description?: string;
  modules?: PlanModules;
  forModule?: string;
  createdAt?: string;
  updatedAt?: string;
}

const MODULE_GROUPS = [
  {
    id: "products",
    label: "Product Management",
    icon: Package,
    color: "blue",
    items: [
      { key: "products", label: "Products", hasLimit: true },
      { key: "bulkImport", label: "Bulk Import / Export", hasLimit: false },
    ],
  },
  {
    id: "orders",
    label: "Order Management",
    icon: ShoppingCart,
    color: "amber",
    items: [
      { key: "orders", label: "Orders", hasLimit: false },
      { key: "receipts", label: "Receipt Printing", hasLimit: false },
    ],
  },
  {
    id: "storefront",
    label: "Online Storefront",
    icon: Globe,
    color: "emerald",
    items: [
      { key: "storefront", label: "Storefront", hasLimit: false },
      { key: "customDomain", label: "Custom Domain", hasLimit: false },
      { key: "instagram", label: "Instagram Integration", hasLimit: false },
      { key: "videoSection", label: "Video Section", hasLimit: false },
      { key: "ourStory", label: "Our Story Section", hasLimit: false },
    ],
  },
  {
    id: "analytics",
    label: "Analytics Dashboard",
    icon: BarChart3,
    color: "purple",
    items: [
      { key: "analytics", label: "Analytics & Reports", hasLimit: false },
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
    color: "indigo",
    items: [
      { key: "staticQR", label: "Static QR", hasLimit: false },
      { key: "dynamicQR", label: "Dynamic QR", hasLimit: false },
      { key: "paymentTracking", label: "Payment Tracking (Gmail)", hasLimit: false },
      { key: "razorpay", label: "Card Payments (Razorpay)", hasLimit: false },
    ],
  },
  {
    id: "crm",
    label: "CRM / Customers",
    icon: Users,
    color: "pink",
    items: [
      { key: "crm", label: "Customer Management", hasLimit: false },
    ],
  },
  {
    id: "coupons",
    label: "Coupons & Discounts",
    icon: Tag,
    color: "orange",
    items: [
      { key: "coupons", label: "Coupon Management", hasLimit: false },
    ],
  },
  {
    id: "kiosk",
    label: "Kiosk Mode",
    icon: Monitor,
    color: "cyan",
    items: [
      { key: "kiosk", label: "Kiosk / POS Mode", hasLimit: false },
    ],
  },
  {
    id: "operators",
    label: "Operators",
    icon: UserPlus,
    color: "rose",
    items: [
      { key: "operators", label: "Multi-User Operators", hasLimit: false },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageCircle,
    color: "green",
    items: [
      { key: "whatsappQR", label: "WhatsApp QR", hasLimit: false },
      { key: "chatbot", label: "Smart Assistant", hasLimit: false },
    ],
  },
];

const ALL_MODULE_KEYS = MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.key));

const EMPTY_FORM = {
  planName: "",
  forModule: "shopkeeper",
  price: 0,
  validityInDays: 30,
  description: "",
  moduleType: "Shopkeeper",
  features: "",
  modules: {} as PlanModules,
};

function getToken() {
  return sessionStorage.getItem("token") || "";
}

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    badge: "bg-blue-100 text-blue-800" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   badge: "bg-amber-100 text-amber-800" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-800" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-700",  badge: "bg-purple-100 text-purple-800" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-700",  badge: "bg-indigo-100 text-indigo-800" },
  pink:    { bg: "bg-pink-50",    border: "border-pink-200",    text: "text-pink-700",    badge: "bg-pink-100 text-pink-800" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700",  badge: "bg-orange-100 text-orange-800" },
  cyan:    { bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-700",    badge: "bg-cyan-100 text-cyan-800" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    badge: "bg-rose-100 text-rose-800" },
  green:   { bg: "bg-green-50",   border: "border-green-200",   text: "text-green-700",   badge: "bg-green-100 text-green-800" },
};

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const isGroupEnabled = (group: typeof MODULE_GROUPS[0]) => {
    return group.items.some((item) => form.modules[item.key]?.enabled);
  };

  const toggleGroupAll = (group: typeof MODULE_GROUPS[0], enabled: boolean) => {
    setForm((prev) => {
      const updated = { ...prev.modules };
      group.items.forEach((item) => {
        updated[item.key] = { ...updated[item.key], enabled };
      });
      return { ...prev, modules: updated };
    });
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiURL}/plans/get-plans`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch plans");
      const data = await res.json();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setExpandedGroups(new Set());
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan._id);
    setForm({
      planName: plan.planName,
      forModule: plan.forModule || "shopkeeper",
      price: plan.price,
      validityInDays: plan.validityInDays,
      description: plan.description || "",
      moduleType: plan.moduleType,
      features: (plan.features || []).join(", "),
      modules: plan.modules || {},
    });
    setExpandedGroups(new Set());
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.planName.trim()) return;
    setSaving(true);
    try {
      const body = {
        planName: form.planName.trim(),
        forModule: form.forModule,
        price: Number(form.price),
        validityInDays: Number(form.validityInDays),
        description: form.description,
        moduleType: form.moduleType,
        features: form.features
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        modules: form.modules,
      };

      const url = editingId
        ? `${apiURL}/plans/${editingId}`
        : `${apiURL}/plans/create-plan`;
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save plan");
      setDialogOpen(false);
      await fetchPlans();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/plans/${id}/toggle-active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to toggle");
      await fetchPlans();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/plans/${id}/set-default`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to set default");
      await fetchPlans();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const res = await fetch(`${apiURL}/plans/${deletingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteDialogOpen(false);
      setDeletingId(null);
      await fetchPlans();
    } catch (err) {
      console.error(err);
    }
  };

  const updateModule = (
    key: string,
    field: "enabled" | "limit",
    value: boolean | number
  ) => {
    setForm((prev) => {
      const current = prev.modules[key] || { enabled: false };
      return {
        ...prev,
        modules: {
          ...prev.modules,
          [key]: { ...current, [field]: value },
        },
      };
    });
  };

  const getEnabledCount = (plan: Plan) => {
    if (!plan.modules) return 0;
    return ALL_MODULE_KEYS.filter((k) => (plan.modules as any)?.[k]?.enabled).length;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl sm:text-3xl font-bold">Subscription Plans</h2>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Plan
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No plans yet</p>
            <p className="text-sm mt-1">Create your first subscription plan to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan._id} className={`relative ${!plan.isActive ? "opacity-60" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base sm:text-lg truncate">
                      {plan.planName}
                    </CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {plan.isDefault && (
                        <Badge className="bg-indigo-600">Default</Badge>
                      )}
                      <Badge variant="outline">
                        {getEnabledCount(plan)}/{ALL_MODULE_KEYS.length} modules
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-indigo-600 shrink-0 ml-2">
                    ${plan.price}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {plan.description}
                  </p>
                )}
                <p className="text-sm">
                  <span className="text-muted-foreground">Validity:</span>{" "}
                  <span className="font-medium">{plan.validityInDays} days</span>
                </p>
                {plan.modules && (
                  <div className="flex flex-wrap gap-1">
                    {MODULE_GROUPS.filter((g) =>
                      g.items.some((i) => (plan.modules as any)?.[i.key]?.enabled)
                    ).map((g) => {
                      const c = COLOR_MAP[g.color];
                      return (
                        <Badge key={g.id} className={`text-xs ${c.badge}`}>
                          {g.label}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleActive(plan._id)}>
                    <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                    {plan.isActive ? "Disable" : "Enable"}
                  </Button>
                  {!plan.isDefault && (
                    <Button size="sm" variant="outline" className="text-indigo-600 hover:bg-indigo-50" onClick={() => handleSetDefault(plan._id)}>
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => { setDeletingId(plan._id); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Plan" : "Create Plan"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Plan Name</Label>
                <Input
                  value={form.planName}
                  onChange={(e) => setForm({ ...form, planName: e.target.value })}
                  placeholder="e.g. Starter Plan"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validity (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.validityInDays}
                  onChange={(e) => setForm({ ...form, validityInDays: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description of the plan"
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Features (comma-separated)</Label>
              <Textarea
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                placeholder="e.g. Unlimited products, 24/7 support, Analytics"
                rows={2}
              />
            </div>

            {/* Module Groups */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Modules</Label>
              <div className="space-y-2">
                {MODULE_GROUPS.map((group) => {
                  const colors = COLOR_MAP[group.color];
                  const groupEnabled = isGroupEnabled(group);
                  const isExpanded = expandedGroups.has(group.id);
                  const enabledCount = group.items.filter((i) => form.modules[i.key]?.enabled).length;
                  const Icon = group.icon;

                  return (
                    <div key={group.id} className={`rounded-lg border ${groupEnabled ? colors.border : "border-gray-200"} ${groupEnabled ? colors.bg : "bg-white"} overflow-hidden`}>
                      {/* Group Header */}
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer"
                        onClick={() => toggleGroup(group.id)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Icon className={`h-5 w-5 ${groupEnabled ? colors.text : "text-gray-400"}`} />
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-semibold ${groupEnabled ? colors.text : "text-gray-600"}`}>
                              {group.label}
                            </span>
                            {enabledCount > 0 && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {enabledCount}/{group.items.length} on
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={groupEnabled}
                            onCheckedChange={(checked) => {
                              toggleGroupAll(group, checked);
                              if (checked && !isExpanded) toggleGroup(group.id);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Group Items */}
                      {isExpanded && (
                        <div className="border-t border-gray-200/60 divide-y divide-gray-200/40">
                          {group.items.map((item) => {
                            const current = form.modules[item.key] || { enabled: false };
                            const itemEnabled = current.enabled;
                            return (
                              <div key={item.key} className="flex items-center justify-between px-4 py-2.5 pl-12">
                                <span className="text-sm">{item.label}</span>
                                <div className="flex items-center gap-2">
                                  {item.hasLimit && itemEnabled && (
                                    <div className="flex items-center gap-1.5">
                                      <Label className="text-xs text-muted-foreground">Limit</Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        className="w-20 h-7 text-xs"
                                        placeholder="Unlimited"
                                        value={(current as any).limit || ""}
                                        onChange={(e) =>
                                          updateModule(item.key, "limit", e.target.value ? Number(e.target.value) : 0)
                                        }
                                      />
                                    </div>
                                  )}
                                  <Switch
                                    checked={itemEnabled}
                                    onCheckedChange={(checked) => updateModule(item.key, "enabled", checked)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.planName.trim()}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Update Plan" : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this plan? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
