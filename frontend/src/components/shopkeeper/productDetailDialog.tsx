import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCart } from "@/hooks/cartContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Star,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  X,
  Truck,
  Shield,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { useCurrency } from "@/hooks/useCurrencyhook";

interface ProductDetailsDialogProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  features: {
    showReviews: boolean;
    showWishlist: boolean;
  };
}

export function ProductDetailsDialog({
  productId,
  isOpen,
  onClose,
  primaryColor,
  secondaryColor,
  fontFamily,
  features,
}: ProductDetailsDialogProps) {
  const apiUrl = __API_URL__;
  const { user } = useAuth();
  const { addToCart, isInCart, getCartItemQuantity } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [whatsAppNumber, setWhatsAppNumber] = useState("");
  const [shopkeeper, setShopkeeper] = useState<any>(null);
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);

  useEffect(() => {
    if (isOpen && productId) {
      fetchProductDetails(productId);
    }
  }, [isOpen, productId]);

  useEffect(() => {
    if (!isOpen) {
      setProduct(null);
      setError(null);
      setCurrentImageIndex(0);
      setSelectedOption(null);
      setSelectedSubcategory(0);
      setSelectedVariant(0);
      setQuantity(1);
      setAddingToCart(false);
    }
  }, [isOpen]);

  const fetchShopkeeperDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const shopResponse = await fetch(
        `${apiUrl}/shopkeepers/Shopkeeper-detail/${id}`,
        { method: "GET" },
      );
      if (!shopResponse.ok) {
        throw new Error(
          `Failed to fetch product details: ${shopResponse.statusText}`,
        );
      }
      const shopData = await shopResponse.json();
      setWhatsAppNumber(shopData.data.whatsappNumber);

      setShopkeeper(shopData.data);
      setCountry(shopData.data.country);
    } catch (err: any) {
      setError(err.message || "Failed to load product details");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductDetails = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiUrl}/products/get-product-details/${id}`,
        { method: "GET" },
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch product details: ${response.statusText}`,
        );
      }
      const data = await response.json();
      const productData = Array.isArray(data) ? data[0] : data;
      if (!productData) {
        throw new Error("Product not found");
      }
      setProduct(productData);
      // Auto-select first option if product has options
      if (productData.hasOptions && productData.productOptions?.length > 0) {
        setSelectedOption(0);
      }
      fetchShopkeeperDetails(productData.shopkeeperId);
    } catch (err: any) {
      setError(err.message || "Failed to load product details");
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (img?: string): string => {
    if (!img) return "/placeholder.jpg";
    if (img.startsWith("http") || img.startsWith("https")) return img;
    return `${apiUrl}${img.startsWith("/") ? img : "/" + img}`;
  };

  const nextImage = () => {
    if (product?.images?.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product?.images?.length > 0) {
      setCurrentImageIndex(
        (prev) => (prev - 1 + product.images.length) % product.images.length,
      );
    }
  };

  // Get price based on product structure
  // If hasOptions: additive model (option price + variant/subcategory additional)
  // If no options: variant/subcategory price is the absolute price (backward compat)
  const getPrice = () => {
    if (!product) return null;

    const _hasOptions = product.hasOptions && product.productOptions?.length > 0;
    const _currentOption = _hasOptions && selectedOption != null ? product.productOptions[selectedOption] : null;

    // Base price from option (additive model) or 0 (old model uses variant price directly)
    const optionBase = _currentOption
      ? Number(_currentOption.isDiscounted && _currentOption.discountedPrice ? _currentOption.discountedPrice : _currentOption.price) || 0
      : 0;

    const _hasSubcategories =
      product.subcategories &&
      Array.isArray(product.subcategories) &&
      product.subcategories.length > 0;

    if (_hasSubcategories) {
      const subcategories = product.subcategories || [];
      const _currentSubcategory = subcategories[selectedSubcategory];

      // Selected Variant
      if (
        _currentSubcategory?.variants?.length > 0 &&
        _currentSubcategory.variants[selectedVariant]
      ) {
        const variant = _currentSubcategory.variants[selectedVariant];
        const variantEffective = Number(variant.isDiscounted && variant.discountedPrice
          ? variant.discountedPrice
          : variant.price) || 0;

        return {
          originalPrice: optionBase + (Number(variant.price) || 0),
          effectivePrice: optionBase + variantEffective,
          isDiscounted: Boolean(variant.isDiscounted && variant.discountedPrice) || Boolean(_currentOption?.isDiscounted),
          hasVariants: true,
        };
      }

      // Subcategory without variants — uses additionalPrice (additive) on top of option/product base
      if (_currentSubcategory && _currentSubcategory.variants?.length === 0) {
        const base = _hasOptions ? optionBase : (Number(product.price) || 0);
        const subAdd = Number(_currentSubcategory.isDiscounted && _currentSubcategory.discountedAdditionalPrice != null
          ? _currentSubcategory.discountedAdditionalPrice
          : (_currentSubcategory.additionalPrice || 0)) || 0;

        return {
          originalPrice: base + (Number(_currentSubcategory.additionalPrice) || 0),
          effectivePrice: base + subAdd,
          isDiscounted: Boolean(_currentSubcategory.isDiscounted) || Boolean(_currentOption?.isDiscounted),
          hasVariants: true,
        };
      }

      // Min price across all variants/subcategories (for display before selection)
      let minOriginal: number | null = null;
      let minEffective: number | null = null;
      let discounted = false;

      subcategories.forEach((subcat: any) => {
        if (subcat.variants && subcat.variants.length > 0) {
          subcat.variants.forEach((variant: any) => {
            const inStock = !variant.trackQuantity || variant.inventory > 0;
            if (!inStock) return;

            const ve = Number(variant.isDiscounted && variant.discountedPrice
              ? variant.discountedPrice : variant.price) || 0;
            const total = optionBase + ve;

            if (minEffective === null || total < minEffective) {
              minEffective = total;
              minOriginal = optionBase + (Number(variant.price) || 0);
            }
            if (variant.isDiscounted) discounted = true;
          });
        } else {
          const base = _hasOptions ? optionBase : (Number(product.price) || 0);
          const subAdd = Number(subcat.isDiscounted && subcat.discountedAdditionalPrice != null
            ? subcat.discountedAdditionalPrice : (subcat.additionalPrice || 0)) || 0;
          const total = base + subAdd;
          if (minEffective === null || total < minEffective) {
            minEffective = total;
            minOriginal = base + (Number(subcat.additionalPrice) || 0);
          }
        }
      });

      return {
        originalPrice: minOriginal,
        effectivePrice: minEffective,
        isDiscounted: discounted,
        hasVariants: true,
      };
    }

    // SIMPLE PRODUCT (or product with options only)
    if (_currentOption) {
      return {
        originalPrice: _currentOption.price,
        effectivePrice: _currentOption.isDiscounted && _currentOption.discountedPrice ? _currentOption.discountedPrice : _currentOption.price,
        isDiscounted: Boolean(_currentOption.isDiscounted),
        hasVariants: false,
      };
    }

    return {
      originalPrice: product.price,
      effectivePrice: product.isDiscounted && product.discountedPrice ? product.discountedPrice : product.price,
      isDiscounted: Boolean(product.isDiscounted && product.discountedPrice),
      hasVariants: false,
    };
  };

  const priceData = getPrice();

  // Get compare-at price based on product structure
  const getCompareAtPrice = () => {
    if (!product) return null;

    const hasSubcategories =
      product.subcategories &&
      Array.isArray(product.subcategories) &&
      product.subcategories.length > 0;

    if (hasSubcategories) {
      const subcategories = product.subcategories || [];
      const currentSubcategory = subcategories[selectedSubcategory];

      if (
        currentSubcategory &&
        currentSubcategory.variants &&
        currentSubcategory.variants.length > 0
      ) {
        const variants = currentSubcategory.variants || [];
        const currentVariant = variants[selectedVariant];

        if (currentVariant && currentVariant.compareAtPrice) {
          return currentVariant.compareAtPrice;
        }
      }
      return product.compareAtPrice;
    } else {
      return product.compareAtPrice;
    }
  };

  // --- FIXED DISPLAY MEASUREMENT LOGIC ---
  const displayMeasurement = (() => {
    let measure = "";

    // 1. Check if we are looking at a specific variant
    if (
      product?.subcategories?.[selectedSubcategory]?.variants?.[selectedVariant]
    ) {
      measure =
        product.subcategories[selectedSubcategory].variants[selectedVariant]
          .measurement;
    }
    // 2. Otherwise check the main product
    else if (product?.measurement) {
      measure = product.measurement;
    }

    // 3. Fix the "1" or empty issue: If empty or "1", show "Unit"
    if (!measure || measure === "1") {
      return "Unit";
    }
    return measure;
  })();
  // ----------------------------------------

  // Get stock based on product structure
  const getStock = () => {
    if (!product) return 999;

    const hasSubcategories =
      product.subcategories &&
      Array.isArray(product.subcategories) &&
      product.subcategories.length > 0;

    if (hasSubcategories) {
      const subcategories = product.subcategories || [];
      const currentSubcategory = subcategories[selectedSubcategory];
      if (!currentSubcategory) return 999;

      if (
        currentSubcategory.variants &&
        currentSubcategory.variants.length > 0
      ) {
        // Subcategory with variants — use selected variant
        const currentVariant = currentSubcategory.variants[selectedVariant];
        if (!currentVariant || !currentVariant.trackQuantity) return 999;
        return currentVariant.inventory ?? 0;
      }

      // Subcategory without variants — use subcategory inventory
      if (!currentSubcategory.trackQuantity) return 999;
      return currentSubcategory.inventory ?? 0;
    }

    // Simple product — use product-level inventory
    if (!product.trackQuantity) return 999;
    return product.inventory ?? 0;
  };

  // Check if product is tracking inventory
  const isTrackingInventory = () => {
    if (!product) return false;

    const hasSubcategories =
      product.subcategories &&
      Array.isArray(product.subcategories) &&
      product.subcategories.length > 0;

    if (hasSubcategories) {
      const subcategories = product.subcategories || [];
      const currentSubcategory = subcategories[selectedSubcategory];
      if (!currentSubcategory) return false;

      if (
        currentSubcategory.variants &&
        currentSubcategory.variants.length > 0
      ) {
        const currentVariant = currentSubcategory.variants[selectedVariant];
        return currentVariant?.trackQuantity ?? false;
      }

      // Subcategory without variants
      return currentSubcategory.trackQuantity ?? false;
    }

    // Simple product
    return product.trackQuantity ?? false;
  };

  // Get price range for products with variants
  const getPriceRange = () => {
    if (
      !product ||
      !product.subcategories ||
      !Array.isArray(product.subcategories) ||
      product.subcategories.length === 0
    ) {
      return null;
    }

    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    product.subcategories.forEach((subcat: any) => {
      if (subcat.variants && Array.isArray(subcat.variants)) {
        subcat.variants.forEach((variant: any) => {
          const price = parseFloat(variant.price);
          if (!isNaN(price)) {
            if (minPrice === null || price < minPrice) {
              minPrice = price;
            }
            if (maxPrice === null || price > maxPrice) {
              maxPrice = price;
            }
          }
        });
      }
    });

    if (minPrice === null || maxPrice === null) {
      return null;
    }

    if (minPrice === maxPrice) {
      return `${formatPrice(minPrice)}`;
    }

    return `${formatPrice(minPrice)} - $${formatPrice(maxPrice)}`;
  };

  // Get inventory status for display
  const getInventoryStatus = () => {
    if (!product) return null;

    const hasSubcategories =
      product.subcategories &&
      Array.isArray(product.subcategories) &&
      product.subcategories.length > 0;

    if (hasSubcategories) {
      // For products with variants, check current variant
      const stock = getStock();
      const isTracking = isTrackingInventory();

      if (!isTracking) {
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            In Stock
          </Badge>
        );
      } else if (stock <= 0) {
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Out of Stock
          </Badge>
        );
      } else {
        const currentSubcategory = product.subcategories[selectedSubcategory];
        const currentVariant = currentSubcategory?.variants?.[selectedVariant];
        const lowThreshold = currentVariant?.lowstockThreshold || 10;

        if (stock <= lowThreshold) {
          return (
            <Badge className="bg-yellow-100 text-yellow-800">
              <AlertCircle className="w-3 h-3 mr-1" />
              Low Stock ({stock})
            </Badge>
          );
        } else {
          return (
            <Badge className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              In Stock ({stock})
            </Badge>
          );
        }
      }
    } else {
      // Simple product without variants
      if (!product.trackQuantity) {
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            In Stock
          </Badge>
        );
      } else if (product.inventory <= 0) {
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Out of Stock
          </Badge>
        );
      } else if (product.inventory <= (product.lowstockThreshold || 10)) {
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Low Stock ({product.inventory})
          </Badge>
        );
      } else {
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            In Stock ({product.inventory})
          </Badge>
        );
      }
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    setAddingToCart(true);
    try {
      const hasSubcategories =
        product.subcategories &&
        Array.isArray(product.subcategories) &&
        product.subcategories.length > 0;

      let cartItem;

      const _hasOptions = product.hasOptions && product.productOptions?.length > 0;
      const _currentOption = _hasOptions && selectedOption != null ? product.productOptions[selectedOption] : null;
      const optionBase = _currentOption
        ? (Number(_currentOption.isDiscounted && _currentOption.discountedPrice ? _currentOption.discountedPrice : _currentOption.price) || 0)
        : 0;

      if (hasSubcategories) {
        const subcategories = product.subcategories || [];
        const _currentSubcategory = subcategories[selectedSubcategory];
        const _variants = _currentSubcategory?.variants || [];
        const currentVariant = _variants[selectedVariant];

        if (currentVariant?.trackQuantity) {
          if (cartQuantity + 1 > quantity) {
            toast({
              duration: 5000,
              title: "Quantity Exhaust",
              description: "Product Stock Quantity Exhaust",
            });
            return;
          }
        }

        let totalPrice: number;
        if (currentVariant) {
          const variantEffective = Number(currentVariant.isDiscounted && currentVariant.discountedPrice
            ? currentVariant.discountedPrice : currentVariant.price) || 0;
          totalPrice = optionBase + variantEffective;
        } else if (_currentSubcategory && _variants.length === 0) {
          const base = _hasOptions ? optionBase : (Number(product.price) || 0);
          const subAdd = Number(_currentSubcategory.isDiscounted && _currentSubcategory.discountedAdditionalPrice != null
            ? _currentSubcategory.discountedAdditionalPrice : (_currentSubcategory.additionalPrice || 0)) || 0;
          totalPrice = base + subAdd;
        } else {
          totalPrice = optionBase || (Number(product.price) || 0);
        }

        cartItem = {
          productId: product._id,
          productName: product.name,
          trackQuantity: currentVariant?.trackQuantity ?? false,
          inventory: currentVariant?.inventory ?? 0,
          price: totalPrice,
          subcategoryIndex: selectedSubcategory,
          variantIndex: currentVariant ? selectedVariant : -1,
          image: product.images?.[0],
          shopkeeperName: shopkeeper?.shopName || "Shop",
          shopClosedFromDate: shopkeeper?.shopClosedFromDate,
          shopClosedToDate: shopkeeper?.shopClosedToDate,
          category: product.category,
          sku: currentVariant?.sku || product.sku,
          subcategoryName: _currentSubcategory?.name,
          variantTitle: currentVariant?.title || "Default",
          measurement: currentVariant?.measurement,
          productImages: product.images || [],
          description: product.description,
          optionTitle: _currentOption?.title,
          optionPrice: _currentOption?.price,
        };
      } else {
        // Simple product or product with options only
        if (product?.trackQuantity) {
          if (cartQuantity + 1 > quantity) {
            toast({
              duration: 5000,
              title: "Quantity Exhaust",
              description: "Product Stock Quantity Exhaust",
            });
            return;
          }
        }
        cartItem = {
          productId: product._id,
          productName: product.name,
          trackQuantity: _currentOption ? (_currentOption.trackQuantity ?? false) : (product?.trackQuantity ?? false),
          inventory: _currentOption ? (_currentOption.inventory ?? 0) : (product?.inventory ?? 0),
          price: _currentOption
            ? (_currentOption.isDiscounted && _currentOption.discountedPrice ? _currentOption.discountedPrice : _currentOption.price)
            : (product.isDiscounted && product.discountedPrice ? product.discountedPrice : product.price),
          subcategoryIndex: -1,
          variantIndex: -1,
          image: product.images?.[0],
          measurement: product.measurement,
          shopkeeperName: product.shopkeeperId?.shopName || "Shop",
          shopClosedFromDate: product.shopkeeperId?.shopClosedFromDate,
          shopClosedToDate: product.shopkeeperId?.shopClosedToDate,
          category: product.category,
          sku: product.sku,
          subcategoryName: null,
          variantTitle: null,
          productImages: product.images || [],
          description: product.description,
          optionTitle: _currentOption?.title,
          optionPrice: _currentOption?.price,
        };
      }

      addToCart(
        product.shopkeeperId?._id || product.shopkeeperId,
        cartItem,
        quantity,
      );

      toast({
        duration: 5000,
        title: "Added to Cart",
        description: `${product.name} (${quantity}) added to your cart`,
      });
    } catch (error) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Failed to add item to cart",
        variant: "destructive",
      });
    } finally {
      setAddingToCart(false);
    }
  };

  const isInStock = getStock() > 0 || !isTrackingInventory();
  const images = product?.images || [];
  const subcategories = product?.subcategories || [];
  const hasSubcategories = subcategories.length > 0;
  const hasOptions = product?.hasOptions && product?.productOptions?.length > 0;
  const currentOption = hasOptions && selectedOption != null ? product.productOptions[selectedOption] : null;
  const currentSubcategory = subcategories[selectedSubcategory];
  const variants = currentSubcategory?.variants || [];

  // Get current variant for description display
  const currentVariantDescription =
    hasSubcategories && variants.length > 0 && variants[selectedVariant]
      ? variants[selectedVariant].description
      : null;

  // Check if product is in cart
  const hasCurrentVariant = variants.length > 0 && variants[selectedVariant];
  const cartSubcategoryIndex = hasSubcategories ? selectedSubcategory : -1;
  const cartVariantIndex = hasCurrentVariant ? selectedVariant : -1;

  const inCart = product
    ? isInCart(product.shopkeeperId?._id || product.shopkeeperId, {
        productId: product._id,
        subcategoryIndex: cartSubcategoryIndex,
        variantIndex: cartVariantIndex,
        optionTitle: currentOption?.title,
      })
    : false;

  const cartQuantity = product
    ? getCartItemQuantity(
        product.shopkeeperId?._id || product.shopkeeperId,
        {
          productId: product._id,
          subcategoryIndex: cartSubcategoryIndex,
          variantIndex: cartVariantIndex,
          optionTitle: currentOption?.title,
        },
      )
    : 0;

  // Style definitions
  const brandBtnStyle = {
    backgroundColor: primaryColor,
    color: "#fff",
    border: `1px solid ${primaryColor}`,
    fontFamily,
  };
  const blackTextBtnStyle = {
    backgroundColor: "#fff",
    color: "#222",
    border: `1px solid ${primaryColor}`,
    fontFamily,
  };
  const infoBadgeStyle = {
    backgroundColor: secondaryColor,
    color: "#fff",
    fontFamily,
  };
  const badgeOutlineStyle = {
    borderColor: primaryColor,
    color: primaryColor,
    fontFamily,
  };

  // Returns style for buttons that highlights selection
  const getSelectableButtonStyle = (isSelected: boolean) =>
    isSelected ? brandBtnStyle : blackTextBtnStyle;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-xs sm:max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl p-0 overflow-hidden max-h-[95vh]">
        <VisuallyHidden>
          <DialogHeader>
            <DialogTitle>{product?.name || "Product Details"}</DialogTitle>
          </DialogHeader>
        </VisuallyHidden>
        <DialogClose className="absolute right-2 top-2 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none bg-white/80 backdrop-blur-sm p-1 shadow-md">
          <X className="h-4 w-4 md:h-5 md:w-5" />
          <span className="sr-only">Close</span>
        </DialogClose>
        <ScrollArea className="max-h-[95vh] overflow-y-auto">
          <div className="p-3 sm:p-4 md:p-6 lg:p-8" style={{ fontFamily }}>
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Loader2
                  className="h-8 w-8 md:h-12 md:w-12 animate-spin mb-4"
                  style={{ color: primaryColor }}
                />
                <p
                  className="text-sm md:text-base text-muted-foreground"
                  style={{ fontFamily }}
                >
                  Loading product details...
                </p>
              </div>
            )}
            {error && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div
                  className="text-destructive mb-4 text-sm md:text-base"
                  style={{ fontFamily }}
                >
                  {error}
                </div>
                {productId && (
                  <Button
                    onClick={() => fetchProductDetails(productId)}
                    variant="buttonOutline"
                    className="text-xs md:text-sm"
                    style={blackTextBtnStyle}
                  >
                    Try Again
                  </Button>
                )}
              </div>
            )}
            {product && !loading && !error && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8">
                {/* Image Section */}
                <div className="space-y-3 md:space-y-4">
                  {images.length > 0 ? (
                    <>
                      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100">
                        <img
                          src={getImageUrl(images[currentImageIndex])}
                          alt={product?.name}
                          className="h-full w-full object-cover transition-all hover:scale-105"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "/placeholder.jpg";
                            e.currentTarget.onerror = null;
                          }}
                          loading="lazy"
                        />
                        {images.length > 1 && (
                          <>
                            <button
                              onClick={prevImage}
                              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-1 md:p-2 shadow-md hover:bg-white transition-all"
                              aria-label="Previous image"
                              style={blackTextBtnStyle}
                            >
                              <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
                            </button>
                            <button
                              onClick={nextImage}
                              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 backdrop-blur-sm p-1 md:p-2 shadow-md hover:bg-white transition-all"
                              aria-label="Next image"
                              style={blackTextBtnStyle}
                            >
                              <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
                            </button>
                          </>
                        )}
                        {images.length > 1 && (
                          <div className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                            {currentImageIndex + 1} / {images.length}
                          </div>
                        )}
                      </div>
                      {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {images.map((image: string, index: number) => (
                            <button
                              key={index}
                              onClick={() => setCurrentImageIndex(index)}
                              className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-md border-2 overflow-hidden transition-all hover:scale-105 ${
                                currentImageIndex === index
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-gray-200 hover:border-gray-300"
                              }`}
                              style={
                                currentImageIndex === index
                                  ? { borderColor: primaryColor }
                                  : {}
                              }
                            >
                              <img
                                src={getImageUrl(image)}
                                alt={`Thumbnail ${index + 1}`}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src =
                                    "/placeholder.jpg";
                                  e.currentTarget.onerror = null;
                                }}
                                loading="lazy"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="aspect-square w-full rounded-lg bg-gray-100 flex items-center justify-center">
                      <p
                        className="text-gray-500 text-sm md:text-base"
                        style={{ fontFamily }}
                      >
                        No image available
                      </p>
                    </div>
                  )}
                </div>
                {/* Details Section */}
                <div className="space-y-4 md:space-y-6">
                  <div className="space-y-2 md:space-y-3">
                    <Badge
                      variant="secondary"
                      className="text-xs md:text-sm"
                      style={infoBadgeStyle}
                    >
                      {product.category}
                    </Badge>
                    <h1
                      className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight"
                      style={{ fontFamily }}
                    >
                      {product.name}
                    </h1>
                    {product.tags && product.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 md:gap-2">
                        {product.tags.map((tag: string, index: number) => (
                          <Badge
                            key={index}
                            variant="buttonOutline"
                            className="text-xs px-2 py-1"
                            style={badgeOutlineStyle}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="pt-2">
                      {/* Price display — always uses priceData from getPrice() */}
                      <div className="flex items-center gap-2">
                        {priceData && priceData.effectivePrice != null ? (
                          <div className="flex items-center gap-2">
                            {priceData.isDiscounted && priceData.originalPrice && (
                              <span className="text-sm line-through text-gray-400">
                                {formatPrice(priceData.originalPrice)}
                              </span>
                            )}
                            <span
                              className="text-2xl font-bold"
                              style={{ color: primaryColor }}
                            >
                              {formatPrice(priceData.effectivePrice)}
                              <span className="text-sm text-gray-500 font-normal ml-1">
                                / {displayMeasurement}
                              </span>
                            </span>
                            {priceData.isDiscounted && priceData.originalPrice && priceData.originalPrice > 0 && (
                              <span className="text-xs font-medium text-green-600">
                                SAVE{" "}
                                {(
                                  100 -
                                  (priceData.effectivePrice /
                                    priceData.originalPrice) *
                                    100
                                ).toFixed(0)}
                                %
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="text-2xl font-bold"
                            style={{ color: primaryColor }}
                          >
                            {formatPrice(product.price)}
                          </span>
                        )}
                      </div>

                      {/* Inventory status display */}
                      <div className="mt-2">{getInventoryStatus()}</div>
                    </div>

                    {/* Main Product Description */}
                    {product.description && (
                      <div className="pt-2">
                        <p className="text-sm md:text-base text-muted-foreground">
                          {product.description}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Product Options (Size/Quantity/Pack) */}
                  {hasOptions && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm md:text-base">
                        {product.optionsLabel || "Select Option"}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {product.productOptions.map((opt: any, idx: number) => {
                          const optOutOfStock = opt.trackQuantity && opt.inventory <= 0;
                          const optPrice = opt.isDiscounted && opt.discountedPrice ? opt.discountedPrice : opt.price;
                          return (
                            <Button
                              key={opt.id}
                              variant={selectedOption === idx ? "default" : "outline"}
                              onClick={() => setSelectedOption(idx)}
                              className="h-auto p-3 flex flex-col items-start text-left"
                              style={getSelectableButtonStyle(selectedOption === idx)}
                              disabled={optOutOfStock}
                            >
                              <span
                                className="font-medium text-xs md:text-sm"
                                style={{ color: selectedOption === idx ? "#fff" : "#222" }}
                              >
                                {opt.title}
                              </span>
                              <span
                                className="text-sm"
                                style={{ color: selectedOption === idx ? "#ddd" : "#666" }}
                              >
                                {formatPrice(optPrice)}
                                {opt.isDiscounted && opt.discountedPrice && (
                                  <span className="ml-1 line-through text-xs opacity-60">
                                    {formatPrice(opt.price)}
                                  </span>
                                )}
                              </span>
                              {optOutOfStock && (
                                <span className="text-[10px] text-red-500">Out of stock</span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subcategory Options */}
                  {subcategories.length > 0 && (!hasOptions || selectedOption != null) && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm md:text-base">
                        Available Options
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {subcategories.map((subcat: any, idx: number) => {
                          const hasVariantsInSub = subcat.variants && subcat.variants.length > 0;
                          const subPrice = !hasVariantsInSub && (subcat.additionalPrice || subcat.additionalPrice === 0)
                            ? (subcat.isDiscounted && subcat.discountedAdditionalPrice != null
                              ? subcat.discountedAdditionalPrice
                              : subcat.additionalPrice)
                            : null;
                          const subOriginalPrice = !hasVariantsInSub && subcat.isDiscounted && subcat.discountedAdditionalPrice != null
                            ? subcat.additionalPrice
                            : null;

                          return (
                            <Button
                              key={idx}
                              variant={
                                selectedSubcategory === idx
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() => {
                                setSelectedSubcategory(idx);
                                setSelectedVariant(0);
                              }}
                              className="h-auto p-3 flex flex-col items-start text-left"
                              style={getSelectableButtonStyle(
                                selectedSubcategory === idx,
                              )}
                            >
                              <span
                                className="font-medium text-xs md:text-sm"
                                style={{
                                  color:
                                    selectedSubcategory === idx ? "#fff" : "#222",
                                }}
                              >
                                {subcat.name}
                              </span>
                              {subPrice != null && (
                                <span
                                  className="text-sm mt-0.5"
                                  style={{ color: selectedSubcategory === idx ? "#ddd" : "#666" }}
                                >
                                  {subPrice > 0 ? `+${formatPrice(subPrice)}` : formatPrice(0)}
                                  {subOriginalPrice != null && (
                                    <span className="ml-1 line-through text-xs opacity-60">
                                      +{formatPrice(subOriginalPrice)}
                                    </span>
                                  )}
                                </span>
                              )}
                              {subcat.description && (
                                <span
                                  style={{
                                    color:
                                      selectedSubcategory === idx
                                        ? "#fff"
                                        : "#222",
                                  }}
                                  className="text-xs text-black mt-1 whitespace-normal break-words"
                                >
                                  {subcat.description}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Variant Options */}
                  {variants.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm md:text-base">
                        {currentSubcategory?.name} Variants
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {variants.map((variant: any, idx: number) => (
                          <Button
                            key={idx}
                            variant={
                              selectedVariant === idx ? "default" : "outline"
                            }
                            onClick={() => setSelectedVariant(idx)}
                            className="h-auto p-3 flex flex-col items-start text-left"
                            style={getSelectableButtonStyle(
                              selectedVariant === idx,
                            )}
                            disabled={
                              variant.trackQuantity && variant.inventory <= 0
                            }
                          >
                            <span
                              className="font-medium text-xs md:text-sm"
                              style={{
                                color:
                                  selectedVariant === idx ? "#fff" : "#222",
                              }}
                            >
                              {variant.title}
                            </span>
                            <div className="flex items-center gap-2">
                              {variant.isDiscounted && (
                                <span className="text-sm text-gray-400 line-through">
                                  {formatPrice(variant.price)}
                                </span>
                              )}

                              <span className="text-lg text-white-600">
                                {formatPrice(
                                  variant.isDiscounted
                                    ? variant.discountedPrice
                                    : variant.price,
                                )}
                              </span>
                            </div>
                          </Button>
                        ))}
                      </div>

                      {/* --- ADDED VARIANT DESCRIPTION HERE --- */}
                      {currentVariantDescription && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-100">
                          <p className="text-sm text-gray-600">
                            {currentVariantDescription}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quantity and Add to Cart */}
                  {isInStock && (
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">Quantity:</span>
                        <div className="flex items-center border rounded-md">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setQuantity(Math.max(1, quantity - 1))
                            }
                            disabled={quantity <= 1}
                            className="h-8 w-8 p-0 hover:bg-muted"
                            style={blackTextBtnStyle}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span
                            className="px-3 py-1 text-sm font-medium min-w-[3rem] text-center"
                            style={{ fontFamily }}
                          >
                            {quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setQuantity(
                                Math.min(
                                  quantity + 1,
                                  isTrackingInventory() ? getStock() : 99,
                                ),
                              )
                            }
                            disabled={
                              isTrackingInventory() && quantity >= getStock()
                            }
                            className="h-8 w-8 p-0 hover:bg-muted"
                            style={blackTextBtnStyle}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {isTrackingInventory()
                            ? `(${getStock()} available)`
                            : "(In Stock)"}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <Button
                          onClick={handleAddToCart}
                          disabled={
                            addingToCart ||
                            !isInStock ||
                            (hasSubcategories &&
                              variants.length > 0 &&
                              !variants[selectedVariant])
                          }
                          className="flex-1 text-sm md:text-base py-2 md:py-3"
                          style={brandBtnStyle}
                        >
                          {addingToCart ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding to Cart...
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="mr-2 h-4 w-4" />
                              {inCart
                                ? `Add More (${cartQuantity} in cart)`
                                : "Add to Cart"}
                            </>
                          )}
                        </Button>
                        {inCart && (
                          <Button
                            variant="buttonOutline"
                            onClick={() =>
                              navigate(`/cart/${product.shopkeeperId}`)
                            }
                            className="flex-1 sm:flex-initial text-sm"
                            style={blackTextBtnStyle}
                          >
                            Go To Cart
                          </Button>
                        )}
                      </div>
                      {whatsAppNumber && (
                        <Button
                          variant="buttonOutline"
                          onClick={() => {
                            if (!priceData) return;

                            const priceText = priceData.isDiscounted
                              ? priceData.hasVariants
                                ? `${formatPrice(priceData.effectivePrice)} (Discount Available)`
                                : `~~${formatPrice(priceData.originalPrice)}~~ ${formatPrice(
                                    priceData.effectivePrice,
                                  )}`
                              : formatPrice(priceData.effectivePrice);

                            // Updated WhatsApp message to include measurement
                            const message = `Hi! I'm interested in ${product.name}. Price: ${priceText} / ${displayMeasurement}`;

                            window.open(
                              `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(message)}`,
                              "_blank",
                            );
                          }}
                          className="w-full text-sm"
                          style={blackTextBtnStyle}
                        >
                          <FaWhatsapp className="mr-2 h-4 w-4 text-green-600" />
                          Contact via WhatsApp
                        </Button>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <Button
                          variant="buttonOutline"
                          onClick={() => {
                            onClose?.();
                          }}
                          className="flex-1 text-sm"
                          style={blackTextBtnStyle}
                        >
                          Back to Store
                        </Button>
                      </div>
                    </div>
                  )}
                  {!isInStock && (
                    <div className="pt-4 space-y-4">
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center">
                        <XCircle className="h-5 w-5 text-red-500 mr-2" />
                        <p className="text-sm text-red-700">
                          This product is currently out of stock.
                        </p>
                      </div>
                      <Button
                        variant="buttonOutline"
                        onClick={() => {
                          onClose?.();
                        }}
                        className="w-full text-sm"
                        style={blackTextBtnStyle}
                      >
                        Back to Store
                      </Button>
                      {whatsAppNumber && (
                        <Button
                          variant="buttonOutline"
                          onClick={() => {
                            const message = `Hi! I'm interested in ${product.name} which is currently out of stock. Could you let me know when it will be available?`;
                            window.open(
                              `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(
                                message,
                              )}`,
                              "_blank",
                            );
                          }}
                          className="w-full text-sm"
                          style={blackTextBtnStyle}
                        >
                          <FaWhatsapp className="mr-2 h-4 w-4 text-green-600" />
                          Ask About Availability
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
