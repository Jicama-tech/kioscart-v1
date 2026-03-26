import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { RefreshCw, Star, Heart, Eye, Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  description: string;
  category: string;
  shopkeeperName: string;
  shopkeeperId: string;
  isFollowing: boolean;
  rating: number;
  reviews: number;
  inStock: boolean;
  images: string[];
  shopkeeper?: any;
}

interface FollowedProductsSectionProps {
  products?: Product[];
  onFollowToggle?: (shopkeeperId: string) => void;
  onViewProduct?: (productId: string) => void;
}

export function FollowedProductsSection({
  products: propProducts,
  onFollowToggle,
  onViewProduct,
}: FollowedProductsSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);

  const apiURL = __API_URL__;
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselTimer = useRef<number>();

  useEffect(() => {
    if (!products?.length) return;
    carouselTimer.current = window.setInterval(() => {
      setCurrentIndex((prevIndex) =>
        prevIndex + 4 >= products.length ? 0 : prevIndex + 4,
      );
    }, 2000);
    return () => window.clearInterval(carouselTimer.current);
  }, [products]);

  useEffect(() => {
    if (propProducts) {
      setProducts(propProducts);
      setLoading(false);
    } else {
      fetchProducts();
    }
  }, [propProducts, apiURL]);

  const visibleProducts = products.slice(currentIndex, currentIndex + 4);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiURL}/products/get-all-products`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      const productsWithBase: Product[] = (data || []).map((p: any) => {
        const firstSub = p.subcategories?.[0];
        const firstVar = firstSub?.variants?.[0];
        return {
          id: p._id,
          name: p.name,
          price: firstVar ? firstVar.price : 0,
          description: p.description,
          category: p.category,
          shopkeeperId: p.shopkeeperId?._id ?? p.shopkeeperId,
          shopkeeperName: "", // Will be filled below after fetching details
          isFollowing: false,
          rating: p.rating || 4.5,
          reviews: p.reviews || Math.floor(Math.random() * 1000) + 100,
          inStock: (firstVar?.inventory ?? 1) > 0,
          images: p.images?.length ? p.images : [],
          originalPrice:
            firstVar && Math.random() > 0.7 ? firstVar.price * 1.2 : undefined,
        };
      });

      // Fetch shopkeeper detail per product in parallel
      const productWithShopkeeperDetail = await Promise.all(
        productsWithBase.map(async (product) => {
          try {
            const shopkeeperResp = await fetch(
              `${apiURL}/shopkeepers/Shopkeeper-detail/${product.shopkeeperId}`,
            );
            if (shopkeeperResp.ok) {
              const shopkeeperData = await shopkeeperResp.json();

              return {
                ...product,
                shopkeeperName: shopkeeperData?.data?.shopName ?? "Shopkeeper",
                shopkeeper: shopkeeperData,
              };
            } else {
              return { ...product, shopkeeperName: "Shopkeeper" };
            }
          } catch {
            return { ...product, shopkeeperName: "Shopkeeper" };
          }
        }),
      );

      setProducts(productWithShopkeeperDetail);
    } catch (error) {
      console.error("Error fetching products:", error);
      setError(
        error instanceof Error ? error.message : "Failed to fetch products",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleViewProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setIsProductDialogOpen(true);
    if (onViewProduct) {
      onViewProduct(product.id);
    }
  };

  const handleFollowToggle = (shopkeeperId: string) => {
    if (onFollowToggle) {
      onFollowToggle(shopkeeperId);
    }
    setProducts((prevProducts) =>
      prevProducts.map((product) =>
        product.shopkeeperId === shopkeeperId
          ? { ...product, isFollowing: !product.isFollowing }
          : product,
      ),
    );
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star
          key={`full-${i}`}
          className="w-3 h-3 fill-yellow-400 text-yellow-400"
        />,
      );
    }
    const remainingStars = 5 - fullStars;
    for (let i = 0; i < remainingStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="w-3 h-3 text-gray-300" />);
    }
    return stars;
  };

  const handleNavigateToStorefront = (product: Product) => {
    const slug = product.shopkeeperName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    navigate(`/estore/${slug}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Products from Shopkeepers</h3>
          <RefreshCw className="w-4 h-4 animate-spin" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-square bg-gray-200"></div>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Products from Shopkeepers</h3>
          <Badge variant="destructive">Error</Badge>
        </div>
        <Card className="p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchProducts}>Try Again</Button>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Products from Shopkeepers</h3>
          <div className="flex items-center gap-2">
            <Badge variant="buttonOutline">{products.length} products</Badge>
            <Button variant="buttonOutline" size="sm" onClick={fetchProducts}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="relative">
          {/* Carousel */}
          <div className="flex flex-nowrap gap-4 overflow-hidden">
            {visibleProducts.map((product) => (
              <Card
                key={product.id}
                className="group hover:shadow-lg transition-all duration-200 border border-gray-200 hover:border-gray-300 cursor-pointer flex-shrink-0 w-full max-w-[270px] min-w-[220px]"
                onClick={() => handleNavigateToStorefront(product)}
              >
                <div className="aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden">
                  {product.images.length > 0 ? (
                    <img
                      src={
                        product.images[0].startsWith("http")
                          ? product.images[0]
                          : `${apiURL}${product.images[0]}`
                      }
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholder.jpg";
                      }}
                    />
                  ) : (
                    <Package className="h-12 w-12 text-gray-400" />
                  )}

                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs">
                      {product.category}
                    </Badge>
                  </div>

                  {product.originalPrice && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="destructive" className="text-xs">
                        SALE
                      </Badge>
                    </div>
                  )}

                  {!product.inStock && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Badge variant="destructive">Out of Stock</Badge>
                    </div>
                  )}
                </div>

                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-1">
                      {renderStars(product.rating)}
                      <span className="text-xs font-medium">
                        {product.rating}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({product.reviews})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFollowToggle(product.shopkeeperId);
                      }}
                      className={`p-1 h-auto ${
                        product.isFollowing
                          ? "text-red-500 hover:text-red-600"
                          : "text-gray-400 hover:text-red-500"
                      }`}
                      title={
                        product.isFollowing
                          ? "Unfollow shopkeeper"
                          : "Follow shopkeeper"
                      }
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          product.isFollowing ? "fill-current" : ""
                        }`}
                      />
                    </Button>
                  </div>

                  <CardTitle className="text-sm leading-tight line-clamp-2">
                    {product.name}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    by{" "}
                    <span className="font-medium text-blue-600">
                      {product.shopkeeperName}
                    </span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {product.description}
                  </p>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-slate-800">
                      ${product.price}
                    </span>
                    {product.originalPrice && (
                      <>
                        <span className="text-xs text-muted-foreground line-through">
                          ${product.originalPrice.toFixed(2)}
                        </span>
                        <Badge
                          variant="buttonOutline"
                          className="text-xs bg-green-100 text-green-700 border-green-200"
                        >
                          {Math.round(
                            ((product.originalPrice - product.price) /
                              product.originalPrice) *
                              100,
                          )}
                          % OFF
                        </Badge>
                      </>
                    )}
                  </div>

                  <Button
                    className="w-full  text-white transition-colors duration-300 shadow-sm hover:shadow-md"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigateToStorefront(product);
                    }}
                    title={`Visit ${product.shopkeeperName}'s storefront`}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Navigational dots */}
          <div className="flex justify-center items-center mt-3 gap-2">
            {Array.from({ length: Math.ceil(products.length / 4) }).map(
              (_, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full bg-gray-400 ${
                    currentIndex === idx * 4 ? "bg-blue-500" : "opacity-50"
                  }`}
                  onClick={() => setCurrentIndex(idx * 4)}
                  style={{ cursor: "pointer" }}
                />
              ),
            )}
          </div>
        </div>

        {products.length === 0 && !loading && !error && (
          <Card className="py-12 text-center">
            <CardContent>
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-semibold mb-2">
                No Products Available
              </h3>
              <p className="text-muted-foreground mb-4">
                There are currently no products to display. Check back later!
              </p>
              <Button onClick={fetchProducts}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
