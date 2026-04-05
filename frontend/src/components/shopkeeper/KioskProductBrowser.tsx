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

interface ProductOptionItem {
  id: number;
  title: string;
  price: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
  inventory: number;
  trackQuantity: boolean;
  lowstockThreshold?: number;
}

interface Subcategory {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  additionalPrice?: number;
  isDiscounted?: boolean;
  discountedAdditionalPrice?: number;
  inventory?: number;
  trackQuantity?: boolean;
  lowstockThreshold?: number;
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
  hasOptions?: boolean;
  optionsLabel?: string;
  productOptions?: ProductOptionItem[];
  subcategories?: Subcategory[];
  variants?: Variant[];
  inventory?: number;
  trackQuantity?: boolean;
  measurement?: string;
  sku?: string;
  isActive?: boolean;
  status?: "active" | "draft" | "archived";
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
        const rawList = Array.isArray(data)
          ? data
          : data.data || data.products || [];
        const productList = rawList.map((p: any) => ({
          ...p,
          productName: p.productName || p.name || "",
        }));
        console.log("Kiosk products loaded:", productList.length, productList.map((p: any) => ({ name: p.productName, status: p.status })));
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
      if (p.status && p.status !== "active") return false;
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
    selectedOption?: ProductOptionItem,
  ) {
    const sub = product.subcategories![subIdx];
    const variant = sub.variants[varIdx];
    // Option base (additive) or 0 (variant price is absolute for old products)
    const optionBase = selectedOption
      ? (Number(selectedOption.isDiscounted && selectedOption.discountedPrice ? selectedOption.discountedPrice : selectedOption.price) || 0)
      : 0;
    const variantEffective = Number(variant.isDiscounted && variant.discountedPrice ? variant.discountedPrice : variant.price) || 0;
    const totalPrice = optionBase + variantEffective;

    onAddItem({
      productId: product._id,
      productName: product.productName,
      price: totalPrice,
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
      optionTitle: selectedOption?.title,
      optionPrice: selectedOption?.price,
    });
  }

  function handleAddProductVariant(
    product: Product,
    varIdx: number,
    selectedOption?: ProductOptionItem,
  ) {
    const variant = product.variants![varIdx];
    const optionBase = selectedOption
      ? (Number(selectedOption.isDiscounted && selectedOption.discountedPrice ? selectedOption.discountedPrice : selectedOption.price) || 0)
      : 0;
    const variantEffective = Number(variant.isDiscounted && variant.discountedPrice ? variant.discountedPrice : variant.price) || 0;
    const totalPrice = optionBase + variantEffective;

    onAddItem({
      productId: product._id,
      productName: product.productName,
      price: totalPrice,
      subcategoryIndex: -1,
      subcategoryName: undefined,
      variantIndex: varIdx,
      variantTitle: variant.title,
      image: product.images?.[0],
      inventory: variant.inventory || 0,
      trackQuantity: variant.trackQuantity ?? false,
      measurement: variant.measurement,
      sku: variant.sku,
      category: product.category,
      optionTitle: selectedOption?.title,
      optionPrice: selectedOption?.price,
    });
  }

  function handleAddSubcategory(
    product: Product,
    subIdx: number,
    selectedOption?: ProductOptionItem,
  ) {
    const sub = product.subcategories![subIdx];
    // Base price = option price (if selected) or product price (for subcategory-only)
    const base = selectedOption
      ? (Number(selectedOption.isDiscounted && selectedOption.discountedPrice ? selectedOption.discountedPrice : selectedOption.price) || 0)
      : (Number(product.price) || 0);
    const subAdd = Number(sub.isDiscounted && sub.discountedAdditionalPrice != null
      ? sub.discountedAdditionalPrice
      : (sub.additionalPrice || 0)) || 0;
    const totalPrice = base + subAdd;

    onAddItem({
      productId: product._id,
      productName: product.productName,
      price: totalPrice,
      subcategoryIndex: subIdx,
      subcategoryName: sub.name,
      variantIndex: -1,
      variantTitle: "Default",
      image: product.images?.[0],
      inventory: sub.inventory || 0,
      trackQuantity: sub.trackQuantity ?? false,
      category: product.category,
      optionTitle: selectedOption?.title,
      optionPrice: selectedOption?.price,
    });
  }

  function handleAddWithOption(product: Product, option: ProductOptionItem) {
    // Product with option only (no subcategories)
    const price = option.isDiscounted && option.discountedPrice ? option.discountedPrice : option.price;
    onAddItem({
      productId: product._id,
      productName: product.productName,
      price,
      subcategoryIndex: 0,
      subcategoryName: "Default",
      variantIndex: 0,
      variantTitle: "Default",
      image: product.images?.[0],
      inventory: option.inventory || 0,
      trackQuantity: option.trackQuantity ?? false,
      measurement: product.measurement,
      sku: product.sku,
      category: product.category,
      optionTitle: option.title,
      optionPrice: option.price,
    });
  }

  function handleAddSimpleProduct(product: Product) {
    // Product with no subcategories/variants/options
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
                onAddProductVariant={handleAddProductVariant}
                onAddSubcategory={handleAddSubcategory}
                onAddWithOption={handleAddWithOption}
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
  onAddProductVariant,
  onAddSubcategory,
  onAddWithOption,
  disabled,
  formatPrice,
}: {
  product: Product;
  onAddSimple: (p: Product) => void;
  onAddVariant: (p: Product, subIdx: number, varIdx: number, option?: ProductOptionItem) => void;
  onAddProductVariant: (p: Product, varIdx: number, option?: ProductOptionItem) => void;
  onAddSubcategory: (p: Product, subIdx: number, option?: ProductOptionItem) => void;
  onAddWithOption: (p: Product, option: ProductOptionItem) => void;
  disabled: boolean;
  formatPrice: (amount: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(
    product.hasOptions && product.productOptions && product.productOptions.length > 0 ? 0 : null
  );

  const hasSubcategories =
    product.subcategories && product.subcategories.length > 0;
  const hasProductVariants =
    product.variants && product.variants.length > 0;
  const hasOptions = product.hasOptions && product.productOptions && product.productOptions.length > 0;

  // Check if product has meaningful variants (more than 1 variant total)
  const totalVariants = hasSubcategories
    ? product.subcategories!.reduce((sum, sub) => sum + (sub.variants?.length || 0), 0)
    : 0;

  const needsExpansion = hasOptions || hasProductVariants || (hasSubcategories && (
    product.subcategories!.length > 1 || totalVariants > 1
  ));

  const selectedOption = hasOptions && selectedOptionIdx != null
    ? product.productOptions![selectedOptionIdx]
    : undefined;

  // Get display price — show selected option price or product base price
  const dp = (() => {
    if (hasOptions && selectedOptionIdx != null) {
      const opt = product.productOptions![selectedOptionIdx];
      return {
        price: opt.price,
        discountedPrice: opt.discountedPrice,
        isDiscounted: opt.isDiscounted,
      };
    }
    if (hasOptions) {
      // No option selected yet — show min option price
      const minOpt = product.productOptions!.reduce((min: any, opt: any) => {
        const eff = opt.isDiscounted && opt.discountedPrice ? opt.discountedPrice : opt.price;
        const minEff = min.isDiscounted && min.discountedPrice ? min.discountedPrice : min.price;
        return eff < minEff ? opt : min;
      }, product.productOptions![0]);
      return {
        price: minOpt.price,
        discountedPrice: minOpt.discountedPrice,
        isDiscounted: minOpt.isDiscounted,
      };
    }
    return {
      price: product.price,
      discountedPrice: product.discountedPrice,
      isDiscounted: product.isDiscounted,
    };
  })();

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
          {hasOptions && (
            <span className="text-[10px] text-slate-400 block">
              {product.productOptions!.length} {product.optionsLabel || "option"}{product.productOptions!.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {needsExpansion ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => { setExpanded(!expanded); if (!expanded && hasOptions) setSelectedOptionIdx(0); }}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3 mr-0.5" />
            ) : (
              <ChevronDown className="h-3 w-3 mr-0.5" />
            )}
            {expanded ? "Hide" : "Select"}
          </Button>
        ) : hasProductVariants && product.variants!.length === 1 ? (
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            disabled={disabled}
            onClick={() => onAddProductVariant(product, 0)}
          >
            <Plus className="h-3 w-3 mr-0.5" />
            Add
          </Button>
        ) : hasSubcategories && totalVariants === 1 ? (
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

      {/* Expanded Options, Subcategories & Variants */}
      {expanded && (
        <div className="mt-2 border-t pt-1.5 space-y-2">
          {/* Step 1: Option selection (Size/Qty/Pack) */}
          {hasOptions && (
            <div>
              <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-1">
                {product.optionsLabel || "Select Option"}
              </p>
              <div className="flex flex-wrap gap-1">
                {product.productOptions!.map((opt, optIdx) => {
                  const optOutOfStock = opt.trackQuantity && opt.inventory <= 0;
                  const isSelected = selectedOptionIdx === optIdx;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled || optOutOfStock}
                      onClick={() => {
                        setSelectedOptionIdx(optIdx);
                        // If no subcategories and no product-level variants, add directly
                        if (!hasSubcategories && !hasProductVariants) {
                          onAddWithOption(product, opt);
                          setExpanded(false);
                          setSelectedOptionIdx(0);
                        }
                      }}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                        optOutOfStock
                          ? "opacity-40 cursor-not-allowed"
                          : isSelected
                            ? "bg-purple-100 border-purple-400 text-purple-700"
                            : "hover:bg-slate-50 border-slate-200"
                      }`}
                    >
                      {opt.title} — {formatPrice(opt.isDiscounted && opt.discountedPrice ? opt.discountedPrice : opt.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2a: Product-Level Variants (show if no options required, or option is selected) */}
          {hasProductVariants && !hasSubcategories && (!hasOptions || selectedOption) && (
            <div>
              {product.variants!.map((variant, varIdx) => {
                const outOfStock = variant.trackQuantity && variant.inventory <= 0;
                return (
                  <div
                    key={varIdx}
                    className={`flex items-center justify-between py-1 px-1.5 rounded text-[11px] ${
                      outOfStock ? "opacity-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-700 block truncate">
                        {variant.title}
                        {variant.measurement && (
                          <span className="text-slate-400 ml-1">({variant.measurement})</span>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">
                          {formatPrice(variant.isDiscounted && variant.discountedPrice ? variant.discountedPrice : variant.price)}
                        </span>
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
                      onClick={() => {
                        onAddProductVariant(product, varIdx, selectedOption);
                        setExpanded(false);
                        setSelectedOptionIdx(null);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 2b: Subcategories & Variants (show if no options required, or option is selected) */}
          {hasSubcategories && (!hasOptions || selectedOption) && (
            <div>
              {product.subcategories!.map((sub, subIdx) => (
                <div key={subIdx}>
                  {product.subcategories!.length > 1 && (
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      {sub.name}
                    </p>
                  )}

                  {/* If subcategory has no variants, show subcategory as selectable */}
                  {sub.variants.length === 0 ? (
                    <div className="flex items-center justify-between py-1 px-1.5 rounded text-[11px] hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-700">{sub.name}</span>
                        <span className="text-[10px] text-slate-400 ml-1">
                          +{formatPrice(sub.isDiscounted && sub.discountedAdditionalPrice != null ? sub.discountedAdditionalPrice : (sub.additionalPrice || 0))}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-1.5 ml-1"
                        disabled={disabled || (sub.trackQuantity && (sub.inventory || 0) <= 0)}
                        onClick={() => {
                          onAddSubcategory(product, subIdx, selectedOption);
                          setExpanded(false);
                          setSelectedOptionIdx(null);
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    /* Variants */
                    sub.variants.map((variant, varIdx) => {
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
                                <span className="text-slate-400 ml-1">({variant.measurement})</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">
                                +{formatPrice(variant.isDiscounted && variant.discountedPrice ? variant.discountedPrice : variant.price)}
                              </span>
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
                            onClick={() => {
                              onAddVariant(product, subIdx, varIdx, selectedOption);
                              setExpanded(false);
                              setSelectedOptionIdx(null);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
