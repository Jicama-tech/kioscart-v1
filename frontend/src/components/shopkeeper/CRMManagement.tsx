import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Plus,
  Edit,
  Eye,
  Mail,
  Phone,
  MapPin,
  Calendar,
  MessageCircle,
  Star,
  DollarSign,
  ShoppingBag,
  Clock,
  Filter,
  Download,
  Send,
  UserPlus,
  Layers,
  Award,
  CircleCheck,
  CircleEllipsis,
  CircleX,
  FileText,
  Building,
  Upload,
  ChevronRight,
  ChevronDown,
  Edit2,
} from "lucide-react";
import { jwtDecode } from "jwt-decode";
import {
  FaAirFreshener,
  FaDollarSign,
  FaLocationArrow,
  FaMapMarkerAlt,
  FaMapPin,
  FaRupeeSign,
  FaUser,
  FaUsers,
  FaWhatsapp,
} from "react-icons/fa";
import { Separator } from "@radix-ui/react-separator";
import { useCurrency } from "@/hooks/useCurrencyhook";

// Mock WhatsApp icon
// const FaWhatsapp = ({ className = "" }) => (
//   <div className={`${className} text-green-600`}>📱</div>
// );

// Interfaces for API data
interface APICustomer {
  userId: string;
  user: {
    userId: string;
    name: string;
    email: string;
    whatsapp: string;
  };
  orders: Array<{
    orderId: string;
    createdAt: string;
    totalAmount: number;
    items: Array<{
      productId: string;
      productName: string;
      price: number;
      image: string;
      subcategoryName: string;
      variantTitle: string;
      quantity: number;
    }>;
    status: string;
    orderType: string;
    deliveryAddress: string | null;
    pickupDate: string;
    pickupTime: string;
  }>;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
}

interface Customer {
  source: "created" | "order";
  id: string;
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  avatar?: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string;
  joinDate: string;
  status: "active" | "inactive" | "vip";
  tags: string[];
  notes?: string;
  preferences: {
    emailMarketing: boolean;
    smsMarketing: boolean;
    preferredContact: "email" | "phone" | "sms" | "whatsapp";
  };
  orders: Array<{
    orderId: string;
    createdAt: string;
    totalAmount: number;
    items: Array<{
      productId: string;
      productName: string;
      price: number;
      image: string;
      subcategoryName: string;
      variantTitle: string;
      quantity: number;
    }>;
    status: string;
    orderType: string;
    deliveryAddress: string;
    pickupDate: string;
    pickupTime: string;
  }>;
}

interface Order {
  id: number;
  customerId: number;
  orderNumber: string;
  date: string;
  total: number;
  status: "completed" | "processing" | "shipped" | "cancelled";
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
}

interface Product {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  subcategories?: {
    id: string;
    name: string;
    variants: {
      id: string;
      title: string;
      price: number;
      inventory: number;
    }[];
  }[];
}

interface Event {
  id: number;
  name: string;
  organizer: string;
  date: string;
  status: "open" | "closed" | "upcoming";
  location: string;
  description: string;
}

interface EventApplication {
  id: number;
  eventId: number;
  eventName: string;
  status: "accepted" | "pending" | "rejected";
  applicationDate: string;
}

interface Organizer {
  id: number;
  name: string;
  email: string;
  whatsapp: string;
  avatar?: string;
}

// Mock data for organizers and events (will be developed later)
// const mockProducts: Product[] = [
//   {
//     id: 1,
//     name: "Electronics",
//     description: "Gadgets and accessories for a modern life.",
//     imageUrl: "https://placehold.co/100x100",
//     subcategories: [
//       {
//         id: 10,
//         name: "Laptops",
//         variants: [
//           { id: 101, name: "Dell XPS", price: 1200 },
//           { id: 102, name: "MacBook Air", price: 1500 },
//         ],
//       },
//     ],
//   },
// ];

const mockEvents: Event[] = [
  {
    id: 1,
    name: "Local Makers Market",
    organizer: "Creative Co-op",
    date: "2024-03-15",
    status: "open",
    location: "City Square Park",
    description: "A pop-up market for local artisans and craftspeople.",
  },
];

const mockEventApplications: EventApplication[] = [
  {
    id: 1,
    eventId: 1,
    eventName: "Local Makers Market",
    status: "pending",
    applicationDate: "2024-02-10",
  },
];

const mockOrganizers: Organizer[] = [
  {
    id: 1,
    name: "Creative Co-op",
    email: "contact@creativecoop.com",
    whatsapp: "15551112222",
    avatar: "https://placehold.co/100x100/blue/white",
  },
];

function OrderDetailDialog({
  isOpen,
  onClose,
  order,
}: {
  isOpen: boolean;
  onClose: () => void;
  order: Customer["orders"][0] | null;
}) {
  if (!order) return null;

  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);

  async function fetchShopkeeperInfo() {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      const shopkeeperId = decoded.sub;
      setCountry(decoded.country);
    } catch (error) {
      console.error("Error fetching shopkeeper info:", error);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            Information for order <strong>{order.orderId}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <p>
            <strong>Order Date:</strong>{" "}
            {/* {new Date(order.createdAt).toLocaleString()} */}
            {formatDateTime(order.createdAt)}
          </p>
          <p>
            <strong>Total Amount:</strong> {formatPrice(order.totalAmount)}
          </p>
          <p>
            <strong>Status:</strong>{" "}
            <Badge variant="buttonOutline">{order.status}</Badge>
          </p>
          <p>
            <strong>Order Type:</strong> {order.orderType}
          </p>
          {order.deliveryAddress && (
            <p>
              <strong>Delivery Address:</strong> {order.deliveryAddress}
            </p>
          )}
          {order.pickupDate && (
            <p>
              <strong>Pickup Date:</strong> {formatDate(order.pickupDate)} at{" "}
              {order.pickupTime}
            </p>
          )}
          <Separator />
          <h3 className="text-lg font-semibold">Items Purchased</h3>

          {order.items.map((item, idx) => (
            <div
              key={item.productId + "-" + idx}
              className="flex items-center gap-3 border rounded p-3"
            >
              <img
                src={__API_URL__ + item.image}
                alt={item.productName}
                className="w-20 h-20 object-cover rounded"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/placeholder.jpg";
                  e.currentTarget.onerror = null;
                }}
                loading="lazy"
              />
              <div className="flex-1">
                <p className="font-semibold">{item.productName}</p>
                <p className="text-sm text-muted-foreground">
                  {item.subcategoryName} - {item.variantTitle}
                </p>
                <p className="text-sm">
                  Price: {formatPrice(item.price)} x {item.quantity}
                </p>
                <p className="font-medium text-right text-lg">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end px-4 pb-4">
          <Button variant="buttonOutline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Customer Detail Modal Component
export function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [selectedOrder, setSelectedOrder] = useState<
    Customer["orders"][0] | null
  >(null);
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);

  useEffect(() => {
    async function fetchShopkeeperInfo() {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) return;

        const decoded: any = jwtDecode(token);
        const shopkeeperId = decoded.sub;
        setCountry(decoded.country);
      } catch (error) {
        console.error("Error fetching shopkeeper info:", error);
      }
    }
    fetchShopkeeperInfo();
  });

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{customer.name}</DialogTitle>
            <DialogDescription>
              Detailed information and order history for this customer.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Details */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Email</Label>
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {customer.email}
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <Label>WhatsApp</Label>
                  <a
                    href={`https://wa.me/${customer.whatsapp.replace(
                      /\D/g,
                      "",
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-green-600 hover:underline"
                  >
                    <span className="text-sm">{customer.whatsapp}</span>
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <Label>Total Orders</Label>
                  <p className="text-sm font-medium">{customer.totalOrders}</p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>Total Spent</Label>
                  <p className="text-sm font-medium">
                    {formatPrice(customer.totalSpent)}
                    {/* ${customer.totalSpent.toFixed(2)} */}
                  </p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>Average Order Value</Label>
                  <p className="text-sm font-medium">
                    {formatPrice(customer.averageOrderValue)}
                  </p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>Last Order</Label>
                  <p className="text-sm text-muted-foreground">
                    {customer.lastOrderDate}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Order History */}
            <Card>
              <CardHeader>
                <CardTitle>Order History ({customer.orders.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {customer.orders.map((order) => (
                    <Card
                      key={order.orderId}
                      className="border rounded-lg p-3 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-sm">{order.orderId}</p>
                          <p className="text-xs text-muted-foreground">
                            {/* {new Date(order.createdAt).toLocaleDateString()} */}
                            {formatDate(order.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {formatPrice(order.totalAmount)}
                            {/* ${order.totalAmount.toFixed(2)} */}
                          </p>
                          <Badge variant="buttonOutline" className="text-xs">
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>
                              {item.productName} x{item.quantity}
                            </span>
                            <span>
                              {formatPrice(item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="buttonOutline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <OrderDetailDialog
        isOpen={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
      />
    </>
  );
}

interface Variant {
  id: string;
  title: string;
  price: number;
  inventory: number;
}

interface Subcategory {
  id: string;
  name: string;
  variants: Variant[];
}

interface Customer {
  id: string;
  name: string;
  whatsapp?: string;
}

interface AddCustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerAdded?: (customer: any) => void;
  shopkeeperId?: string;
  customerToEdit?: Customer | null; // New
  mode?: "add" | "edit"; // New
}

interface Country {
  name: string;
  dialCode: string;
  code: string;
  flag: string;
}

interface ProductMarketingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
}

export function ProductMarketingDialog({ isOpen, onClose, customers }) {
  const { toast } = useToast();
  const [shopkeeperId, setShopkeeperId] = useState(null);
  const [products, setProducts] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [expandedSubcategories, setExpandedSubcategories] = useState(new Set());
  const [selectedVariants, setSelectedVariants] = useState(new Set());
  const [selectedCustomers, setSelectedCustomers] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setShopkeeperId(decoded.sub);
      } catch {
        toast({
          duration: 5000,
          title: "Error decoding token",
          variant: "destructive",
        });
      }
    }
    fetchShopkeeperInfo();
  }, [toast]);

  async function fetchShopkeeperInfo() {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      const shopkeeperId = decoded.sub;
      setCountry(decoded.country);
    } catch (error) {
      console.error("Error fetching shopkeeper info:", error);
    }
  }

  useEffect(() => {
    if (!shopkeeperId) return;
    async function fetchProducts() {
      try {
        const res = await fetch(
          `${__API_URL__}/products/shopkeeper-products/${shopkeeperId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();
        setProducts(data.data);
      } catch (error) {
        toast({
          duration: 5000,
          title: "Error fetching products",
          description: error.message,
          variant: "destructive",
        });
      }
    }
    fetchProducts();
  }, [shopkeeperId, toast]);

  const getAllVariantIds = (product) =>
    product
      ? product.subcategories.flatMap((sc) => sc.variants.map((v) => v.id))
      : [];

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setExpandedSubcategories(new Set(product.subcategories.map((sc) => sc.id)));
    setSelectedVariants(new Set(getAllVariantIds(product)));
  };

  const toggleSubcategory = (subcatId) => {
    setExpandedSubcategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(subcatId)) newSet.delete(subcatId);
      else newSet.add(subcatId);
      return newSet;
    });
  };

  const toggleVariant = (variantId) => {
    setSelectedVariants((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(variantId)) newSet.delete(variantId);
      else newSet.add(variantId);
      return newSet;
    });
  };

  const toggleCustomer = (customerId) => {
    setSelectedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) newSet.delete(customerId);
      else newSet.add(customerId);
      return newSet;
    });
  };

  const handleSelectAllCustomers = () => {
    if (selectedCustomers.size === customers.length && customers.length > 0) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(customers.map((c) => c.id)));
    }
  };

  const getProductDetailsString = () => {
    if (!selectedProduct) return "";
    let detail = `*${selectedProduct.name}*\n${
      selectedProduct.description || ""
    }`;
    if (selectedProduct.image)
      detail += `\n${window.location.origin}${selectedProduct.image}`;
    detail += `\n\n🔹 *Available Variants:*`;
    selectedProduct.subcategories.forEach((subcat) => {
      detail += `\n  ◾️ *${subcat.name}*`;
      subcat.variants.forEach((variant) => {
        if (selectedVariants.has(variant.id)) {
          detail += `\n    - ${variant.title}, ${formatPrice(
            variant.price,
          )} (Stock: ${variant.inventory})`;
        }
      });
    });
    return detail;
  };

  const handleCustomerWhatsApp = (customer) => {
    if (!customer.whatsapp || !selectedProduct) {
      toast({
        duration: 5000,
        title: "Cannot send message: Missing customer phone or product.",
        variant: "destructive",
      });
      return;
    }
    const details = getProductDetailsString();
    const text = `${details}\n\n${message}`;
    const phone = customer.whatsapp.replace(/\D/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleSend = () => {
    if (!selectedProduct) {
      toast({
        duration: 5000,
        title: "Select a product",
        variant: "destructive",
      });
      return;
    }
    if (selectedVariants.size === 0) {
      toast({
        duration: 5000,
        title: "Select at least one variant",
        variant: "destructive",
      });
      return;
    }
    if (selectedCustomers.size === 0) {
      toast({
        duration: 5000,
        title: "Select at least one customer",
        variant: "destructive",
      });
      return;
    }
    if (!message.trim()) {
      toast({
        duration: 5000,
        title: "Message cannot be empty",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    setTimeout(() => {
      toast({
        duration: 5000,
        title: "Messages Sent",
        description: `Sent marketing message to ${selectedCustomers.size} customers.`,
      });
      setSending(false);
      onClose();
    }, 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="
          w-full 
          max-w-[95vw] sm:max-w-3xl lg:max-w-5xl 
          max-h-[90vh] overflow-y-auto
          p-4 sm:p-6 space-y-6
        "
      >
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-semibold">
            Product Marketing Campaign
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            Select a product, choose variants, write your message, and send it
            to your customers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Products List */}
          <div className="w-full lg:w-1/4">
            <Label className="font-medium mb-2">Products</Label>
            <ScrollArea className="border rounded-md max-h-[300px] sm:max-h-[400px]">
              {products?.map((product) => (
                <div
                  key={product.id}
                  className={`p-3 cursor-pointer border-b last:border-b-0 ${
                    selectedProduct?.id === product.id
                      ? "bg-blue-50 border-blue-400"
                      : "border-gray-200"
                  }`}
                  onClick={() => handleProductSelect(product)}
                >
                  {product.name}
                </div>
              ))}
            </ScrollArea>
          </div>

          {/* Subcategories & Variants */}
          <div className="w-full lg:w-1/3">
            <Label className="font-medium mb-2">Subcategories & Variants</Label>
            {!selectedProduct ? (
              <p className="text-sm text-gray-500">
                Select a product to see variants
              </p>
            ) : (
              <ScrollArea className="border rounded-md max-h-[300px] sm:max-h-[400px] p-3">
                {selectedProduct.subcategories.map((subcat) => (
                  <div key={subcat.id} className="mb-4">
                    <div
                      className="flex items-center justify-between cursor-pointer font-semibold bg-gray-100 p-2 rounded"
                      onClick={() => toggleSubcategory(subcat.id)}
                    >
                      <span>{subcat.name}</span>
                      {expandedSubcategories.has(subcat.id) ? (
                        <ChevronDown />
                      ) : (
                        <ChevronRight />
                      )}
                    </div>
                    {expandedSubcategories.has(subcat.id) && (
                      <div className="mt-2 space-y-2 pl-4">
                        {subcat.variants.map((variant) => (
                          <div
                            key={variant.id}
                            className="flex items-center justify-between"
                          >
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedVariants.has(variant.id)}
                                onChange={() => toggleVariant(variant.id)}
                                className="h-5 w-5"
                              />
                              <span>{variant.title}</span>
                            </label>
                            <span>
                              {formatPrice(variant.price)} • Stock:{" "}
                              {variant.inventory}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </ScrollArea>
            )}
          </div>

          {/* Message & Customers */}
          <div className="w-full lg:w-2/5 flex flex-col gap-4">
            <div>
              <Label className="font-medium mb-2">Message</Label>
              <Textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your marketing message..."
                className="resize-none mb-2"
              />
              {selectedProduct && (
                <div className="mb-2 p-2 bg-blue-50 text-xs sm:text-sm rounded border max-h-32 overflow-auto">
                  {getProductDetailsString()}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-medium">Customers List</Label>
                {/* <button
                  type="button"
                  onClick={handleSelectAllCustomers}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {selectedCustomers.size === customers.length &&
                  customers.length > 0
                    ? "Deselect All"
                    : "Select All"}
                </button> */}
              </div>
              <div className="border rounded-md max-h-[200px] sm:max-h-[270px] p-2 space-y-2 overflow-y-auto">
                {customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-2 py-2"
                  >
                    <span className="flex-1 truncate">{customer.name}</span>
                    <button
                      type="button"
                      onClick={() => handleCustomerWhatsApp(customer)}
                      className="px-2 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-xs"
                    >
                      WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* <Button
              onClick={handleSend}
              disabled={sending}
              className="mt-2 w-full sm:w-auto"
            >
              {sending ? "Sending..." : "Send Message"}
            </Button> */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AddCustomerDialog({
  isOpen,
  onClose,
  onCustomerAdded,
  shopkeeperId,
  customerToEdit, // New prop for edit mode
  mode = "add", // New prop: 'add' | 'edit'
}: AddCustomerDialogProps & {
  customerToEdit?: Customer | null;
  mode?: "add" | "edit";
}) {
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    whatsAppNumber: "",
    email: "",
  });

  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);

  // Fetch countries from API (unchanged)
  useEffect(() => {
    async function fetchCountries() {
      try {
        setLoadingCountries(true);
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,cca2,idd",
        );
        const data = await response.json();

        const fetchedCountries: Country[] = data
          .map((country: any) => {
            const root = country.idd?.root ?? "";
            const suffixes = country.idd?.suffixes ?? [];
            let dial = "";
            if (root && suffixes.length === 1) dial = root + suffixes[0];
            else if (root) dial = root;
            return {
              name: country.name?.common || "",
              code: country.cca2 || "",
              dialCode: dial,
            };
          })
          .filter((c) => c.dialCode)
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(fetchedCountries);
      } catch (e) {
        toast({
          duration: 5000,
          title: "Error loading countries",
          description: "Failed to fetch country codes",
          variant: "destructive",
        });
      } finally {
        setLoadingCountries(false);
      }
    }

    if (isOpen) {
      fetchCountries();
    }
  }, [isOpen, toast]);

  // NEW: Pre-fill form for edit mode
  useEffect(() => {
    if (isOpen && customerToEdit && mode === "edit" && countries.length > 0) {
      const [first, ...rest] = customerToEdit.name.split(" ");

      const rawWhatsapp = customerToEdit.whatsapp || "";

      // Extract country code (e.g. +91)
      const match = rawWhatsapp.match(/^(\+\d{1,2})(.*)$/);

      let country = null;
      let localNumber = rawWhatsapp;

      if (match) {
        const dialCode = match[1]; // +91
        localNumber = match[2].replace(/\s/g, ""); // remaining number

        country = countries.find((c) => c.dialCode === dialCode) || null;
      }

      // 1️⃣ Set selected country first
      setSelectedCountry(country);

      // 2️⃣ Set form data with CLEAN number
      setFormData({
        firstName: first || "",
        lastName: rest.join(" ") || "",
        whatsAppNumber: localNumber,
        email: customerToEdit.email || "",
      });

      setErrors({});
    } else if (isOpen && mode === "add") {
      resetForm();
    }
  }, [isOpen, customerToEdit, mode, countries]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate firstName
    if (!formData.firstName.trim()) {
      newErrors.firstName = "First name is required";
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = "First name must be at least 2 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(formData.firstName.trim())) {
      newErrors.firstName = "First name contains invalid characters";
    }

    // Validate lastName
    if (!formData.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = "Last name must be at least 2 characters";
    } else if (!/^[a-zA-Z\s'-]+$/.test(formData.lastName.trim())) {
      newErrors.lastName = "Last name contains invalid characters";
    }

    // Validate whatsAppNumber
    if (!formData.whatsAppNumber.trim()) {
      newErrors.whatsAppNumber = "WhatsApp number is required";
    } else if (!/^\d{6,15}$/.test(formData.whatsAppNumber.trim())) {
      newErrors.whatsAppNumber =
        "Please enter a valid phone number (6-15 digits)";
    }

    // Validate country code
    if (!selectedCountry) {
      newErrors.countryCode = "Please select a country code";
    }

    // Validate email (optional, but if provided must be valid)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Please enter a valid email address";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // UPDATED: Handle both ADD and EDIT
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = sessionStorage.getItem("token");
    if (!token) {
      toast({
        title: "Error",
        description: "No authentication token found",
        variant: "destructive",
      });
      return;
    }
    const decoded: any = jwtDecode(token);
    const currentShopkeeperId = decoded.sub;

    if (!validateForm()) {
      toast({
        duration: 5000,
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const fullWhatsAppNumber = `${selectedCountry?.dialCode}${formData.whatsAppNumber.trim()}`;

      const payload = {
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        whatsAppNumber: fullWhatsAppNumber,
        ...(formData.email.trim() && { email: formData.email.trim() }),
      };

      let url: string;
      let method: string = "POST";

      // EDIT MODE → UPDATE USER
      if (mode === "edit" && customerToEdit?.id) {
        url = `${__API_URL__}/users/update-user-by-shopkeeper/${currentShopkeeperId}/${customerToEdit.id}`;
        method = "PATCH";
      }
      // ADD MODE → CREATE USER
      else {
        url = `${__API_URL__}/users/create-user-by-shopkeeper/${currentShopkeeperId}`;
      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.message ||
            `Failed to ${mode === "edit" ? "update" : "add"} customer`,
        );
      }

      const data = await res.json();

      toast({
        duration: 5000,
        title: "Success",
        description: `Customer ${mode === "edit" ? "updated" : "added"} successfully`,
      });

      resetForm();
      onClose();

      if (onCustomerAdded) {
        onCustomerAdded(data.data);
      }
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Error",
        description:
          error.message ||
          `Failed to ${mode === "edit" ? "update" : "add"} customer`,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      whatsAppNumber: "",
      email: "",
    });
    setSelectedCountry(null);
    setErrors({});
    setSearchQuery("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.dialCode.includes(searchQuery),
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl md:text-2xl font-semibold">
            {mode === "edit" ? "Edit Customer" : "Add New Customer"}
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground">
            {mode === "edit"
              ? "Update customer details."
              : "Enter customer details to add them to your customer list."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <Label htmlFor="firstName" className="font-medium mb-2 block">
              First Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="firstName"
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              placeholder="Enter first name"
              className={errors.firstName ? "border-red-500" : ""}
              disabled={submitting}
            />
            {errors.firstName && (
              <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div>
            <Label htmlFor="lastName" className="font-medium mb-2 block">
              Last Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="lastName"
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              placeholder="Enter last name"
              className={errors.lastName ? "border-red-500" : ""}
              disabled={submitting}
            />
            {errors.lastName && (
              <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>
            )}
          </div>

          {/* WhatsApp Number with Country Code - UNCHANGED */}
          <div>
            <Label htmlFor="whatsAppNumber" className="font-medium mb-2 block">
              WhatsApp Number <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Select
                value={selectedCountry?.code}
                onValueChange={(code) => {
                  const country = countries.find((c) => c.code === code);
                  setSelectedCountry(country || null);
                  if (errors.countryCode) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.countryCode;
                      return newErrors;
                    });
                  }
                }}
                disabled={submitting}
              >
                <SelectTrigger
                  className={`w-[140px] ${
                    errors.countryCode ? "border-red-500" : ""
                  }`}
                >
                  <SelectValue>
                    {selectedCountry ? (
                      <div className="flex items-center gap-2">
                        {selectedCountry.flag && (
                          <img
                            src={selectedCountry.flag}
                            alt={selectedCountry.name}
                            className="w-5 h-3 object-cover"
                            loading="lazy"
                          />
                        )}
                        <span>{selectedCountry.dialCode}</span>
                      </div>
                    ) : (
                      "Select"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search country..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="mb-2"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <ScrollArea className="h-[200px]">
                    {filteredCountries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        <div className="flex items-center gap-2">
                          {country.flag && (
                            <img
                              src={country.flag}
                              alt={country.name}
                              className="w-5 h-3 object-cover"
                              loading="lazy"
                            />
                          )}
                          <span className="font-medium">
                            {country.dialCode}
                          </span>
                          <span className="text-gray-500 text-sm">
                            {country.name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>

              <Input
                id="whatsAppNumber"
                type="tel"
                value={formData.whatsAppNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  handleChange("whatsAppNumber", value);
                }}
                maxLength={10}
                placeholder="1234567890"
                className={`flex-1 ${
                  errors.whatsAppNumber ? "border-red-500" : ""
                }`}
                disabled={submitting}
              />
            </div>
            {(errors.whatsAppNumber || errors.countryCode) && (
              <p className="text-red-500 text-sm mt-1">
                {errors.whatsAppNumber || errors.countryCode}
              </p>
            )}
            {selectedCountry && formData.whatsAppNumber && (
              <p className="text-gray-500 text-xs mt-1">
                Full number: {selectedCountry.dialCode}
                {formData.whatsAppNumber}
              </p>
            )}
          </div>

          {/* Email (Optional) */}
          <div>
            <Label htmlFor="email" className="font-medium mb-2 block">
              Email{" "}
              <span className="text-gray-400 text-xs font-normal">
                (Optional)
              </span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="customer@example.com"
              className={errors.email ? "border-red-500" : ""}
              disabled={submitting}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          {/* Action Buttons - Dynamic text */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="w-full sm:w-1/2"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-1/2"
            >
              {submitting
                ? mode === "edit"
                  ? "Updating..."
                  : "Adding..."
                : mode === "edit"
                  ? "Update Customer"
                  : "Add Customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Main CRM Component
// ============================================
// ORGANIZER MANAGEMENT TAB COMPONENT
// ============================================

interface StallRequest {
  _id: string;
  shopkeeperId: any;
  eventId: {
    _id: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    image: string;
    gallery?: string[];
    description?: string;
    organizer?: {
      name: string;
      organizationName: string;
    };
  };
  organizerId: any;
  status: "Pending" | "Confirmed" | "Cancelled" | "Processing" | "Completed";
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  selectedTables: Array<{
    tableId: string;
    positionId: string;
    tableName: string;
    tableType: string;
    price: number;
    depositAmount: number;
    layoutName: string;
  }>;
  selectedAddOns: Array<{
    addOnId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  tablesTotal: number;
  depositTotal: number;
  addOnsTotal: number;
  grandTotal: number;
  requestDate: string;
  confirmationDate?: string;
  selectionDate?: string;
  paymentDate?: string;
  completionDate?: string;
  notes?: string;
  cancellationReason?: string;
}

interface OrganizerManagementTabProps {
  shopkeeperId: string;
}

function formatDateTime(inputDate: Date | string) {
  const date = new Date(inputDate);

  const day = date.getDate(); // 1-31
  const month = date.getMonth() + 1; // 0-based, so add 1
  const year = date.getFullYear();

  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Format as: d/m/yyyy
  const formattedDate = `${day}/${month}/${year}`;

  // Format time as HH:MM (24-hour)
  const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;

  return `${formattedDate} ${formattedTime}`;
}

function formatDate(inputDate: Date | string) {
  const date = new Date(inputDate);

  const day = date.getDate(); // 1-31
  const month = date.getMonth() + 1; // 0-based, so add 1
  const year = date.getFullYear();

  const hours = date.getHours();
  const minutes = date.getMinutes();

  // Format as: d/m/yyyy
  const formattedDate = `${day}/${month}/${year}`;

  // Format time as HH:MM (24-hour)
  const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;

  return `${formattedDate}`;
}

function OrganizerManagementTab({ shopkeeperId }: OrganizerManagementTabProps) {
  const { toast } = useToast();

  // State
  const [stallRequests, setStallRequests] = useState<StallRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<StallRequest | null>(
    null,
  );
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [eventsParticipate, setEventsParticipated] = useState(0);
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);
  const apiURL = __API_URL__;

  // Fetch stall requests
  useEffect(() => {
    if (shopkeeperId) {
      fetchStallRequests();
    }
    fetchShopkeeperInfo();
  }, [shopkeeperId]);

  async function fetchShopkeeperInfo() {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      setCountry(decoded.country);
    } catch (error) {
      console.error("Error fetching shopkeeper info:", error);
    }
  }

  const fetchStallRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiURL}/stalls/shopkeeper/${shopkeeperId}`,
      );
      const result = await response.json();

      if (result.success) {
        setStallRequests(result.data || []);
        const eventsParticipated = new Set(
          stallRequests
            .filter((r) => r.status === "Completed")
            .map((r) => r.eventId._id),
        ).size;
        setEventsParticipated(eventsParticipated);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error("Error fetching stall requests:", error);
      toast({
        duration: 5000,
        title: "Error",
        description: error.message || "Failed to fetch stall requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const stats = {
    totalRequests: stallRequests.length,
    confirmedBookings: stallRequests.filter((r) =>
      ["Confirmed", "Processing", "Completed"].includes(r.status),
    ).length,
    totalRevenue: stallRequests
      .filter((r) => r.paymentStatus === "Paid")
      .reduce((sum, r) => sum + r.grandTotal, 0),
    pendingRequests: stallRequests.filter((r) => r.status === "Pending").length,
    eventsParticipated: new Set(stallRequests.map((r) => r.eventId._id)).size,
  };

  // Filter requests
  const filteredRequests = stallRequests.filter((request) => {
    const statusMatch =
      statusFilter === "all" || request.status === statusFilter;
    const paymentMatch =
      paymentFilter === "all" || request.paymentStatus === paymentFilter;
    return statusMatch && paymentMatch;
  });

  // Get unique events participated
  const eventsParticipated = Array.from(
    new Map(
      stallRequests
        .filter((r) =>
          ["Confirmed", "Processing", "Completed"].includes(r.status),
        )
        .map((r) => [r.eventId._id, r.eventId]),
    ).values(),
  );

  // Status badge color
  const getStatusBadge = (status: string) => {
    const colors = {
      Pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
      Confirmed: "bg-blue-100 text-blue-800 border-blue-300",
      Processing: "bg-purple-100 text-purple-800 border-purple-300",
      Completed: "bg-green-100 text-green-800 border-green-300",
      Cancelled: "bg-red-100 text-red-800 border-red-300",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  // Payment badge color
  const getPaymentBadge = (payment: string) => {
    const colors = {
      Unpaid: "bg-red-100 text-red-800 border-red-300",
      Partial: "bg-orange-100 text-orange-800 border-orange-300",
      Paid: "bg-green-100 text-green-800 border-green-300",
    };
    return (
      colors[payment as keyof typeof colors] || "bg-gray-100 text-gray-800"
    );
  };

  // View details
  const handleViewDetails = (request: StallRequest) => {
    setSelectedRequest(request);
    setShowDetailDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {/*<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
         <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-3xl">{stats.totalRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              All stall booking requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed Bookings</CardDescription>
            <CardTitle className="text-3xl">
              {stats.confirmedBookings}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Active and completed bookings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-3xl">
              ${stats.totalRevenue.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">From paid bookings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Requests</CardDescription>
            <CardTitle className="text-3xl">{stats.pendingRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Awaiting organizer approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Events Participated</CardDescription>
            <CardTitle className="text-3xl">
              {stats.eventsParticipated}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Unique events joined
            </p>
          </CardContent>
        </Card>
      </div> */}

      {/* Events Participated Cards */}
      {/* {eventsParticipated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Events Participated</CardTitle>
            <CardDescription>
              Events where you have confirmed or completed stall bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventsParticipated.map((event) => (
                <Card
                  key={event._id}
                  className="overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="relative h-40">
                    <img
                      src={apiURL + event.image}
                      alt={event.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://placehold.co/400x300/e2e8f0/64748b?text=Event";
                      }}
                    />
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-white/90 text-gray-800">
                        {
                          stallRequests.filter(
                            (r) => r.eventId._id === event._id
                          ).length
                        }{" "}
                        Booking(s)
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="pt-4">
                    <h3 className="font-semibold text-lg mb-2">
                      {event.title}
                    </h3>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {event.location}
                      </p>
                      <p className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(event.startDate).toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )} */}

      {/* Stall Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Stall Booking Requests</CardTitle>
          <CardDescription>
            Manage all your stall booking requests across different events
          </CardDescription>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="status-filter">Status:</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Processing">Processing</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="payment-filter">Payment:</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger id="payment-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                  <SelectItem value="Partial">Partial</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No Stall Requests Found
              </h3>
              <p className="text-muted-foreground">
                {statusFilter !== "all" || paymentFilter !== "all"
                  ? "No requests match your filters. Try adjusting the filters."
                  : "You haven't made any stall booking requests yet. Visit events to rent a stall!"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Request Date</TableHead>
                    <TableHead>Tables</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request._id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <img
                            src={apiURL + request.eventId.image}
                            alt={request.eventId.title}
                            className="w-12 h-12 rounded object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src =
                                "https://placehold.co/100x100/e2e8f0/64748b?text=Event";
                            }}
                            loading="lazy"
                          />
                          <div>
                            <p className="font-medium">
                              {request.eventId.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {request.eventId.location}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* {new Date(request.requestDate).toLocaleDateString()} */}
                        {formatDateTime(request.requestDate)}
                      </TableCell>
                      <TableCell>
                        {request.selectedTables.length > 0 ? (
                          <span>{request.selectedTables.length} table(s)</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Not selected
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatPrice(request.grandTotal)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(request.status)}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getPaymentBadge(request.paymentStatus)}
                        >
                          {request.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="buttonOutline"
                          size="sm"
                          onClick={() => handleViewDetails(request)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      {selectedRequest && (
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Stall Booking Details</DialogTitle>
              <DialogDescription>
                Complete information about your stall booking request
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Event Banner */}
              <div className="relative h-64 rounded-lg overflow-hidden">
                <img
                  src={apiURL + selectedRequest.eventId.image}
                  alt={selectedRequest.eventId.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://placehold.co/1200x400/e2e8f0/64748b?text=Event+Banner";
                  }}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end">
                  <div className="p-6 text-white">
                    <h2 className="text-3xl font-bold mb-2">
                      {selectedRequest.eventId.title}
                    </h2>
                    <p className="flex items-center text-sm">
                      <MapPin className="h-4 w-4 mr-1" />
                      {selectedRequest.eventId.location}
                    </p>
                    <p className="flex items-center text-sm mt-1">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDateTime(selectedRequest.eventId.startDate)} -{" "}
                      {formatDate(selectedRequest.eventId.startDate)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Event Gallery */}
              {selectedRequest.eventId.gallery &&
                selectedRequest.eventId.gallery.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">
                      Event Gallery
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {selectedRequest.eventId.gallery.map((img, idx) => (
                        <img
                          key={idx}
                          src={apiURL + img}
                          alt={`Gallery ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://placehold.co/300x200/e2e8f0/64748b?text=Image";
                          }}
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Booking Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Booking Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Request ID</Label>
                      <p className="text-sm font-mono">{selectedRequest._id}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <Label>Status</Label>
                      <Badge className={getStatusBadge(selectedRequest.status)}>
                        {selectedRequest.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <Label>Payment Status</Label>
                      <Badge
                        className={getPaymentBadge(
                          selectedRequest.paymentStatus,
                        )}
                      >
                        {selectedRequest.paymentStatus}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <Label>Request Date</Label>
                      <p className="text-sm">
                        {/* {new Date(selectedRequest.requestDate).toLocaleString()} */}
                        {formatDateTime(selectedRequest.requestDate)}
                      </p>
                    </div>
                    {selectedRequest.confirmationDate && (
                      <div className="flex justify-between">
                        <Label>Confirmation Date</Label>
                        <p className="text-sm">
                          {/* {new Date(
                            selectedRequest.confirmationDate
                          ).toLocaleString()} */}
                          {formatDateTime(selectedRequest.confirmationDate)}
                        </p>
                      </div>
                    )}
                    {selectedRequest.selectionDate && (
                      <div className="flex justify-between">
                        <Label>Table Selection Date</Label>
                        <p className="text-sm">
                          {/* {new Date(
                            selectedRequest.selectionDate
                          ).toLocaleString()} */}
                          {formatDateTime(selectedRequest.selectionDate)}
                        </p>
                      </div>
                    )}
                    {selectedRequest.paymentDate && (
                      <div className="flex justify-between">
                        <Label>Payment Date</Label>
                        <p className="text-sm">
                          {/* {new Date(
                            selectedRequest.paymentDate
                          ).toLocaleString()} */}
                          {formatDateTime(selectedRequest.paymentDate)}
                        </p>
                      </div>
                    )}
                    {selectedRequest.completionDate && (
                      <div className="flex justify-between">
                        <Label>Completion Date</Label>
                        <p className="text-sm">
                          {/* {new Date(
                            selectedRequest.completionDate
                          ).toLocaleString()} */}
                          {formatDateTime(selectedRequest.completionDate)}
                        </p>
                      </div>
                    )}
                    {selectedRequest.notes && (
                      <div>
                        <Label>Notes</Label>
                        <p className="text-sm text-muted-foreground">
                          {selectedRequest.notes}
                        </p>
                      </div>
                    )}
                    {selectedRequest.cancellationReason && (
                      <div>
                        <Label>Cancellation Reason</Label>
                        <p className="text-sm text-red-600">
                          {selectedRequest.cancellationReason}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Selected Tables */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Selected Tables ({selectedRequest.selectedTables.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedRequest.selectedTables.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No tables selected yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {selectedRequest.selectedTables.map((table, idx) => (
                          <div key={idx} className="border rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold">
                                  {table.tableName}
                                </p>
                                <p className="font-semibold">
                                  {table.layoutName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {table.tableType}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">
                                  {formatPrice(table.price)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  +{formatPrice(table.depositAmount)} deposit
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Selected Add-ons */}
              {selectedRequest.selectedAddOns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Selected Add-ons ({selectedRequest.selectedAddOns.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedRequest.selectedAddOns.map((addon, idx) => (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold">{addon.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Quantity: {addon.quantity}
                              </p>
                            </div>
                            <p className="font-semibold">
                              {formatPrice(addon.price * addon.quantity)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Price Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle>Price Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Tables Rental</span>
                      <span className="font-semibold">
                        {formatPrice(selectedRequest.tablesTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Deposit</span>
                      <span className="font-semibold">
                        {formatPrice(selectedRequest.depositTotal)}
                      </span>
                    </div>
                    {selectedRequest.addOnsTotal > 0 && (
                      <div className="flex justify-between">
                        <span>Add-ons</span>
                        <span className="font-semibold">
                          {formatPrice(selectedRequest.addOnsTotal)}
                        </span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Grand Total</span>
                      <span>{formatPrice(selectedRequest.grandTotal)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Organizer Information */}
              {selectedRequest.organizerId && (
                <Card>
                  <CardHeader>
                    <CardTitle>Organizer Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Organization</Label>
                      <p className="text-sm">
                        {selectedRequest.organizerId.organizationName}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <Label>Contact Person</Label>
                      <p className="text-sm">
                        {selectedRequest.organizerId.name}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <Label>WhatsApp Number</Label>
                      <a
                        href={`tel:${selectedRequest.organizerId.whatsAppNumber}`}
                        className="text-sm text-gray-700 hover:text-green-600"
                      >
                        {selectedRequest.organizerId.whatsAppNumber}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <Label>Email</Label>
                      <a
                        href={`mailto:${selectedRequest.organizerId.businessEmail}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {selectedRequest.organizerId.businessEmail}
                      </a>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <Button
                variant="buttonOutline"
                onClick={() => setShowDetailDialog(false)}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function CRMManagement() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("users");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [stallRequests, setStallRequests] = useState<StallRequest[]>([]);
  const [showProductMarketing, setShowProductMarketing] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  // State for API data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [shopkeeperId, setShopkeeperId] = useState("");
  const [eventsParticipate, setEventsParticipated] = useState(0);
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);

  const apiURL = __API_URL__;

  useEffect(() => {
    if (shopkeeperId) {
      fetchStallRequests();
    }
    fetchShopkeeperInfo();
  }, [shopkeeperId]);

  async function fetchShopkeeperInfo() {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      setCountry(decoded.country);
    } catch (error) {
      console.error("Error fetching shopkeeper info:", error);
    }
  }

  const showEditCustomer = async (customer: any) => {
    setShowAddCustomer(true);
    setCustomerToEdit(customer);
  };

  const addNewCustomer = async () => {
    setShowAddCustomer(true);
    setCustomerToEdit(null);
  };

  const fetchStallRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiURL}/stalls/shopkeeper/${shopkeeperId}`,
      );
      const result = await response.json();

      if (result.success) {
        setStallRequests(result.data || []);
        const eventsParticipated = new Set(
          stallRequests
            .filter((r) => r.status === "Completed")
            .map((r) => r.eventId._id),
        ).size;
        setEventsParticipated(eventsParticipated);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error("Error fetching stall requests:", error);
      toast({
        duration: 5000,
        title: "Error",
        description: error.message || "Failed to fetch stall requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats from real API data
  const stats = {
    totalCustomers: customers.length,
    activeCustomers: customers.filter((c) => c.totalOrders > 0).length,
    internationalCustomers: customers.filter((c) => {
      if (!c.whatsapp) return false;
      const localDialCode = country === "IN" ? "+91" : "+65";
      return !c.whatsapp.startsWith(localDialCode);
    }).length,

    // ✅ International: Non-local customers
    localCustomers: customers.filter((c) => {
      if (!c.whatsapp) return false;
      const localDialCode = country === "IN" ? "+91" : "+65";
      return c.whatsapp.startsWith(localDialCode);
    }).length,
    totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    averageOrderValue:
      customers.length > 0
        ? customers.reduce((sum, c) => sum + c.totalSpent, 0) /
            customers.reduce((sum, c) => sum + c.totalOrders, 0) || 0
        : 0,
    totalOrders: customers.reduce((sum, c) => sum + c.totalOrders, 0),
    // totalEvents: events.length,
    // eventsParticipated: applications.filter((app) => app.status === "accepted")
    //   .length,
  };

  // Transform API data to component format
  // Transform function for Orders API
  const transformOrdersAPIData = (apiData: APICustomer[]): Customer[] => {
    return apiData.map((apiCustomer) => ({
      id: apiCustomer.userId,
      name: apiCustomer.user.name,
      email: apiCustomer.user.email,
      whatsapp: apiCustomer.user.whatsapp,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        apiCustomer.user.name,
      )}`,
      totalOrders: apiCustomer.orderCount,
      totalSpent: apiCustomer.totalSpent,
      averageOrderValue: apiCustomer.avgOrderValue,
      lastOrderDate:
        apiCustomer.orders.length > 0
          ? formatDate(
              new Date(
                Math.max(
                  ...apiCustomer.orders.map((o) =>
                    new Date(o.createdAt).getTime(),
                  ),
                ),
              ),
            )
          : "Never",
      joinDate:
        apiCustomer.orders.length > 0
          ? formatDate(
              new Date(
                Math.min(
                  ...apiCustomer.orders.map((o) =>
                    new Date(o.createdAt).getTime(),
                  ),
                ),
              ),
            )
          : "Unknown",
      status:
        apiCustomer.totalSpent > 100
          ? "vip"
          : ("active" as "active" | "inactive" | "vip"),
      tags: [
        apiCustomer.orderCount > 5 ? "frequent-buyer" : "occasional-buyer",
        apiCustomer.totalSpent > 100 ? "high-value" : "regular",
      ],
      preferences: {
        emailMarketing: true,
        smsMarketing: false,
        preferredContact: "whatsapp" as "email" | "phone" | "sms" | "whatsapp",
      },
      orders: apiCustomer.orders,
      source: "order",
    }));
  };

  // Transform function for Users API (created by shopkeeper)
  const transformUsersAPIData = (apiData: any[]): Customer[] => {
    return apiData.map((user) => ({
      id: user._id || user.id,
      name:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.name || "Unknown",
      email: user.email || "",
      whatsapp: user.whatsAppNumber || user.whatsapp || "",
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.name || "Unknown",
      )}`,
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      lastOrderDate: "Never",
      joinDate: user.createdAt
        ? formatDate(new Date(user.createdAt))
        : "Unknown",
      status: "active" as "active" | "inactive" | "vip",
      tags: ["new-customer"],
      preferences: {
        emailMarketing: true,
        smsMarketing: false,
        preferredContact: "whatsapp" as "email" | "phone" | "sms" | "whatsapp",
      },
      orders: [],
      source: "created",
    }));
  };

  useEffect(() => {
    fetchCustomerData();
  }, []);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      setShopkeeperId(decoded.sub);

      // Fetch both APIs in parallel
      const [ordersResponse, usersResponse] = await Promise.all([
        fetch(`${apiURL}/orders/customers/${decoded.sub}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        fetch(`${apiURL}/users/fetch-users-by-shopkeeper/${decoded.sub}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      ]);

      // Check if both responses are ok
      if (!ordersResponse.ok) {
        const errorData = await ordersResponse.json();
        throw new Error(errorData.message || "Failed to fetch order customers");
      }

      if (!usersResponse.ok) {
        const errorData = await usersResponse.json();
        throw new Error(errorData.message || "Failed to fetch created users");
      }

      // Parse both responses
      const ordersData = await ordersResponse.json();
      const usersData = await usersResponse.json();

      // Transform data using appropriate transform functions
      const orderCustomers =
        ordersData.data && Array.isArray(ordersData.data)
          ? transformOrdersAPIData(ordersData.data)
          : [];

      const createdUsers =
        usersData.data && Array.isArray(usersData.data)
          ? transformUsersAPIData(usersData.data)
          : [];

      // Merge both arrays and remove duplicates
      const allCustomers = mergeCustomers(orderCustomers, createdUsers);

      setCustomers(allCustomers);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast({
        duration: 5000,
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load customer data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const closeAddCustomer = async () => {
    try {
      await setShowAddCustomer(false);
      await fetchCustomerData();
    } catch (error) {
      throw error;
    }
  };

  // Helper function to merge customers and remove duplicates
  const mergeCustomers = (
    orderCustomers: Customer[],
    createdUsers: Customer[],
  ) => {
    const customerMap = new Map();

    // Add order customers first
    orderCustomers.forEach((customer) => {
      // Normalize the key (try whatsapp first, then email, then id)
      const key = customer.whatsapp || customer.email || customer.id;
      if (key) {
        customerMap.set(key, {
          ...customer,
          source: "order", // Track where this customer came from
        });
      }
    });

    // Add created users (and merge if they already exist from orders)
    createdUsers.forEach((user) => {
      // Normalize the key (try whatsapp first, then email, then id)
      const key = user.whatsapp || user.email || user.id;
      if (key) {
        if (customerMap.has(key)) {
          // Customer exists in both - merge the data (keep order data but update other fields)
          const existing = customerMap.get(key);
          customerMap.set(key, {
            ...existing,
            // Keep order-related data from existing
            // Update other fields from user if they're missing
            name: existing.name || user.name,
            email: existing.email || user.email,
            whatsapp: existing.whatsapp || user.whatsapp,
            source: "both", // Exists in both sources
          });
        } else {
          customerMap.set(key, {
            ...user,
            source: "created", // Only from created users
          });
        }
      }
    });

    // Convert map back to array and sort by name
    return Array.from(customerMap.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""),
    );
  };

  const handleApplyToEvent = (eventId: number) => {
    toast({
      duration: 5000,
      title: "Feature Coming Soon",
      description: "Event applications will be available in the next update.",
    });
  };

  const totalPages = Math.ceil(customers.length / rowsPerPage);

  const paginatedCustomers = customers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading customer data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CRM Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Customers
            </CardTitle>
            <FaUsers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Local Customers
            </CardTitle>
            <FaMapMarkerAlt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.localCustomers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              International Customers
            </CardTitle>
            <FaMapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.internationalCustomers}
            </div>
          </CardContent>
        </Card>

        {/* <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Events Participated
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventsParticipate}</div>
          </CardContent>
        </Card> */}
      </div>

      {/* Main Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <TabsList className="grid w-full md:w-auto grid-cols-1 mb-4 md:mb-0">
              <TabsTrigger value="users">Customer Management</TabsTrigger>
              {/* <TabsTrigger value="organizers" className="relative">
                Organizer Management
              </TabsTrigger> */}
            </TabsList>
          </div>

          <div>
            <Button
              onClick={() => setShowProductMarketing(true)}
              className="w-full md:w-auto mr-2"
            >
              <Send className="mr-2 h-4 w-4" />
              Product Marketing
            </Button>
            <Button
              onClick={() => addNewCustomer()}
              className="w-full md:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
          </div>
        </div>

        {/* User Management Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: Title */}
                <div>
                  <CardTitle>Customer Database</CardTitle>
                  <CardDescription>
                    Manage your customer relationships and view order history.
                  </CardDescription>
                </div>

                {/* Right: Rows per page */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Rows per page:
                  </span>

                  <Select
                    value={String(rowsPerPage)}
                    onValueChange={(value) => {
                      setRowsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 25, 50, 100].map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Total Spent</TableHead>
                      <TableHead>Last Order</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={customer.avatar} />
                              <AvatarFallback>
                                {customer.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{customer.name}</div>
                              {/* <div className="text-sm text-muted-foreground">
                                {customer.email}
                              </div>
                              {customer.whatsapp && (
                                <div className="text-sm text-green-600 flex items-center">
                                  <FaWhatsapp className="mr-1 h-3 w-3" />
                                  {customer.whatsapp}
                                </div>
                              )} */}
                            </div>
                          </div>
                        </TableCell>
                        {/* <TableCell>
                          <div className="text-sm">
                            <div>
                              <a
                                href={`mailto:${customer.email}`}
                                className="text-blue-600 hover:text-blue-800"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {customer.email}
                              </a>
                            </div>

                            {customer.whatsapp && (
                              <div className="text-green-600 flex-col col-1">
                                <a
                                  href={`https://wa.me/${customer.whatsapp.replace(
                                    /\D/g,
                                    ""
                                  )}?text=${encodeURIComponent(
                                    "Hello from Shopkeeper! I am reaching out regarding your recent orders."
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-green-800"
                                >
                                  <FaWhatsapp size={16} />
                                  <span>{customer.whatsapp}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        </TableCell> */}
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            <a
                              href={`mailto:${customer.email}`}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Mail size={16} />
                              <span>{customer.email}</span>
                            </a>
                            {customer.whatsapp && (
                              <a
                                href={`https://wa.me/${customer.whatsapp.replace(
                                  /\D/g,
                                  "",
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline flex items-center gap-1"
                              >
                                <FaWhatsapp size={16} />
                                <span>{customer.whatsapp}</span>
                              </a>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {customer.totalOrders}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {formatPrice(customer.averageOrderValue)} avg
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {formatPrice(customer.totalSpent)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {customer.lastOrderDate !== "Never" ? (
                            <div className="text-sm">
                              {customer.lastOrderDate}
                            </div>
                          ) : (
                            <Badge variant="secondary">No orders</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="buttonOutline"
                              size="sm"
                              onClick={() => setSelectedCustomer(customer)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {customer.source === "created" && (
                              <Button
                                variant="buttonOutline"
                                size="sm"
                                onClick={() => showEditCustomer(customer)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {paginatedCustomers.length === 0 && !loading && (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No customers found
                  </h3>
                  <p className="text-muted-foreground">
                    Your customers will appear here once you receive orders.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center mt-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="buttonOutline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    Previous
                  </Button>

                  <span className="text-sm">
                    Page <strong>{currentPage}</strong> of{" "}
                    <strong>{totalPages}</strong>
                  </span>

                  <Button
                    variant="buttonOutline"
                    size="sm"
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organizer Management Tab - FULLY FUNCTIONAL */}
        <TabsContent value="organizers">
          <OrganizerManagementTab shopkeeperId={shopkeeperId} />
        </TabsContent>
      </Tabs>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {/* Product Marketing Dialog */}
      {showProductMarketing && (
        <ProductMarketingDialog
          isOpen={showProductMarketing}
          onClose={() => setShowProductMarketing(false)}
          customers={customers}
        />
      )}

      {showAddCustomer && (
        <AddCustomerDialog
          isOpen={showAddCustomer}
          onClose={closeAddCustomer}
          customerToEdit={customerToEdit} // New prop
          mode={customerToEdit ? "edit" : "add"} // New prop
        />
      )}
    </div>
  );
}
