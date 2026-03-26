import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { CartProvider } from './hooks/cartContext';
import { useEffect, lazy, Suspense, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useLocation } from 'react-router-dom';

// Keep lightweight auth components as eager imports
import { EShopLogin } from './components/auth/E-ShopLogin';
import { AdminLogs } from './components/auth/loginAdmin';
import { ShopkeeperLogin } from './components/auth/shopKeeperLogin';
import { CartAuthReturn } from './components/auth/CartAuthReturn';
import { ShopKeeperRegister } from './components/auth/shopKeeperRegistration';

// Lazy load all heavy page components for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Eshop = lazy(() => import('./pages/EShop'));
const Pricing = lazy(() => import('./pages/pricing'));
const Blog = lazy(() => import('./pages/Blog'));
const FAQ = lazy(() => import('./pages/faqs'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ContactUsPage = lazy(() => import('./pages/contactUs'));
const PaymentPage = lazy(() => import('./components/shopkeeper/paymentPage'));

const AdminLayout = lazy(() =>
  import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminDashboard = lazy(() =>
  import('./pages/admin/AdminDashboard').then((m) => ({
    default: m.AdminDashboard,
  })),
);
const UsersPage = lazy(() =>
  import('./pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })),
);
const PricingPage = lazy(() =>
  import('./pages/admin/PricingPage').then((m) => ({ default: m.PricingPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/admin/SettingsPage').then((m) => ({
    default: m.SettingsPage,
  })),
);

const ShopkeeperDashboard = lazy(() =>
  import('./pages/shopkeeper/ShopkeeperDashboard').then((m) => ({
    default: m.ShopkeeperDashboard,
  })),
);
const AboutUsPage = lazy(() =>
  import('./pages/aboutUs').then((m) => ({ default: m.AboutUsPage })),
);
const TermsAndConditionsPage = lazy(() =>
  import('./pages/termsAndConditions').then((m) => ({
    default: m.TermsAndConditionsPage,
  })),
);
const PrivacyPolicyPage = lazy(() =>
  import('./pages/privacyPolicy').then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
);
const StorefrontTemplate = lazy(() =>
  import('./components/user/shopkeeperStoreFront').then((m) => ({
    default: m.StorefrontTemplate,
  })),
);
const CartPage = lazy(() =>
  import('./components/shopkeeper/cartPage').then((m) => ({
    default: m.CartPage,
  })),
);
const ProductForm = lazy(() =>
  import('./components/shopkeeper/ProductForm').then((m) => ({
    default: m.ProductForm,
  })),
);
const ProductManagement = lazy(() =>
  import('./components/shopkeeper/ProductManagement').then((m) => ({
    default: m.ProductManagement,
  })),
);

// Error boundary to catch rendering crashes
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-4">
              Something went wrong
            </h1>
            <p className="text-slate-600 mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Loading screen while validating token
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  );
}

// Guard for "user" role
function RequireUserRole({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.roles[0] !== 'user') return <Navigate to="/" replace />;
  return children;
}

// function CleanShopkeeperUrl1() {
//   const location = useLocation();

//   useEffect(() => {
//     const hostname = window.location.hostname;

//     // ✅ Only run for thefoxsg.com (including www)
//     const isFoxDomain =
//       hostname === "thefoxsg.com" || hostname === "www.thefoxsg.com";

//     // ✅ Match /estore/:slug (only one segment after estore)
//     const isEstoreSlug = /^\/estore\/[^/]+$/.test(location.pathname);

//     if (isFoxDomain && isEstoreSlug) {
//       // Replace URL without reload
//       window.history.replaceState(null, "", "/");
//     }
//   }, [location.pathname]);

//   return null;
// }

// Centralized  domain config — add new custom domains here
// Each entry maps a domain to its store slug, title, and description
const CUSTOM_DOMAIN_CONFIG: Record<
  string,
  { slug: string; title: string; description: string }
> = {
  'thefoxsg.com': {
    slug: 'thefoxsg',
    title: 'TheFoxSg - Snack With No Regret',
    description: 'Premium snacks and treats by TheFoxSg',
  },
  'www.thefoxsg.com': {
    slug: 'thefoxsg',
    title: 'TheFoxSg - Snack With No Regret',
    description: 'Premium snacks and treats by TheFoxSg',
  },
  // Add more custom domains here:
  // "mycustomdomain.com": { slug: "mystore", title: "My Store", description: "..." },
};

// Lookup the current domain config once at module load (not on every render)
const currentDomainConfig =
  CUSTOM_DOMAIN_CONFIG[window.location.hostname] || null;

const PROTECTED_ROUTES = new Set([
  '/cart',
  '/cart-auth-return',
  '/payment',
  '/login',
  '/register',
  '/estore-dashboard',
  '/admin-dashboard',
]);

function CleanShopkeeperUrl() {
  const location = useLocation();

  useEffect(() => {
    // Skip entirely if not a custom domain — zero work for kioscart.com/localhost
    if (!currentDomainConfig) return;

    const path = location.pathname;
    const isStorefrontPath = /^\/[^/]+$/.test(path);
    const isProtected = [...PROTECTED_ROUTES].some((route) =>
      path.startsWith(route),
    );

    if (isStorefrontPath && !isProtected) {
      window.history.replaceState(null, '', '/');
    }
  }, [location]);

  return null;
}

function AppContent() {
  const navigate = useNavigate();

  // Set page title and OG tags once on mount
  useEffect(() => {
    if (currentDomainConfig) {
      document.title = currentDomainConfig.title;
    } else {
      const domain = window.location.hostname;
      document.title = domain.includes('localhost')
        ? 'KiosCart Development - E-Shop Platform'
        : 'KiosCart - Online Platform for Kiosk and Cart Management';
    }
  }, []);

  // Custom domain → navigate directly to store slug (skip landing page)
  useEffect(() => {
    if (currentDomainConfig && window.location.pathname === '/') {
      navigate(`/${currentDomainConfig.slug}`, { replace: true });
    }
  }, [navigate]);

  const { user, logout, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <CleanShopkeeperUrl />

      {!user ? (
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/estore" element={<Eshop />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/estore-register" element={<ShopKeeperRegister />} />
          <Route path="/about" element={<AboutUsPage />} />
          {/* <Route path="/login" element={<AdminLogin />} /> */}
          <Route path="/estore/login" element={<EShopLogin />} />
          <Route path="/register" element={<ShopKeeperRegister />} />
          <Route path="/contact" element={<ContactUsPage />} />
          <Route path="/terms" element={<TermsAndConditionsPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/admin-login" element={<AdminLogs />} />
          <Route
            path="/:shopName"
            element={<StorefrontTemplate onBack={() => navigate(-1)} />}
          />
          <Route path="/cart/:shopkeeperId" element={<CartPage />} />
          <Route path="/cart-auth-return" element={<CartAuthReturn />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/login" element={<ShopkeeperLogin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        (() => {
          switch (user.roles[0]) {
            case 'admin':
              return (
                <AdminLayout onLogout={logout}>
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate to="/admin-dashboard" replace />}
                    />
                    <Route
                      path="/admin-dashboard"
                      element={<AdminDashboard />}
                    />
                    <Route
                      path="/admin-dashboard/users"
                      element={<UsersPage />}
                    />
                    <Route
                      path="/admin-dashboard/pricing"
                      element={<PricingPage />}
                    />
                    <Route
                      path="/admin-dashboard/analytics"
                      element={<div className="p-6">Analytics Dashboard</div>}
                    />
                    <Route
                      path="/admin-dashboard/settings"
                      element={<SettingsPage />}
                    />
                    <Route
                      path="*"
                      element={<Navigate to="/admin-dashboard" replace />}
                    />
                  </Routes>
                </AdminLayout>
              );

            case 'shopkeeper':
              return (
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="/estore-dashboard" replace />}
                  />
                  <Route path="/login" element={<ShopkeeperLogin />} />
                  <Route path="/cart/:shopkeeperId" element={<CartPage />} />
                  <Route path="/payment" element={<PaymentPage />} />
                  <Route
                    path="/:shopName"
                    element={<StorefrontTemplate onBack={() => navigate(-1)} />}
                  />
                  <Route
                    path="/estore-dashboard"
                    element={<ShopkeeperDashboard onLogout={logout} />}
                  />
                  <Route
                    path="/estore-dashboard/product-management"
                    element={<ProductManagement />}
                  />
                  <Route
                    path="/estore-dashboard/product-form"
                    element={<ProductForm />}
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/estore-dashboard" replace />}
                  />
                </Routes>
              );
            case 'user':
              return (
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route
                    path="/:shopName"
                    element={<StorefrontTemplate onBack={() => navigate(-1)} />}
                  />
                  <Route path="/payment" element={<PaymentPage />} />
                  <Route path="/cart/:shopkeeperId" element={<CartPage />} />
                  <Route
                    path="/login"
                    element={
                      <RequireUserRole>
                        <ShopkeeperLogin />
                      </RequireUserRole>
                    }
                  />
                  <Route path="/estore/login" element={<EShopLogin />} />
                  <Route
                    path="/register"
                    element={
                      <RequireUserRole>
                        <ShopKeeperRegister />
                      </RequireUserRole>
                    }
                  />
                  <Route
                    path="*"
                    element={<Navigate to="/user-dashboard" replace />}
                  />
                </Routes>
              );
            default:
              return (
                <Routes>
                  <Route
                    path="*"
                    element={
                      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
                        <div className="text-center bg-white p-8 rounded-2xl shadow-xl max-w-md">
                          <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                            Welcome, {user.roles[0]}!
                          </h1>
                          <p className="text-gray-600 mb-6">
                            Your dashboard is coming soon...
                          </p>
                          <button
                            onClick={logout}
                            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
                          >
                            Logout
                          </button>
                        </div>
                      </div>
                    }
                  />
                </Routes>
              );
          }
        })()
      )}
    </Suspense>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - avoid refetching fresh data
      gcTime: 10 * 60 * 1000, // 10 minutes cache
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <CartProvider>
                <AppContent />
              </CartProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
