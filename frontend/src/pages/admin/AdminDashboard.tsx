import { useState, useEffect, lazy, Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  Users,
  Store,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  Shield,
  LayoutDashboard,
  Briefcase,
  DollarSign,
  BarChart3,
  Settings,
  Menu,
  Package,
  MessageSquare,
  LifeBuoy,
} from "lucide-react";
import { useFetchWithLoading } from "@/hooks/useFetchWithLoading";

// Lazy load heavy sub-pages
const AgentsPage = lazy(() => import("./AgentsPage"));
const ShopkeepersPage = lazy(() => import("./ShopkeepersPage"));
const UsersPage = lazy(() =>
  import("./UsersPage").then((m) => ({ default: m.UsersPage })),
);
const SubscriptionsPage = lazy(() => import("./SubscriptionsPage"));
const AppFeedbackPage = lazy(() => import("./AppFeedbackPage"));
const SupportTicketsPage = lazy(() => import("./SupportTicketsPage"));

const NAVIGATION_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "shopkeepers", label: "Shopkeepers", icon: Store },
  { id: "agents", label: "Agents", icon: Briefcase },
  { id: "users", label: "Users", icon: Users },
  { id: "subscriptions", label: "Subscriptions", icon: Package },
  { id: "app-feedback", label: "App Feedback", icon: MessageSquare },
  { id: "support-tickets", label: "Support & Bugs", icon: LifeBuoy },
  { id: "settings", label: "Settings", icon: Settings },
];

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

interface AdminDashboardProps {
  onLogout?: () => void;
}

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const apiURL = __API_URL__;
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalShopkeepers: 0,
    activeShopkeepers: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    activeSubscriptions: 0,
    pendingApprovals: 0,
    thisMonthShopkeepers: 0,
  });
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { fetchWithLoading } = useFetchWithLoading();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Auth token not found");

      const response = await fetchWithLoading(
        `${apiURL}/admin/dashboard-stats`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!response.ok)
        throw new Error(`Failed to fetch: ${response.statusText}`);

      const resData = await response.json();
      if (resData.stats) setStats(resData.stats);

      if (resData.pendingApprovals) {
        const { shopkeepers = [] } = resData.pendingApprovals;
        setPendingApprovals(
          shopkeepers.map((s: any) => ({
            ...s,
            id: s._id,
            name: s.name,
            type: "Shopkeeper",
            email: s.email,
            referredBy: s.referredBy || null,
            appliedDate: s.createdAt
              ? new Date(s.createdAt).toLocaleDateString()
              : "N/A",
          })),
        );
      }

      if (resData.recentActivity) {
        setRecentActivity(
          resData.recentActivity.map((act: any) => ({
            ...act,
            time:
              typeof act.time === "string"
                ? new Date(act.time).toLocaleString()
                : act.time,
          })),
        );
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const handleReviewClick = (applicant: any) => {
    setSelectedApplicant(applicant);
    setReviewDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedApplicant) return;
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithLoading(
        `${apiURL}/admin/approve/${selectedApplicant.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: selectedApplicant.type }),
        },
      );
      if (!response.ok) throw new Error(`Failed to approve`);
      setReviewDialogOpen(false);
      await fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async () => {
    if (!selectedApplicant) return;
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetchWithLoading(
        `${apiURL}/admin/reject/${selectedApplicant.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: selectedApplicant.type }),
        },
      );
      if (!response.ok) throw new Error(`Failed to reject`);
      setReviewDialogOpen(false);
      await fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAdmin = async () => {
    if (
      !newAdmin.name ||
      !newAdmin.email ||
      !newAdmin.password ||
      !newAdmin.confirmPassword
    ) {
      alert("All fields are required");
      return;
    }
    if (newAdmin.password !== newAdmin.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetchWithLoading(`${apiURL}/admin/create-admin`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newAdmin.name,
          email: newAdmin.email,
          password: newAdmin.password,
        }),
      });
      if (!res.ok) throw new Error(`Failed to create admin`);
      alert("Admin created successfully");
      setCreateDialogOpen(false);
      setNewAdmin({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (err) {
      console.error(err);
    }
  };

  const logout =
    onLogout ||
    (() => {
      sessionStorage.removeItem("token");
      localStorage.removeItem("token");
      window.location.href = "/admin-login";
    });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="h-14 sm:h-16 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 flex items-center px-3 sm:px-6 sticky top-0 z-50">
        <div className="flex items-center flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden p-1 mr-2"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2.5">
            <div className="bg-indigo-100 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-bold text-slate-900">
                KiosCart Admin
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                Management Console
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Create Admin</span>
            <span className="sm:hidden">+ Admin</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="text-xs"
          >
            <LogOut className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* Main container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static lg:translate-x-0
            w-64 border-r bg-white/95 backdrop-blur-sm lg:bg-muted/30
            h-full z-50 transition-all duration-300 ease-in-out
            flex-shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          <div className="h-full flex flex-col">
            <nav className="p-3 sm:p-4 space-y-1 sm:space-y-2">
              {NAVIGATION_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "default" : "outline"}
                  className={`w-full justify-start text-sm ${
                    activeTab === item.id
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                      : ""
                  }`}
                  onClick={() => handleTabChange(item.id)}
                >
                  <item.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4 lg:p-6">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              {/* Dashboard Tab */}
              <TabsContent value="dashboard" className="mt-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-2xl sm:text-3xl font-bold">Dashboard</h2>

                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                    {[
                      {
                        title: "Total Shopkeepers",
                        value: stats.totalShopkeepers,
                        icon: Store,
                        color: "text-indigo-600",
                        iconColor: "text-indigo-500",
                        note: `${stats.thisMonthShopkeepers} this month`,
                      },
                      {
                        title: "Active Shopkeepers",
                        value: stats.activeShopkeepers,
                        icon: TrendingUp,
                        color: "text-green-600",
                        iconColor: "text-green-500",
                        note: "Approved stores",
                      },
                      {
                        title: "Total Products",
                        value: stats.totalProducts,
                        icon: Package,
                        color: "text-blue-600",
                        iconColor: "text-blue-500",
                        note: "Listed across stores",
                      },
                      {
                        title: "Total Orders",
                        value: stats.totalOrders,
                        icon: BarChart3,
                        color: "text-purple-600",
                        iconColor: "text-purple-500",
                        note: "All-time orders",
                      },
                      {
                        title: "Total Revenue",
                        value: `$${stats.totalRevenue?.toFixed?.(2) ?? stats.totalRevenue}`,
                        icon: DollarSign,
                        color: "text-emerald-600",
                        iconColor: "text-emerald-500",
                        note: "Platform-wide",
                      },
                      {
                        title: "Active Subscriptions",
                        value: stats.activeSubscriptions,
                        icon: Package,
                        color: "text-rose-600",
                        iconColor: "text-rose-500",
                        note: "Currently paid",
                      },
                      {
                        title: "Total Users",
                        value: stats.totalUsers,
                        icon: Users,
                        color: "text-amber-600",
                        iconColor: "text-amber-500",
                        note: "Registered customers",
                      },
                      {
                        title: "Pending Approvals",
                        value: stats.pendingApprovals,
                        icon: AlertCircle,
                        color: "text-orange-600",
                        iconColor: "text-orange-500",
                        note: "Awaiting review",
                      },
                    ].map((stat, i) => (
                      <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-xs sm:text-sm font-medium truncate">
                            {stat.title}
                          </CardTitle>
                          <stat.icon
                            className={`h-4 w-4 ${stat.iconColor} flex-shrink-0`}
                          />
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div
                            className={`text-lg sm:text-2xl font-bold ${stat.color}`}
                          >
                            {stat.value}
                          </div>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                            {stat.note}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Pending Approvals + Recent Activity */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    {/* Pending Approvals */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                          Pending Approvals
                          {stats.pendingApprovals > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {stats.pendingApprovals}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {pendingApprovals.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                            <p className="text-sm">All caught up!</p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[350px] overflow-y-auto">
                            {pendingApprovals.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {item.type} • {item.email}
                                    {item.referredBy &&
                                      ` • Ref: ${item.referredBy.name}`}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Applied: {item.appliedDate}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="ml-2 text-xs shrink-0"
                                  onClick={() => handleReviewClick(item)}
                                >
                                  Review
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                          <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />{" "}
                          Recent Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {recentActivity.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm">No recent activity</p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[350px] overflow-y-auto">
                            {recentActivity.map((act) => (
                              <div
                                key={act.id}
                                className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-muted/30 transition-colors"
                              >
                                <div
                                  className={`p-1.5 rounded-full shrink-0 ${
                                    act.status === "pending"
                                      ? "bg-yellow-100 text-yellow-600"
                                      : act.status === "approved"
                                        ? "bg-green-100 text-green-600"
                                        : "bg-blue-100 text-blue-600"
                                  }`}
                                >
                                  {act.status === "pending" ? (
                                    <Clock className="h-3.5 w-3.5" />
                                  ) : act.status === "approved" ? (
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  ) : (
                                    <Users className="h-3.5 w-3.5" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {act.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {act.action}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {act.time}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    act.status === "pending"
                                      ? "secondary"
                                      : act.status === "approved"
                                        ? "default"
                                        : "outline"
                                  }
                                  className="text-xs shrink-0 capitalize"
                                >
                                  {act.status}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Shopkeepers Tab */}
              <TabsContent value="shopkeepers" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <ShopkeepersPage />
                </Suspense>
              </TabsContent>

              {/* Agents Tab */}
              <TabsContent value="agents" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <AgentsPage />
                </Suspense>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <UsersPage />
                </Suspense>
              </TabsContent>

              {/* Subscriptions Tab */}
              <TabsContent value="subscriptions" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <SubscriptionsPage />
                </Suspense>
              </TabsContent>

              {/* App Feedback Tab */}
              <TabsContent value="app-feedback" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <AppFeedbackPage />
                </Suspense>
              </TabsContent>

              {/* Support & Bugs Tab */}
              <TabsContent value="support-tickets" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <SupportTicketsPage />
                </Suspense>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="mt-0">
                <div className="space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-bold">Settings</h2>
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <Settings className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium">
                        Settings coming soon
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Applicant</DialogTitle>
            <DialogDescription>
              Review and approve or reject this application
            </DialogDescription>
          </DialogHeader>
          {selectedApplicant && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Name", value: selectedApplicant.name },
                  { label: "Type", value: selectedApplicant.type },
                  { label: "Email", value: selectedApplicant.email },
                  {
                    label: "Business Email",
                    value: selectedApplicant.businessEmail,
                  },
                  { label: "Phone", value: selectedApplicant.phone },
                  { label: "Shop Name", value: selectedApplicant.shopName },
                  { label: "Address", value: selectedApplicant.address },
                  { label: "Applied", value: selectedApplicant.appliedDate },
                  {
                    label: "Referred By",
                    value: selectedApplicant.referredBy?.name
                      ? `${selectedApplicant.referredBy.name} (${selectedApplicant.referredBy.referralCode})`
                      : null,
                  },
                ].map((field, i) =>
                  field.value ? (
                    <div key={i} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">
                        {field.label}
                      </p>
                      <p className="text-sm font-medium">{field.value}</p>
                    </div>
                  ) : null,
                )}
              </div>
              {selectedApplicant.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Description
                  </p>
                  <p className="text-sm">{selectedApplicant.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject
            </Button>
            <Button
              onClick={handleApprove}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Admin Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Admin</DialogTitle>
            <DialogDescription>
              Add a new administrator account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={newAdmin.name}
                onChange={(e) =>
                  setNewAdmin({ ...newAdmin, name: e.target.value })
                }
                placeholder="Admin name"
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={newAdmin.email}
                onChange={(e) =>
                  setNewAdmin({ ...newAdmin, email: e.target.value })
                }
                placeholder="admin@email.com"
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newAdmin.password}
                  onChange={(e) =>
                    setNewAdmin({ ...newAdmin, password: e.target.value })
                  }
                  placeholder="Password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={newAdmin.confirmPassword}
                  onChange={(e) =>
                    setNewAdmin({
                      ...newAdmin,
                      confirmPassword: e.target.value,
                    })
                  }
                  placeholder="Confirm password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <Button className="w-full mt-4" onClick={handleCreateAdmin}>
            Create Admin
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
