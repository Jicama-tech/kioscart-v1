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
import { Search, Plus, Minus, Package } from "lucide-react";
import { CartItem } from "@/hooks/cartContext";

const apiURL = __API_URL__;

interface Product {
  _id: string;
  productName: string;
  price: number;
  discountedPrice?: number;
  isDiscounted?: boolean;
  images?: string[];
  category?: string;
  subcategories?: {
    name: string;
    variants: {
      title: string;
      price: number;
      discountedPrice?: number;
      isDiscounted?: boolean;
      inventory: number;
      trackQuantity: boolean;
      measurement?: string;
      sku?: string;
    }[];
  }[];
  inventory?: number;
  trackQuantity?: boolean;
  measurement?: string;
  sku?: string;
  isActive?: boolean;
}

interface KioskProductBrowserProps {
  onAddItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  activeCartId: string | null;
}

export function KioskProductBrowser({
  onAddItem,
  activeCartId,
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
        setProducts(Array.isArray(data) ? data : data.products || []);
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

  function handleAddProduct(product: Product) {
    // If product has subcategories with variants, add first variant
    if (
      product.subcategories &&
      product.subcategories.length > 0 &&
      product.subcategories[0].variants?.length > 0
    ) {
      const sub = product.subcategories[0];
      const variant = sub.variants[0];
      onAddItem({
        productId: product._id,
        productName: product.productName,
        price: variant.isDiscounted
          ? variant.discountedPrice || variant.price
          : variant.price,
        discountedPrice: variant.discountedPrice,
        isDiscounted: variant.isDiscounted,
        subcategoryIndex: 0,
        subcategoryName: sub.name,
        variantIndex: 0,
        variantTitle: variant.title,
        image: product.images?.[0],
        inventory: variant.inventory || 0,
        trackQuantity: variant.trackQuantity ?? false,
        measurement: variant.measurement,
        sku: variant.sku,
        category: product.category,
      });
    } else {
      onAddItem({
        productId: product._id,
        productName: product.productName,
        price: product.isDiscounted
          ? product.discountedPrice || product.price
          : product.price,
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
  }

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
      price: variant.isDiscounted
        ? variant.discountedPrice || variant.price
        : variant.price,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
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
                onAdd={handleAddProduct}
                onAddVariant={handleAddVariant}
                disabled={!activeCartId}
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
  onAdd,
  onAddVariant,
  disabled,
}: {
  product: Product;
  onAdd: (p: Product) => void;
  onAddVariant: (p: Product, subIdx: number, varIdx: number) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasVariants =
    product.subcategories &&
    product.subcategories.length > 0 &&
    (product.subcategories.length > 1 ||
      (product.subcategories[0]?.variants?.length || 0) > 1);

  const displayPrice = product.isDiscounted
    ? product.discountedPrice || product.price
    : product.price;

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
          {product.isDiscounted && product.discountedPrice ? (
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-green-600">
                ${product.discountedPrice.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 line-through">
                ${product.price.toFixed(2)}
              </span>
            </div>
          ) : (
            <span className="text-xs font-semibold">
              ${product.price.toFixed(2)}
            </span>
          )}
        </div>

        {hasVariants ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Variants"}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => onAdd(product)}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Add
          </Button>
        )}
      </div>

      {/* Expanded Variants */}
      {expanded && hasVariants && (
        <div className="mt-2 space-y-1 border-t pt-1.5">
          {product.subcategories!.map((sub, subIdx) =>
            sub.variants.map((variant, varIdx) => (
              <div
                key={`${subIdx}-${varIdx}`}
                className="flex items-center justify-between text-[11px]"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-slate-600 truncate block">
                    {sub.name !== "Default" ? `${sub.name} - ` : ""}
                    {variant.title}
                  </span>
                  <span className="font-medium">
                    ${(variant.isDiscounted
                      ? variant.discountedPrice || variant.price
                      : variant.price
                    ).toFixed(2)}
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-1.5 ml-1"
                  disabled={disabled}
                  onClick={() => onAddVariant(product, subIdx, varIdx)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
