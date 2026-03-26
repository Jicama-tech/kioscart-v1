import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  X,
  Plus,
  Minus,
  Package,
  DollarSign,
  Globe,
  Truck,
  ChevronDown,
} from "lucide-react";
import { ProductImageUpload } from "./ProductImageUpload";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { jwtDecode } from "jwt-decode";
import { FaDollarSign, FaRupeeSign } from "react-icons/fa";
import { BlurWrapper } from "../ui/BlurWrapper";

// Interfaces
interface ProductVariant {
  id: number;
  title: string;
  price: number;
  measurement?: string;
  description?: string;
  isDiscounted?: boolean;
  discountedPrice?: number;
  sku: string;
  inventory: number;
  trackQuantity: boolean;
  lowstockThreshold: number;
  options?: { [key: string]: string | number | boolean };
}

interface ProductSubcategory {
  id: number;
  name: string;
  description?: string;
  basePrice?: number;
  variants: ProductVariant[];
}

interface Product {
  _id?: number;
  name: string;
  description: string;
  price: number;
  measurement?: string;
  isDiscounted: boolean;
  discountedPrice?: number;
  compareAtPrice?: number;
  sku: string;
  barcode?: string;
  category: string;
  tags: string[];
  images: (string | File)[];
  // Product-level inventory (when no subcategories)
  inventory?: number;
  trackQuantity?: boolean;
  lowstockThreshold?: number;
  subcategories?: ProductSubcategory[];
  status: "active" | "draft" | "archived";
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  seo?: {
    title: string;
    description: string;
  };
}

// Main component
export function ProductForm({ product, onSave, onClose }: any) {
  const apiURL = __API_URL__;
  const navigate = useNavigate();
  const [isDiscounted, setisDiscounted] = useState(false);

  // Form state initialization with product data or default values
  const [formData, setFormData] = useState<Product>({
    name: "",
    description: "",
    discountedPrice: 0,
    price: 0,
    compareAtPrice: undefined,
    sku: "",
    barcode: "",
    category: "",
    isDiscounted: false,
    tags: [],
    images: [],
    // Product-level inventory defaults
    inventory: 0,
    trackQuantity: true,
    lowstockThreshold: 10,
    subcategories: [],
    measurement: "",
    status: "active",
    weight: undefined,
    dimensions: undefined,
    seo: {
      title: "",
      description: "",
    },
    ...product,
  });
  const [shopkeeperInfo, setShopkeeperInfo] = useState<any>(null);
  const { formatPrice, getSymbol } = useCurrency(
    shopkeeperInfo?.country || "IN",
  );
  const [newTag, setNewTag] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [collapsedVariants, setCollapsedVariants] = useState<
    Record<number, boolean>
  >({});
  const [collapsedSubcategories, setCollapsedSubcategories] = useState<
    Record<string, boolean>
  >({});

  const toggleVariants = (subcatId: number) => {
    setCollapsedVariants((prev) => ({ ...prev, [subcatId]: !prev[subcatId] }));
  };

  const toggleSubcategories = (subcatName: string) => {
    setCollapsedSubcategories((prev) => ({
      ...prev,
      [subcatName]: !prev[subcatName],
    }));
  };

  useEffect(() => {
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
  }, [apiURL]);

  // Categories for selection
  const categories = [
    "Apparel",
    "Drinkware",
    "Accessories",
    "Electronics",
    "Sports & Recreation",
    "Art & Crafts",
    "Food & Beverage",
    "Other",
  ];

  // Status options
  const statusOptions = [
    { value: "active", label: "Active" },
    { value: "draft", label: "Draft" },
    { value: "archived", label: "Archived" },
  ];

  // Track Quantity options
  const trackQuantityOptions = [
    { value: true, label: "Yes" },
    { value: false, label: "No" },
  ];

  // Keep seo.title synced with product name if empty
  useEffect(() => {
    if (formData.name && (!formData.seo?.title || formData.seo.title === "")) {
      setFormData((prev) => ({
        ...prev,
        seo: {
          ...prev.seo,
          title: formData.name,
        },
      }));
    }
  }, [formData.name]);

  // Basic field changes
  const handleInputChange = (field: keyof Product, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "isDiscounted" && value === true) {
      setisDiscounted(true);
    }
    if (field === "isDiscounted" && value === false) {
      setisDiscounted(false);
    }
  };

  // Nested field changes for seo, dimensions
  const handleNestedInputChange = (
    parent: "seo" | "dimensions",
    field: string,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: {
        ...(prev[parent] || {}),
        [field]: value,
      },
    }));
  };

  // Tag input handlers
  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Subcategory handlers
  const handleAddSubcategory = () => {
    setFormData((prev) => ({
      ...prev,
      subcategories: [
        ...(prev.subcategories || []),
        {
          id: Date.now(),
          name: "",
          description: "",
          variants: [],
        },
      ],
    }));
  };

  const handleRemoveSubcategory = (index: number) => {
    setFormData((prev) => {
      const newSubs = [...(prev.subcategories || [])];
      newSubs.splice(index, 1);
      return {
        ...prev,
        subcategories: newSubs,
      };
    });
  };

  const handleSubcategoryChange = (
    index: number,
    field: keyof ProductSubcategory,
    value: any,
  ) => {
    setFormData((prev) => {
      if (!prev.subcategories) return prev;
      const newSubs = [...prev.subcategories];
      newSubs[index] = { ...newSubs[index], [field]: value };
      return { ...prev, subcategories: newSubs };
    });
  };

  // Variant handlers inside subcategories
  const handleAddVariant = (subIndex: number) => {
    setFormData((prev) => {
      if (!prev.subcategories) return prev;
      const newSubs = [...prev.subcategories];
      const newVariant: ProductVariant = {
        id: Date.now(),
        title: "",
        price: newSubs[subIndex].basePrice || prev.price,
        sku: `${prev.sku || "SKU"}-VAR-${
          newSubs[subIndex].variants.length + 1
        }`,
        trackQuantity: true,
        lowstockThreshold: 10,
        inventory: 0,
        options: {},
      };
      newSubs[subIndex].variants = [...newSubs[subIndex].variants, newVariant];
      return { ...prev, subcategories: newSubs };
    });
  };

  const handleRemoveVariant = (subIndex: number, varIndex: number) => {
    setFormData((prev) => {
      if (!prev.subcategories) return prev;
      const newSubs = [...prev.subcategories];
      newSubs[subIndex].variants.splice(varIndex, 1);
      return { ...prev, subcategories: newSubs };
    });
  };

  const handleVariantChange = (
    subIndex: number,
    varIndex: number,
    field: keyof ProductVariant,
    value: any,
  ) => {
    setFormData((prev) => {
      if (!prev.subcategories) return prev;
      const newSubs = [...prev.subcategories];
      const variants = [...newSubs[subIndex].variants];
      variants[varIndex] = { ...variants[varIndex], [field]: value };
      newSubs[subIndex].variants = variants;
      return { ...prev, subcategories: newSubs };
    });
  };

  const handleVariantOptionChange = (
    subIndex: number,
    varIndex: number,
    optionKey: string,
    value: string | boolean | number,
  ) => {
    setFormData((prev) => {
      if (!prev.subcategories) return prev;

      const newSubs = [...prev.subcategories];
      const variants = [...newSubs[subIndex].variants];
      const variant = { ...variants[varIndex] };
      variant.options = { ...(variant.options || {}), [optionKey]: value };
      variants[varIndex] = variant;
      newSubs[subIndex] = { ...newSubs[subIndex], variants };

      return { ...prev, subcategories: newSubs };
    });
  };

  // SKU generator for product SKU
  const generateSKU = () => {
    const prefix = formData.category
      ? formData.category.substring(0, 3).toUpperCase()
      : "PRD";
    const timestamp = Date.now().toString().slice(-6);
    const sku = `${prefix}-${timestamp}`;
    handleInputChange("sku", sku);
  };

  // Image handling with 3-image limit
  const handleImagesChange = (newImages: (string | File)[]) => {
    const limitedImages = newImages.slice(0, 3);
    setFormData((prev) => ({
      ...prev,
      images: limitedImages,
    }));
  };

  // Check if subcategories exist
  const hasSubcategories =
    formData.subcategories && formData.subcategories.length > 0;

  // Validation
  const isValid = formData.name && formData.category && formData.sku;

  const showDiscount = isDiscounted || formData.isDiscounted;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        alert("You must be logged in");
        setIsSubmitting(false);
        return;
      }

      // Separate existing URLs and new files from the single images array
      const existingImageUrls = formData.images.filter(
        (img) => typeof img === "string",
      ) as string[];
      const newFiles = formData.images.filter(
        (img) => img instanceof File,
      ) as File[];

      // Validate image limit
      if (existingImageUrls.length + newFiles.length > 3) {
        toast({
          duration: 5000,
          title: "Too Many Images",
          description: "Maximum 3 images are allowed per product",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Build productData matching your schema
      const productData = {
        ...formData,
        images: existingImageUrls,
        // Include product-level inventory only if no subcategories
        inventory: hasSubcategories ? undefined : formData.inventory,
        trackQuantity: hasSubcategories ? undefined : formData.trackQuantity,
        lowstockThreshold: hasSubcategories
          ? undefined
          : formData.lowstockThreshold,
        subcategories: formData.subcategories || [],
        weight: formData.weight || undefined,
      };

      const form = new FormData();
      form.append("product", JSON.stringify(productData));

      // Append new files for multi-part upload (max 3)
      for (const file of newFiles.slice(0, 3)) {
        form.append("images", file);
      }

      const method = product?._id ? "PATCH" : "POST";
      const url = product?._id
        ? `${apiURL}/products/${String(product._id)}`
        : `${apiURL}/products/create-product`;

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save product");
      }

      const saved = await res.json();
      const productName =
        saved.data?.name || saved.name || formData.name || "Product";
      toast({
        duration: 5000,
        title: product?._id ? "Product Updated" : "Product Added",
        description: product?._id
          ? `${productName} updated successfully`
          : `${productName} created successfully`,
      });

      onSave(saved);

      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-white pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {product ? "Edit Product" : "Add New Product"}
          </h3>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting
                ? "Saving..."
                : product
                  ? "Update Product"
                  : "Save Product"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="sticky top-12 z-20 grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="images">Images (Max 3)</TabsTrigger>
          <TabsTrigger value="shipping">Shipping</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        {/* Basic Information */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="Enter product name"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => handleInputChange("category", v)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  placeholder="Describe your product..."
                  rows={4}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => handleInputChange("sku", e.target.value)}
                      placeholder="Product SKU"
                      disabled={isSubmitting}
                    />
                    <Button
                      type="button"
                      variant="buttonOutline"
                      onClick={generateSKU}
                      disabled={isSubmitting}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    value={formData.barcode || ""}
                    onChange={(e) =>
                      handleInputChange("barcode", e.target.value)
                    }
                    placeholder="Product barcode"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="Enter price"
                    value={formData.price}
                    onChange={(e) =>
                      handleInputChange(
                        "price",
                        parseFloat(e.target.value) || 0
                      )
                    }
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="compareAtPrice">Compare At Price</Label>
                  <Input
                    id="compareAtPrice"
                    type="number"
                    step="0.01"
                    placeholder="Original price"
                    value={formData.compareAtPrice || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "compareAtPrice",
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div> */}

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleInputChange("status", value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product-level inventory (only shown when no subcategories) */}
              {!hasSubcategories && (
                <Card>
                  <CardHeader>
                    <CardTitle>Price & Inventory Management</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      {/* First Row: Price and Unit */}
                      <div className="flex gap-4">
                        {/* Price Field (Half Width) */}
                        <div className="flex-1 space-y-2">
                          <label className="text-sm font-medium flex items-center gap-1">
                            Price (
                            {shopkeeperInfo?.country === "IN" ? (
                              <FaRupeeSign className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <FaDollarSign className="h-3 w-3 text-muted-foreground" />
                            )}
                            )
                          </label>
                          <Input
                            id="price"
                            type="text"
                            inputMode="decimal"
                            placeholder="Enter price"
                            value={formData.price ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "" || /^\d*\.?\d*$/.test(value)) {
                                handleInputChange("price", value);
                              }
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            disabled={isSubmitting}
                          />
                          {/* Optional: Keep this info text if needed, or remove to save space */}
                          <p className="text-[10px] text-gray-500 leading-tight">
                            Handled per variant if subcategory is selected.
                          </p>
                        </div>

                        {/* Unit Field (Half Width) */}
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="product-measurement">Unit</Label>
                          <Input
                            id="product-measurement"
                            placeholder="e.g. kg, pc, Unit"
                            value={formData.measurement}
                            onChange={(e) =>
                              handleInputChange("measurement", e.target.value)
                            }
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      {/* Second Row: Toggle and Discounted Price */}
                      <div className="flex gap-4 items-start">
                        {/* Toggle Section (Half Width) */}
                        <div className="flex-1 flex items-center gap-3 h-10 mt-6">
                          <Switch
                            id="discountToggle"
                            checked={formData.isDiscounted}
                            onCheckedChange={(checked) =>
                              handleInputChange("isDiscounted", checked)
                            }
                            disabled={isSubmitting}
                          />
                          <label
                            htmlFor="discountToggle"
                            className="text-sm text-gray-700 cursor-pointer"
                          >
                            Add discounted price
                          </label>
                        </div>

                        {/* Discounted Price Field (Half Width - only shows if showDiscount is true) */}
                        <div className="flex-1">
                          {showDiscount && (
                            <div className="space-y-2">
                              <label className="text-sm font-medium flex items-center gap-1">
                                Discounted Price (
                                {shopkeeperInfo?.country === "IN" ? (
                                  <FaRupeeSign className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <FaDollarSign className="h-3 w-3 text-muted-foreground" />
                                )}
                                )
                              </label>
                              <Input
                                id="discountedPrice"
                                type="text"
                                inputMode="decimal"
                                placeholder="Discounted price"
                                value={formData.discountedPrice ?? ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (
                                    value === "" ||
                                    /^\d*\.?\d*$/.test(value)
                                  ) {
                                    handleInputChange("discountedPrice", value);
                                  }
                                }}
                                onWheel={(e) => e.currentTarget.blur()}
                                disabled={isSubmitting}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="trackQuantity">Track quantity</Label>
                      <Switch
                        id="trackQuantity"
                        checked={formData.trackQuantity}
                        onCheckedChange={(checked) =>
                          handleInputChange("trackQuantity", checked)
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    {formData.trackQuantity && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="inventory">Quantity</Label>
                            <Input
                              id="inventory"
                              type="text"
                              inputMode="numeric"
                              placeholder="0"
                              value={
                                formData.inventory === 0
                                  ? ""
                                  : formData.inventory
                              }
                              onChange={(e) => {
                                const value = e.target.value;

                                if (value === "") {
                                  handleInputChange("inventory", 0);
                                  return;
                                }

                                if (/^\d+$/.test(value)) {
                                  handleInputChange(
                                    "inventory",
                                    parseInt(value, 10),
                                  );
                                }
                              }}
                              onWheel={(e) => e.currentTarget.blur()}
                              disabled={isSubmitting}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lowstockThreshold">
                              Low Stock Threshold
                            </Label>
                            <Input
                              id="lowstockThreshold"
                              type="text"
                              inputMode="numeric"
                              placeholder="10"
                              value={
                                formData.lowstockThreshold === 0
                                  ? ""
                                  : formData.lowstockThreshold
                              }
                              onChange={(e) => {
                                const value = e.target.value;

                                if (value === "") {
                                  handleInputChange("lowstockThreshold", 0);
                                  return;
                                }

                                if (/^\d+$/.test(value)) {
                                  handleInputChange(
                                    "lowstockThreshold",
                                    parseInt(value, 10),
                                  );
                                }
                              }}
                              onWheel={(e) => e.currentTarget.blur()}
                              disabled={isSubmitting}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Subcategories & Variants Section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <Label className="text-lg font-semibold">
                    Subcategories & Variants (Optional)
                  </Label>
                  <Button
                    type="button"
                    variant="buttonOutline"
                    onClick={handleAddSubcategory}
                    disabled={isSubmitting}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Subcategory
                  </Button>
                </div>

                {hasSubcategories && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> When subcategories are added,
                      inventory management is handled at the variant level.
                    </p>
                  </div>
                )}

                {(formData.subcategories || []).map((subcat, si) => {
                  const variantsOpen = collapsedVariants[subcat.id] ?? false;
                  const subcatOpen = collapsedSubcategories[subcat.id] ?? true;

                  return (
                    <Card key={subcat.id} className="mb-4">
                      {/* Subcategory Collapsible Header */}
                      <CardHeader className="p-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedSubcategories((prev) => ({
                              ...prev,
                              [subcat.id]: !prev[subcat.id],
                            }))
                          }
                          className="flex items-center justify-between w-full px-6 py-4 text-left group"
                        >
                          <div className="flex items-center gap-3">
                            <CardTitle>
                              {subcat.name || `Subcategory ${si + 1}`}
                            </CardTitle>
                            {subcat.variants.length > 0 && (
                              <span className="text-xs bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">
                                {subcat.variants.length} variant
                                {subcat.variants.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="buttonOutline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveSubcategory(si);
                              }}
                              disabled={isSubmitting}
                              title="Remove subcategory"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <ChevronDown
                              className={`h-6 w-6 text-muted-foreground transition-transform duration-200 ${
                                subcatOpen ? "rotate-180" : "rotate-0"
                              }`}
                            />
                          </div>
                        </button>
                      </CardHeader>

                      {/* Collapsed summary */}
                      {!subcatOpen && (
                        <div className="px-6 pb-4">
                          {subcat.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {subcat.description}
                            </p>
                          )}
                          {subcat.variants.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {subcat.variants.map((v, vi) => (
                                <span
                                  key={v.id}
                                  className="inline-flex items-center gap-1 text-xs bg-muted border rounded-full px-2.5 py-1 text-muted-foreground"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                  {v.title || `Variant ${vi + 1}`}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Expanded Content */}
                      {subcatOpen && (
                        <CardContent className="space-y-3">
                          <Input
                            placeholder="Subcategory name"
                            value={subcat.name}
                            onChange={(e) =>
                              handleSubcategoryChange(
                                si,
                                "name",
                                e.target.value,
                              )
                            }
                            disabled={isSubmitting}
                          />
                          <Textarea
                            placeholder="Subcategory description"
                            value={subcat.description}
                            onChange={(e) =>
                              handleSubcategoryChange(
                                si,
                                "description",
                                e.target.value,
                              )
                            }
                            rows={2}
                            disabled={isSubmitting}
                          />

                          {/* Variants Section */}
                          <div className="mt-3">
                            {/* Variants Header with collapse toggle */}
                            <button
                              type="button"
                              onClick={() => toggleVariants(subcat.id)}
                              className="flex items-center gap-2 w-full text-left group mb-2"
                            >
                              <span className="text-sm font-medium">
                                Variants
                              </span>
                              {subcat.variants.length > 0 && (
                                <span className="text-xs bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded-full">
                                  {subcat.variants.length}
                                </span>
                              )}
                              <div className="flex-1 h-px bg-border mx-1" />
                              <ChevronDown
                                className={`h-6 w-6 text-muted-foreground transition-transform duration-200 ${
                                  variantsOpen ? "rotate-180" : "rotate-0"
                                }`}
                              />
                            </button>

                            {/* Collapsed summary pill row */}
                            {!variantsOpen && subcat.variants.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {subcat.variants.map((v, vi) => (
                                  <span
                                    key={v.id}
                                    className="inline-flex items-center gap-1 text-xs bg-muted border rounded-full px-2.5 py-1 text-muted-foreground"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                                    {v.title || `Variant ${vi + 1}`}
                                  </span>
                                ))}
                              </div>
                            )}

                            {!variantsOpen && subcat.variants.length === 0 && (
                              <p className="text-muted-foreground text-sm mb-2">
                                No variants added yet.
                              </p>
                            )}

                            {/* Expanded variants */}
                            {variantsOpen && (
                              <div className="mt-1">
                                {subcat.variants.length === 0 && (
                                  <p className="text-muted-foreground text-sm">
                                    No variants added yet.
                                  </p>
                                )}
                                {subcat.variants.map((variant, vi) => (
                                  <Card
                                    key={variant.id}
                                    className="p-4 mb-3 border rounded"
                                  >
                                    <div className="flex justify-between items-center mb-3">
                                      <span>
                                        Variant {vi + 1} -{" "}
                                        {variant.title || "(No title)"}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          handleRemoveVariant(si, vi)
                                        }
                                        disabled={isSubmitting}
                                        title="Remove variant"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <Label htmlFor={`variant-title-${vi}`}>
                                          Title
                                        </Label>
                                        <Input
                                          id={`variant-title-${vi}`}
                                          placeholder="Variant title"
                                          value={variant.title}
                                          onChange={(e) =>
                                            handleVariantChange(
                                              si,
                                              vi,
                                              "title",
                                              e.target.value,
                                            )
                                          }
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor={`variant-sku-${vi}`}>
                                          SKU
                                        </Label>
                                        <Input
                                          id={`variant-sku-${vi}`}
                                          placeholder="SKU"
                                          value={variant.sku}
                                          onChange={(e) =>
                                            handleVariantChange(
                                              si,
                                              vi,
                                              "sku",
                                              e.target.value,
                                            )
                                          }
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                      <div className="w-full col-span-2">
                                        <Label
                                          htmlFor={`variant-description-${vi}`}
                                        >
                                          Description
                                        </Label>
                                        <Textarea
                                          id={`variant-description-${vi}`}
                                          placeholder="Variant description"
                                          value={variant.description}
                                          onChange={(e) =>
                                            handleVariantChange(
                                              si,
                                              vi,
                                              "description",
                                              e.target.value,
                                            )
                                          }
                                          rows={2}
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                      <div className="space-y-4 md:col-span-2">
                                        <div className="flex gap-4">
                                          <div className="flex-1 space-y-2">
                                            <Label
                                              htmlFor={`variant-price-${vi}`}
                                            >
                                              Price
                                            </Label>
                                            <Input
                                              id={`variant-price-${vi}`}
                                              type="text"
                                              inputMode="decimal"
                                              placeholder="Price"
                                              value={variant.price ?? ""}
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                if (
                                                  value === "" ||
                                                  /^\d*\.?\d*$/.test(value)
                                                ) {
                                                  handleVariantChange(
                                                    si,
                                                    vi,
                                                    "price",
                                                    value,
                                                  );
                                                }
                                              }}
                                              onWheel={(e) =>
                                                e.currentTarget.blur()
                                              }
                                              disabled={isSubmitting}
                                            />
                                          </div>
                                          <div className="flex-1 space-y-2">
                                            <Label
                                              htmlFor={`variant-measurement-${vi}`}
                                            >
                                              Unit
                                            </Label>
                                            <Input
                                              id={`variant-measurement-${vi}`}
                                              placeholder="e.g. kg, pc"
                                              value={variant.measurement}
                                              onChange={(e) =>
                                                handleVariantChange(
                                                  si,
                                                  vi,
                                                  "measurement",
                                                  e.target.value,
                                                )
                                              }
                                              disabled={isSubmitting}
                                            />
                                          </div>
                                        </div>
                                        <div className="flex gap-4 items-start">
                                          <div className="flex-1 flex items-center gap-2 h-10 mt-6">
                                            <Switch
                                              id={`variant-discount-toggle-${vi}`}
                                              checked={variant.isDiscounted}
                                              onCheckedChange={(checked) =>
                                                handleVariantChange(
                                                  si,
                                                  vi,
                                                  "isDiscounted",
                                                  checked,
                                                )
                                              }
                                              disabled={isSubmitting}
                                            />
                                            <label
                                              htmlFor={`variant-discount-toggle-${vi}`}
                                              className="text-sm text-muted-foreground cursor-pointer"
                                            >
                                              Add discounted price
                                            </label>
                                          </div>
                                          <div className="flex-1">
                                            {variant.isDiscounted && (
                                              <div className="space-y-2">
                                                <Label
                                                  htmlFor={`variant-discountedPrice-${vi}`}
                                                >
                                                  Discounted Price
                                                </Label>
                                                <Input
                                                  id={`variant-discountedPrice-${vi}`}
                                                  type="text"
                                                  inputMode="decimal"
                                                  placeholder="Discounted price"
                                                  value={
                                                    variant.discountedPrice ??
                                                    ""
                                                  }
                                                  onChange={(e) => {
                                                    const value =
                                                      e.target.value;
                                                    if (
                                                      value === "" ||
                                                      /^\d*\.?\d*$/.test(value)
                                                    ) {
                                                      handleVariantChange(
                                                        si,
                                                        vi,
                                                        "discountedPrice",
                                                        value,
                                                      );
                                                    }
                                                  }}
                                                  onWheel={(e) =>
                                                    e.currentTarget.blur()
                                                  }
                                                  disabled={isSubmitting}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <Label
                                          htmlFor={`variant-trackQuantity-${vi}`}
                                        >
                                          Track Quantity
                                        </Label>
                                        <Select
                                          value={
                                            variant.trackQuantity
                                              ? "true"
                                              : "false"
                                          }
                                          onValueChange={(value) =>
                                            handleVariantChange(
                                              si,
                                              vi,
                                              "trackQuantity",
                                              value === "true",
                                            )
                                          }
                                          disabled={isSubmitting}
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="true">
                                              Yes
                                            </SelectItem>
                                            <SelectItem value="false">
                                              No
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {variant.trackQuantity && (
                                        <>
                                          <div className="space-y-2">
                                            <Label
                                              htmlFor={`variant-inventory-${vi}`}
                                            >
                                              Inventory
                                            </Label>
                                            <Input
                                              id={`variant-inventory-${vi}`}
                                              type="text"
                                              inputMode="numeric"
                                              placeholder="Inventory"
                                              value={
                                                variant.inventory === 0
                                                  ? ""
                                                  : variant.inventory
                                              }
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === "") {
                                                  handleVariantChange(
                                                    si,
                                                    vi,
                                                    "inventory",
                                                    0,
                                                  );
                                                  return;
                                                }
                                                if (/^\d+$/.test(value))
                                                  handleVariantChange(
                                                    si,
                                                    vi,
                                                    "inventory",
                                                    parseInt(value, 10),
                                                  );
                                              }}
                                              onWheel={(e) =>
                                                e.currentTarget.blur()
                                              }
                                              disabled={isSubmitting}
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label
                                              htmlFor={`lowstockThreshold-${vi}`}
                                            >
                                              Low Stock Threshold
                                            </Label>
                                            <Input
                                              id={`lowstockThreshold-${vi}`}
                                              type="text"
                                              inputMode="numeric"
                                              placeholder="Low Stock Threshold"
                                              value={
                                                variant.lowstockThreshold === 0
                                                  ? ""
                                                  : variant.lowstockThreshold
                                              }
                                              onChange={(e) => {
                                                const value = e.target.value;
                                                if (value === "") {
                                                  handleVariantChange(
                                                    si,
                                                    vi,
                                                    "lowstockThreshold",
                                                    0,
                                                  );
                                                  return;
                                                }
                                                if (/^\d+$/.test(value))
                                                  handleVariantChange(
                                                    si,
                                                    vi,
                                                    "lowstockThreshold",
                                                    parseInt(value, 10),
                                                  );
                                              }}
                                              onWheel={(e) =>
                                                e.currentTarget.blur()
                                              }
                                              disabled={isSubmitting}
                                            />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}

                            <Button
                              type="button"
                              variant="buttonOutline"
                              onClick={() => {
                                handleAddVariant(si);
                                setCollapsedVariants((prev) => ({
                                  ...prev,
                                  [subcat.id]: true,
                                }));
                              }}
                              disabled={isSubmitting}
                              className="mt-1"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Variant
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>

              <div className="space-y-2 mt-4">
                <Label>Tags</Label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {formData.tags?.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                        disabled={isSubmitting}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={handleTagKeyPress}
                    placeholder="Add a tag..."
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="buttonOutline"
                    onClick={handleAddTag}
                    disabled={isSubmitting}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product Images (Maximum 3)</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductImageUpload
                images={formData.images}
                onImagesChange={handleImagesChange}
                maxImages={3}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Upload up to 3 high-quality images of your product. The first
                image will be used as the main product image.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping">
          <BlurWrapper>
            <Card>
              <CardHeader>
                <CardTitle>Shipping Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    value={formData.weight || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "weight",
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    disabled={isSubmitting}
                  />
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label>Dimensions (inches)</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="length">Length</Label>
                      <Input
                        id="length"
                        type="number"
                        step="0.1"
                        value={formData.dimensions?.length || ""}
                        onChange={(e) =>
                          handleNestedInputChange(
                            "dimensions",
                            "length",
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          )
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="width">Width</Label>
                      <Input
                        id="width"
                        type="number"
                        step="0.1"
                        value={formData.dimensions?.width || ""}
                        onChange={(e) =>
                          handleNestedInputChange(
                            "dimensions",
                            "width",
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          )
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height</Label>
                      <Input
                        id="height"
                        type="number"
                        step="0.1"
                        value={formData.dimensions?.height || ""}
                        onChange={(e) =>
                          handleNestedInputChange(
                            "dimensions",
                            "height",
                            e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          )
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </BlurWrapper>
        </TabsContent>

        <TabsContent value="seo">
          <BlurWrapper>
            <Card>
              <CardHeader>
                <CardTitle>Search Engine Optimization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="seoTitle">SEO Title</Label>
                  <Input
                    id="seoTitle"
                    value={formData.seo?.title || ""}
                    onChange={(e) =>
                      handleNestedInputChange("seo", "title", e.target.value)
                    }
                    placeholder="Optimized title for search engines"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    {(formData.seo?.title || "").length}/60 characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seoDescription">SEO Description</Label>
                  <Textarea
                    id="seoDescription"
                    value={formData.seo?.description || ""}
                    onChange={(e) =>
                      handleNestedInputChange(
                        "seo",
                        "description",
                        e.target.value,
                      )
                    }
                    placeholder="Brief description for search engine results"
                    rows={3}
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    {(formData.seo?.description || "").length}/160 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </BlurWrapper>
        </TabsContent>
      </Tabs>
    </div>
  );
}
