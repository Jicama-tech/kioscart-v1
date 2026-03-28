import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Package, ChevronDown, ChevronUp } from "lucide-react";
import { CartItem } from "@/hooks/cartContext";

const apiURL = __API_URL__;

interface Variant {
  id: number;
  title: string;
  price: number;
  measurement?: string;
  description?: string;
  isDiscounted?: boolean;
  discountedPrice?: number;
  compareAtPrice?: number;
  sku: string;
  barcode?: string;
  inventory: number;
  lowstockThreshold: number;
  trackQuantity: boolean;
  options?: Record<string, any>;
}

interface Subcategory {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  variants: Variant[];
}

interface Product {
  _id: string;
  productName: string;
  price: number;
  discountedPrice?: number;
  isDiscounted?: boolean;
  images?: string[];
  category?: string;
  subcategories?: Subcategory[];
  inventory?: number;
  trackQuantity?: boolean;
  measurement?: string;
  sku?: string;
  isActive?: boolean;
}

interface KioskProductBrowserProps {
  onAddItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  activeCartId: string | null;
  formatPrice: (amount: number) => string;
}

export function KioskProductBrowser({
  onAddItem,
  activeCartId,
  formatPrice,
}: KioskProductBrowserProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(`${apiURL}/products/shopkeeper-products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const productList = Array.isArray(data)
          ? data
          : data.data || data.products || [];
        setProducts(productList);
      }
    } catch (e) {
      console.error("Failed to fetch products:", e);
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (p.isActive === false) return false;
      const matchSearch =
        !search ||
        p.productName.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      const matchCategory =
        categoryFilter === "all" || p.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [products, search, categoryFilter]);

  function handleAddVariant(
    product: Product,
    subIdx: number,
    varIdx: number,
  ) {
    const sub = product.subcategories![subIdx];
    const variant = sub.variants[varIdx];
    onAddItem({
      productId: product._id,
      productName: product.productName,
      price: variant.price,
      discountedPrice: variant.discountedPrice,
      isDiscounted: variant.isDiscounted,
      subcategoryIndex: subIdx,
      subcategoryName: sub.name,
      variantIndex: varIdx,
      variantTitle: variant.title,
      image: product.images?.[0],
      inventory: variant.inventory || 0,
      trackQuantity: variant.trackQuantity ?? false,
      measurement: variant.measurement,
      sku: variant.sku,
      category: product.category,
    });
  }

  function handleAddSimpleProduct(product: Product) {
    // Product with no subcategories/variants
    onAddItem({
      productId: product._id,
      productName: product.productName,
      price: product.price,
      discountedPrice: product.discountedPrice,
      isDiscounted: product.isDiscounted,
      subcategoryIndex: 0,
      subcategoryName: "Default",
      variantIndex: 0,
      variantTitle: "Default",
      image: product.images?.[0],
      inventory: product.inventory || 0,
      trackQuantity: product.trackQuantity ?? false,
      measurement: product.measurement,
      sku: product.sku,
      category: product.category,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2" />
        Loading products...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search & Filter */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Package className="h-8 w-8 mb-2" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                onAddSimple={handleAddSimpleProduct}
                onAddVariant={handleAddVariant}
                disabled={!activeCartId}
                formatPrice={formatPrice}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onAddSimple,
  onAddVariant,
  disabled,
  formatPrice,
}: {
  product: Product;
  onAddSimple: (p: Product) => void;
  onAddVariant: (p: Product, subIdx: number, varIdx: number) => void;
  disabled: boolean;
  formatPrice: (amount: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  const hasSubcategories =
    product.subcategories && product.subcategories.length > 0;

  // Check if product has meaningful variants (more than 1 variant total)
  const totalVariants = hasSubcategories
    ? product.subcategories!.reduce((sum, sub) => sum + (sub.variants?.length || 0), 0)
    : 0;

  const hasMultipleOptions = hasSubcategories && (
    product.subcategories!.length > 1 || totalVariants > 1
  );

  // Get display price from first variant or product level
  const getDisplayPrice = () => {
    if (hasSubcategories && product.subcategories![0]?.variants?.[0]) {
      const v = product.subcategories![0].variants[0];
      return { price: v.price, discountedPrice: v.discountedPrice, isDiscounted: v.isDiscounted };
    }
    return { price: product.price, discountedPrice: product.discountedPrice, isDiscounted: product.isDiscounted };
  };

  const dp = getDisplayPrice();

  return (
    <div className="border rounded-lg p-2 bg-white hover:shadow-sm transition-shadow">
      {/* Image */}
      {product.images?.[0] && (
        <img
          src={
            product.images[0].startsWith("http")
              ? product.images[0]
              : `${apiURL}${product.images[0]}`
          }
          alt={product.productName}
          className="w-full h-20 object-cover rounded mb-1.5"
        />
      )}

      {/* Info */}
      <p className="text-xs font-medium text-slate-800 truncate">
        {product.productName}
      </p>
      {product.category && (
        <p className="text-[10px] text-slate-400">{product.category}</p>
      )}

      <div className="flex items-center justify-between mt-1.5">
        <div>
          {dp.isDiscounted && dp.discountedPrice ? (
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-green-600">
                {formatPrice(dp.discountedPrice)}
              </span>
              <span className="text-[10px] text-slate-400 line-through">
                {formatPrice(dp.price)}
              </span>
            </div>
          ) : (
            <span className="text-xs font-semibold">
              {formatPrice(dp.price)}
            </span>
          )}
          {hasMultipleOptions && (
            <span className="text-[10px] text-slate-400 block">
              {product.subcategories!.length} option{product.subcategories!.length > 1 ? "s" : ""} &middot; {totalVariants} variant{totalVariants > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {hasMultipleOptions ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3 mr-0.5" />
            ) : (
              <ChevronDown className="h-3 w-3 mr-0.5" />
            )}
            {expanded ? "Hide" : "Select"}
          </Button>
        ) : hasSubcategories && totalVariants === 1 ? (
          // Single variant — add directly
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => onAddVariant(product, 0, 0)}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Add
          </Button>
        ) : (
          // No subcategories — simple product
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => onAddSimple(product)}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Add
          </Button>
        )}
      </div>

      {/* Expanded Subcategories & Variants */}
      {expanded && hasSubcategories && (
        <div className="mt-2 border-t pt-1.5 space-y-2">
          {product.subcategories!.map((sub, subIdx) => (
            <div key={subIdx}>
              {/* Subcategory header — show if more than one subcategory */}
              {product.subcategories!.length > 1 && (
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  {sub.name}
                  {sub.description && (
                    <span className="font-normal normal-case ml-1 text-slate-400">
                      — {sub.description}
                    </span>
                  )}
                </p>
              )}

              {/* Variants */}
              {sub.variants.map((variant, varIdx) => {
                const varPrice = variant.isDiscounted && variant.discountedPrice
                  ? variant.discountedPrice
                  : variant.price;
                const outOfStock = variant.trackQuantity && variant.inventory <= 0;

                return (
                  <div
                    key={`${subIdx}-${varIdx}`}
                    className={`flex items-center justify-between py-1 px-1.5 rounded text-[11px] ${
                      outOfStock ? "opacity-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-700 block truncate">
                        {variant.title}
                        {variant.measurement && (
                          <span className="text-slate-400 ml-1">
                            ({variant.measurement})
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {variant.isDiscounted && variant.discountedPrice ? (
                          <>
                            <span className="font-semibold text-green-600">
                              {formatPrice(variant.discountedPrice)}
                            </span>
                            <span className="text-slate-400 line-through text-[10px]">
                              {formatPrice(variant.price)}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium">
                            {formatPrice(variant.price)}
                          </span>
                        )}
                        {variant.trackQuantity && (
                          <Badge
                            variant={outOfStock ? "destructive" : "secondary"}
                            className="text-[8px] h-3.5 px-1"
                          >
                            {outOfStock ? "Out of stock" : `${variant.inventory} left`}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-6 text-[10px] px-1.5 ml-1"
                      disabled={disabled || outOfStock}
                      onClick={() => onAddVariant(product, subIdx, varIdx)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
