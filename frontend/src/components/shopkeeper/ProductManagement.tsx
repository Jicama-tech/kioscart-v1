import { useEffect, useState, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { useSubscription } from "@/context/SubscriptionContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ProductForm } from "./ProductForm";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Upload,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  TrendingUp,
  Grid3x3,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Warehouse,
  Truck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { jwtDecode } from "jwt-decode";

// Per-product supplier quotations (requirements + link + quotations table),
// ported from eventsh-v1's MyEvents "manage suppliers" dialog.
const SupplierRequests = lazy(
  () => import("./SupplierRequests"),
);

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

interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
  sku: string;
  barcode?: string;
  category: string;
  status: "active" | "draft" | "archived";
  images: string[];
  tags: string[];
  hasOptions?: boolean;
  optionsLabel?: string;
  productOptions?: ProductOptionItem[];
  subcategories: ProductSubcategory[];
  variants?: ProductVariant[];
  inventory: number;
  lowstockThreshold: number;
  trackQuantity: boolean;
  shopkeeperId: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

interface ProductSubcategory {
  id: number;
  name: string;
  description?: string;
  additionalPrice?: number;
  isDiscounted?: boolean;
  discountedAdditionalPrice?: number;
  inventory?: number;
  trackQuantity?: boolean;
  lowstockThreshold?: number;
  variants: ProductVariant[];
}

interface ProductVariant {
  id: number;
  title: string;
  price: number;
  measurement?: string;
  isDiscounted?: boolean;
  discountedPrice?: number;
  sku: string;
  trackQuantity: boolean;
  lowstockThreshold?: number;
  inventory: number;
}

const categories = [
  "Apparel",
  "Drinkware",
  "Accessories",
  "Electronics",
  "Home & Garden",
  "Sports & Recreation",
  "Books",
  "Art & Crafts",
  "Food & Beverage",
  "Other",
];

interface ProductManagementProps {
  /**
   * Optional request from the chat bot / dashboard to open a specific sub-UI
   * on mount (Add form, or Edit form for a named product). The `key` makes
   * repeated identical requests re-fire the effect.
   */
  pendingAction?: {
    action: "add" | "edit";
    productName?: string;
    key: number;
  } | null;
  onPendingActionConsumed?: () => void;
}

export function ProductManagement({
  pendingAction,
  onPendingActionConsumed,
}: ProductManagementProps = {}) {
  const { subscription } = useSubscription();
  const productLimit = subscription?.modules?.products?.limit || 0;
  const apiURL = __API_URL__;
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "list" = the product table/filters screen; "form" = the full-screen
  // Add/Edit Product view (replaces the old Dialog — matches the
  // singadvisor convention of entity forms getting their own screen).
  const [view, setView] = useState<"list" | "form">("list");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const [shopkeeperInfo, setShopkeeperInfo] = useState<any>(null);
  // Which product's supplier quotations dialog is open (null = closed).
  const [suppliersProduct, setSuppliersProduct] = useState<Product | null>(
    null,
  );
  const { formatPrice, getSymbol } = useCurrency(
    shopkeeperInfo?.country || "IN",
  );

  // Excel Import/Export states
  const [importLoading, setImportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tree expansion state
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  );
  const [expandedSubcategories, setExpandedSubcategories] = useState<
    Set<string>
  >(new Set());

  // Helper function to get proper image URL
  const getImageUrl = (imagePath: string) => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    return `${apiURL}${imagePath}`;
  };

  // Tree expansion handlers
  const toggleProductExpansion = (productId: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
      // Also collapse all subcategories of this product
      const subcatKeys = Array.from(expandedSubcategories).filter((key) =>
        key.startsWith(`${productId}-`),
      );
      const newExpandedSubcats = new Set(expandedSubcategories);
      subcatKeys.forEach((key) => newExpandedSubcats.delete(key));
      setExpandedSubcategories(newExpandedSubcats);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const toggleSubcategoryExpansion = (
    productId: string,
    subcategoryId: number,
  ) => {
    const key = `${productId}-${subcategoryId}`;
    const newExpanded = new Set(expandedSubcategories);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSubcategories(newExpanded);
  };

  // Fetch products from API
  useEffect(() => {
    async function fetchProducts() {
      const token = sessionStorage.getItem("token");
      if (!token) {
        setError("You must be logged in to view your products");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiURL}/products/shopkeeper-products`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Failed to fetch products");

        const data = await response.json();
        setProducts(data.data);
      } catch (err: any) {
        setError(err.message || "Error fetching products");
        toast({
          duration: 5000,
          title: "Error",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    async function fetchShopkeeperInfo() {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) return;

        const decoded: any = jwtDecode(token);
        const shopkeeperId = decoded.sub;

        const res = await fetch(
          `${apiURL}/shopkeepers/shopkeeper-detail/${shopkeeperId}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (res.ok) {
          const data = await res.json();
          setShopkeeperInfo(data.data);
        }
      } catch (error) {
        console.error("Error fetching shopkeeper info:", error);
      }
    }
    fetchShopkeeperInfo();

    fetchProducts();
  }, [shouldRefresh, apiURL, toast]);

  // Filter logic
  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;
    const matchesStatus =
      statusFilter === "all" || product.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  }), [products, searchQuery, categoryFilter, statusFilter]);

  // Calculate statistics
  const { lowStockCount, totalStock } = useMemo(() => {
    const lowStockCount = products.filter((product) => {
      // Check product-level variants
      if (product.variants && product.variants.length > 0) {
        return product.variants.some(
          (variant) => variant.inventory <= (variant.lowstockThreshold || 10),
        );
      }
      // Check if product has subcategories and variants
      if (product.subcategories && product.subcategories.length > 0) {
        return product.subcategories.some((subcat) =>
          subcat.variants.some(
            (variant) => variant.inventory <= (variant.lowstockThreshold || 10),
          ),
        );
      }
      // Check main product inventory
      return product.inventory <= product.lowstockThreshold;
    }).length;

    const totalStock = products.reduce((total, product) => {
      // Add main product stock (if exists)
      total += product.inventory || 0;

      // Add product-level variant stock
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant) => {
          total += variant.inventory || 0;
        });
      }

      // Add all variant stock from subcategories
      if (product.subcategories && product.subcategories.length > 0) {
        product.subcategories.forEach((subcat) => {
          if (subcat.variants && subcat.variants.length > 0) {
            subcat.variants.forEach((variant) => {
              total += variant.inventory || 0;
            });
          }
        });
      }

      return total;
    }, 0);

    return { lowStockCount, totalStock };
  }, [products]);

  // Handler functions
  const handleUpdateProduct = async (
    id: string,
    updatedProduct: Partial<Product>,
  ) => {
    const token = sessionStorage.getItem("token");
    try {
      const response = await fetch(`${apiURL}/products/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updatedProduct),
      });

      if (!response.ok) {
        throw new Error("Failed to update product");
      }

      toast({
        duration: 5000,
        title: "Product updated",
        description: `${updatedProduct.name || "Product"} updated.`,
      });
      setShouldRefresh((prev) => !prev);
      setEditingProduct(null);
      setView("list");
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Error updating product",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    }
  };

  const handleProductSave = async (savedProduct: any) => {
    try {
      setShouldRefresh((prev) => !prev);
      toast({
        duration: 5000,
        title: "Product added",
        description: "Product added to catalog.",
      });
    } catch (err: any) {
      toast({
        duration: 5000,
        title: "Error",
        description: err.message || "Failed to refresh products",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const token = sessionStorage.getItem("token");
    try {
      const response = await fetch(`${apiURL}/products/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete product");
      }

      toast({
        duration: 5000,
        title: "Product deleted",
        description: "Product deleted from catalog.",
      });
      setShouldRefresh((prev) => !prev);
      setSelectedProducts([]);
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Error deleting product",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    }
  };

  const openAddDialog = () => {
    setEditingProduct(null);
    setView("form");
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setView("form");
  };

  const closeDialog = () => {
    setView("list");
    setEditingProduct(null);
  };

  // Chat-driven entry point: when the bot says "open Add Product form" or
  // "edit product <name>", the dashboard feeds a pendingAction down. We wait
  // until products have loaded for the "edit" case so we can resolve the name
  // to an actual Product record.
  useEffect(() => {
    if (!pendingAction) return;

    if (pendingAction.action === "add") {
      openAddDialog();
      onPendingActionConsumed?.();
      return;
    }

    if (pendingAction.action === "edit") {
      if (loading) return; // wait for products to load, re-run when loading flips
      const target = pendingAction.productName?.trim().toLowerCase();
      const match = target
        ? products.find((p) => p.name?.toLowerCase() === target) ||
          products.find((p) => p.name?.toLowerCase().includes(target))
        : null;
      if (match) {
        openEditDialog(match);
      } else {
        toast({
          duration: 5000,
          title: "Product not found",
          description: pendingAction.productName
            ? `No product matching "${pendingAction.productName}".`
            : "Tell me which product to edit.",
          variant: "destructive",
        });
      }
      onPendingActionConsumed?.();
    }
    // pendingAction.key changes on each new request so repeated identical
    // bot intents still trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction?.key, loading, products.length]);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedProducts(filteredProducts.map((p) => p._id));
    else setSelectedProducts([]);
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    if (checked) setSelectedProducts((prev) => [...prev, id]);
    else setSelectedProducts((prev) => prev.filter((pid) => pid !== id));
  };

  // Enhanced tree rendering function
  const renderTreeRows = (): JSX.Element[] => {
    const rows: JSX.Element[] = [];

    filteredProducts.forEach((product) => {
      const hasSubcategories =
        product.subcategories && product.subcategories.length > 0;
      const hasVariants =
        product.variants && product.variants.length > 0;
      const hasOptions = product.hasOptions && product.productOptions?.length > 0;
      const productExpanded = expandedProducts.has(product._id);

      // Main product row
      rows.push(
        <TableRow
          key={`product-${product._id}`}
          className="hover:bg-gray-50 font-medium"
        >
          <TableCell className="w-12">
            <input
              type="checkbox"
              checked={selectedProducts.includes(product._id)}
              onChange={(e) => toggleSelectOne(product._id, e.target.checked)}
            />
          </TableCell>
          <TableCell className="w-12">
            {hasSubcategories || hasVariants || hasOptions ? (
              <button
                onClick={() => toggleProductExpansion(product._id)}
                className="p-1 hover:bg-gray-200 rounded"
                aria-label={productExpanded ? "Collapse" : "Expand"}
              >
                {productExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}
          </TableCell>
          <TableCell>
            <div className="flex items-center space-x-3">
              {product.images && product.images.length > 0 ? (
                <Avatar className="w-10 h-10">
                  <AvatarImage
                    src={getImageUrl(product.images[0])}
                    alt={product.name}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                  <AvatarFallback className="bg-gray-100">
                    <Package className="w-4 h-4 text-gray-400" />
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="w-10 h-10">
                  <AvatarFallback className="bg-gray-100">
                    <Package className="w-4 h-4 text-gray-400" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                <div className="font-semibold">{product.name}</div>
                <div className="text-sm text-gray-500 line-clamp-2">
                  {product.description}
                </div>
              </div>
            </div>
          </TableCell>
          <TableCell>{product.sku}</TableCell>
          <TableCell>
            <div className="space-y-1">
              <div className="text-sm font-medium">{product.category}</div>
              {!hasSubcategories && !hasVariants && (
                <div className="flex items-center gap-2">
                  {product.isDiscounted ? (
                    <>
                      {/* Original Price (crossed) */}
                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(product.price)}
                      </span>

                      {/* Discounted Price */}
                      <span className="text-lg font-bold text-green-600">
                        {formatPrice(product.discountedPrice)}
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-green-600">
                      {formatPrice(product.price)}
                    </span>
                  )}
                </div>
              )}
              {hasVariants && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const prices = product.variants!.map((v) =>
                      v.isDiscounted && v.discountedPrice ? v.discountedPrice : v.price
                    );
                    const minPrice = Math.min(...prices);
                    const maxPrice = Math.max(...prices);
                    return (
                      <span className="text-lg font-bold text-green-600">
                        {minPrice === maxPrice
                          ? formatPrice(minPrice)
                          : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`}
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </TableCell>
          <TableCell>
            <div className="space-y-2">
              <Badge
                variant={
                  product.status === "active"
                    ? "default"
                    : product.status === "draft"
                      ? "secondary"
                      : "destructive"
                }
              >
                {product.status}
              </Badge>
              {!hasSubcategories && !hasVariants && product.trackQuantity && (
                <div className="flex items-center space-x-1 text-sm">
                  <span>Stock: {product.inventory}</span>
                  {product.trackQuantity &&
                    product.inventory <= product.lowstockThreshold && (
                      <Badge variant="destructive" className="text-xs">
                        Low
                      </Badge>
                    )}
                </div>
              )}
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              {product.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="buttonOutline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {product.tags.length > 2 && (
                <Badge variant="buttonOutline" className="text-xs">
                  +{product.tags.length - 2}
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell>
            <div className="flex items-center space-x-2">
              <Button
                variant="buttonOutline"
                size="sm"
                onClick={() => openEditDialog(product)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="buttonOutline"
                size="sm"
                onClick={() => setSuppliersProduct(product)}
                title="Manage suppliers"
              >
                <Truck className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteProduct(product._id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>,
      );

      // Option rows (Size/Quantity/Pack)
      if (hasOptions && productExpanded) {
        rows.push(
          <TableRow key={`options-header-${product._id}`} className="bg-purple-50/50">
            <TableCell />
            <TableCell />
            <TableCell colSpan={2} className="pl-8">
              <span className="text-sm font-semibold text-purple-700">
                {product.optionsLabel || "Options"}
              </span>
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell />
          </TableRow>,
        );
        product.productOptions?.forEach((option: any) => {
          rows.push(
            <TableRow key={`option-${product._id}-${option.id}`} className="bg-purple-50/30">
              <TableCell />
              <TableCell />
              <TableCell className="pl-12">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span className="text-sm">{option.title}</span>
                </div>
              </TableCell>
              <TableCell />
              <TableCell>
                <span className="text-sm font-semibold text-green-600">
                  {formatPrice(option.price)}
                </span>
                {option.isDiscounted && option.discountedPrice != null && (
                  <span className="ml-2 text-xs text-purple-600">
                    Sale: {formatPrice(option.discountedPrice)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {option.trackQuantity && (
                  <div className="flex items-center gap-1 text-sm">
                    <span>Stock: {option.inventory}</span>
                    {option.inventory <= (option.lowstockThreshold || 10) && (
                      <Badge variant="destructive" className="text-xs">Low</Badge>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>,
          );
        });
      }

      // Product-level variant rows
      if (hasVariants && productExpanded) {
        product.variants!.forEach((variant) => {
          const isLowStock = variant.inventory <= (variant.lowstockThreshold || 10);
          rows.push(
            <TableRow
              key={`${product._id}-var-${variant.id}`}
              className="bg-purple-50/50"
            >
              <TableCell />
              <TableCell />
              <TableCell>
                <div className="ml-8">
                  <div className="font-medium text-purple-800">{variant.title}</div>
                  {variant.measurement && (
                    <div className="text-xs text-purple-500">{variant.measurement}</div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {variant.sku || "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {variant.isDiscounted ? (
                    <>
                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(variant.price)}
                      </span>
                      <span className="text-lg font-bold text-green-600">
                        {formatPrice(variant.discountedPrice)}
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-bold text-green-600">
                      {formatPrice(variant.price)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {variant.trackQuantity && (
                  <div className="flex items-center gap-1 text-sm">
                    <span>Stock: {variant.inventory}</span>
                    {isLowStock && (
                      <Badge variant="destructive" className="text-xs">Low</Badge>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>,
          );
        });
      }

      // Subcategory and variant rows
      if (hasSubcategories && productExpanded) {
        product.subcategories.forEach((subcat) => {
          const subcatKey = `${product._id}-${subcat.id}`;
          const subcatExpanded = expandedSubcategories.has(subcatKey);

          // Subcategory row
          rows.push(
            <TableRow key={subcatKey}>
              <TableCell />
              <TableCell>
                <button
                  onClick={() =>
                    toggleSubcategoryExpansion(product._id, subcat.id)
                  }
                  className="p-1 hover:bg-blue-200 rounded ml-4"
                  aria-label={subcatExpanded ? "Collapse" : "Expand"}
                >
                  {subcatExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </TableCell>
              <TableCell>
                <div className="ml-8">
                  <div className="font-semibold text-blue-800">
                    {subcat.name}
                  </div>
                  <div className="text-sm text-blue-600">
                    {subcat.description || "No description"}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                Subcategory
              </TableCell>
              <TableCell>
                <Badge variant="buttonOutline" className="text-blue-700">
                  {subcat.variants.length} variants
                </Badge>
              </TableCell>
              <TableCell>
                {/* <div className="text-sm text-gray-500">
                  Total Stock:{" "}
                  {subcat.variants.reduce((sum, v) => sum + v.inventory, 0)}
                </div> */}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>,
          );

          // Variant rows
          if (subcatExpanded) {
            subcat.variants.forEach((variant) => {
              const isLowStock =
                variant.inventory <= (variant.lowstockThreshold || 10);

              rows.push(
                <TableRow
                  key={`${subcatKey}-${variant.id}`}
                  className="bg-gray-50 hover:bg-gray-100"
                >
                  <TableCell />
                  <TableCell />
                  <TableCell>
                    <div className="ml-12 flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {variant.title}
                        </div>
                        <div className="text-xs text-gray-500">
                          SKU: {variant.sku}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{variant.sku}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {variant.isDiscounted ? (
                        <>
                          {/* Original Price (crossed) */}
                          <span className="text-sm text-gray-400 line-through">
                            {formatPrice(variant.price)}
                          </span>

                          {/* Discounted Price */}
                          <span className="text-lg font-bold text-green-600">
                            {formatPrice(variant.discountedPrice)}
                          </span>
                        </>
                      ) : (
                        <span className="text-lg font-bold text-green-600">
                          {formatPrice(variant.price)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {variant.trackQuantity && (
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">
                          Stock: {variant.inventory}
                        </span>

                        {variant.inventory <= variant.lowstockThreshold && (
                          <Badge variant="destructive" className="text-xs">
                            Low
                          </Badge>
                        )}
                      </div>
                    )}
                    {/* <div className="flex items-center space-x-2 mt-1">
                      <Switch checked={variant.trackQuantity} disabled />
                      <span className="text-xs text-gray-500">Track Qty</span>
                    </div> */}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      Variant
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {/* <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled
                        className="opacity-50"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                    </div> */}
                  </TableCell>
                </TableRow>,
              );
            });
          }
        });
      }
    });

    return rows;
  };

  // Download template and import handlers (keeping your existing ones)
  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const response = await fetch(
        `${apiURL}/products/excel/download-template`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = "products-template.xlsx";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          duration: 5000,
          title: "Success",
          description: "Excel template downloaded successfully!",
        });
      } else {
        throw new Error("Failed to download template");
      }
    } catch (error) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Failed to download Excel template",
        variant: "destructive",
      });
    } finally {
      setTemplateLoading(false);
    }
  };

  // Full-screen Add/Edit Product view — replaces the list entirely while
  // active, matching the singadvisor convention: entity create/edit forms
  // get their own screen, not a Dialog.
  if (view === "form") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="buttonOutline" size="sm" onClick={closeDialog}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
          <div>
            <h2 className="text-lg font-semibold">
              {editingProduct ? "Edit Product" : "Add New Product"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {editingProduct
                ? "Update product information, subcategories, and variants."
                : "Create a new product with subcategories and variants."}
            </p>
          </div>
        </div>
        <ProductForm
          product={editingProduct}
          onSave={(savedProduct: any) => {
            handleProductSave(savedProduct);
            setView("list");
            setEditingProduct(null);
          }}
          onClose={closeDialog}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="ml-2 text-sm font-medium">Total Products</span>
            </div>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="ml-2 text-sm font-medium">Active Products</span>
            </div>
            <div className="text-2xl font-bold">
              {products.filter((p) => p.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              <span className="ml-2 text-sm font-medium">Total Stock</span>
            </div>
            <div className="text-2xl font-bold">{totalStock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
              <span className="ml-2 text-sm font-medium">Categories</span>
            </div>
            <div className="text-2xl font-bold">
              {Array.from(new Set(products.map((p) => p.category))).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Product Management</CardTitle>
              <CardDescription>
                Manage your products with subcategories and variants in a tree
                structure
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* <Button
                onClick={handleDownloadTemplate}
                variant="buttonOutline"
                size="sm"
                className="flex items-center gap-2"
                disabled={templateLoading}
              >
                {templateLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download Template
              </Button>

              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="buttonOutline"
                size="sm"
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Excel
              </Button> */}

              {productLimit > 0 && products.length >= productLimit ? (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1.5">
                  <span>Limit reached ({products.length}/{productLimit}). Upgrade plan to add more.</span>
                </div>
              ) : (
                <Button onClick={openAddDialog} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                  {productLimit > 0 && (
                    <span className="ml-2 text-xs opacity-80">({products.length}/{productLimit})</span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx"
            style={{ display: "none" }}
          />

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products, SKU, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full sm:max-w-xs"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product Tree Table */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>Loading products...</p>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={
                          selectedProducts.length > 0 &&
                          selectedProducts.length === filteredProducts.length
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Product / Subcategory / Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category / Price</TableHead>
                    <TableHead>Status / Stock</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <div className="flex flex-col items-center space-y-2">
                          <Package className="w-8 h-8 text-gray-400" />
                          <p>No products found</p>
                          <p className="text-sm text-gray-500">
                            Try adjusting your search or filter criteria
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    renderTreeRows()
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manage suppliers for one product — requirements, private link, and
          incoming quotations. */}
      <Dialog
        open={!!suppliersProduct}
        onOpenChange={(o) => !o && setSuppliersProduct(null)}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Suppliers —{" "}
              {suppliersProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Set what you need, share the private link, and review incoming
              quotations for this product.
            </DialogDescription>
          </DialogHeader>
          {suppliersProduct && (
            <Suspense
              fallback={
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              }
            >
              <SupplierRequests productId={suppliersProduct._id} />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
