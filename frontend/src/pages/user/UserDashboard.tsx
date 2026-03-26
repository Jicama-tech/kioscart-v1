import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  LogOut,
  Home,
  Search,
  ShoppingCart,
  Heart,
  Menu,
  Store,
  X,
} from "lucide-react";
import { FollowedProductsSection } from "@/components/user/FollowedProductsSection";
import { DiscoverSection } from "@/components/user/DiscoverSection";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/cartContext";
import { jwtDecode } from "jwt-decode";
import { RecentOrders } from "@/components/user/recentOrders";

export function UserDashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [username, setUsername] = useState("");
  const { logout } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleRoleChange = async () => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      alert("Please login first.");
      return;
    }
    try {
      const response = await fetch(`${__API_URL__}/role/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: "shopkeeper" }),
      });
      if (!response.ok) throw new Error("Failed to check role");
      const data = await response.json();
      if (data.found) {
        navigate("/shopkeeper-login");
      } else {
        navigate("/shopkeeper-register", {
          state: { name: data.user.name, email: data.user.email },
        });
      }
    } catch (err) {
      console.error(err);
      alert("Error checking role. Please try again.");
    }
  };

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const fetchAddress = async (latitude: number, longitude: number) => {
      try {
        const res = await fetch(
          `${__API_URL__}/users/reverse?lat=${latitude}&lng=${longitude}`,
        );
        if (!res.ok) throw new Error("Reverse geocoding failed");
        const data = await res.json();
      } catch (err) {
        console.error("Error fetching address:", err);
      }
    };

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((result) => {
          if (result.state === "denied") return;
          navigator.geolocation.getCurrentPosition(
            (pos) => fetchAddress(pos.coords.latitude, pos.coords.longitude),
            (err) => console.error("Geo error:", err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          );
        });
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchAddress(pos.coords.latitude, pos.coords.longitude),
        (err) => console.error("Geo error:", err),
      );
    }
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        if (decoded?.name) setUsername(decoded.name);
      } catch (err) {
        console.error("Invalid token", err);
      }
    }
  }, []);

  const handleFollowShopkeeper = (id: string) => {};
  const handleViewProduct = (id: number) => {};
  const handleAddToCart = (id: number) => {};

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card flex justify-between items-center h-16 px-4 md:px-6">
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            className="md:hidden p-0 mr-2"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          >
            {sidebarOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
          <Store className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold">KiosCart</h1>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground hidden sm:block">
            Welcome, {username || "User"}
          </span>
          <Button variant="buttonOutline" size="sm" onClick={handleRoleChange}>
            <Store className="h-4 w-4 mr-2" />
            Open a Store
          </Button>
          <Button variant="buttonOutline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Layout wrapper for sidebar and main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-muted/30 border-r min-h-screen transform duration-300 transition-transform
          ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0 md:relative md:static md:flex-shrink-0`}
        >
          <nav className="p-4 space-y-2 h-full">
            <Button
              variant={activeTab === "home" ? "default" : "buttonOutline"}
              className="w-full justify-start"
              onClick={() => {
                setActiveTab("home");
                setSidebarOpen(false);
              }}
            >
              <Home className="h-4 w-4 mr-2" /> Home Feed
            </Button>
            <Button
              variant={activeTab === "discover" ? "default" : "buttonOutline"}
              className="w-full justify-start"
              onClick={() => {
                setActiveTab("discover");
                setSidebarOpen(false);
              }}
            >
              <Search className="h-4 w-4 mr-2" /> Discover & Follow
            </Button>
            <Button
              variant={activeTab === "orders" ? "default" : "buttonOutline"}
              className="w-full justify-start"
              onClick={() => {
                setActiveTab("orders");
                setSidebarOpen(false);
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-2" /> My Orders
            </Button>
            <Button
              variant={activeTab === "wishlist" ? "default" : "buttonOutline"}
              className="w-full justify-start"
              onClick={() => {
                setActiveTab("wishlist");
                setSidebarOpen(false);
              }}
            >
              <Heart className="h-4 w-4 mr-2" /> Wishlist
            </Button>
          </nav>
        </aside>

        {/* Overlay when sidebar is open on mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black opacity-25 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content area */}
        <main className="flex-1 p-6 overflow-auto">
          {activeTab === "home" && (
            <div className="space-y-8">
              <h2 className="text-3xl font-bold mb-2">Welcome Back!</h2>
              <p className="text-muted-foreground mb-6">
                Stay updated with products from your followed stores
              </p>
              <FollowedProductsSection />
            </div>
          )}
          {activeTab === "discover" && (
            <DiscoverSection
              onFollowShopkeeper={handleFollowShopkeeper}
            />
          )}
          {activeTab === "orders" && <RecentOrders />}
          {activeTab === "wishlist" && (
            <div className="space-y-6">
              <h2 className="text-3xl font-bold">My Wishlist</h2>
              <Card className="py-12">
                <CardContent className="text-center">
                  <Heart className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-xl font-semibold mb-2">
                    Your Wishlist is Empty
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Save items you love by clicking the heart icon on any
                    product.
                  </p>
                  <Button onClick={() => setActiveTab("home")}>
                    Start Shopping
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
