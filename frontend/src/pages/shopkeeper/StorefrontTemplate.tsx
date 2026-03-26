import { useState, useEffect, CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  ShoppingCart,
  Heart,
  Share2,
  Filter,
  Search,
  ArrowLeft,
  Menu,
  User,
  Phone,
  Mail,
  MapPin,
  Clock,
  Globe,
  MessageCircle,
  Facebook,
  Twitter,
  Instagram,
  X,
  ChevronLeft,
  ChevronRight,
  TwitterIcon,
} from "lucide-react";
import { StorefrontCustomizer } from "@/components/shopkeeper/StorefrontCustomizer";
import { ProductDetailsDialog } from "@/components/shopkeeper/productDetailDialog";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  FaFacebook,
  FaInstagram,
  FaTiktok,
  FaTwitter,
  FaWhatsapp,
  FaXing,
} from "react-icons/fa";
import { Helmet } from "react-helmet-async";
import AnnouncementBar from "@/components/ui/adBar";

export interface ShopkeeperStore {
  _id: string;
  shopkeeperId: string;
  slug: string;
  settings: {
    general: {
      storeName: string;
      tagline: string;
      description: string;
      logo: string;
      favicon: string;
      contactInfo: {
        phone: string;
        email: string;
        address: string;
        hours: string;
        website: string;
        instagramLink: string;
        twitterLink: string;
        tiktokLink: string;
        facebookLink: string;
        showInstagram: boolean;
        showFacebook: boolean;
        showTiktok: boolean;
        showTwitter: boolean;
      };
    };
    design: {
      theme: string;
      primaryColor: string;
      secondaryColor: string;
      fontFamily: string;
      layout: {
        header: string;
        allProducts: string;
        visibleFeaturedProducts: boolean;
        visibleAdvertismentBar: boolean;
        visibleProductCarausel: boolean;
        advertiseText: string;
        adBarBgcolor: string;
        adBarTextColor: string;
        visibleQuickPicks: boolean;
        featuredProducts: string;
        quickPicks: string;
        banner: string;
        footer: string;
      };
      bannerImage: string;
      heroBannerImage: string;
      showBanner: boolean;
      bannerHeight: string;
    };
    features: {
      showSearch: boolean;
      showFilters: boolean;
      showReviews: boolean;
      showWishlist: boolean;
      showSocialMedia: boolean;
      enableChat: boolean;
      showNewsletter: boolean;
    };
    seo: {
      metaTitle: string;
      metaDescription: string;
      keywords: string;
      customCode: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export function StorefrontTemplate({ onBack }: { onBack: () => void }) {
  const apiURL = __API_URL__;
  const navigate = useNavigate();

  const [settings, setSettings] = useState<ShopkeeperStore | null>(null);
  const [products, setProducts] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("featured");
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [whatsAppNumber, setWhatsappNumber] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [shopkeeperId, setShopkeeperId] = useState("");
  const [layout, setLayout] = useState("");
  const [header, setHeader] = useState("");
  const [banner, setBanner] = useState("");
  const [featureProducts, setFeatureProducts] = useState("");
  const [quickPicks, setQuickPicks] = useState("");
  const [allProducts, setAllProducts] = useState("");
  const [footer, setFooter] = useState("");
  const [isNavBarSticky, setIsNavBarSticky] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const [shopkeeperInfo, setShopkeeperInfo] = useState<any>(null);
  const { formatPrice, getSymbol } = useCurrency(
    shopkeeperInfo?.country || "IN",
  );

  // Carousel state
  const [currentSlide, setCurrentSlide] = useState(0);

  // Carousel state

  // Product details dialog state
  // const [selectedProduct, setSelectedProduct] = useState<any>(null);
  // const [showProductDetails, setShowProductDetails] = useState(false);

  const updateCartCountForShopkeeper = async (currentShopkeeperId) => {
    try {
      const cartData = JSON.parse(localStorage.getItem("cart") || "{}");
      let totalCount = 0;

      if (
        cartData[currentShopkeeperId] &&
        Array.isArray(cartData[currentShopkeeperId])
      ) {
        totalCount = cartData[currentShopkeeperId].length;
      }

      await setCartCount(totalCount);
    } catch (err) {
      console.error("Failed to parse cart from localStorage", err);
      setCartCount(0);
    }
  };

  useEffect(() => {
    updateCartCountForShopkeeper(shopkeeperId);

    // Optional: If you want to listen for changes in localStorage from other tabs/windows:
    const storageListener = (event: StorageEvent) => {
      if (event.key === "cart") {
        updateCartCountForShopkeeper(shopkeeperId);
      }
    };
    window.addEventListener("storage", storageListener);

    return () => window.removeEventListener("storage", storageListener);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const navBarThreshold = 140; // Height of top bar
      setIsNavBarSticky(window.scrollY > navBarThreshold);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Helper function to get full image URL
  const getImageUrl = (imagePath: string | undefined): string => {
    if (!imagePath) return "/placeholder-product.jpg";

    // Already a full URL
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      return imagePath;
    }

    // Relative path - add API URL
    const fullPath = imagePath.startsWith("/") ? imagePath : "/" + imagePath;
    return `${apiURL}${fullPath}`;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const token = sessionStorage.getItem("token");
        if (!token) throw new Error("Unauthorized");

        const [settingsRes, productsRes] = await Promise.all([
          fetch(`${apiURL}/shopkeeper-stores/shopkeeper-store-detail`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiURL}/products/shopkeeper-products`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!settingsRes.ok || !productsRes.ok) {
          throw new Error("Failed to load data");
        }

        const settingsData = await settingsRes.json();
        const productsData = await productsRes.json();

        setSettings(settingsData.data || settingsData);

        setProducts(productsData.data || productsData || []);

        if (settingsData.data?.settings?.design?.bannerImage) {
        }
      } catch (err: any) {
        setError(err.message || "Error loading storefront.");
      } finally {
        setLoading(false);
      }
    }

    async function fetchShopkeeper() {
      try {
        const token = sessionStorage.getItem("token");
        const decoded = jwtDecode(token);
        const shopkeeperId = decoded.sub;
        const res = await fetch(
          `${__API_URL__}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
        );
        const data = await res.json();
        setWhatsappNumber(data?.data?.whatsappNumber || "");
        setShopkeeperInfo(data?.data);
      } catch {
        setWhatsappNumber("");
      }
    }
    fetchShopkeeper();
    fetchData();
  }, []);

  // Close sidebar when screen size changes to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  useEffect(() => {
    if (settings?.settings?.design?.layout) {
      // setLayout(settings?.settings.design.layout);
      setHeader(settings?.settings?.design?.layout.header);
      if (settings?.settings?.design?.layout.visibleFeaturedProducts) {
        setFeatureProducts(settings?.settings?.design?.layout.featuredProducts);
      }
      if (settings?.settings?.design?.layout.visibleQuickPicks) {
        setQuickPicks(settings?.settings?.design?.layout.quickPicks);
      }
      if (settings?.settings?.design?.showBanner) {
        setBanner(settings?.settings?.design?.layout.banner);
      }
      setAllProducts(settings?.settings.design.layout.allProducts);
      setFooter(settings?.settings?.design?.layout.footer);
    }
  });

  // Smooth scroll function
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setSidebarOpen(false);
  };

  // Product click handler
  const handleProductClick = (productId: string) => {
    setSelectedProductId(productId);
    setShowProductDialog(true);
  };

  // Get random products for carousel
  const getRandomProducts = () => {
    if (!products || products.length === 0) return [];
    const shuffled = [...products].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 8);
  };

  const carouselProducts = getRandomProducts();
  const totalSlides = Math.ceil(carouselProducts.length / 2);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-4">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-base sm:text-lg font-medium">
            Loading storefront...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center bg-card rounded-xl shadow-lg p-6 sm:p-8 max-w-md w-full border">
          <p className="text-red-600 mb-4 text-base sm:text-lg">{error}</p>
          <Button
            onClick={onBack}
            className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const categories =
    products && products.length > 0
      ? ["all", ...Array.from(new Set(products.map((p) => p.category)))]
      : ["all"];

  const featuredProduct =
    products && products.length > 0
      ? products.reduce(
          (latest, product) =>
            new Date(product.createdAt) > new Date(latest.createdAt)
              ? product
              : latest,
          products[0],
        )
      : null;

  const quickPickProducts =
    products && products.length > 0
      ? products
          .filter((product) => product.rating >= 4)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 4)
      : [];

  const handleSaveCustomization = (newSettings: any) => {
    setSettings(newSettings);
    setShowCustomizer(false);
  };

  const filteredProducts =
    products && products.length > 0
      ? products.filter((product) => {
          const matchesSearch = product.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase());
          const matchesCategory =
            selectedCategory === "all" || product.category === selectedCategory;
          return matchesSearch && matchesCategory;
        })
      : [];

  function getLowestPrice(product: any): number | null {
    let minPrice: number | null = null;
    product.subcategories?.forEach((subcat: any) => {
      subcat.variants?.forEach((variant: any) => {
        if (
          variant.inventory > 0 &&
          (minPrice === null || variant.price < minPrice)
        ) {
          minPrice = variant.price;
        }
      });
    });
    return minPrice;
  }

  const handleCartClick = () => {
    if (!settings?.shopkeeperId) return;
    navigate(`/cart/${settings.shopkeeperId}`);
  };

  const infoBadgeStyle = {
    backgroundColor: settings.settings.design.secondaryColor,
    color: "#fff",
    fontFamily: settings.settings.design.fontFamily,
  };

  const design = settings.settings.design;
  const features = settings.settings.features;
  const general = settings.settings.general;

  const getThemeColors = () => {
    const isDark = design.theme === "dark";
    return {
      "--background": isDark ? "#0f0f0f" : "#ffffff",
      "--foreground": isDark ? "#f1f5f9" : "#0f172a",
      "--card": isDark ? "#1e1e1e" : "#ffffff",
      "--card-foreground": isDark ? "#f1f5f9" : "#0f172a",
      "--muted": isDark ? "#2a2a2a" : "#f8fafc",
      "--muted-foreground": isDark ? "#94a3b8" : "#64748b",
      "--border": isDark ? "#374151" : "#e2e8f0",
      "--primary": design.primaryColor,
      "--secondary": design.secondaryColor,
    };
  };

  function getProductPrice(product: any): {
    price: number | null;
    hasVariants: boolean;
    inStock: boolean;
  } {
    // Check if product has subcategories with variants
    const hasSubcategories =
      product.subcategories && product.subcategories.length > 0;

    if (hasSubcategories) {
      // Product has subcategories - get lowest variant price
      let minPrice: number | null = null;
      let hasStock = false;

      product.subcategories.forEach((subcat: any) => {
        if (subcat.variants && subcat.variants.length > 0) {
          subcat.variants.forEach((variant: any) => {
            // Check if variant is in stock (if tracking quantity)
            const variantInStock =
              !variant.trackQuantity || variant.inventory > 0;

            if (variantInStock) {
              hasStock = true;
              if (minPrice === null || variant.price < minPrice) {
                minPrice = variant.price;
              }
            }
          });
        }
      });

      return { price: minPrice, hasVariants: true, inStock: hasStock };
    } else {
      // Product has no subcategories - use product-level pricing and inventory
      const productInStock =
        !product.trackQuantity || (product.inventory && product.inventory > 0);
      return {
        price: product.price,
        hasVariants: false,
        inStock: productInStock,
      };
    }
  }

  function getDisplayPrice(product: any): string {
    const { price, hasVariants, inStock } = getProductPrice(product);

    if (!inStock) {
      return "Out of stock";
    }

    if (price === null) {
      return "Price unavailable";
    }

    return hasVariants
      ? `${formatPrice(price)} onwards`
      : `${formatPrice(price)}`;
  }

  // Helper function for checking if product is available
  function isProductAvailable(product: any): boolean {
    const { inStock } = getProductPrice(product);
    return inStock;
  }

  const themeStyles: CSSProperties = {
    ...getThemeColors(),
    fontFamily: design.fontFamily,
  } as CSSProperties;

  const getBannerHeight = () => {
    switch (design.bannerHeight) {
      case "small":
        return "300px";
      case "medium":
        return "400px";
      case "large":
        return "500px";
      case "xl":
        return "600px";
      default:
        return "400px";
    }
  };

  if (showCustomizer) {
    return (
      <StorefrontCustomizer
        onBack={() => setShowCustomizer(false)}
        onSave={handleSaveCustomization}
      />
    );
  }

  const onShare = async () => {
    const shareUrl = `https://kioscart.com/${settings.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out ${general.storeName} on KiosCart`,
          url: shareUrl,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      // Fallback for browsers that don't support navigator.share
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Store link copied to clipboard: " + shareUrl);
      } catch {
        alert("Sharing is not supported on this device.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Head */}
      <Helmet>
        <title>
          {settings.settings.general.storeName || "Default Shop Title"}
        </title>
        <meta
          name="description"
          content={
            settings.settings.general.description || "Default Shop Description"
          }
        />
        <meta
          property="og:title"
          content={settings.settings.general.storeName || "Default Shop Title"}
        />
        <meta
          property="og:description"
          content={
            settings.settings.general.description || "Default Shop Description"
          }
        />
        {/* Add more meta tags if needed */}
      </Helmet>
      {settings.settings.seo.customCode && (
        <div
          dangerouslySetInnerHTML={{
            __html: settings.settings.seo.customCode,
          }}
        />
      )}

      {/* Product Details Dialog */}
      <ProductDetailsDialog
        productId={selectedProductId}
        isOpen={showProductDialog}
        onClose={() => {
          setShowProductDialog(false);
          setSelectedProductId(null);
        }}
        primaryColor={design.primaryColor}
        secondaryColor={design.secondaryColor}
        fontFamily={design.fontFamily}
        features={{
          showReviews: features.showReviews,
          showWishlist: features.showWishlist,
        }}
      />

      <div className="bg-white dark:bg-gray-900 shadow-sm border-b p-3 sm:p-4 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto px-2 sm:px-4">
          <Button
            variant="buttonOutline"
            onClick={onBack}
            className="hover:bg-gray-50 dark:hover:bg-gray-800 text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-2"
            size="sm"
          >
            <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Back to </span>Dashboard
          </Button>
        </div>
      </div>

      {/* STOREFRONT CONTENT */}
      <div style={themeStyles} className="text-foreground">
        {settings.settings.design.layout.visibleAdvertismentBar &&
          settings.settings.design.layout.advertiseText && (
            <AnnouncementBar
              message={settings.settings.design.layout.advertiseText}
              backgroundColor={
                settings.settings.design.layout.adBarBgcolor || "#000000"
              }
              textColor={
                settings.settings.design.layout.adBarTextColor || "#ffffff"
              }
              speed="100s"
              fontFamily={settings.settings.design.fontFamily || "Arial"}
            />
          )}
        {/* Navigation - FIXED WHITE BACKGROUND */}
        {header === "modern" && (
          <nav className="bg-white shadow-sm border-b sticky top-0 sm:top-0 z-40">
            <div className="max-w-7xl mx-auto px-2 sm:px-4">
              <div className="flex justify-between items-center h-14 sm:h-16">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden p-1 sm:p-2"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>

                <div className="flex items-center space-x-3 sm:space-x-6 lg:space-x-8">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    {general.logo ? (
                      <img
                        src={getImageUrl(general.logo)}
                        alt="Logo"
                        loading="lazy"
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm sm:text-lg ${
                        general.logo ? "hidden" : ""
                      }`}
                      style={{ backgroundColor: design.primaryColor }}
                    >
                      {general.storeName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h1
                        className="font-bold text-base sm:text-lg lg:text-xl text-gray-900 truncate max-w-auto sm:max-w-none"
                        style={{ fontFamily: design.fontFamily }}
                      >
                        {general.storeName}
                      </h1>
                    </div>
                  </div>
                  <div className="hidden md:flex mr-15 space-x-4 lg:space-x-8">
                    <button
                      onClick={() => scrollToSection("home")}
                      className="text-gray-900 hover:text-primary font-medium transition-colors text-sm lg:text-base"
                    >
                      Home
                    </button>
                    <button
                      onClick={() => scrollToSection("products")}
                      className="text-gray-600 hover:text-primary transition-colors text-sm lg:text-base"
                    >
                      Products
                    </button>
                    <button
                      onClick={() => scrollToSection("about")}
                      className="text-gray-600 hover:text-primary transition-colors text-sm lg:text-base"
                    >
                      About
                    </button>
                    <button
                      onClick={() => scrollToSection("about")}
                      className="text-gray-600 hover:text-primary transition-colors text-sm lg:text-base"
                    >
                      Contact
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-1 sm:space-x-3">
                  {features.showWishlist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-600 hover:text-primary p-1 sm:p-2"
                    >
                      <Heart className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                  )}
                  <Button
                    variant="buttonOutline"
                    size="lg"
                    onClick={handleCartClick}
                    className="relative"
                  >
                    <ShoppingCart size={50} />

                    {cartCount > 0 && (
                      <span
                        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: design.primaryColor }}
                      >
                        {cartCount > 99 ? "99+" : cartCount}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </nav>
        )}

        {header === "minimal" && (
          <>
            <nav className="bg-white shadow-md border-b sticky top-0 z-40">
              <div className="w-full px-3 sm:px-4 md:px-6">
                <div className="flex justify-between items-center h-14 sm:h-16 md:h-18">
                  {/* Left Navigation Items (hidden on mobile) */}
                  <div className="hidden md:flex space-x-4 lg:space-x-6 flex-shrink-0">
                    <button
                      onClick={() => scrollToSection("home")}
                      className="text-gray-900 hover:text-primary font-medium hover:font-bold transition-all duration-200 text-xs lg:text-sm whitespace-nowrap"
                    >
                      Home
                    </button>
                    <button
                      onClick={() => scrollToSection("products")}
                      className="text-gray-600 hover:text-primary font-medium hover:font-bold transition-all duration-200 text-xs lg:text-sm whitespace-nowrap"
                    >
                      Products
                    </button>
                    <button
                      onClick={() => scrollToSection("about")}
                      className="text-gray-600 hover:text-primary font-medium hover:font-bold transition-all duration-200 text-xs lg:text-sm whitespace-nowrap"
                    >
                      About
                    </button>
                    <button
                      onClick={() => scrollToSection("about")}
                      className="text-gray-600 hover:text-primary font-medium hover:font-bold transition-all duration-200 text-xs lg:text-sm whitespace-nowrap"
                    >
                      Contact
                    </button>
                  </div>

                  {/* Center: Logo and Store Name (desktop) / Left (mobile) */}
                  <div className="md:absolute md:left-1/2 md:transform md:-translate-x-1/2 flex items-center space-x-2 sm:space-x-3 md:space-x-4 flex-shrink-0">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      {general.logo ? (
                        <img
                          src={getImageUrl(general.logo)}
                          alt="Logo"
                          loading="lazy"
                          className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove(
                              "hidden",
                            );
                          }}
                        />
                      ) : null}
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center text-white font-bold text-sm sm:text-base md:text-lg ${
                          general.logo ? "hidden" : ""
                        }`}
                        style={{ backgroundColor: design.primaryColor }}
                      >
                        {general.storeName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h1
                          className="font-bold text-sm sm:text-base md:text-lg lg:text-xl text-gray-900 truncate max-w-auto sm:max-w-auto md:max-w-none"
                          style={{ fontFamily: design.fontFamily }}
                        >
                          {general.storeName}
                        </h1>
                      </div>
                    </div>
                  </div>

                  {/* Right: Menu Toggle, Cart Button */}
                  <div className="flex items-center space-x-1 sm:space-x-2 ml-auto flex-shrink-0">
                    {/* Mobile Menu Toggle */}
                    <button
                      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                      className="md:hidden text-gray-600 hover:text-primary transition-colors p-1.5 sm:p-2"
                      aria-label="Toggle menu"
                    >
                      {isMobileMenuOpen ? (
                        <X className="h-5 w-5 sm:h-6 sm:w-6" />
                      ) : (
                        <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
                      )}
                    </button>

                    {/* Wishlist Button */}
                    {features.showWishlist && (
                      <button
                        className="hidden sm:flex text-gray-600 hover:text-primary p-1.5 sm:p-2 flex-shrink-0"
                        aria-label="Wishlist"
                      >
                        <Heart className="h-4 w-4 sm:h-5 sm:w-5 md:h-5 md:w-5" />
                      </button>
                    )}

                    {/* Cart Button */}
                    <button
                      onClick={handleCartClick}
                      className="relative text-gray-600 hover:text-primary transition-colors p-1.5 sm:p-2 flex-shrink-0"
                      aria-label="Shopping cart"
                    >
                      <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 md:h-6 md:w-6" />
                      {cartCount > 0 && (
                        <span
                          className="absolute top-0 right-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: design.primaryColor }}
                        >
                          {cartCount > 99 ? "99+" : cartCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Mobile Menu Dropdown */}
                {isMobileMenuOpen && (
                  <div className="md:hidden bg-gray-50 border-t border-gray-200 animate-in fade-in duration-200">
                    <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
                      <button
                        onClick={() => {
                          scrollToSection("home");
                          closeMobileMenu();
                        }}
                        className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-900 hover:bg-gray-200 font-semibold transition-colors rounded text-sm sm:text-base"
                      >
                        Home
                      </button>
                      <button
                        onClick={() => {
                          scrollToSection("products");
                          closeMobileMenu();
                        }}
                        className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold transition-colors rounded text-sm sm:text-base"
                      >
                        Products
                      </button>
                      <button
                        onClick={() => {
                          scrollToSection("about");
                          closeMobileMenu();
                        }}
                        className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold transition-colors rounded text-sm sm:text-base"
                      >
                        About
                      </button>
                      <button
                        onClick={() => {
                          scrollToSection("contact");
                          closeMobileMenu();
                        }}
                        className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold transition-colors rounded text-sm sm:text-base"
                      >
                        Contact
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </nav>
          </>
        )}

        {header === "mega" && (
          <>
            {/* TOP SECTION: Normal scrolling logo and store name */}
            <nav className="hidden md:block bg-white shadow-md border-b relative z-30 transition-all duration-300">
              <div className="w-full px-3 sm:px-4 md:px-6">
                <div
                  className={`flex justify-center items-center transition-all duration-300 ${
                    isNavBarSticky
                      ? "py-0 h-0 opacity-0 overflow-hidden"
                      : "py-3 sm:py-4 md:py-5 opacity-100"
                  }`}
                >
                  <div className="flex items-center space-x-2 sm:space-x-3 md:space-x-4 text-center md:text-left">
                    {general.logo ? (
                      <img
                        src={getImageUrl(general.logo)}
                        alt="Logo"
                        loading="lazy"
                        className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg object-cover transition-all duration-300 flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg flex items-center justify-center text-white font-bold text-lg sm:text-xl md:text-2xl transition-all duration-300 flex-shrink-0 ${
                        general.logo ? "hidden" : ""
                      }`}
                      style={{ backgroundColor: design.primaryColor }}
                    >
                      {general.storeName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h1
                        className="font-bold text-base sm:text-lg md:text-2xl lg:text-3xl text-gray-900 transition-all duration-300 truncate sm:truncate-none"
                        style={{ fontFamily: design.fontFamily }}
                      >
                        {general.storeName}
                      </h1>
                      <p className="text-gray-500 text-xs sm:text-sm md:text-sm mt-0.5 sm:mt-1 transition-all duration-300 hidden sm:block">
                        {general.tagline}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </nav>

            {/* B O T T O M  S E C T I O N */}
            <nav
              className={`bg-white shadow-md border-b transition-all duration-300 ${
                isNavBarSticky
                  ? "fixed top-0 left-0 right-0 w-full shadow-lg z-50"
                  : "relative z-40"
              }`}
            >
              <div className="w-full px-3 sm:px-4 md:px-6">
                <div
                  className={`flex items-center transition-all duration-300 ${
                    isNavBarSticky && !isMobile
                      ? "h-12 sm:h-14 md:h-16 py-2 sm:py-3 md:py-4"
                      : "py-3 sm:py-4 md:py-5"
                  }`}
                >
                  {/* M O B I L E  L A Y O U T */}
                  {isMobile ? (
                    <>
                      {/* Left: Mobile Menu Button */}
                      <div className="flex items-center flex-shrink-0">
                        <button
                          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                          className="flex text-gray-600 hover:text-primary transition-colors p-1.5 sm:p-2"
                          aria-label="Toggle menu"
                        >
                          {isMobileMenuOpen ? (
                            <X className="h-5 w-5 sm:h-6 sm:w-6" />
                          ) : (
                            <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
                          )}
                        </button>
                      </div>

                      {/* Center Logo + Store Name */}
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex items-center space-x-2">
                          {general.logo ? (
                            <img
                              src={getImageUrl(general.logo)}
                              alt="Logo"
                              loading="lazy"
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                e.currentTarget.nextElementSibling?.classList.remove(
                                  "hidden",
                                );
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs sm:text-sm ${
                              general.logo ? "hidden" : ""
                            }`}
                            style={{ backgroundColor: design.primaryColor }}
                          >
                            {general.storeName.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-gray-800 text-xs sm:text-sm font-semibold truncate">
                            {general.storeName}
                          </p>
                        </div>
                      </div>

                      {/* Cart */}
                      <div className="flex items-center flex-shrink-0">
                        <button
                          onClick={handleCartClick}
                          className="relative text-gray-600 hover:text-primary transition-all duration-300 p-1.5 sm:p-2"
                          aria-label="Shopping cart"
                        >
                          <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" />
                          {cartCount > 0 && (
                            <span
                              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: design.primaryColor }}
                            >
                              {cartCount > 99 ? "99+" : cartCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* D E S K T O P  L A Y O U T */}

                      {/* Left Logo */}
                      <div
                        className={`flex items-center space-x-1.5 sm:space-x-2 transition-all duration-300 flex-shrink-0 ${
                          isNavBarSticky
                            ? "md:opacity-100 md:w-auto opacity-100"
                            : "opacity-0 w-0 overflow-hidden"
                        }`}
                      >
                        {general.logo ? (
                          <img
                            src={getImageUrl(general.logo)}
                            alt="Logo"
                            loading="lazy"
                            className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded object-cover transition-all duration-300"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              e.currentTarget.nextElementSibling?.classList.remove(
                                "hidden",
                              );
                            }}
                          />
                        ) : null}
                        <div
                          className={`w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded flex items-center justify-center text-white font-bold text-xs sm:text-sm transition-all duration-300 ${
                            general.logo ? "hidden" : ""
                          }`}
                          style={{ backgroundColor: design.primaryColor }}
                        >
                          {general.storeName.charAt(0).toUpperCase()}
                        </div>
                        <div className="hidden md:block">
                          <p className="text-gray-600 text-xs lg:text-sm font-medium truncate">
                            {general.storeName}
                          </p>
                        </div>
                      </div>

                      {/* Navigation Items */}
                      <div
                        className={`hidden md:flex items-center justify-center flex-1 transition-all duration-300 ${
                          isNavBarSticky
                            ? "space-x-3 lg:space-x-5"
                            : "space-x-4 lg:space-x-8"
                        }`}
                      >
                        <button
                          onClick={() => scrollToSection("home")}
                          className={`text-gray-900 hover:text-primary font-semibold transition-all duration-200 hover:underline whitespace-nowrap px-3 py-2 rounded-md ${
                            isNavBarSticky
                              ? "text-base lg:text-lg" // Even larger: was text-sm lg:text-base
                              : "text-lg lg:text-xl" // Even larger: was text-base lg:text-lg
                          }`}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.fontWeight = "bold";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.fontWeight = "normal";
                          }}
                        >
                          Home
                        </button>
                        <button
                          onClick={() => scrollToSection("products")}
                          className={`text-gray-600 hover:text-primary font-semibold transition-all duration-200 hover:underline whitespace-nowrap px-3 py-2 rounded-md ${
                            isNavBarSticky
                              ? "text-base lg:text-lg" // Even larger: was text-sm lg:text-base
                              : "text-lg lg:text-xl" // Even larger: was text-base lg:text-lg
                          }`}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.fontWeight = "bold";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.fontWeight = "normal";
                          }}
                        >
                          Products
                        </button>
                        <button
                          onClick={() => scrollToSection("about")}
                          className={`text-gray-600 hover:text-primary font-semibold transition-all duration-200 hover:underline whitespace-nowrap px-3 py-2 rounded-md ${
                            isNavBarSticky
                              ? "text-base lg:text-lg" // Even larger: was text-sm lg:text-base
                              : "text-lg lg:text-xl" // Even larger: was text-base lg:text-lg
                          }`}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.fontWeight = "bold";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.fontWeight = "normal";
                          }}
                        >
                          About
                        </button>
                        <button
                          onClick={() => scrollToSection("about")}
                          className={`text-gray-600 hover:text-primary font-semibold transition-all duration-200 hover:underline whitespace-nowrap px-3 py-2 rounded-md ${
                            isNavBarSticky
                              ? "text-base lg:text-lg" // Even larger: was text-sm lg:text-base
                              : "text-lg lg:text-xl" // Even larger: was text-base lg:text-lg
                          }`}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.fontWeight = "bold";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.fontWeight = "normal";
                          }}
                        >
                          Contact
                        </button>
                      </div>

                      {/* Right: Wishlist + Cart + Mobile */}
                      <div className="flex items-center space-x-1 sm:space-x-2 ml-auto flex-shrink-0">
                        {features.showWishlist && !isNavBarSticky && (
                          <button
                            className="hidden sm:flex text-gray-600 hover:text-primary transition-colors p-1.5 sm:p-2"
                            aria-label="Wishlist"
                          >
                            <Heart className="h-4 w-4 sm:h-5 sm:w-5" />
                          </button>
                        )}
                        <button
                          onClick={handleCartClick}
                          className="relative text-gray-600 hover:text-primary transition-all duration-300 p-1.5 sm:p-2 flex-shrink-0"
                          aria-label="Shopping cart"
                        >
                          <ShoppingCart
                            className={`transition-all duration-300 ${
                              isNavBarSticky
                                ? "h-5 w-5 sm:h-5 sm:w-5"
                                : "h-5 w-5 sm:h-6 sm:w-6"
                            }`}
                          />
                          {cartCount > 0 && (
                            <span
                              className={`absolute flex items-center justify-center rounded-full text-white font-bold transition-all duration-300 ${
                                isNavBarSticky
                                  ? "top-0 right-0 h-4 w-4 text-xs"
                                  : "top-0 right-0 h-5 w-5 text-xs"
                              }`}
                              style={{ backgroundColor: design.primaryColor }}
                            >
                              {cartCount > 99 ? "99+" : cartCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Mobile Menu Dropdown */}
              {isMobileMenuOpen && isMobile && (
                <div className="md:hidden bg-gray-50 border-t border-gray-200 animate-in fade-in duration-200">
                  <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3">
                    <button
                      onClick={() => {
                        scrollToSection("home");
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-900 hover:bg-gray-200 font-semibold hover:font-bold transition-colors rounded text-sm sm:text-base"
                    >
                      Home
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection("products");
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold hover:font-bold transition-colors rounded text-sm sm:text-base"
                    >
                      Products
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection("about");
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold hover:font-bold transition-colors rounded text-sm sm:text-base"
                    >
                      About
                    </button>
                    <button
                      onClick={() => {
                        scrollToSection("contact");
                        closeMobileMenu();
                      }}
                      className="block w-full text-left px-3 sm:px-4 py-2 sm:py-2.5 text-gray-600 hover:bg-gray-200 font-semibold hover:font-bold transition-colors rounded text-sm sm:text-base"
                    >
                      Contact
                    </button>
                  </div>
                </div>
              )}
            </nav>

            {/* Spacer to prevent content overlap when desktop nav becomes sticky */}
            {isNavBarSticky && !isMobile && (
              <div className="h-12 sm:h-14 md:h-16 transition-all duration-300" />
            )}
          </>
        )}

        {/* Mobile Sidebar - FIXED BACKGROUND */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed left-0 top-0 h-full w-72 sm:w-80 bg-white dark:bg-gray-900 border-r p-4 sm:p-6 shadow-2xl overflow-y-auto">
              <div className="flex items-center justify-between mb-6 sm:mb-8">
                <span className="font-bold text-lg sm:text-xl text-gray-900 dark:text-white">
                  {general.storeName}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="space-y-4 sm:space-y-6">
                <button
                  onClick={() => scrollToSection("home")}
                  className="block w-full text-left py-3 text-base sm:text-lg font-semibold text-gray-900 dark:text-white hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  Home
                </button>
                <button
                  onClick={() => scrollToSection("products")}
                  className="block w-full text-left py-3 text-base sm:text-lg text-gray-600 dark:text-gray-300 hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  Products
                </button>
                <button
                  onClick={() => scrollToSection("about")}
                  className="block w-full text-left py-3 text-base sm:text-lg text-gray-600 dark:text-gray-300 hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  About
                </button>
                <button
                  onClick={() => scrollToSection("about")}
                  className="block w-full text-left py-3 text-base sm:text-lg text-gray-600 dark:text-gray-300 hover:text-primary transition-colors border-b border-gray-100 dark:border-gray-700"
                >
                  Contact
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Hero Banner - RESPONSIVE */}
        {banner === "modern" && design.showBanner && (
          <section
            id="home"
            className="relative overflow-hidden"
            style={{ height: getBannerHeight() }}
          >
            {design.bannerImage && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url("${getImageUrl(
                      design.bannerImage,
                    )}")`,
                  }}
                />
                <div className="absolute inset-0 bg-black/50" />
              </>
            )}

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
              <div className="max-w-xl sm:max-w-2xl lg:max-w-3xl text-white">
                <h1
                  className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight"
                  style={{ fontFamily: design.fontFamily }}
                >
                  {general.storeName}
                </h1>
                <p className="text-sm sm:text-lg lg:text-xl mb-6 sm:mb-8 opacity-90 leading-relaxed">
                  {general.tagline}
                </p>
                <div className="flex">
                  <Button
                    size="lg"
                    className="px-10 sm:px-16 lg:px-20 py-3 sm:py-4 rounded-xl text-sm sm:text-base lg:text-lg font-bold shadow-xl transition-all hover:scale-105 w-full sm:w-auto"
                    style={{ backgroundColor: design.primaryColor }}
                    onClick={() => scrollToSection("products")}
                  >
                    Shop Now
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {banner === "minimal" && design.showBanner && (
          <section
            id="home"
            className="relative overflow-hidden"
            style={{ height: getBannerHeight() }}
          >
            {design.bannerImage && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url("${getImageUrl(
                      design.bannerImage,
                    )}")`,
                  }}
                />
                <div className="absolute inset-0 bg-black/50" />
              </>
            )}

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-center">
              <div className="max-w-3xl text-white text-center flex flex-col items-center">
                <h1
                  className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight"
                  style={{ fontFamily: design.fontFamily }}
                >
                  {general.storeName}
                </h1>
                <p className="text-sm sm:text-lg lg:text-xl mb-6 sm:mb-8 opacity-90 leading-relaxed max-w-2xl">
                  {general.tagline}
                </p>
                <div className="flex justify-center w-full">
                  <Button
                    size="lg"
                    className="px-10 sm:px-16 lg:px-20 py-3 sm:py-4 rounded-xl text-sm sm:text-base lg:text-lg font-bold shadow-xl transition-all hover:scale-105 w-full sm:w-auto"
                    style={{ backgroundColor: design.primaryColor }}
                    onClick={() => scrollToSection("products")}
                  >
                    Shop Now
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {banner === "mega" && design.showBanner && (
          <section
            id="home"
            className="w-full px-4 sm:px-6 lg:px-8 py-8"
            style={{ height: getBannerHeight() }}
          >
            {/* Main Container Box */}
            <div
              className="w-full h-full rounded-[2rem] sm:rounded-[3rem] overflow-hidden flex items-center relative"
              style={{
                backgroundColor: design.primaryColor, // Default fallback
                backgroundImage: design.heroBannerImage
                  ? `url("${getImageUrl(design.heroBannerImage)}")`
                  : "none",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            >
              {/* Optional overlay for better text readability when using heroBannerImage */}
              {design.heroBannerImage && (
                <div className="absolute inset-0 bg-black/30" />
              )}

              <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[0.8fr_1.2fr] gap-4 sm:gap-8 items-center relative z-10">
                {/* Right Image Box */}
                <div className="flex justify-center md:justify-end w-full order-1 lg:order-2">
                  <div
                    className={`
              w-full 
              max-w-[16rem]
              md:max-w-[14rem] 
              lg:max-w-[32rem] 
              h-56 
              sm:h-64 
              md:h-72 
              lg:h-[24rem] 
              bg-gray-200 
              rounded-3xl 
              overflow-hidden 
              shadow-2xl 
              relative
            `}
                  >
                    {design.bannerImage && (
                      <img
                        src={getImageUrl(design.bannerImage)}
                        alt="Hero image"
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                </div>

                {/* Left Content */}
                <div className="flex flex-col items-center md:items-start space-y-4 sm:space-y-6 lg:space-y-8 max-w-lg lg:max-w-sm mx-auto lg:mx-0 order-2 lg:order-1">
                  {general.logo && (
                    <img
                      src={getImageUrl(general.logo)}
                      alt={`${general.storeName} logo`}
                      loading="lazy"
                      className="h-10 w-auto sm:h-12 lg:h-16 drop-shadow-lg"
                    />
                  )}
                  <h1
                    className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-white text-center md:text-left drop-shadow-lg"
                    style={{ fontFamily: design.fontFamily }}
                  >
                    {general.storeName}
                  </h1>
                  <div className="w-full sm:w-auto flex justify-center md:justify-start">
                    <Button
                      size="lg"
                      className="px-4 sm:px-6 lg:px-10 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-xs lg:text-base font-bold shadow-lg w-full sm:w-auto transition-transform hover:scale-105 hover:shadow-xl"
                      style={{
                        backgroundColor: "rgba(255,255,255,0.95)",
                        color: design.primaryColor,
                        backdropFilter: "blur(10px)",
                      }}
                      onClick={() => scrollToSection("products")}
                    >
                      Shop Now
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Featured Product - RESPONSIVE */}
        {featuredProduct &&
          settings?.settings.design.layout.visibleFeaturedProducts && (
            <section className="py-8 sm:py-12 lg:py-16 bg-muted/30">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8 sm:mb-12">
                  <h2
                    className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                    style={{ fontFamily: design.fontFamily }}
                  >
                    Featured Product
                  </h2>
                  <p className="text-base sm:text-lg text-muted-foreground">
                    Our newest addition
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
                  {/* Image: order 1 on mobile, order 1 on desktop */}
                  <div
                    className="relative cursor-pointer order-1 lg:order-1"
                    onClick={() => handleProductClick(featuredProduct._id)}
                  >
                    <img
                      src={getImageUrl(featuredProduct.images?.[0])}
                      alt={featuredProduct.name}
                      loading="lazy"
                      className="w-full h-64 sm:h-80 lg:h-96 object-cover rounded-xl shadow-lg hover:shadow-xl transition-shadow"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder-product.jpg";
                        e.currentTarget.onerror = null;
                      }}
                    />
                  </div>

                  {/* Details: order 2 on mobile, order 2 on desktop */}
                  <div className="space-y-4 sm:space-y-6 order-2 lg:order-2">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <Badge
                        style={{ backgroundColor: design.primaryColor }}
                        className="text-white px-2 sm:px-3 py-1 text-xs sm:text-sm"
                      >
                        Featured
                      </Badge>
                      <Badge
                        variant="outline"
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm"
                      >
                        Latest
                      </Badge>
                    </div>

                    <h3
                      className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight"
                      style={{ fontFamily: design.fontFamily }}
                    >
                      {featuredProduct.name}
                    </h3>

                    <p className="text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed">
                      {featuredProduct.description}
                    </p>

                    {/* {features.showReviews && (
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 sm:h-5 sm:w-5 ${
                                i < Math.floor(featuredProduct.rating || 0)
                                  ? "text-yellow-400 fill-yellow-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-xs sm:text-sm text-muted-foreground">
                            ({featuredProduct.reviews ?? 0} reviews)
                          </span>
                        </div>
                      </div>
                    )} */}

                    <div
                      className="text-2xl sm:text-3xl font-bold"
                      style={{ color: design.primaryColor }}
                    >
                      {getDisplayPrice(featuredProduct)}
                    </div>

                    <div className="flex flex-row xs:flex-row gap-3 sm:gap-4">
                      <Button
                        size="sm"
                        className="flex-1 text-sm sm:text-base lg:text-lg py-2 sm:py-3 rounded-xl"
                        style={{
                          backgroundColor: design.primaryColor,
                          color: "#fff",
                        }}
                        onClick={() => handleProductClick(featuredProduct._id)}
                        disabled={!isProductAvailable(featuredProduct)}
                      >
                        <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                        {isProductAvailable(featuredProduct)
                          ? "Add to Cart"
                          : "Out of Stock"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-sm sm:text-base lg:text-lg py-2 sm:py-3 px-4 sm:px-6 rounded-xl border-2"
                        onClick={() => handleProductClick(featuredProduct._id)}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

        {settings.settings.design.layout.visibleProductCarausel &&
          products &&
          products.length > 0 && (
            <section className="py-10 sm:py-14 overflow-hidden">
              {/* Heading */}
              <div className="text-center mb-8 px-4">
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold"
                  style={{ fontFamily: design.fontFamily }}
                >
                  Our Products
                </h2>
                <p className="text-muted-foreground text-sm sm:text-base mt-1 italic">
                  Browse through our collection
                </p>
              </div>

              {/* ROW 1 — scrolls left */}
              <div className="relative overflow-hidden mb-4">
                {/* Left fade */}
                {/* <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 sm:w-32 z-10"
        style={{ background: "linear-gradient(to right, var(--background, #fff), transparent)" }}
      /> */}
                {/* Right fade */}
                {/* <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 sm:w-32 z-10"
        style={{ background: "linear-gradient(to left, var(--background, #fff), transparent)" }}
      /> */}

                <div className="track-ltr">
                  {[...products, ...products].map((product, idx) => (
                    <div
                      key={`ltr-${idx}`}
                      className="pc-card"
                      onClick={() => handleProductClick(product._id)}
                    >
                      <div className="overflow-hidden relative">
                        <img
                          src={getImageUrl(product.images?.[0])}
                          alt={product.name}
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder-product.jpg";
                            e.currentTarget.onerror = null;
                          }}
                          loading="lazy"
                        />
                        {!isProductAvailable(product) && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                              Out of Stock
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                          {product.category}
                        </p>
                        <p
                          className="font-semibold text-sm text-gray-900 truncate"
                          style={{ fontFamily: design.fontFamily }}
                        >
                          {product.name}
                        </p>
                        {/* <div
                          className="mt-1 text-sm font-bold"
                          style={{ color: design.primaryColor }}
                        >
                          {getDisplayPrice(product)}
                        </div> */}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

        {/* Quick Picks Carousel Section - RESPONSIVE */}
        {settings.settings.design.layout.visibleQuickPicks && (
          <section className="py-8 sm:py-12 lg:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8 sm:mb-12">
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                  style={{ fontFamily: design.fontFamily }}
                >
                  Quick Picks
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  Handpicked products just for you
                </p>
              </div>

              {carouselProducts.length > 0 && (
                <div className="relative">
                  {/* Fixed height carousel container */}
                  <div className="overflow-hidden rounded-xl sm:rounded-2xl h-[28rem] sm:h-[32rem] lg:h-[36rem]">
                    <div
                      className="flex h-full transition-transform duration-500 ease-in-out"
                      style={{
                        transform: `translateX(-${currentSlide * 100}%)`,
                      }}
                    >
                      {/* 
                Note: To make this work correctly, the parent component's logic for 'totalSlides' 
                and 'currentSlide' navigation should ideally account for screen size.
                However, to achieve the visual requirement of "one card per slide on mobile" 
                within this snippet:
              */}
                      {Array.from({ length: totalSlides }).map(
                        (_, slideIndex) => (
                          <div
                            key={slideIndex}
                            className="w-full flex-shrink-0 h-full"
                          >
                            {/* Changed grid-cols-2 to grid-cols-1 for mobile, sm:grid-cols-2 for larger screens */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 px-2 sm:px-4 h-full w-full">
                              {/* 
                      On mobile, we only show the first product of the pair to ensure "one card per slide".
                      On tablet/desktop (sm and up), we show both products.
                    */}
                              {carouselProducts
                                .slice(slideIndex * 2, slideIndex * 2 + 2)
                                .map((product, index) => (
                                  <Card
                                    key={product._id}
                                    className={`group cursor-pointer hover:shadow-xl transition-all duration-300 rounded-3xl sm:rounded-3xl overflow-hidden bg-gradient-to-br from-white to-gray-50 h-full flex flex-col ${
                                      index === 1 ? "hidden sm:flex" : "flex"
                                    }`}
                                    onClick={() =>
                                      handleProductClick(product._id)
                                    }
                                  >
                                    <div className="relative flex-1 min-h-0">
                                      <img
                                        src={getImageUrl(product.images?.[0])}
                                        alt={product.name}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e) => {
                                          e.currentTarget.src =
                                            "/placeholder-product.jpg";
                                          e.currentTarget.onerror = null;
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                      {!isProductAvailable(product) && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                          <Badge
                                            variant="destructive"
                                            className="text-white font-semibold"
                                          >
                                            Out of Stock
                                          </Badge>
                                        </div>
                                      )}
                                    </div>

                                    <CardContent className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex-1 flex flex-col justify-between">
                                      <div className="space-y-2 flex-1">
                                        <h3 className="font-bold text-lg sm:text-xl lg:text-2xl group-hover:text-primary transition-colors line-clamp-2">
                                          {product.name}
                                        </h3>
                                        <p className="text-sm sm:text-base text-muted-foreground">
                                          {product.description}
                                        </p>
                                      </div>

                                      <div className="flex items-center justify-between pt-1">
                                        <div className="space-y-1">
                                          <div
                                            className="font-bold text-xl sm:text-2xl"
                                            style={{
                                              color: design.primaryColor,
                                            }}
                                          >
                                            {getDisplayPrice(product)}
                                          </div>
                                        </div>

                                        <Button
                                          className="rounded-lg sm:rounded-xl px-3 sm:px-6 py-1 sm:py-2 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-xs sm:text-sm h-auto"
                                          style={{
                                            backgroundColor:
                                              design.primaryColor,
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleProductClick(product._id);
                                          }}
                                          disabled={
                                            !isProductAvailable(product)
                                          }
                                        >
                                          {isProductAvailable(product)
                                            ? "View Details"
                                            : "Out of Stock"}
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}

                              {/* Empty placeholder for incomplete slides - hidden on mobile as we only show 1 card */}
                              {carouselProducts.slice(
                                slideIndex * 2,
                                slideIndex * 2 + 2,
                              ).length === 1 && (
                                <div className="hidden sm:flex h-full bg-gradient-to-br from-gray-50 to-white rounded-xl sm:rounded-2xl items-center justify-center">
                                  <p className="text-lg sm:text-xl text-muted-foreground text-center px-4">
                                    More products coming soon!
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  {totalSlides > 1 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={prevSlide}
                        className="absolute left-2 sm:left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:shadow-xl border-0 hover:scale-110 transition-all duration-300 z-10"
                        disabled={totalSlides === 0}
                      >
                        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={nextSlide}
                        className="absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:shadow-xl border-0 hover:scale-110 transition-all duration-300 z-10"
                        disabled={totalSlides === 0}
                      >
                        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                      </Button>
                    </>
                  )}

                  {/* Slide Indicators */}
                  {totalSlides > 1 && (
                    <div className="flex justify-center mt-6 sm:mt-8 space-x-2">
                      {Array.from({ length: totalSlides }).map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentSlide(index)}
                          className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full transition-all duration-300 ${
                            index === currentSlide
                              ? "scale-125 shadow-lg"
                              : "hover:scale-110"
                          }`}
                          style={{
                            backgroundColor:
                              index === currentSlide
                                ? design.primaryColor
                                : "#d1d5db",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* All Products - RESPONSIVE */}
        {allProducts === "modern" && (
          <section id="products" className="py-8 sm:py-12 lg:py-16 bg-muted/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8 sm:mb-12">
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                  style={{ fontFamily: design.fontFamily }}
                >
                  All Products
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  Handpicked products just for you
                </p>
              </div>

              {/* Filters - Compact */}
              {(features.showSearch || features.showFilters) && (
                <div className="bg-card rounded-3xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border mb-6 max-w-full">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {features.showSearch && (
                      <div className="flex-grow min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 h-10 sm:h-11 w-full rounded-3xl sm:rounded-3xl"
                        />
                      </div>
                    )}
                    {features.showFilters && (
                      <div className="min-w-[160px]">
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="w-full h-10 sm:h-11 rounded-2xl sm:rounded-3xl">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="featured">Featured</SelectItem>
                            <SelectItem value="price-low">
                              Price: Low to High
                            </SelectItem>
                            <SelectItem value="price-high">
                              Price: High to Low
                            </SelectItem>
                            <SelectItem value="rating">
                              Highest Rated
                            </SelectItem>
                            <SelectItem value="newest">Newest</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                {filteredProducts.map((product) => (
                  <div
                    key={product._id}
                    className="group mb-4 cursor-pointer border-2 border-border/50 hover:border-primary/80 rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-white hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
                    onClick={() => handleProductClick(product._id)}
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center p-6 sm:p-8">
                      {/* Image */}
                      <div className="relative">
                        <img
                          loading="lazy"
                          src={
                            product.images?.[0]
                              ? getImageUrl(product.images?.[0])
                              : "/placeholder-product.jpg"
                          }
                          alt={product.name}
                          className="w-full h-64 sm:h-80 lg:h-96 object-cover rounded-3xl sm:rounded-[2.5rem] shadow-lg group-hover:shadow-xl group-hover:scale-[1.02] transition-all duration-500"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder-product.jpg";
                            e.currentTarget.onerror = null;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl sm:rounded-[2.5rem]" />

                        {!isProductAvailable(product) && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-3xl sm:rounded-[2.5rem]">
                            <Badge
                              variant="destructive"
                              className="text-white font-semibold text-lg"
                            >
                              Out of Stock
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Product Details */}
                      <div className="space-y-4 sm:space-y-6">
                        {/* Name and Description */}
                        <div className="space-y-2">
                          <Badge
                            variant="secondary"
                            className="text-xs md:text-sm"
                            style={infoBadgeStyle}
                          >
                            {product.category}
                          </Badge>
                          <h3
                            className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight group-hover:text-primary transition-colors"
                            style={{ fontFamily: design.fontFamily }}
                          >
                            {product.name}
                          </h3>
                          {/* Responsive Description: Shortened on mobile (line-clamp-2), longer on desktop (line-clamp-4) */}
                          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-4">
                            {product.description}
                          </p>
                        </div>

                        <div
                          className="text-2xl sm:text-3xl lg:text-4xl font-bold"
                          style={{ color: design.primaryColor }}
                        >
                          {getDisplayPrice(product)}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                          <Button
                            size="lg"
                            className="flex-1 py-3 sm:py-4 rounded-3xl font-semibold text-base sm:text-lg shadow-lg hover:shadow-xl transition-all duration-300"
                            style={{
                              backgroundColor: design.primaryColor,
                              color: "#fff",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              // Add to cart logic would go here, using handleProductClick for now as per original
                              handleProductClick(product._id);
                            }}
                            disabled={!isProductAvailable(product)}
                          >
                            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
                            {isProductAvailable(product)
                              ? "Add to Cart"
                              : "Out of Stock"}
                          </Button>
                          <Button
                            variant="outline"
                            size="lg"
                            className="py-3 sm:py-4 px-6 sm:px-8 rounded-3xl border-2 font-semibold text-base sm:text-lg hover:shadow-xl transition-all duration-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductClick(product._id);
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {allProducts === "minimal" && (
          <section id="products" className="py-8 sm:py-12 lg:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8 sm:mb-12">
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                  style={{ fontFamily: design.fontFamily }}
                >
                  All Products
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  Handpicked products just for you
                </p>
              </div>

              {/* Filters - Compact */}
              {(features.showSearch || features.showFilters) && (
                <div className="bg-card rounded-3xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border mb-6 max-w-full">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {features.showSearch && (
                      <div className="flex-grow min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 h-10 sm:h-11 w-full rounded-3xl sm:rounded-3xl"
                        />
                      </div>
                    )}
                    {features.showFilters && (
                      <div className="min-w-[160px]">
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="w-full h-10 sm:h-11 rounded-2xl sm:rounded-3xl">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="featured">Featured</SelectItem>
                            <SelectItem value="price-low">
                              Price: Low to High
                            </SelectItem>
                            <SelectItem value="price-high">
                              Price: High to Low
                            </SelectItem>
                            <SelectItem value="rating">
                              Highest Rated
                            </SelectItem>
                            <SelectItem value="newest">Newest</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {filteredProducts.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product._id}
                      className="group cursor-pointer hover:shadow-2xl transition-all duration-300 rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white to-gray-50 h-[24rem] sm:h-[28rem] lg:h-[26rem] xl:h-[30rem]"
                      onClick={() => handleProductClick(product._id)}
                    >
                      <div className="relative h-[60%]">
                        <img
                          src={getImageUrl(product.images?.[0])}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 rounded-t-3xl sm:rounded-t-[2.5rem]"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder-product.jpg";
                            e.currentTarget.onerror = null;
                          }}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-3xl sm:rounded-t-[2.5rem]" />

                        {!isProductAvailable(product) && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-t-3xl sm:rounded-t-[2.5rem]">
                            <Badge
                              variant="destructive"
                              className="text-white font-semibold text-base px-3 py-1.5"
                            >
                              Out of Stock
                            </Badge>
                          </div>
                        )}
                      </div>

                      <CardContent className="p-4 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 h-[40%] flex flex-col justify-between">
                        <div className="space-y-2 sm:space-y-3">
                          <h3 className="font-bold text-lg sm:text-xl lg:text-2xl group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                            {product.name}
                          </h3>
                          <p className="text-sm sm:text-base text-muted-foreground line-clamp-1 leading-relaxed">
                            {product.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div
                              className="font-bold text-l sm:text-xl lg:text-2xl"
                              style={{
                                color: design.primaryColor,
                              }}
                            >
                              {getDisplayPrice(product)}
                            </div>
                          </div>

                          <Button
                            className="rounded-3xl mb-4 px-4 sm:px-6 py-2 sm:py-3 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-xs sm:text-sm lg:text-base h-auto min-h-[40px]"
                            style={{
                              backgroundColor: design.primaryColor,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductClick(product._id);
                            }}
                            disabled={!isProductAvailable(product)}
                          >
                            {isProductAvailable(product)
                              ? "View Details"
                              : "Out of Stock"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {allProducts === "mega" && (
          <section id="products" className="py-8 sm:py-12 lg:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8 sm:mb-12">
                <h2
                  className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                  style={{ fontFamily: design.fontFamily }}
                >
                  All Products
                </h2>
                <p className="text-base sm:text-lg text-muted-foreground">
                  Handpicked products just for you
                </p>
              </div>

              {/* Filters - Compact */}
              {(features.showSearch || features.showFilters) && (
                <div className="bg-card rounded-3xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border mb-6 max-w-full">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {features.showSearch && (
                      <div className="flex-grow min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 h-10 sm:h-11 w-full rounded-3xl sm:rounded-3xl"
                        />
                      </div>
                    )}
                    {features.showFilters && (
                      <div className="min-w-[160px]">
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="w-full h-10 sm:h-11 rounded-2xl sm:rounded-3xl">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="featured">Featured</SelectItem>
                            <SelectItem value="price-low">
                              Price: Low to High
                            </SelectItem>
                            <SelectItem value="price-high">
                              Price: High to Low
                            </SelectItem>
                            <SelectItem value="rating">
                              Highest Rated
                            </SelectItem>
                            <SelectItem value="newest">Newest</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {filteredProducts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 xl:gap-10">
                  {filteredProducts.map((product) => (
                    <Card
                      key={product._id}
                      className="group cursor-pointer hover:shadow-2xl transition-all duration-300 rounded-3xl sm:rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-white to-gray-50 h-[24rem] sm:h-[28rem] lg:h-[26rem] xl:h-[30rem]"
                      onClick={() => handleProductClick(product._id)}
                    >
                      <div className="relative h-[60%]">
                        <img
                          src={getImageUrl(product.images?.[0])}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 rounded-t-3xl sm:rounded-t-[2.5rem]"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder-product.jpg";
                            e.currentTarget.onerror = null;
                          }}
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-3xl sm:rounded-t-[2.5rem]" />

                        {!isProductAvailable(product) && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-t-3xl sm:rounded-t-[2.5rem]">
                            <Badge
                              variant="destructive"
                              className="text-white font-semibold text-base px-3 py-1.5"
                            >
                              Out of Stock
                            </Badge>
                          </div>
                        )}
                      </div>

                      <CardContent className="p-4 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 h-[40%] flex flex-col justify-between">
                        <div className="space-y-2 sm:space-y-3">
                          <h3 className="font-bold text-lg sm:text-xl lg:text-2xl group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                            {product.name}
                          </h3>
                          <p className="text-sm sm:text-base text-muted-foreground line-clamp-1 leading-relaxed">
                            {product.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div
                              className="font-bold text-l sm:text-xl lg:text-2xl"
                              style={{
                                color: design.primaryColor,
                              }}
                            >
                              {getDisplayPrice(product)}
                            </div>
                          </div>

                          <Button
                            className="rounded-3xl mb-4 px-4 sm:px-6 py-2 sm:py-3 font-semibold shadow-lg hover:shadow-xl transition-all duration-300 text-xs sm:text-sm lg:text-base h-auto min-h-[40px]"
                            style={{
                              backgroundColor: design.primaryColor,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductClick(product._id);
                            }}
                            disabled={!isProductAvailable(product)}
                          >
                            {isProductAvailable(product)
                              ? "View Details"
                              : "Out of Stock"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Newsletter - RESPONSIVE */}
        {features.showNewsletter && (
          <section
            className="py-8 sm:py-12 lg:py-16"
            style={{ backgroundColor: `${design.primaryColor}15` }}
          >
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2
                className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4"
                style={{ fontFamily: design.fontFamily }}
              >
                Stay Updated
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
                Subscribe to our newsletter for latest updates and offers
              </p>
              <div className="flex flex-col xs:flex-row gap-3 sm:gap-4 max-w-md mx-auto">
                <Input
                  placeholder="Enter your email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="flex-1 h-10 sm:h-12 rounded-lg border-2 text-sm sm:text-base"
                />
                <Button
                  size="sm"
                  className="h-10 sm:h-12 px-4 sm:px-8 rounded-lg font-semibold text-sm sm:text-base"
                  style={{ backgroundColor: design.primaryColor }}
                >
                  Subscribe
                </Button>
              </div>
            </div>
          </section>
        )}
        {/* Footer - RESPONSIVE */}
        {footer === "modern" && (
          <footer
            id="about"
            className="bg-card border-t py-8 sm:py-12 lg:py-16"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Main Footer Details */}
              <div
                id="contact"
                className="flex flex-col lg:grid lg:grid-cols-4 gap-4 mb-4 sm:mb-8"
              >
                {/* Logo & Social - Centered on Mobile/Tablet, Left-aligned on Desktop */}
                <div className="lg:col-span-2 flex flex-col items-center lg:items-start space-y-6">
                  {/* Logo and Store Name */}
                  <div className="flex items-center justify-center lg:justify-start space-x-3">
                    {general.logo ? (
                      <img
                        src={getImageUrl(general.logo)}
                        alt="Logo"
                        className="w-10 h-10 sm:w-12 sm:h-12 brightness-0 invert"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                        loading="lazy"
                      />
                    ) : null}
                    <div
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg ${
                        general.logo ? "hidden" : ""
                      }`}
                      style={{ backgroundColor: design.primaryColor }}
                    >
                      {general.storeName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3
                        className="font-bold text-lg sm:text-xl"
                        style={{ fontFamily: design.fontFamily }}
                      >
                        {general.storeName}
                      </h3>
                      {shopkeeperInfo.GSTNumber && (
                        <p className="text-sm text-muted-foreground mt-1">
                          GST Number: {shopkeeperInfo.GSTNumber}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* MOBILE/TABLET: Contact Section (Visible on sm and md, hidden on lg) */}
                  <div className="flex flex-col items-center lg:hidden w-full">
                    <h4 className="text-lg font-bold text-black">Contact Us</h4>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {general.contactInfo.phone && (
                        <a
                          href={`tel:${general.contactInfo.phone}`}
                          className="p-3 lg:p-4 transition-all"
                          aria-label="Phone"
                        >
                          <Phone className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                        </a>
                      )}

                      {general.contactInfo.email && (
                        <a
                          href={`mailto:${general.contactInfo.email}`}
                          className="p-3 lg:p-4 transition-all"
                          aria-label="Email"
                        >
                          <Mail className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                        </a>
                      )}

                      {general.contactInfo.address && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            general.contactInfo.address,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 lg:p-4 transition-all"
                          aria-label="Location"
                        >
                          <MapPin className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                        </a>
                      )}

                      {general.contactInfo.website && (
                        <a
                          href={
                            general.contactInfo.website.startsWith("http")
                              ? general.contactInfo.website
                              : `https://${general.contactInfo.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 lg:p-4 transition-all"
                          aria-label="Website"
                        >
                          <Globe className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* MOBILE/TABLET: Social Media Section (Visible on sm and md, hidden on lg) */}
                  {features.showSocialMedia && (
                    <div className="flex flex-col items-center lg:hidden w-full">
                      <h4 className="text-lg font-bold text-black">
                        Follow Us
                      </h4>
                      <div className="flex items-center justify-center gap-3">
                        {whatsAppNumber && (
                          <a
                            href={`https://wa.me/${whatsAppNumber?.replace(
                              /\D/g,
                              "",
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="WhatsApp"
                            className="p-3 lg:p-4 transition-all"
                          >
                            <FaWhatsapp className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                          </a>
                        )}

                        {general.contactInfo.instagramLink &&
                          general.contactInfo.showInstagram && (
                            <a
                              href={general.contactInfo.instagramLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Instagram"
                              className="p-3 lg:p-4 transition-all"
                            >
                              <FaInstagram className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                            </a>
                          )}

                        {general.contactInfo.showFacebook &&
                          general.contactInfo.facebookLink && (
                            <a
                              href={general.contactInfo.facebookLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Facebook"
                              className="p-3 lg:p-4 transition-all"
                            >
                              <FaFacebook className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                            </a>
                          )}

                        {general.contactInfo.showTwitter &&
                          general.contactInfo.twitterLink && (
                            <a
                              href={general.contactInfo.twitterLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="X (Twitter)"
                              className="p-3 lg:p-4 transition-all"
                            >
                              <FaTwitter className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                            </a>
                          )}

                        {general.contactInfo.showTiktok &&
                          general.contactInfo.tiktokLink && (
                            <a
                              href={general.contactInfo.tiktokLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="TikTok"
                              className="p-3 lg:p-4 transition-all"
                            >
                              <FaTiktok className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                            </a>
                          )}

                        <Button
                          variant="outline1"
                          className="p-3 lg:p-4 transition-all"
                          onClick={onShare}
                          aria-label="Share store link"
                        >
                          <Share2 className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* DESKTOP: Social Media Layout (Hidden on sm and md, visible on lg) */}
                  {features.showSocialMedia && (
                    <div className="hidden lg:flex space-x-3">
                      {general.contactInfo.instagramLink &&
                        general.contactInfo.showInstagram && (
                          <a
                            href={general.contactInfo.instagramLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 lg:p-4 transition-all"
                            aria-label="Instagram"
                          >
                            <FaInstagram className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                          </a>
                        )}

                      {general.contactInfo.showFacebook &&
                        general.contactInfo.facebookLink && (
                          <a
                            href={general.contactInfo.facebookLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Facebook"
                            className="p-3 lg:p-4 transition-all"
                          >
                            <FaFacebook className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                          </a>
                        )}

                      {general.contactInfo.showTwitter &&
                        general.contactInfo.twitterLink && (
                          <a
                            href={general.contactInfo.twitterLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X (Twitter)"
                            className="p-3 lg:p-4 transition-all"
                          >
                            <FaTwitter className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                          </a>
                        )}

                      {general.contactInfo.showTiktok &&
                        general.contactInfo.tiktokLink && (
                          <a
                            href={general.contactInfo.tiktokLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="TikTok"
                            className="p-3 lg:p-4 transition-all"
                          >
                            <FaTiktok className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                          </a>
                        )}

                      <Button
                        variant="outline1"
                        className="p-3 mt-2 lg:p-4 transition-all"
                        onClick={onShare}
                        aria-label="Share store link"
                      >
                        <Share2 className="h-5 w-5 lg:h-6 lg:w-6 transition-all" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Contact Info - DESKTOP ONLY (Hidden on sm and md, visible on lg) */}
                <div className="hidden lg:block">
                  <h4 className="font-semibold mb-4 text-lg text-black">
                    Contact Info
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {general.contactInfo.phone && (
                      <div className="flex items-center space-x-3">
                        <Phone
                          className="h-4 w-4"
                          style={{ color: design.primaryColor }}
                        />
                        <span>{general.contactInfo.phone}</span>
                      </div>
                    )}
                    {whatsAppNumber && (
                      <div className="flex items-center space-x-3">
                        <FaWhatsapp className="h-5 w-5 text-green-600" />
                        <a
                          href={`https://wa.me/${whatsAppNumber.replace(
                            /\D/g,
                            "",
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 font-medium"
                        >
                          Chat on WhatsApp
                        </a>
                      </div>
                    )}
                    {general.contactInfo.email && (
                      <div className="flex items-center space-x-3">
                        <Mail
                          className="h-4 w-4"
                          style={{ color: design.primaryColor }}
                        />
                        <span className="break-all">
                          {general.contactInfo.email}
                        </span>
                      </div>
                    )}
                    {general.contactInfo.address && (
                      <div className="flex items-center space-x-3">
                        <MapPin
                          className="h-4 w-4 flex-shrink-0"
                          style={{ color: design.primaryColor }}
                        />
                        <span>{general.contactInfo.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Store Hours/Website - DESKTOP ONLY (Hidden on sm and md, visible on lg) */}
                <div className="hidden lg:block">
                  <h4 className="font-semibold mb-4 text-lg text-black">
                    Store Hours
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {general.contactInfo.hours && (
                      <div className="flex items-start space-x-3">
                        <Clock
                          className="h-4 w-4 mt-0.5 flex-shrink-0"
                          style={{ color: design.primaryColor }}
                        />
                        <div className="flex flex-col gap-1">
                          {general.contactInfo.hours
                            .split(",")
                            .map((slot: string, index: number) => (
                              <span key={index} className="leading-relaxed">
                                {slot.trim()}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    {general.contactInfo.website && (
                      <div className="flex items-center space-x-3">
                        <Globe
                          className="h-4 w-4"
                          style={{ color: design.primaryColor }}
                        />
                        <a
                          href={
                            general.contactInfo.website.startsWith("http")
                              ? general.contactInfo.website
                              : `https://${general.contactInfo.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-black-600"
                        >
                          {general.contactInfo.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Bar with Admin Login */}
              <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between text-sm text-muted-foreground">
                <p>
                  &copy; 2025 {general.storeName}. All rights reserved. Powered
                  by{" "}
                  <span style={{ color: design.primaryColor }}>
                    <a href="https://kioscart.com">KiosCart</a>
                  </span>
                </p>
                <a
                  href="/login"
                  className="text-black font-semibold hover:underline mt-2 md:mt-0"
                >
                  Store Login
                </a>
              </div>
            </div>
          </footer>
        )}

        {footer === "minimal" && (
          <footer
            id="about"
            className="bg-gray-900 border-t border-gray-800 py-8 sm:py-12"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col lg:flex-row items-center justify-between lg:gap-12 mb-4 gap-4 lg:gap-0">
                {/* Left: Contact - flex-1 for equal spacing, CENTERED on mobile */}
                <div className="flex flex-col items-center justify-center lg:justify-start gap-4 w-full lg:w-auto lg:flex-1 order-2 lg:order-1">
                  {/* MOBILE/TABLET VERSION - Contact Section with Title + Icons */}
                  <div className="flex flex-col items-center gap-1 lg:hidden w-full">
                    <h4 className="text-lg font-bold text-white">Contact Us</h4>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <a
                        href={`tel:${general.contactInfo.phone}`}
                        className="p-3 hover:bg-white-700/50 transition-all"
                        aria-label="Phone"
                      >
                        <Phone className="h-5 w-5 text-gray-400 hover:text-white transition-colors" />
                      </a>

                      <a
                        href={`mailto:${general.contactInfo.email}`}
                        className="p-3 hover:bg-white-700/50 transition-all"
                        aria-label="Email"
                      >
                        <Mail className="h-5 w-5 text-gray-400 hover:text-white transition-colors" />
                      </a>

                      <a
                        href={
                          general.contactInfo.address
                            ? `https://maps.google.com/?q=${encodeURIComponent(
                                general.contactInfo.address,
                              )}`
                            : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 hover:bg-white-700/50 transition-all"
                        aria-label="Location"
                      >
                        <MapPin className="h-5 w-5 text-gray-400 hover:text-white transition-colors" />
                      </a>

                      <a
                        href={general.contactInfo.website || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 hover:bg-white-700/50 transition-all"
                        aria-label="Website"
                      >
                        <Globe className="h-5 w-5 text-gray-400 hover:text-white transition-colors" />
                      </a>
                    </div>
                  </div>

                  {/* DESKTOP VERSION - Original Contact Buttons */}
                  <div className="hidden lg:flex items-center justify-start gap-6 w-full">
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {general.contactInfo.phone && (
                        <a
                          href={`tel:${general.contactInfo.phone}`}
                          className="p-3 hover:bg-white-700/50 transition-all"
                          aria-label="Phone"
                        >
                          <Phone className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}

                      {general.contactInfo.email && (
                        <a
                          href={`mailto:${general.contactInfo.email}`}
                          className="p-3 hover:bg-white-700/50 transition-all"
                          aria-label="Email"
                        >
                          <Mail className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}

                      {general.contactInfo.address && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            general.contactInfo.address,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 hover:bg-white-700/50 transition-all"
                          aria-label="Location"
                        >
                          <MapPin className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}

                      {general.contactInfo.website && (
                        <a
                          href={
                            general.contactInfo.website.startsWith("http")
                              ? general.contactInfo.website
                              : `https://${general.contactInfo.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 hover:bg-white-700/50 transition-all"
                          aria-label="Website"
                        >
                          <Globe className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center: Logo & Store Name */}
                <div className="flex flex-col items-center gap-3 order-1 lg:order-2 w-full lg:w-auto lg:flex-none">
                  <div className="flex items-center justify-center space-x-3">
                    {general.logo ? (
                      <img
                        src={getImageUrl(general.logo)}
                        alt={`${general.storeName} Logo`}
                        className="w-16 h-16 lg:w-20 lg:h-20 rounded-xl shadow-xl brightness-0 hover:brightness-100 transition-all duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                        loading="lazy"
                      />
                    ) : null}
                    <div
                      className={`w-16 h-16 lg:w-20 lg:h-20 rounded-xl flex items-center justify-center text-3xl lg:text-4xl font-black shadow-xl ${
                        general.logo ? "hidden" : ""
                      }`}
                      style={{
                        backgroundColor: design.primaryColor,
                        color: "white",
                        boxShadow: `0 10px 30px ${design.primaryColor}20`,
                      }}
                    >
                      {general.storeName.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <h3
                    className="font-black text-2xl lg:text-3xl xl:text-4xl text-white tracking-tight text-center leading-tight px-4"
                    style={{ fontFamily: design.fontFamily }}
                  >
                    {general.storeName}
                  </h3>
                </div>

                {/* Right: Social Media - flex-1 for equal spacing, CENTERED on mobile */}
                {features.showSocialMedia && (
                  <div className="flex flex-col items-center justify-center lg:justify-end gap-2 order-3 w-full lg:w-auto lg:flex-1">
                    {/* MOBILE/TABLET VERSION - "Follow Us" Title */}
                    <h4 className="text-lg font-bold text-white lg:hidden">
                      Follow Us
                    </h4>

                    {/* Social Icons (Same for all views) */}
                    <div className="flex items-center justify-center lg:justify-end gap-3 lg:gap-4">
                      {whatsAppNumber && (
                        <a
                          href={`https://wa.me/${whatsAppNumber?.replace(
                            /\D/g,
                            "",
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="WhatsApp"
                          className="p-3 hover:bg-white-700/50 transition-all"
                        >
                          <FaWhatsapp className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}

                      {settings.settings.general.contactInfo.showInstagram && (
                        <a
                          href={general.contactInfo.instagramLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Instagram"
                          className="p-3 hover:bg-white-700/50 transition-all"
                        >
                          <FaInstagram className="h-5 w-5 lg:h-6 lg:w-6 text-gray-400 group-hover:text-primary transition-all duration-200" />
                        </a>
                      )}

                      {settings.settings.general.contactInfo.showFacebook && (
                        <a
                          href="#"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Facebook"
                          className="p-3 hover:bg-white-700/50 transition-all"
                        >
                          <FaFacebook className="h-5 w-5 text-gray-400 transition-all duration-200" />
                        </a>
                      )}

                      {settings.settings.general.contactInfo.showTwitter && (
                        <a
                          href="#"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="X (Twitter)"
                          className="p-3 hover:bg-white-700/50 transition-all"
                        >
                          <FaTwitter className="h-5 w-5 text-gray-400 transition-all duration-200" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 pt-6 sm:pt-4 mt-4">
                <div className="text-center space-y-1">
                  <p className="text-sm sm:text-base text-gray-400">
                    © 2025 {general.storeName}. All rights reserved.
                  </p>
                  <p className="text-sm sm:text-base text-gray-500">
                    Powered by
                    <span
                      className="ml-1 font-semibold"
                      style={{ color: design.primaryColor }}
                    >
                      KiosCart
                    </span>
                  </p>
                </div>

                <div className="flex justify-center">
                  <a
                    href="/login"
                    className="font-semibold text-xs mt-2 text-gray-600 text-center hover:underline"
                  >
                    Store Login
                  </a>
                </div>
              </div>
            </div>
          </footer>
        )}

        {footer === "mega" && (
          <footer
            id="about"
            className="relative border-t pt-6 sm:pt-8 lg:pt-10 bg-card"
          >
            <div
              className="absolute inset-x-0 top-0 h-1.5"
              style={{ backgroundColor: design.primaryColor }}
            />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-base sm:text-lg">
              {/* About Us - DESKTOP ONLY */}
              <div className="mb-6 sm:mb-8 lg:mb-10 hidden lg:block">
                <div className="text-center mb-6 sm:mb-8">
                  <h2
                    className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 tracking-wide"
                    style={{ fontFamily: design.fontFamily }}
                  >
                    {general.storeName}
                  </h2>
                  <p className="text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                    {general.description ||
                      `Welcome to ${general.storeName}! We are dedicated to providing you with the best products and exceptional customer service.`}
                  </p>
                </div>
              </div>

              {/* M A I N  F O O T E R */}
              <div
                id="contact"
                className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-6 sm:mb-8 justify-items-center lg:justify-items-center"
              >
                {/* C O L U M N 1 : Logo, Shop Name, Social Media */}
                <div className="space-y-4 sm:space-y-5 text-center lg:text-left w-fit mx-auto lg:mx-0">
                  {/* Logo and Store Name - ORDER 1 on mobile */}
                  <div className="flex items-center justify-center lg:justify-start space-x-3 order-1 lg:order-none">
                    {general.logo ? (
                      <img
                        src={getImageUrl(general.logo)}
                        alt="Logo"
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 shadow-lg"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden",
                          );
                        }}
                        loading="lazy"
                      />
                    ) : null}
                    <div
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg ${
                        general.logo ? "hidden" : ""
                      }`}
                      style={{ backgroundColor: design.primaryColor }}
                    >
                      {general.storeName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3
                        className="font-bold text-lg sm:text-xl"
                        style={{ fontFamily: design.fontFamily }}
                      >
                        {general.storeName}
                      </h3>
                      {shopkeeperInfo.GSTNumber && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {shopkeeperInfo.GSTNumber}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* MOBILE/TABLET: Contact Section with Title + Icons (ORDER 2) */}
                  {features.showSocialMedia && (
                    <div className="flex flex-col items-center gap-4 lg:hidden w-full order-2">
                      <h4 className="text-lg font-bold">Contact Us</h4>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {general.contactInfo.phone && (
                          <a
                            href={`tel:${general.contactInfo.phone}`}
                            className="p-3 hover:bg-white-700/50 transition-all"
                            aria-label="Phone"
                          >
                            <Phone className="h-5 w-5 transition-colors" />
                          </a>
                        )}

                        {general.contactInfo.email && (
                          <a
                            href={`mailto:${general.contactInfo.email}`}
                            className="p-3 hover:bg-white-700/50 transition-all"
                            aria-label="Email"
                          >
                            <Mail className="h-5 w-5 transition-colors" />
                          </a>
                        )}

                        {general.contactInfo.address && (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(
                              general.contactInfo.address,
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 hover:bg-white-700/50 transition-all"
                            aria-label="Location"
                          >
                            <MapPin className="h-5 w-5 transition-colors" />
                          </a>
                        )}

                        {general.contactInfo.website && (
                          <a
                            href={
                              general.contactInfo.website.startsWith("http")
                                ? general.contactInfo.website
                                : `https://${general.contactInfo.website}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-3 hover:bg-white-700/50 transition-all"
                            aria-label="Website"
                          >
                            <Globe className="h-5 w-5 transition-colors" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MOBILE/TABLET: Social Media Section with "Follow Us" Title (ORDER 3) */}
                  {features.showSocialMedia && (
                    <div className="flex flex-col items-center gap-4 lg:hidden w-full order-3">
                      <h4 className="text-lg font-bold">Follow Us</h4>
                      <div className="flex items-center justify-center gap-3">
                        <a
                          href={`https://wa.me/${whatsAppNumber?.replace(
                            /\D/g,
                            "",
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="WhatsApp"
                          className="p-3 hover:bg-white-700/50 transition-all"
                        >
                          <FaWhatsapp className="h-5 w-5 transition-colors" />
                        </a>

                        {settings.settings.general.contactInfo
                          .instagramLink && (
                          <a
                            href={
                              settings.settings.general.contactInfo
                                .instagramLink
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Instagram"
                            className="p-3 hover:bg-white-700/50 transition-all"
                          >
                            <FaInstagram className="h-5 w-5 transition-colors" />
                          </a>
                        )}

                        {settings.settings.general.contactInfo.facebookLink && (
                          <a
                            href={
                              settings.settings.general.contactInfo.facebookLink
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Facebook"
                            className="p-3 hover:bg-white-700/50 transition-all"
                          >
                            <FaFacebook className="h-5 w-5 transition-colors" />
                          </a>
                        )}

                        {settings.settings.general.contactInfo.twitterLink && (
                          <a
                            href={
                              settings.settings.general.contactInfo.twitterLink
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="X (Twitter)"
                            className="p-3 hover:bg-white-700/50 transition-all"
                          >
                            <FaTwitter className="h-5 w-5 transition-colors" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DESKTOP: Original Social Media Layout (hidden on mobile/tablet) */}
                  {features.showSocialMedia && (
                    <div className="hidden lg:flex items-center justify-center lg:justify-end gap-3 lg:gap-4 w-full lg:w-auto lg:flex-1">
                      <a
                        href={`https://wa.me/${whatsAppNumber?.replace(
                          /\D/g,
                          "",
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="WhatsApp"
                        className="p-3 transition-all"
                      >
                        <FaWhatsapp className="h-5 w-5 text-gray-600 transition-colors" />
                      </a>

                      {settings.settings.general.contactInfo.instagramLink && (
                        <a
                          href={
                            settings.settings.general.contactInfo.instagramLink
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Instagram"
                          className="p-3 transition-all"
                        >
                          <FaInstagram className="h-5 w-5 text-gray-600 transition-colors" />
                        </a>
                      )}

                      {settings.settings.general.contactInfo.facebookLink && (
                        <a
                          href={
                            settings.settings.general.contactInfo.facebookLink
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Facebook"
                          className="p-3 transition-all"
                        >
                          <FaFacebook className="h-5 w-5 text-gray-600 transition-colors"></FaFacebook>
                        </a>
                      )}

                      {settings.settings.general.contactInfo.twitterLink && (
                        <a
                          href={
                            settings.settings.general.contactInfo.twitterLink
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="X (Twitter)"
                          className="p-3 transition-all"
                        >
                          <FaTwitter className="h-5 w-5 text-gray-600 transition-colors"></FaTwitter>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* C O L U M N 2 : Contact Info - DESKTOP ONLY */}
                <div className="text-left w-fit mx-auto hidden lg:block">
                  <h4 className="font-semibold mb-4 text-base sm:text-lg uppercase tracking-wide text-center">
                    Contact Info
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {general.contactInfo.address && (
                      <div className="flex items-start space-x-3">
                        <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5 text-gray-500" />
                        <span className="leading-relaxed">
                          {general.contactInfo.address}
                        </span>
                      </div>
                    )}
                    {general.contactInfo.email && (
                      <div className="flex items-center space-x-3">
                        <Mail className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <span className="break-all">
                          {general.contactInfo.email}
                        </span>
                      </div>
                    )}
                    {general.contactInfo.phone && (
                      <div className="flex items-center space-x-3">
                        <Phone className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <span>{general.contactInfo.phone}</span>
                      </div>
                    )}
                    {whatsAppNumber && (
                      <div className="flex items-center space-x-3">
                        <FaWhatsapp className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 flex-shrink-0" />
                        <a
                          href={`https://wa.me/${whatsAppNumber.replace(
                            /\D/g,
                            "",
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          Chat on WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* C O L U M N 3 : Store Details - DESKTOP ONLY */}
                <div className="text-left w-fit mx-auto hidden lg:block">
                  <h4 className="font-semibold mb-4 text-base sm:text-lg uppercase tracking-wide text-center">
                    Store Details
                  </h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    {general.contactInfo.hours && (
                      <div className="flex items-start space-x-3">
                        <Clock className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500" />
                        <div className="flex flex-col gap-1">
                          {general.contactInfo.hours
                            .split(",")
                            .map((slot: string, index: number) => (
                              <span key={index} className="leading-relaxed">
                                {slot.trim()}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    {general.contactInfo.website && (
                      <div className="flex items-center space-x-3">
                        <Globe className="h-4 w-4 flex-shrink-0 text-gray-500" />
                        <a
                          href={
                            general.contactInfo.website.startsWith("http")
                              ? general.contactInfo.website
                              : `https://${general.contactInfo.website}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-medium hover:underline"
                        >
                          {general.contactInfo.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* F O O T E R  B A R */}
              <div className="border-t border-border/70 pt-7 sm:pt-9 pb-4 sm:pb-6 flex flex-col md:flex-row items-center justify-between text-sm sm:text-base text-muted-foreground">
                <p className="text-center md:text-left mb-2 md:mb-0">
                  © 2025 {general.storeName}. All rights reserved. Powered by{" "}
                  <span style={{ color: design.primaryColor }}>KiosCart</span>
                </p>
                <a href="/login" className="font-semibold hover:underline">
                  Store Login
                </a>
              </div>
            </div>
          </footer>
        )}
        {/* Chat Button - RESPONSIVE */}
        {features.enableChat && (
          <Button
            className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50"
            style={{ backgroundColor: design.primaryColor }}
          >
            <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </Button>
        )}
      </div>
    </div>
  );
}
