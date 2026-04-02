export interface ProductOption {
  id: number;
  title: string;
  price: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
  inventory: number;
  trackQuantity: boolean;
  lowstockThreshold?: number;
}

export interface ProductVariant {
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
  trackQuantity: boolean;
  lowstockThreshold?: number;
  options?: Record<string, any>;
}

export interface ProductSubcategory {
  id: number;
  name: string;
  description?: string;
  basePrice?: number;
  additionalPrice?: number;
  isDiscounted?: boolean;
  discountedAdditionalPrice?: number;
  inventory?: number;
  trackQuantity?: boolean;
  lowstockThreshold?: number;
  variants: ProductVariant[];
}

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  measurement?: string;
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
  productOptions?: ProductOption[];
  subcategories?: ProductSubcategory[];
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  inventory?: number;
  lowstockThreshold?: number;
  trackQuantity?: boolean;
  shopkeeperId: string;
  createdAt?: string;
  updatedAt?: string;
}
