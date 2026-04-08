import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  Search,
  Eye,
  ChevronDown,
  ChevronUp,
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Globe,
} from "lucide-react";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface ShopkeeperOverview {
  _id: string;
  name: string;
  shopName: string;
  email: string;
  businessEmail: string;
  phone: string;
  whatsappNumber: string;
  address: string;
  country: string;
  businessCategory: string;
  approved: boolean;
  rejected: boolean;
  hasDocVerification: boolean;
  GSTNumber?: string;
  UENNumber?: string;
  createdAt: string;
  productsCount: number;
  totalOrders: number;
  totalRevenue: number;
  completedOrders: number;
  operators: { name: string; email: string; whatsAppNumber: string }[];
  referredBy: { name: string; referralCode: string } | null;
  provider: string;
}

export default function ShopkeepersPage() {
  const [shopkeepers, setShopkeepers] = useState<ShopkeeperOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedShopkeeper, setSelectedShopkeeper] = useState<ShopkeeperOverview | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const token = sessionStorage.getItem("token");

  useEffect(() => {
    fetchShopkeepers();
  }, []);

  async function fetchShopkeepers() {
    try {
      const res = await fetch(`${apiURL}/admin/shopkeepers-overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setShopkeepers(data.shopkeepers || []);
      }
    } catch (err) {
      console.error("Failed to fetch shopkeepers:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return shopkeepers.filter((s) => {
      const searchMatch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.shopName.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase());

      const statusMatch = statusFilter === "all" ||
        (statusFilter === "approved" && s.approved) ||
        (statusFilter === "pending" && !s.approved && !s.rejected) ||
        (statusFilter === "rejected" && s.rejected);

      return searchMatch && statusMatch;
    });
  }, [shopkeepers, search, statusFilter]);

  const stats = useMemo(() => ({
    total: shopkeepers.length,
    approved: shopkeepers.filter((s) => s.approved).length,
    pending: shopkeepers.filter((s) => !s.approved && !s.rejected).length,
    totalRevenue: shopkeepers.reduce((sum, s) => sum + s.totalRevenue, 0),
    totalProducts: shopkeepers.reduce((sum, s) => sum + s.productsCount, 0),
    totalOrders: shopkeepers.reduce((sum, s) => sum + s.totalOrders, 0),
    referred: shopkeepers.filter((s) => s.referredBy).length,
  }), [shopkeepers]);

  function viewDetail(sk: ShopkeeperOverview) {
    setSelectedShopkeeper(sk);
    setDetailOpen(true);
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p>Loading shopkeepers...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Shopkeepers</h2>
        <p className="text-sm text-muted-foreground">Complete overview of all shopkeepers in the system</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Shopkeepers</CardTitle>
            <Store className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">{stats.approved} approved, {stats.pending} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">Across all stores</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent Referrals</CardTitle>
            <Briefcase className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">{stats.referred}</div>
            <p className="text-xs text-muted-foreground">Via agent referrals</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, shop, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Shop</TableHead>
                  <TableHead className="font-semibold">Owner</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Country</TableHead>
                  <TableHead className="font-semibold text-center">Products</TableHead>
                  <TableHead className="font-semibold text-center">Orders</TableHead>
                  <TableHead className="font-semibold">Referred By</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Operators</TableHead>
                  <TableHead className="font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      No shopkeepers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((sk) => (
                    <TableRow key={sk._id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium">{sk.shopName}</p>
                          <p className="text-xs text-muted-foreground">{sk.businessCategory}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{sk.name}</TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          <p>{sk.email}</p>
                          <p className="text-muted-foreground">{sk.whatsappNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{sk.country}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{sk.productsCount}</TableCell>
                      <TableCell className="text-center font-medium">{sk.totalOrders}</TableCell>
                      <TableCell>
                        {sk.referredBy ? (
                          <div className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3 text-indigo-500" />
                            <span className="text-xs font-medium">{sk.referredBy.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Direct</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sk.approved ? "default" : sk.rejected ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {sk.approved ? "Approved" : sk.rejected ? "Rejected" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sk.operators.length > 0 ? (
                          <Badge variant="outline" className="text-xs">
                            <Users className="h-3 w-3 mr-1" />
                            {sk.operators.length}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => viewDetail(sk)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedShopkeeper && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedShopkeeper.shopName}</DialogTitle>
                <DialogDescription>Shopkeeper details and performance</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 mt-4">
                {/* Owner Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Owner Name</p>
                    <p className="text-sm font-medium">{selectedShopkeeper.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Business Category</p>
                    <p className="text-sm font-medium">{selectedShopkeeper.businessCategory}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
                    <p className="text-sm">{selectedShopkeeper.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Business Email</p>
                    <p className="text-sm">{selectedShopkeeper.businessEmail}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</p>
                    <p className="text-sm">{selectedShopkeeper.phone}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> WhatsApp</p>
                    <p className="text-sm">{selectedShopkeeper.whatsappNumber}</p>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</p>
                    <p className="text-sm">{selectedShopkeeper.address}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Country</p>
                    <p className="text-sm">{selectedShopkeeper.country}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Verification</p>
                    <div className="flex gap-2">
                      <Badge variant={selectedShopkeeper.hasDocVerification ? "default" : "secondary"} className="text-xs">
                        {selectedShopkeeper.hasDocVerification ? "Verified" : "Not Verified"}
                      </Badge>
                      {selectedShopkeeper.GSTNumber && <Badge variant="outline" className="text-xs">GST: {selectedShopkeeper.GSTNumber}</Badge>}
                      {selectedShopkeeper.UENNumber && <Badge variant="outline" className="text-xs">UEN: {selectedShopkeeper.UENNumber}</Badge>}
                    </div>
                  </div>
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="py-3 text-center">
                      <Package className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                      <div className="text-xl font-bold">{selectedShopkeeper.productsCount}</div>
                      <p className="text-[10px] text-muted-foreground">Products</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-3 text-center">
                      <ShoppingCart className="h-4 w-4 mx-auto mb-1 text-green-500" />
                      <div className="text-xl font-bold">{selectedShopkeeper.totalOrders}</div>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-3 text-center">
                      <ShoppingCart className="h-4 w-4 mx-auto mb-1 text-indigo-500" />
                      <div className="text-xl font-bold">{selectedShopkeeper.completedOrders}</div>
                      <p className="text-[10px] text-muted-foreground">Completed</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Referral Info */}
                {selectedShopkeeper.referredBy && (
                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium text-indigo-900">
                        Referred by: {selectedShopkeeper.referredBy.name}
                      </span>
                      <Badge variant="outline" className="text-xs">{selectedShopkeeper.referredBy.referralCode}</Badge>
                    </div>
                  </div>
                )}

                {/* Operators */}
                {selectedShopkeeper.operators.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" /> Operators ({selectedShopkeeper.operators.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedShopkeeper.operators.map((op, i) => (
                        <div key={i} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                          <span className="font-medium">{op.name}</span>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{op.email}</span>
                            <span>{op.whatsAppNumber}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta */}
                <div className="text-xs text-muted-foreground">
                  Registered: {new Date(selectedShopkeeper.createdAt).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
