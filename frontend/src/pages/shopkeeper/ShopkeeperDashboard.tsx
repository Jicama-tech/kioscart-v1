import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Store,
  Package,
  DollarSign,
  ShoppingCart,
  Settings,
  LogOut,
  Users,
  Globe,
  Menu,
  X,
  Download,
  Monitor,
  TrendingUp,
  PieChartIcon,
  Crown,
  AlertCircle,
  BarChart3,
  Mail,
  MessageCircle,
  HelpCircle,
} from 'lucide-react';
// Lazy load heavy tab components - only loaded when tab is active
const ProductManagement = lazy(() =>
  import('@/components/shopkeeper/ProductManagement').then((m) => ({
    default: m.ProductManagement,
  })),
);
const CRMManagement = lazy(() =>
  import('@/components/shopkeeper/CRMManagement').then((m) => ({
    default: m.CRMManagement,
  })),
);
const CartManagement = lazy(() =>
  import('@/components/shopkeeper/CartManagement').then((m) => ({
    default: m.CartManagement,
  })),
);
const ShopkeeperSettings = lazy(() =>
  import('@/components/shopkeeper/ShopkeeperSettings').then((m) => ({
    default: m.ShopkeeperSettings,
  })),
);
const KioskMode = lazy(() =>
  import('@/components/shopkeeper/KioskMode').then((m) => ({
    default: m.KioskMode,
  })),
);
import { StorefrontTemplate } from './StorefrontTemplate';
import { useToast } from '@/hooks/use-toast';
import { jwtDecode } from 'jwt-decode';
import { create } from 'qrcode';
import { useCurrency } from '@/hooks/useCurrencyhook';
import { FaRupeeSign } from 'react-icons/fa';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { StorefrontCustomizer } from '@/components/shopkeeper/StorefrontCustomizer';

interface ShopkeeperDashboardProps {
  onLogout: () => void;
}

interface shopkeeperStore {
  sub: string;
}

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalItems: number;
  avgOrderValue: number;
  revenueTrend: any[];
  topProducts: any[];
  categoryPerformance: any[];
  orderTypeBreakdown: any[];
  orderStatusBreakdown: any[];
  topCustomers: any[];
  inactiveCustomers: any[];
  currency: string;
  currencySymbol: string;
}

const COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#F97316', // Orange
];

// Static data moved outside component to prevent re-creation on every render
const NAVIGATION_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Store },
  { id: 'kiosk', label: 'Kiosk Mode', icon: Monitor },
  { id: 'orders', label: 'Orders & Cart', icon: ShoppingCart },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'storefront', label: 'Storefront', icon: Globe, isAction: true },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const SHOPKEEPER_FAQS = [
  {
    question: 'How do I add products to my store?',
    answer:
      "Go to the Products tab and click 'Add Product'. Fill in the product details like name, price, description, and images. You can also bulk import products using an Excel template.",
  },
  {
    question: 'How do I manage orders?',
    answer:
      'Navigate to the Orders & Cart tab to view all incoming orders. You can update order status, view order details, and manage your cart settings from there.',
  },
  {
    question: 'How do I customize my storefront?',
    answer:
      "Go to the Storefront tab to customize your store's appearance. You can change the theme, layout, colors, hero banner, and other visual elements to match your brand.",
  },
  {
    question: 'How do I set up payments?',
    answer:
      'Go to Settings and navigate to the Payment section. You can configure your payment QR code, bank details, and preferred payment methods for your customers.',
  },
  {
    question: 'How do I view my store analytics?',
    answer:
      'The Dashboard tab shows your key metrics including revenue trends, top products, category performance, and customer insights. You can filter by different time periods.',
  },
  {
    question: 'How do I manage my customers?',
    answer:
      'Use the CRM tab to view and manage your customer relationships. You can see customer order history, send messages, and track customer engagement.',
  },
  {
    question: 'How do I share my store link?',
    answer:
      'Your store has a unique URL based on your store slug. You can find and copy your store link from the Storefront tab or Settings. Share it with customers via WhatsApp, social media, or QR code.',
  },
  {
    question: 'Can I add operators to manage my store?',
    answer:
      'Yes! Go to Settings and look for the Operators section. You can invite team members and assign them specific roles and permissions to help manage your store.',
  },
];

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Current Month',
  lastmonth: 'Last Month',
  lastquarter: 'Last Quarter',
  quarterly: 'Current Quarter',
  yearly: 'Current Year',
  lastyear: 'Last Year',
};

function TabLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

export function ShopkeeperDashboard({ onLogout }: ShopkeeperDashboardProps) {
  const apiUrl = __API_URL__;
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showStorefront, setShowStorefront] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shopName, setShopName] = useState('KiosCart Store');
  const [slug, setSlug] = useState('');
  const [totalProducts, setTotalProducts] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [shopkeeperInfo, setShopkeeperInfo] = useState<any>(null);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const { formatPrice, getSymbol } = useCurrency(
    shopkeeperInfo?.country || 'IN',
  );

  // Derive shopkeeperId from JWT for kiosk mode
  const shopkeeperId = useMemo(() => {
    try {
      const token = sessionStorage.getItem('token');
      if (token) {
        const decoded: any = jwtDecode(token);
        return decoded.sub as string;
      }
    } catch {}
    return '';
  }, []);

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null,
  );
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');
  const [period, setPeriod] = useState('Current Month');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showFaqDialog, setShowFaqDialog] = useState(false);

  const changeTimePeriod = useCallback((timePeriod: string) => {
    setSelectedPeriod(timePeriod);
    setPeriod(PERIOD_LABELS[timePeriod] || 'Current Month');
    fetchAnalyticsReport(timePeriod);
  }, []);

  async function fetchAnalyticsReport(timePeriod: string) {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    setAnalyticsLoading(true);
    try {
      const decoded: any = jwtDecode(token);
      const shopkeeperId = decoded.sub;

      const response = await fetch(
        `${apiUrl}/shopkeeper/analytics/${shopkeeperId}/report/${timePeriod}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.ok) {
        const result = await response.json();

        setAnalyticsData(result.data);
      } else {
        console.error('Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  async function logout() {
    sessionStorage.removeItem('token');
    navigate(`/${slug}`);
  }

  // Fetch all dashboard data on mount - parallelized for speed
  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    async function fetchAllDashboardData() {
      const token = sessionStorage.getItem('token');
      if (!token) return;

      let shopkeeperId: string;
      try {
        const decoded: any = jwtDecode(token);
        shopkeeperId = decoded.sub;
      } catch {
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      // Fire ALL requests in parallel instead of sequential waterfall
      const [shopkeeperRes, storeRes, prodRes, orderRes, custRes] =
        await Promise.allSettled([
          fetch(`${apiUrl}/shopkeepers/shopkeeper-detail/${shopkeeperId}`, {
            headers,
            signal,
          }),
          fetch(`${apiUrl}/shopkeeper-stores/shopkeeper-store-detail`, {
            headers,
            signal,
          }),
          fetch(`${apiUrl}/products/shopkeeper-products`, {
            headers,
            signal,
          }),
          fetch(`${apiUrl}/orders/get-orders/shopkeeper/${shopkeeperId}`, {
            headers,
            signal,
          }),
          fetch(`${apiUrl}/orders/customers/${shopkeeperId}`, { signal }),
        ]);

      // Process shopkeeper info
      if (shopkeeperRes.status === 'fulfilled' && shopkeeperRes.value.ok) {
        const data = await shopkeeperRes.value.json();
        setShopkeeperInfo(data.data);
      }

      // Process store details
      if (storeRes.status === 'fulfilled' && storeRes.value.ok) {
        const shopData = await storeRes.value.json();
        if (shopData?.data?.settings?.general?.storeName) {
          setShopName(shopData.data.settings.general.storeName);
          setSlug(shopData.data.slug);
        }
      }

      // Process products count
      if (prodRes.status === 'fulfilled' && prodRes.value.ok) {
        const prodData = await prodRes.value.json();
        setTotalProducts(prodData.data.length);
      }

      // Process orders & revenue
      if (orderRes.status === 'fulfilled' && orderRes.value.ok) {
        const orders = await orderRes.value.json();

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let todayCount = 0;
        let monthRevenue = 0;

        // Single pass through orders for both calculations
        for (const order of orders) {
          const createdAt = new Date(order.createdAt);
          if (createdAt >= startOfToday && createdAt <= endOfToday) {
            todayCount++;
          }
          if (createdAt >= startOfMonth) {
            monthRevenue += order.totalAmount || 0;
          }
        }

        setOrdersToday(todayCount);
        setMonthlyRevenue(Number(monthRevenue.toFixed(2)));
      }

      // Process customers count
      if (custRes.status === 'fulfilled' && custRes.value.ok) {
        const custData = await custRes.value.json();
        setTotalCustomers(custData.customerCount);
      }
    }

    fetchAllDashboardData();
    fetchAnalyticsReport(selectedPeriod);

    return () => abortController.abort();
  }, [apiUrl]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  const downloadCSV = () => {
    window.open(
      `${apiUrl}/shopkeeper/analytics/${shopkeeperInfo._id}/export/excel/${selectedPeriod}`,
      '_blank',
    );
  };

  const stats = useMemo(
    () => [
      { title: 'Total Products', value: totalProducts, icon: Package },
      { title: 'Orders Today', value: ordersToday, icon: ShoppingCart },
      {
        title: 'Revenue This Month',
        value: formatPrice(monthlyRevenue),
        icon: shopkeeperInfo?.country === 'IN' ? FaRupeeSign : DollarSign,
      },
      { title: 'Active Customers', value: totalCustomers, icon: Users },
    ],
    [
      totalProducts,
      ordersToday,
      monthlyRevenue,
      totalCustomers,
      shopkeeperInfo?.country,
      formatPrice,
    ],
  );

  // Default settings for new shopkeepers
  const defaultSettings = {
    slug: shopkeeperInfo?.shopName || 'My Store',
    general: {
      storeName: shopkeeperInfo?.shopName || 'My Store',
      tagline: 'Welcome to my amazing store',
      description: 'Discover our wonderful products and services',
      logo: '',
      favicon: '',
      contactInfo: {
        phone: '',
        email: '',
        address: '',
        hours: 'Mon-Fri: 9AM-6PM',
        website: '',
        showInstagram: false,
        showFacebook: false,
        showTwitter: false,
        showTiktok: false,
        instagramLink: '',
        facebookLink: '',
        twitterLink: '',
        tiktokLink: '',
      },
    },
    design: {
      theme: 'light',
      primaryColor: '#6366f1',
      secondaryColor: '#8b5cf6',
      fontFamily: 'Inter',
      layout: {
        header: 'modern',
        allProducts: 'modern',
        visibleAdvertismentBar: false,
        advertiseText: 'Flat 10% Off',
        visibleFeaturedProducts: true,
        visibleProductCarausel: false,
        adBarBgcolor: '#000000',
        adBarTextColor: '#ffffff',
        visibleQuickPicks: true,
        featuredProducts: 'modern',
        quickPicks: 'modern',
        banner: 'modern',
        footer: 'modern',
      },
      bannerImage:
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
      heroBannerImage:
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8',
      showBanner: true,
      bannerHeight: 'large',
    },
    features: {
      showSearch: true,
      showFilters: true,
      showReviews: false,
      showWishlist: false,
      showQuickView: true,
      showSocialMedia: true,
      enableChat: false,
      showNewsletter: false,
    },
    seo: {
      metaTitle: 'My Store - Quality Products',
      metaDescription:
        'Discover quality products at My Store. Best prices and service guaranteed.',
      keywords: 'store, shop, products, quality',
      customCode: '',
    },
  };

  const handleSaveSettings = useCallback((settings: any) => {}, []);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);

  const createDefaultSettings = async (shopkeeperId: string, token: string) => {
    const createData = {
      shopkeeperId,
      ...defaultSettings,
    };

    const createResponse = await fetch(
      `${apiUrl}/shopkeeper-stores/add-store-settings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createData),
      },
    );

    if (createResponse.ok) {
      const result = await createResponse.json();
      toast({
        duration: 5000,
        title: 'Store Initialized',
        description:
          'Your store has been created with default settings. You can customize it anytime!',
      });

      return result;
    } else {
      const errorData = await createResponse.json();
      throw new Error(errorData.message || 'Failed to create store settings');
    }
  };

  const handleViewStorefront = async () => {
    setLoading(true);
    setSidebarOpen(false);

    try {
      const token = sessionStorage.getItem('token');
      if (!token) {
        toast({
          duration: 5000,
          title: 'Authorization Error',
          description: 'Please login first.',
          variant: 'destructive',
        });
        return;
      }

      const decoded = jwtDecode<shopkeeperStore>(token);
      const shopkeeperId = decoded.sub;

      const checkResponse = await fetch(
        `${apiUrl}/shopkeeper-stores/shopkeeper-store-detail`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // If store exists or needs creation, we just switch the tab
      if (checkResponse.ok) {
        const existingData = await checkResponse.json();
        if (existingData?.data?.settings) {
          setActiveTab('storefront'); // <--- CHANGED THIS
          return;
        } else {
          await createDefaultSettings(shopkeeperId, token);
          setActiveTab('storefront'); // <--- CHANGED THIS
          return;
        }
      }

      if (checkResponse.status === 404) {
        await createDefaultSettings(shopkeeperId, token);
        setActiveTab('storefront'); // <--- CHANGED THIS
      } else {
        const errorData = await checkResponse.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Server error: ${checkResponse.status}`,
        );
      }
    } catch (error: any) {
      toast({
        duration: 5000,
        title: 'Error',
        description: error.message || 'Failed to initialize storefront.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // if (showStorefront) {
  //   return <StorefrontTemplate onBack={() => setShowStorefront(false)} />;
  // }

  if (showPreview) {
    return (
      <div className="min-h-screen bg-white">
        {/* Floating Back Button so you aren't stuck in the preview */}
        {/* <Button
          className="fixed bottom-5 right-5 z-[999] shadow-2xl"
          onClick={() => setShowPreview(false)}
        >
          Exit Preview / Back to Editor
        </Button> */}

        <StorefrontTemplate onBack={() => setShowPreview(false)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50 flex-shrink-0">
        <div className="flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-2">
            {/* Mobile menu button */}
            <Button
              variant="buttonOutline"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>

            <Store className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold hidden sm:block">
              {shopName}
            </h1>
            <h1 className="text-base font-bold sm:hidden">{shopName}</h1>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFaqDialog(true)}
              className="text-xs sm:text-sm text-muted-foreground hover:text-primary"
            >
              <HelpCircle className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Need Help?</span>
            </Button>
            <Button variant="buttonOutline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main container with fixed sidebar and scrollable content */}
      <div className="flex flex-1 overflow-hidden z-40">
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static lg:translate-x-0 
            w-64 border-r bg-card/95 backdrop-blur-sm lg:bg-muted/30 
            h-full z-50 transition-all duration-300 ease-in-out
            flex-shrink-0
            ${
              sidebarOpen
                ? 'translate-x-0'
                : '-translate-x-full lg:translate-x-0'
            }
          `}
        >
          <div className="h-full flex flex-col">
            <nav className="p-3 sm:p-4 space-y-1 sm:space-y-2 flex-1 overflow-y-auto">
              {NAVIGATION_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? 'default' : 'buttonOutline'}
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    if (item.id === 'storefront') {
                      handleViewStorefront();
                    } else {
                      handleTabChange(item.id);
                    }
                  }}
                  disabled={item.id === 'storefront' && loading}
                >
                  <item.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">
                    {item.id === 'storefront' && loading
                      ? 'Loading...'
                      : item.label}
                  </span>
                </Button>
              ))}

              {/* The border-t section is now empty or can be used for Logout */}
            </nav>
          </div>
        </aside>

        {/* Main Content - Now the only scrollable element */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4 lg:p-6">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsContent value="dashboard" className="mt-0">
                <div className="space-y-4 sm:space-y-6">
                  <h2 className="text-2xl sm:text-3xl font-bold">Dashboard</h2>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                    {stats.map((stat, index) => (
                      <Card key={index}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-xs sm:text-sm font-medium truncate">
                            {stat.title}
                          </CardTitle>
                          <stat.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="text-lg sm:text-2xl font-bold">
                            {stat.value}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg sm:text-xl">
                        Quick Actions
                      </CardTitle>
                      <CardDescription className="text-sm">
                        Manage your shop efficiently
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                        <Button
                          onClick={() => handleTabChange('products')}
                          variant="buttonOutline"
                          className="h-14 sm:h-16 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                        >
                          <Package className="h-4 w-4 sm:h-5 sm:w-5" />
                          Products
                        </Button>
                        <Button
                          onClick={() => handleTabChange('orders')}
                          variant="buttonOutline"
                          className="h-14 sm:h-16 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                        >
                          <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                          Orders
                        </Button>
                        <Button
                          onClick={() => handleTabChange('crm')}
                          variant="buttonOutline"
                          className="h-14 sm:h-16 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                        >
                          <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                          Customers
                        </Button>
                        <Button
                          onClick={() => handleTabChange('settings')}
                          variant="buttonOutline"
                          className="h-14 sm:h-16 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm"
                        >
                          <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                          Settings
                        </Button>
                        <Button
                          onClick={handleViewStorefront}
                          disabled={loading}
                          variant="buttonOutline"
                          className="h-14 sm:h-16 flex flex-col gap-1 sm:gap-2 text-xs sm:text-sm col-span-2 sm:col-span-1"
                        >
                          <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="truncate">
                            {loading ? 'Loading...' : 'Storefront'}
                          </span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Analytics Dashboard</CardTitle>
                        <CardDescription>
                          Detailed performance metrics and insights
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={selectedPeriod}
                          onChange={(e) => changeTimePeriod(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="monthly">Current Month</option>
                          <option value="lastmonth">Last Month</option>
                          <option value="lastquarter">Last Quarter</option>
                          <option value="quarterly">Current Quarter</option>
                          <option value="yearly">Current Year</option>
                          <option value="lastyear">Last Year</option>
                        </select>
                        <Button
                          onClick={downloadCSV}
                          size="sm"
                          variant="outline"
                        >
                          <Download size={18} />
                          Export
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {analyticsLoading ? (
                        <div className="flex justify-center py-10">
                          <p className="text-gray-500">Loading analytics...</p>
                        </div>
                      ) : analyticsData?.totalOrders > 0 ? (
                        <div className="space-y-8">
                          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                  Total Revenue
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {analyticsData.currencySymbol}
                                  {analyticsData.totalRevenue.toLocaleString()}
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                  Total Orders
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {analyticsData.totalOrders}
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                  Avg Order Value
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {analyticsData.currencySymbol}
                                  {analyticsData.avgOrderValue.toLocaleString()}
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                  Total Customers
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-2xl font-bold">
                                  {analyticsData.totalCustomers}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                          {/* Revenue Trend Chart */}
                          {analyticsData.revenueTrend &&
                            analyticsData?.revenueTrend.length > 0 && (
                              <div>
                                <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                                  <TrendingUp
                                    size={20}
                                    className="text-indigo-600"
                                  />
                                  Revenue Trend ({period})
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                  <LineChart data={analyticsData.revenueTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#fff',
                                        border: '1px solid #ccc',
                                        borderRadius: '8px',
                                        padding: '10px',
                                      }}
                                      formatter={(value: number) =>
                                        `${
                                          analyticsData.currencySymbol
                                        }${value.toLocaleString()}`
                                      }
                                    />
                                    <Legend />
                                    <Line
                                      type="monotone"
                                      dataKey="revenue"
                                      stroke="#3B82F6"
                                      strokeWidth={2}
                                      dot={{ fill: '#3B82F6' }}
                                      name="Revenue"
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                          {/* Product Performance - Pie Chart */}
                          {analyticsData.topProducts &&
                            analyticsData.topProducts.length > 0 && (
                              <div>
                                <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                                  <PieChartIcon
                                    size={20}
                                    className="text-indigo-600"
                                  />
                                  Top Products Performance ({period})
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                  <PieChart>
                                    <Pie
                                      data={analyticsData.topProducts}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={({ productName, percentage }) =>
                                        `${productName}: ${percentage.toFixed(
                                          1,
                                        )}%`
                                      }
                                      outerRadius={100}
                                      fill="#8884d8"
                                      dataKey="totalRevenue"
                                    >
                                      {analyticsData.topProducts.map(
                                        (entry: any, index: number) => (
                                          <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                          />
                                        ),
                                      )}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#fff',
                                        border: '1px solid #ccc',
                                        borderRadius: '8px',
                                        padding: '10px',
                                      }}
                                      formatter={(value: number) =>
                                        `${
                                          analyticsData.currencySymbol
                                        }${value.toLocaleString()}`
                                      }
                                    />
                                  </PieChart>
                                </ResponsiveContainer>

                                {/* Product Details Table */}
                                <div className="mt-6 overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-200">
                                        <th className="px-4 py-2 text-left font-semibold">
                                          Product
                                        </th>
                                        <th className="px-4 py-2 text-left font-semibold">
                                          Category
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          Quantity
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          Revenue
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          %
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {analyticsData.topProducts.map(
                                        (product: any, idx: number) => (
                                          <tr
                                            key={idx}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                          >
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="h-3 w-3 rounded-full"
                                                  style={{
                                                    backgroundColor:
                                                      COLORS[
                                                        idx % COLORS.length
                                                      ],
                                                  }}
                                                />
                                                {product.productName}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3">
                                              {product.category}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {product.totalQuantity}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                              {analyticsData.currencySymbol}
                                              {product.totalRevenue.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {product.percentage.toFixed(1)}%
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                          {/* Category Performance - Pie Chart */}
                          {analyticsData.categoryPerformance &&
                            analyticsData.categoryPerformance.length > 0 && (
                              <div>
                                <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                                  <PieChartIcon
                                    size={20}
                                    className="text-indigo-600"
                                  />
                                  Category Breakdown ({period})
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                  <PieChart>
                                    <Pie
                                      data={analyticsData.categoryPerformance}
                                      cx="50%"
                                      cy="50%"
                                      labelLine={false}
                                      label={({ category, percentage }) =>
                                        `${category}: ${percentage.toFixed(1)}%`
                                      }
                                      outerRadius={100}
                                      fill="#8884d8"
                                      dataKey="revenue"
                                    >
                                      {analyticsData.categoryPerformance.map(
                                        (entry: any, index: number) => (
                                          <Cell
                                            key={`cell-${index}`}
                                            fill={COLORS[index % COLORS.length]}
                                          />
                                        ),
                                      )}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: '#fff',
                                        border: '1px solid #ccc',
                                        borderRadius: '8px',
                                        padding: '10px',
                                      }}
                                      formatter={(value: number) =>
                                        `${
                                          analyticsData.currencySymbol
                                        }${value.toLocaleString()}`
                                      }
                                    />
                                  </PieChart>
                                </ResponsiveContainer>

                                {/* Category Details Table */}
                                <div className="mt-6 overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-200">
                                        <th className="px-4 py-2 text-left font-semibold">
                                          Category
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          Items Sold
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          Revenue
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold">
                                          %
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {analyticsData.categoryPerformance.map(
                                        (category: any, idx: number) => (
                                          <tr
                                            key={idx}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                          >
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="h-3 w-3 rounded-full"
                                                  style={{
                                                    backgroundColor:
                                                      COLORS[
                                                        idx % COLORS.length
                                                      ],
                                                  }}
                                                />
                                                {category.category}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {category.count}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                              {analyticsData.currencySymbol}
                                              {category.revenue.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              {category.percentage.toFixed(1)}%
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                          {/* Order Type & Status Breakdown */}
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Order Type Breakdown */}
                            {analyticsData.orderTypeBreakdown &&
                              analyticsData.orderTypeBreakdown.length > 0 && (
                                <div>
                                  <h3 className="mb-4 text-lg font-semibold">
                                    Order Type Breakdown ({period})
                                  </h3>
                                  <ResponsiveContainer
                                    width="100%"
                                    height={250}
                                  >
                                    <BarChart
                                      data={analyticsData.orderTypeBreakdown}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" />
                                      <XAxis dataKey="type" />
                                      <YAxis />
                                      <Tooltip
                                        contentStyle={{
                                          backgroundColor: '#fff',
                                          border: '1px solid #ccc',
                                          borderRadius: '8px',
                                        }}
                                      />
                                      <Bar
                                        dataKey="count"
                                        fill="#3B82F6"
                                        name="Orders"
                                      />
                                      <Bar
                                        dataKey="revenue"
                                        fill="#10B981"
                                        name="Revenue"
                                      />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              )}

                            {/* Order Status Breakdown */}
                            {analyticsData.orderStatusBreakdown &&
                              analyticsData.orderStatusBreakdown.length > 0 && (
                                <div>
                                  <h3 className="mb-4 text-lg font-semibold">
                                    Order Status Breakdown ({period})
                                  </h3>
                                  <ResponsiveContainer
                                    width="100%"
                                    height={250}
                                  >
                                    <PieChart>
                                      <Pie
                                        data={
                                          analyticsData.orderStatusBreakdown
                                        }
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ status, percentage }) =>
                                          `${status}: ${percentage.toFixed(1)}%`
                                        }
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="count"
                                      >
                                        {analyticsData.orderStatusBreakdown.map(
                                          (entry: any, index: number) => (
                                            <Cell
                                              key={`cell-${index}`}
                                              fill={
                                                COLORS[index % COLORS.length]
                                              }
                                            />
                                          ),
                                        )}
                                      </Pie>
                                      <Tooltip />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                          </div>

                          {/* Summary Metrics */}
                        </div>
                      ) : (
                        <div className="flex justify-center py-10">
                          <p className="text-gray-500">
                            No analytics data available
                          </p>
                        </div>
                      )}

                      {analyticsData?.topCustomers &&
                        analyticsData.topCustomers.length > 0 && (
                          <div className="mt-6">
                            {/* Top Customers Grid */}
                            {/* <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-6">
                              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                  <Crown
                                    size={20}
                                    className="text-emerald-600"
                                  />
                                  <h4 className="text-md font-semibold text-gray-900">
                                    Top Customers
                                  </h4>
                                </div>

                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                  {analyticsData.topCustomers
                                    .slice(0, 5)
                                    .map((customer: any, idx: number) => (
                                      <div
                                        key={idx}
                                        className="bg-white rounded-lg p-4 border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all duration-200"
                                      >
                                        <div className="flex items-start justify-between mb-2">
                                          <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-900">
                                              {idx + 1}. {customer.customerName}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-1">
                                              {customer.whatsappNumber ||
                                                customer.email ||
                                                "N/A"}
                                            </p>
                                          </div>
                                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                            #{idx + 1}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-emerald-100">
                                          <div>
                                            <p className="text-xs text-gray-600">
                                              Total Spent
                                            </p>
                                            <p className="text-sm font-bold text-emerald-600">
                                              {analyticsData.currencySymbol}
                                              {customer.totalSpent.toLocaleString()}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-600">
                                              Orders
                                            </p>
                                            <p className="text-sm font-bold text-gray-900">
                                              {customer.totalOrders}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-600">
                                              Avg Order
                                            </p>
                                            <p className="text-sm font-bold text-gray-900">
                                              {analyticsData.currencySymbol}
                                              {customer.avgOrderValue.toLocaleString()}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-600">
                                              Frequency
                                            </p>
                                            <p className="text-xs font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full w-fit">
                                              {customer.orderFrequency}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="mt-2 pt-2 border-t border-emerald-100">
                                          <p className="text-xs text-emerald-600 font-medium">
                                            Last order{" "}
                                            {customer.daysSinceLastOrder} days
                                            ago
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>

                              {analyticsData.inactiveCustomers &&
                                analyticsData.inactiveCustomers.length > 0 && (
                                  <div className="bg-gradient-to-br from-red-50 to-rose-50 border border-red-200 rounded-lg p-6 shadow-sm">
                                    <div className="flex items-center gap-2 mb-4">
                                      <AlertCircle
                                        size={20}
                                        className="text-red-600"
                                      />
                                      <h4 className="text-md font-semibold text-gray-900">
                                        Inactive Customers
                                      </h4>
                                      <span className="ml-auto text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-full">
                                        {analyticsData.inactiveCustomers.length}
                                      </span>
                                    </div>

                                    <div className="space-y-3 max-h-96 overflow-y-auto">
                                      {analyticsData.inactiveCustomers
                                        .slice(0, 5)
                                        .map((customer: any, idx: number) => (
                                          <div
                                            key={idx}
                                            className="bg-white rounded-lg p-4 border border-red-100 hover:border-red-300 hover:shadow-md transition-all duration-200"
                                          >
                                            <div className="flex items-start justify-between mb-2">
                                              <div className="flex-1">
                                                <p className="text-sm font-bold text-gray-900">
                                                  {customer.customerName}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                  {customer.whatsappNumber ||
                                                    customer.email ||
                                                    "N/A"}
                                                </p>
                                              </div>
                                              <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-bold px-2 py-1">
                                                {customer.daysSinceLastOrder}d
                                                ago
                                              </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-red-100">
                                              <div>
                                                <p className="text-xs text-gray-600">
                                                  Total Spent
                                                </p>
                                                <p className="text-sm font-bold text-gray-900">
                                                  {analyticsData.currencySymbol}
                                                  {customer.totalSpent.toLocaleString()}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-gray-600">
                                                  Orders
                                                </p>
                                                <p className="text-sm font-bold text-gray-900">
                                                  {customer.totalOrders}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-gray-600">
                                                  Avg Order
                                                </p>
                                                <p className="text-sm font-bold text-gray-900">
                                                  {analyticsData.currencySymbol}
                                                  {customer.avgOrderValue.toLocaleString()}
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-gray-600">
                                                  Last Order
                                                </p>
                                                <p className="text-xs font-bold text-red-600">
                                                  {customer.daysSinceLastOrder}{" "}
                                                  days ago
                                                </p>
                                              </div>
                                            </div>

                                            <div className="mt-2 pt-2 border-t border-red-100">
                                              <p className="text-xs text-red-600 font-medium">
                                                ⚠️ Re-engagement needed
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}
                            </div> */}

                            {/* Detailed Customer Table */}
                            <div className="mt-8">
                              <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                                <Users size={20} className="text-indigo-600" />
                                Top Performing Customers ({period})
                              </h3>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                                      <th className="px-4 py-3 text-left font-semibold">
                                        Customer Name
                                      </th>
                                      <th className="px-4 py-3 text-left font-semibold">
                                        Contact
                                      </th>
                                      <th className="px-4 py-3 text-right font-semibold">
                                        Total Orders
                                      </th>
                                      <th className="px-4 py-3 text-right font-semibold">
                                        Total Spent
                                      </th>
                                      <th className="px-4 py-3 text-right font-semibold">
                                        Avg Order Value
                                      </th>

                                      {/* <th className="px-4 py-3 text-center font-semibold">
                                        Last Order
                                      </th> */}
                                      <th className="px-4 py-3 text-center font-semibold">
                                        Last Order Date
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analyticsData.topCustomers.map(
                                      (customer: any, idx: number) => {
                                        const isInactive =
                                          analyticsData.inactiveCustomers?.some(
                                            (ic: any) =>
                                              ic.customerId ===
                                              customer.customerId,
                                          );

                                        return (
                                          <tr
                                            key={idx}
                                            className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                                              isInactive ? 'bg-red-50' : ''
                                            }`}
                                          >
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                                                  {idx + 1}
                                                </span>
                                                <span className="font-medium text-gray-900">
                                                  {customer.customerName}
                                                </span>
                                              </div>
                                            </td>
                                            <td className="px-2 py-3 w-10">
                                              <div className="space-y-1 text-m">
                                                {/* WhatsApp Link - 1st Line */}
                                                {customer.whatsappNumber && (
                                                  <a
                                                    href={`https://wa.me/${customer.whatsappNumber.replace(
                                                      /[^0-9]/g,
                                                      '',
                                                    )}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 font-medium transition-colors"
                                                    title="Message on WhatsApp"
                                                  >
                                                    <MessageCircle
                                                      size={12}
                                                      className="text-green-600"
                                                    />
                                                    {customer.whatsappNumber}
                                                  </a>
                                                )}

                                                {/* Email Link - 2nd Line */}
                                                {customer.email && (
                                                  <a
                                                    href={`mailto:${customer.email}`}
                                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium transition-colors block"
                                                    title={`Email ${customer.email}`}
                                                  >
                                                    <Mail
                                                      size={12}
                                                      className="text-blue-600"
                                                    />
                                                    {customer.email}
                                                  </a>
                                                )}

                                                {/* No Contact Fallback */}
                                                {!customer.whatsappNumber &&
                                                  !customer.email && (
                                                    <span className="text-gray-500 italic">
                                                      No contact info
                                                    </span>
                                                  )}
                                              </div>
                                            </td>

                                            <td className="px-4 py-3 text-right font-semibold">
                                              {customer.totalOrders}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">
                                              {analyticsData.currencySymbol}
                                              {customer.totalSpent.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                              {analyticsData.currencySymbol}
                                              {customer.avgOrderValue.toLocaleString()}
                                            </td>

                                            {/* <td className="px-4 py-3 text-center text-gray-600">
                                              {customer.daysSinceLastOrder}d ago
                                            </td> */}
                                            <td className="px-4 py-3 text-center">
                                              {formatDate(
                                                customer.lastOrderDate,
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      },
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="products" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h2 className="text-2xl sm:text-3xl font-bold">
                        Products
                      </h2>
                    </div>
                    <ProductManagement />
                  </div>
                </Suspense>
              </TabsContent>

              <TabsContent value="kiosk" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  {shopkeeperId && <KioskMode shopkeeperId={shopkeeperId} />}
                </Suspense>
              </TabsContent>

              <TabsContent value="orders" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <div className="space-y-4">
                    <h2 className="text-2xl sm:text-3xl font-bold">
                      Orders & Cart
                    </h2>
                    <CartManagement />
                  </div>
                </Suspense>
              </TabsContent>

              <TabsContent value="crm" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <div className="space-y-4">
                    <h2 className="text-2xl sm:text-3xl font-bold">
                      Management Dashboard
                    </h2>
                    <CRMManagement />
                  </div>
                </Suspense>
              </TabsContent>

              <TabsContent value="storefront" className="mt-0 outline-none">
                <Suspense fallback={<TabLoadingFallback />}>
                  <div className="space-y-4">
                    <StorefrontCustomizer
                      onBack={() => setActiveTab('storefront')}
                      onSave={() => setShowPreview(true)}
                    />
                  </div>
                </Suspense>
              </TabsContent>

              <TabsContent value="settings" className="mt-0">
                <Suspense fallback={<TabLoadingFallback />}>
                  <div className="space-y-4">
                    <ShopkeeperSettings onSave={handleSaveSettings} />
                  </div>
                </Suspense>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* FAQ Dialog */}
      <Dialog open={showFaqDialog} onOpenChange={setShowFaqDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </DialogTitle>
            <DialogDescription>
              Find answers to common questions about managing your store on
              KiosCart.
            </DialogDescription>
          </DialogHeader>
          <Accordion type="single" collapsible className="w-full">
            {SHOPKEEPER_FAQS.map((faq, index) => (
              <AccordionItem key={index} value={`faq-${index}`}>
                <AccordionTrigger className="text-left font-medium text-sm">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-sm text-muted-foreground">
              Still need help? Contact us at{' '}
              <a
                href="mailto:support@kioscart.com"
                className="text-primary font-medium hover:underline"
              >
                support@kioscart.com
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
