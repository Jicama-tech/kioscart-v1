import { useState, useEffect } from "react";
import { StorefrontTemplate } from "./StorefrontTemplate";
import { defaultStorefrontSettings } from "./shopkeeperStoreSettings";
import { mockStoreInfo } from "./mockData";
import { useToast } from "@/hooks/use-toast";
import { jwtDecode } from "jwt-decode";
import { Loader2 } from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  image: string;
  category: string;
  featured?: boolean;
  sale?: boolean;
  badge?: string;
}

export function ShopkeeperStorePage() {
  const apiUrl = __API_URL__;
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchShopkeeperProducts = async () => {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) {
          setError("Unauthorized - Please login first");
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        try {
          const response = await fetch(
            `${apiUrl}/products/shopkeeper-products`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(
              `Failed to fetch products: HTTP ${response.status}`
            );
          }

          const data = await response.json();
          // Debug log

          // Check if we have valid product data
          if (data && (data.data || Array.isArray(data))) {
            // Map backend data to match StorefrontTemplate interface
            const productsData = data.data || data;
            const mappedProducts = productsData.map((product: any) => ({
              id: product._id || product.id || Math.random(),
              name: product.name || "Untitled Product",
              description: product.description || "",
              price: product.price || 0,
              originalPrice: product.compareAtPrice || product.originalPrice,
              rating: product.rating || 4.5,
              reviews: product.reviewCount || product.reviews || 0,
              image:
                product.images?.[0] ||
                product.image ||
                "/placeholder-image.jpg",
              category: product.category || "Uncategorized",
              featured: product.featured || false,
              sale: product.sale || false,
              badge: product.badge,
            }));
            setProducts(mappedProducts);
          } else {
            // Fallback to mock data if API returns unexpected format
            throw new Error("API returned unexpected data format");
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === "AbortError") {
            throw new Error("Request timeout - API is not responding");
          }
          throw fetchError;
        }
      } catch (err: any) {
        console.error("Product fetch error:", err);
        setError(err.message || "Failed to fetch products");

        // Fallback to mock data for demo purposes
        const { mockProducts } = await import("./mockData");
        setProducts(mockProducts);

        toast({
          duration: 5000,
          title: "Using Demo Data",
          description: "Showing demo products (API unavailable)",
          variant: "default",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchShopkeeperProducts();
  }, []);

  const handleBack = () => {
    alert("Navigating back to the dashboard...");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-muted-foreground">
            Please check your connection and try again
          </p>
        </div>
      </div>
    );
  }

  return (
    <StorefrontTemplate
      onBack={handleBack}
      // settings={defaultStorefrontSettings}
      // storeInfo={mockStoreInfo}
      // products={products}
    />
  );
}
