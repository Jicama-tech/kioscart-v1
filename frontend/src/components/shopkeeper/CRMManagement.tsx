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
import { avatarAccent, initials, statAccent } from "@/lib/accents";
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
  UserPlus,
  Layers,
  Award,
  CircleCheck,
  CircleEllipsis,
  CircleX,
  FileText,
  Building,
  Upload,
  Edit2,
  ArrowLeft,
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
import { COUNTRY_CODES } from "@/data/countryCodes";

import { t as i18nT } from "@/i18n/t";
import { FeatureGate } from "@/components/ui/FeatureGate";
import {
  MarketingMessagesSwitch,
  WhatsAppCampaignScreen,
} from "@/components/shopkeeper/WhatsAppCampaign";
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
      optionTitle?: string;
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
  source: "created" | "order" | "both";
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
      optionTitle?: string;
      quantity: number;
    }>;
    status: string;
    orderType: string;
    deliveryAddress: string;
    pickupDate: string;
    pickupTime: string;
    transactionId?: string;
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
          <DialogTitle>{i18nT("Order Details")}</DialogTitle>
          <DialogDescription>
            Information for order <strong>{order.orderId}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <p>
            <strong>{i18nT("Order Date:")}</strong>{" "}
            {/* {new Date(order.createdAt).toLocaleString()} */}
            {formatDateTime(order.createdAt)}
          </p>
          <p>
            <strong>{i18nT("Total Amount:")}</strong> {formatPrice(order.totalAmount)}
          </p>
          <p>
            <strong>{i18nT("Status:")}</strong>{" "}
            <Badge variant="buttonOutline">{order.status}</Badge>
          </p>
          <p>
            <strong>{i18nT("Order Type:")}</strong> {order.orderType}
          </p>
          {order.deliveryAddress && (
            <p>
              <strong>{i18nT("Delivery Address:")}</strong> {order.deliveryAddress}
            </p>
          )}
          {order.pickupDate && (
            <p>
              <strong>{i18nT("Pickup Date:")}</strong> {formatDate(order.pickupDate)} at{" "}
              {order.pickupTime}
            </p>
          )}
          {order.transactionId && (
            <p>
              <strong>{i18nT("Transaction ID:")}</strong>{" "}
              <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">
                {order.transactionId}
              </span>
            </p>
          )}
          <Separator />
          <h3 className="text-lg font-semibold">{i18nT("Items Purchased")}</h3>

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
                  {[item.optionTitle, item.subcategoryName, item.variantTitle].filter((v) => v && v !== "Default").join(" · ")}
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
            {i18nT("Close")}
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
              {i18nT("Detailed information and order history for this customer.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Customer Details */}
            <Card>
              <CardHeader>
                <CardTitle>{i18nT("Customer Details")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>{i18nT("Email")}</Label>
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {customer.email}
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <Label>{i18nT("WhatsApp")}</Label>
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
                {/* Only campaigns read the opt-out, so the switch shows only
                    on a plan that has them. */}
                <FeatureGate feature="crmMarketingCampaign">
                  <MarketingMessagesSwitch customerId={customer.id} />
                </FeatureGate>
                <div className="flex justify-between items-center">
                  <Label>{i18nT("Total Orders")}</Label>
                  <p className="text-sm font-medium">{customer.totalOrders}</p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>{i18nT("Total Spent")}</Label>
                  <p className="text-sm font-medium">
                    {formatPrice(customer.totalSpent)}
                    {/* ${customer.totalSpent.toFixed(2)} */}
                  </p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>{i18nT("Average Order Value")}</Label>
                  <p className="text-sm font-medium">
                    {formatPrice(customer.averageOrderValue)}
                  </p>
                </div>
                <div className="flex justify-between items-center">
                  <Label>{i18nT("Last Order")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {customer.lastOrderDate}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Order History */}
            <FeatureGate feature="crmOrderHistory">
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
                              {item.productName}{item.optionTitle && item.optionTitle !== "Default" ? ` · ${item.optionTitle}` : ""} x{item.quantity}
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
            </FeatureGate>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="buttonOutline" onClick={onClose}>
              {i18nT("Close")}
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

interface Customer {
  id: string;
  name: string;
  whatsapp?: string;
}

interface AddCustomerDialogProps {
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

export function AddCustomerDialog({
  onClose,
  onCustomerAdded,
  shopkeeperId,
  customerToEdit, // New prop for edit mode
  mode = "add", // New prop: 'add' | 'edit'
  prefill, // Bot-supplied prefill for add mode
}: AddCustomerDialogProps & {
  customerToEdit?: Customer | null;
  mode?: "add" | "edit";
  prefill?: {
    firstName?: string;
    lastName?: string;
    whatsapp?: string;
    email?: string;
  } | null;
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

  useEffect(() => {
    setCountries(
      COUNTRY_CODES.map((c) => ({
        name: c.name,
        code: c.code,
        dialCode: c.dial_code,
      })),
    );
    setLoadingCountries(false);
  }, []);

  // NEW: Pre-fill form for edit mode
  useEffect(() => {
    if (customerToEdit && mode === "edit" && countries.length > 0) {
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
    } else if (mode === "add" && countries.length > 0) {
      // Apply bot-supplied prefill if present; otherwise reset to empty.
      if (prefill && (prefill.firstName || prefill.lastName || prefill.whatsapp || prefill.email)) {
        const raw = prefill.whatsapp || "";
        const match = raw.match(/^(\+\d{1,3})(.*)$/);
        let country: Country | null = null;
        let localNumber = raw;
        if (match) {
          const dialCode = match[1];
          localNumber = match[2].replace(/\s/g, "");
          country = countries.find((c) => c.dialCode === dialCode) || null;
        }
        setSelectedCountry(country);
        setFormData({
          firstName: prefill.firstName || "",
          lastName: prefill.lastName || "",
          whatsAppNumber: localNumber,
          email: prefill.email || "",
        });
        setErrors({});
      } else {
        resetForm();
      }
    }
  }, [customerToEdit, mode, countries, prefill]);

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

  // A customer who reached the CRM through an order (alone, or as well as
  // being added here) is a shared, platform-wide record: other shops message
  // that number, and the customer signs in with that e-mail. The API refuses
  // to change either from here (UsersService.updateUserByShopkeeper), so the
  // fields are shown but locked, and are neither validated nor sent — the
  // prefill cannot always split a stored number back into country code and
  // digits ("+1202…" reads as "+12"), and sending that back would be refused
  // as a change even when only the name was edited.
  const contactLocked =
    mode === "edit" && !!customerToEdit && customerToEdit.source !== "created";

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
    if (contactLocked) {
      // Locked, not sent — nothing to validate.
    } else if (!formData.whatsAppNumber.trim()) {
      newErrors.whatsAppNumber = "WhatsApp number is required";
    } else if (!/^\d{6,15}$/.test(formData.whatsAppNumber.trim())) {
      newErrors.whatsAppNumber =
        "Please enter a valid phone number (6-15 digits)";
    }

    // Validate country code
    if (!contactLocked && !selectedCountry) {
      newErrors.countryCode = "Please select a country code";
    }

    // Validate email (optional, but if provided must be valid)
    if (!contactLocked && formData.email.trim()) {
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
        title: i18nT("Error"),
        description: i18nT("No authentication token found"),
        variant: "destructive",
      });
      return;
    }
    const decoded: any = jwtDecode(token);
    const currentShopkeeperId = decoded.sub;

    if (!validateForm()) {
      toast({
        duration: 5000,
        title: i18nT("Validation Error"),
        description: i18nT("Please fix the errors in the form"),
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
        // Left out entirely when locked: the server then keeps what it has.
        ...(!contactLocked && { whatsAppNumber: fullWhatsAppNumber }),
        ...(!contactLocked &&
          formData.email.trim() && { email: formData.email.trim() }),
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

      // These routes now require the shop's own login (and check that the
      // shop in the URL is the one in the token), so the token goes along.
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        // The API's sentences are fixed English and double as i18n keys.
        const raw = Array.isArray(errorData?.message)
          ? errorData.message.join(" · ")
          : errorData?.message;
        throw new Error(
          raw
            ? i18nT(raw)
            : `Failed to ${mode === "edit" ? "update" : "add"} customer`,
        );
      }

      const data = await res.json();

      toast({
        duration: 5000,
        title: i18nT("Success"),
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
        title: i18nT("Error"),
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleClose}
          className="w-full sm:w-auto self-start"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> {i18nT("Back to Customers")}
        </Button>
        <div>
          <h2 className="text-lg font-semibold">
            {mode === "edit" ? "Edit Customer" : "Add New Customer"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "edit"
              ? "Update customer details."
              : "Enter customer details to add them to your customer list."}
          </p>
        </div>
      </div>

      <Card className="w-full">
        <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              placeholder={i18nT("Enter first name")}
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
              placeholder={i18nT("Enter last name")}
              className={errors.lastName ? "border-red-500" : ""}
              disabled={submitting}
            />
            {errors.lastName && (
              <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>
            )}
          </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

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
                disabled={submitting || contactLocked}
              >
                <SelectTrigger
                  className={`w-[110px] shrink-0 sm:w-[140px] ${
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
                      placeholder={i18nT("Search country...")}
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
                          <span className="text-muted-foreground text-sm">
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
                disabled={submitting || contactLocked}
              />
            </div>
            {(errors.whatsAppNumber || errors.countryCode) && (
              <p className="text-red-500 text-sm mt-1">
                {errors.whatsAppNumber || errors.countryCode}
              </p>
            )}
            {selectedCountry && formData.whatsAppNumber && (
              <p className="text-muted-foreground text-xs mt-1">
                Full number: {selectedCountry.dialCode}
                {formData.whatsAppNumber}
              </p>
            )}
          </div>

          {/* Email (Optional) */}
          <div>
            <Label htmlFor="email" className="font-medium mb-2 block">
              Email{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (Optional)
              </span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder={i18nT("customer@example.com")}
              className={errors.email ? "border-red-500" : ""}
              disabled={submitting || contactLocked}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
            {contactLocked && (
              <p className="text-muted-foreground text-xs mt-1">
                {i18nT(
                  "This customer ordered from your shop, so their WhatsApp number and e-mail belong to their own account. You can change the name only.",
                )}
              </p>
            )}
          </div>
          </div>

          {/* Action Buttons - Dynamic text */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="w-full sm:w-auto sm:min-w-[140px]"
            >
              {i18nT("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto sm:min-w-[160px]"
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
        </CardContent>
      </Card>
    </div>
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
        title: i18nT("Error"),
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
    return colors[status as keyof typeof colors] || "bg-muted text-foreground";
  };

  // Payment badge color
  const getPaymentBadge = (payment: string) => {
    const colors = {
      Unpaid: "bg-red-100 text-red-800 border-red-300",
      Partial: "bg-orange-100 text-orange-800 border-orange-300",
      Paid: "bg-green-100 text-green-800 border-green-300",
    };
    return (
      colors[payment as keyof typeof colors] || "bg-muted text-foreground"
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
            <CardDescription>{i18nT("Total Requests")}</CardDescription>
            <CardTitle className="text-3xl">{stats.totalRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {i18nT("All stall booking requests")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{i18nT("Confirmed Bookings")}</CardDescription>
            <CardTitle className="text-3xl">
              {stats.confirmedBookings}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {i18nT("Active and completed bookings")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{i18nT("Total Revenue")}</CardDescription>
            <CardTitle className="text-3xl">
              ${stats.totalRevenue.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{i18nT("From paid bookings")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{i18nT("Pending Requests")}</CardDescription>
            <CardTitle className="text-3xl">{stats.pendingRequests}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {i18nT("Awaiting organizer approval")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{i18nT("Events Participated")}</CardDescription>
            <CardTitle className="text-3xl">
              {stats.eventsParticipated}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {i18nT("Unique events joined")}
            </p>
          </CardContent>
        </Card>
      </div> */}

      {/* Events Participated Cards */}
      {/* {eventsParticipated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{i18nT("Events Participated")}</CardTitle>
            <CardDescription>
              {i18nT("Events where you have confirmed or completed stall bookings")}
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
                      <Badge className="bg-card/90 text-foreground">
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
          <CardTitle>{i18nT("Stall Booking Requests")}</CardTitle>
          <CardDescription>
            {i18nT("Manage all your stall booking requests across different events")}
          </CardDescription>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="status-filter">{i18nT("Status:")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{i18nT("All Status")}</SelectItem>
                  <SelectItem value="Pending">{i18nT("Pending")}</SelectItem>
                  <SelectItem value="Confirmed">{i18nT("Confirmed")}</SelectItem>
                  <SelectItem value="Processing">{i18nT("Processing")}</SelectItem>
                  <SelectItem value="Completed">{i18nT("Completed")}</SelectItem>
                  <SelectItem value="Cancelled">{i18nT("Cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Label htmlFor="payment-filter">{i18nT("Payment:")}</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger id="payment-filter" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{i18nT("All Payments")}</SelectItem>
                  <SelectItem value="Unpaid">{i18nT("Unpaid")}</SelectItem>
                  <SelectItem value="Partial">{i18nT("Partial")}</SelectItem>
                  <SelectItem value="Paid">{i18nT("Paid")}</SelectItem>
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
                {i18nT("No Stall Requests Found")}
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
                    <TableHead>{i18nT("Event")}</TableHead>
                    <TableHead>{i18nT("Request Date")}</TableHead>
                    <TableHead>{i18nT("Tables")}</TableHead>
                    <TableHead>{i18nT("Amount")}</TableHead>
                    <TableHead>{i18nT("Status")}</TableHead>
                    <TableHead>{i18nT("Payment")}</TableHead>
                    <TableHead>{i18nT("Actions")}</TableHead>
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
                            {i18nT("Not selected")}
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
                          {i18nT("View")}
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
              <DialogTitle>{i18nT("Stall Booking Details")}</DialogTitle>
              <DialogDescription>
                {i18nT("Complete information about your stall booking request")}
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
                      {i18nT("Event Gallery")}
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
                    <CardTitle>{i18nT("Booking Information")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <Label>{i18nT("Request ID")}</Label>
                      <p className="text-sm font-mono">{selectedRequest._id}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <Label>{i18nT("Status")}</Label>
                      <Badge className={getStatusBadge(selectedRequest.status)}>
                        {selectedRequest.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <Label>{i18nT("Payment Status")}</Label>
                      <Badge
                        className={getPaymentBadge(
                          selectedRequest.paymentStatus,
                        )}
                      >
                        {selectedRequest.paymentStatus}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <Label>{i18nT("Request Date")}</Label>
                      <p className="text-sm">
                        {/* {new Date(selectedRequest.requestDate).toLocaleString()} */}
                        {formatDateTime(selectedRequest.requestDate)}
                      </p>
                    </div>
                    {selectedRequest.confirmationDate && (
                      <div className="flex justify-between">
                        <Label>{i18nT("Confirmation Date")}</Label>
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
                        <Label>{i18nT("Table Selection Date")}</Label>
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
                        <Label>{i18nT("Payment Date")}</Label>
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
                        <Label>{i18nT("Completion Date")}</Label>
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
                        <Label>{i18nT("Notes")}</Label>
                        <p className="text-sm text-muted-foreground">
                          {selectedRequest.notes}
                        </p>
                      </div>
                    )}
                    {selectedRequest.cancellationReason && (
                      <div>
                        <Label>{i18nT("Cancellation Reason")}</Label>
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
                        {i18nT("No tables selected yet")}
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
                  <CardTitle>{i18nT("Price Breakdown")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>{i18nT("Tables Rental")}</span>
                      <span className="font-semibold">
                        {formatPrice(selectedRequest.tablesTotal)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>{i18nT("Deposit")}</span>
                      <span className="font-semibold">
                        {formatPrice(selectedRequest.depositTotal)}
                      </span>
                    </div>
                    {selectedRequest.addOnsTotal > 0 && (
                      <div className="flex justify-between">
                        <span>{i18nT("Add-ons")}</span>
                        <span className="font-semibold">
                          {formatPrice(selectedRequest.addOnsTotal)}
                        </span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between text-lg font-bold">
                      <span>{i18nT("Grand Total")}</span>
                      <span>{formatPrice(selectedRequest.grandTotal)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Organizer Information */}
              {selectedRequest.organizerId && (
                <Card>
                  <CardHeader>
                    <CardTitle>{i18nT("Organizer Information")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <Label>{i18nT("Organization")}</Label>
                      <p className="text-sm">
                        {selectedRequest.organizerId.organizationName}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <Label>{i18nT("Contact Person")}</Label>
                      <p className="text-sm">
                        {selectedRequest.organizerId.name}
                      </p>
                    </div>
                    <div className="flex justify-between">
                      <Label>{i18nT("WhatsApp Number")}</Label>
                      <a
                        href={`tel:${selectedRequest.organizerId.whatsAppNumber}`}
                        className="text-sm text-foreground hover:text-green-600"
                      >
                        {selectedRequest.organizerId.whatsAppNumber}
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <Label>{i18nT("Email")}</Label>
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
                {i18nT("Close")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface CRMPendingAction {
  action: "add";
  prefill?: {
    firstName?: string;
    lastName?: string;
    whatsapp?: string;
    email?: string;
  };
  key: number;
}

export function CRMManagement({
  pendingAction,
  onPendingActionConsumed,
}: {
  pendingAction?: CRMPendingAction | null;
  onPendingActionConsumed?: () => void;
} = {}) {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("users");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [stallRequests, setStallRequests] = useState<StallRequest[]>([]);
  const [showProductMarketing, setShowProductMarketing] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  // Prefill payload from the chatbot. AddCustomerDialog reads this on mount
  // (mode === "add") to populate the form before the shopkeeper clicks Create.
  const [addPrefill, setAddPrefill] = useState<{
    firstName?: string;
    lastName?: string;
    whatsapp?: string;
    email?: string;
  } | null>(null);

  // Chat-driven entry point: open the Add Customer dialog with optional
  // prefill. `pendingAction.key` re-fires this on every fresh bot intent.
  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction.action === "add") {
      setSelectedTab("users");
      setCustomerToEdit(null);
      setAddPrefill(pendingAction.prefill || null);
      // Leaves the campaign screen too, if it is up, so "Back to
      // Customers" from Add Customer lands on the list. A campaign that
      // is sending carries on (it runs on the server).
      setShowProductMarketing(false);
      setShowAddCustomer(true);
      onPendingActionConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction?.key]);

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
        title: i18nT("Error"),
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
        title: i18nT("Error"),
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
      setAddPrefill(null);
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
      title: i18nT("Feature Coming Soon"),
      description: i18nT("Event applications will be available in the next update."),
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
          <p>{i18nT("Loading customer data...")}</p>
        </div>
      </div>
    );
  }

  // Full-screen Add/Edit Customer view — replaces the CRM screen entirely
  // while active, matching the singadvisor convention: entity create/edit
  // forms get their own screen, not a Dialog.
  if (showAddCustomer) {
    return (
      <AddCustomerDialog
        onClose={closeAddCustomer}
        customerToEdit={customerToEdit}
        mode={customerToEdit ? "edit" : "add"}
        prefill={addPrefill}
      />
    );
  }

  // Full-screen WhatsApp Campaign — the same convention: it replaces the CRM
  // screen while active and Back returns to the list as it was (no refetch;
  // nothing a campaign does changes the customer list). Mounted only while
  // open, so leaving it stops every poll it runs — a campaign keeps sending
  // on the server, and is under History when the screen is opened again.
  if (showProductMarketing) {
    return (
      <WhatsAppCampaignScreen
        onBack={() => setShowProductMarketing(false)}
        customers={customers}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* CRM Stats Cards — same accent order as the dashboard tiles, so
          "first card is blue" reads the same on every screen. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: i18nT("Total Customers"),
            value: stats.totalCustomers,
            Icon: Users,
          },
          {
            label: i18nT("Active Customers"),
            value: stats.activeCustomers,
            Icon: FaUsers,
          },
          {
            label: i18nT("Local Customers"),
            value: stats.localCustomers,
            Icon: FaMapMarkerAlt,
          },
          {
            label: i18nT("International Customers"),
            value: stats.internationalCustomers,
            Icon: FaMapPin,
          },
        ].map((card, index) => {
          const accent = statAccent(index);
          return (
            <Card key={card.label} className={`border-l-4 ${accent.ring}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.label}
                </CardTitle>
                <span
                  className={`inline-flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 ${accent.chip}`}
                >
                  <card.Icon className={`h-4 w-4 ${accent.icon}`} />
                </span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}

        {/* <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {i18nT("Events Participated")}
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
              <TabsTrigger value="users">{i18nT("Customer Management")}</TabsTrigger>
              {/* <TabsTrigger value="organizers" className="relative">
                {i18nT("Organizer Management")}
              </TabsTrigger> */}
            </TabsList>
          </div>

          <div>
            <FeatureGate feature="crmMarketingCampaign">
              <Button
                onClick={() => setShowProductMarketing(true)}
                className="w-full md:w-auto mr-2"
              >
                <FaWhatsapp className="mr-2 h-4 w-4" />
                {i18nT("WhatsApp Campaign")}
              </Button>
            </FeatureGate>
            <Button
              onClick={() => addNewCustomer()}
              className="w-full md:w-auto"
            >
              <Plus className="h-4 w-4" />
              {i18nT("Add Customer")}
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
                  <CardTitle>{i18nT("Customer Database")}</CardTitle>
                  <CardDescription>
                    {i18nT("Manage your customer relationships and view order history.")}
                  </CardDescription>
                </div>

                {/* Right: Rows per page */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {i18nT("Rows per page:")}
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
                      <TableHead>{i18nT("Customer")}</TableHead>
                      <TableHead>{i18nT("Contact")}</TableHead>
                      <TableHead>{i18nT("Orders")}</TableHead>
                      <TableHead>{i18nT("Total Spent")}</TableHead>
                      <TableHead>{i18nT("Last Order")}</TableHead>
                      <TableHead>{i18nT("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-3">
                            <Avatar className="h-8 w-8">
                              {/* Only rendered when there is a real photo.
                                  These used to be pointed at a generated
                                  ui-avatars.com URL for every customer, which
                                  always loaded — so Radix never fell through to
                                  the fallback below and every avatar showed
                                  that service's grey default instead of the
                                  colour here. */}
                              {customer.avatar && (
                                <AvatarImage src={customer.avatar} />
                              )}
                              {/* Colour is hashed off the customer id, so it
                                  survives renames, re-sorts and reloads. Seeded
                                  with the id rather than the name for exactly
                                  that reason. */}
                              <AvatarFallback
                                className={`text-xs font-semibold ${avatarAccent(
                                  // `||` not `??`: an id that arrives as an
                                  // empty string is as useless a seed as a
                                  // missing one, and `??` would keep it and
                                  // fall through to the grey no-seed branch.
                                  customer.id || customer.name,
                                )}`}
                              >
                                {initials(customer.name)}
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
                            <FeatureGate feature="crmWhatsappMessage">
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
                            </FeatureGate>
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
                            <Badge variant="secondary">{i18nT("No orders")}</Badge>
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
                            <Button
                              variant="buttonOutline"
                              size="sm"
                              onClick={() => showEditCustomer(customer)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
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
                    {i18nT("No customers found")}
                  </h3>
                  <p className="text-muted-foreground">
                    {i18nT("Your customers will appear here once you receive orders.")}
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
                    {i18nT("Previous")}
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
                    {i18nT("Next")}
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

    </div>
  );
}
