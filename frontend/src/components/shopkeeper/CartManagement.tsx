import { useEffect, useState, useMemo } from "react";
import { Timeline } from "primereact/timeline";
import { Tag } from "primereact/tag";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Package,
  DollarSign,
  TrendingUp,
  User,
  Mail,
  Trash2,
  Printer,
  Eye,
  Download,
  Receipt,
  CalendarDays,
  ShoppingBag,
  Share2Icon,
  PlaneIcon,
} from "lucide-react";
import { jwtDecode } from "jwt-decode";
import {
  FaDollarSign,
  FaRegPaperPlane,
  FaRupeeSign,
  FaWhatsapp,
} from "react-icons/fa";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { Textarea } from "../ui/textarea";

// Interfaces
interface ProductItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  image?: string;
  measurement?: string;
  variantTitle?: string;
  subcategoryName?: string;
}

type OrderStatus =
  | "pending"
  | "processing"
  | "ready"
  | "shipped"
  | "cancelled"
  | "completed";

interface Order {
  _id: string;
  orderId: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    whatsAppNumber: string;
  };
  shopkeeperId: string;
  items: ProductItem[];
  totalAmount: number;
  orderType: "pickup" | "delivery";
  status: string;
  deliveryAddress?: {
    street: string;
    city: string;
    state: string;
  } | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  createdAt: string;
  updatedAt: string;
  instructions?: string;
  statusHistory: {
    status: string;
    note: string;
    changedAt: string;
  }[];
}

interface ThermalPrintItem {
  type: number;
  content?: string;
  bold?: number;
  align?: number;
  format?: number;
  path?: string;
  value?: string;
  height?: number;
  size?: number;
}

export function CartManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [receiptViewOpen, setReceiptViewOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [shopkeeperInfo, setShopkeeperInfo] = useState<any>(null);
  const [printSelectionOpen, setPrintSelectionOpen] = useState(false); // New state
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [statusNoteDialogOpen, setStatusNoteDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    orderId: string;
    newStatus: string;
  } | null>(null);
  const [statusNote, setStatusNote] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const [amountSort, setAmountSort] = useState<"asc" | "desc" | "">("");
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const STATUS_OPTIONS = [
    { label: "Pending", value: "pending" },
    { label: "Processing", value: "processing" },
    { label: "Ready", value: "ready" },
    { label: "Shipped", value: "shipped" },
    { label: "Cancelled", value: "cancelled" },
    { label: "Completed", value: "completed" },
  ];

  const { toast } = useToast();
  const navigate = useNavigate();
  const API_URL = __API_URL__;

  useEffect(() => {
    fetchOrders();
    fetchShopkeeperInfo();
  }, []);

  async function fetchShopkeeperInfo() {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;

      const decoded: any = jwtDecode(token);
      const shopkeeperId = decoded.sub;
      const res = await fetch(
        `${API_URL}/shopkeepers/shopkeeper-detail/${shopkeeperId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        const data = await res.json();
        setShopkeeperInfo(data.data);
        setCountry(data.data.country);
      }
    } catch (error) {
      console.error("Error fetching shopkeeper info:", error);
    }
  }

  async function fetchOrders() {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("User not authenticated");

      const decoded: any = jwtDecode(token);
      const shopkeeperId = decoded.sub;

      const res = await fetch(
        `${API_URL}/orders/get-orders/shopkeeper/${shopkeeperId}`,
      );

      if (!res.ok) throw new Error("Failed to fetch orders");
      const data = await res.json();
      setOrders(data);
    } catch (error: any) {
      console.error(error);
      toast({
        duration: 5000,
        title: "Error",
        description: "Failed to fetch orders",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const timelineEvents =
    selectedOrder?.statusHistory
      ?.sort(
        (a, b) =>
          new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
      )
      .map((history) => ({
        status: history.status,
        note: history.note,
        date: new Date(history.changedAt).toLocaleString(),
        // changedBy: history.changedBy,
      })) || [];

  const getSeverity = (status: string) => {
    switch (status.toLowerCase()) {
      case "processing":
        return "info";
      case "ready":
        return "success";
      case "cancelled":
        return "danger";
      case "delivered":
        return "success";
      default:
        return "warning";
    }
  };

  const getLatestStatus = () => {
    if (!selectedOrder?.statusHistory?.length) return null;

    return [...selectedOrder.statusHistory].sort(
      (a, b) =>
        new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    )[0];
  };

  const sendLatestStatusToWhatsApp = () => {
    if (!selectedOrder) return;

    const latest = getLatestStatus();
    if (!latest) {
      alert("No status history found.");
      return;
    }

    const customerName = selectedOrder.userId?.name || "Customer";
    const orderId = selectedOrder.orderId;
    const status = latest.status?.toUpperCase();
    const note = latest.note || "No additional note provided.";

    const phone = selectedOrder.userId?.whatsAppNumber?.replace(/\D/g, "");

    if (!phone) {
      alert("Customer WhatsApp number not available.");
      return;
    }

    const message = `
Hello ${customerName},

Your Order (${orderId}) status has been updated.

Current Status: ${status}
Note: ${note}

Thank you for shopping with us.
  `;

    const encodedMessage = encodeURIComponent(message.trim());
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

    window.open(whatsappUrl, "_blank");
  };

  const generateWhatsAppMessage = (order: Order) => {
    const { _id, status, userId } = order;

    const shortOrderId = _id.toString().slice(-6).toUpperCase();
    const greeting = userId.name ? `Hi ${userId.name},\n\n` : `Hi,\n\n`;

    const messages: Record<OrderStatus, string> = {
      pending: `${greeting}🕒 Your order *#${shortOrderId}* has been received and is currently pending confirmation.\n\nWe’ll update you shortly.`,

      processing: `${greeting}⚙️ Your order *#${shortOrderId}* is now being processed.\n\nWe’re preparing it for you.`,

      ready: `${greeting}📦 Your order *#${shortOrderId}* is ready!\n\nIt will be shipped or made available shortly.`,

      shipped: `${greeting}🚚 Your order *#${shortOrderId}* has been shipped.\n\nIt’s on the way to you.`,

      cancelled: `${greeting}❌ Your order *#${shortOrderId}* has been cancelled.\n\nIf this was unexpected, please contact our support team.`,

      completed: `${greeting}🎉 Your order *#${shortOrderId}* has been completed successfully.\n\nThank you for shopping with us!`,
    };

    const phone = userId.whatsAppNumber.replace(/\D/g, ""); // digits only
    const text = encodeURIComponent(messages[status]);

    return `https://wa.me/${phone}?text=${text}`;
  };

  const handlePrintRequest = (order: Order) => {
    setPrintingOrder(order);
    setPrintSelectionOpen(true);
  };

  const fetchAndPreviewReceipt = async (type: "A4" | "58MM") => {
    if (!printingOrder) return;

    try {
      // Close selection, open loading/preview
      setPrintSelectionOpen(false);

      // 1. Fetch the specific type from backend
      const response = await fetch(
        `${API_URL}/orders/${printingOrder._id}/receipt?type=${type}`,
        {
          method: "GET",
        },
      );

      if (!response.ok) throw new Error("Failed to generate receipt");

      // 2. Create Blob URL
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // 3. Open the Receipt Preview Modal (Reuse your existing receiptViewOpen)
      setReceiptUrl(url);
      setReceiptViewOpen(true);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load receipt preview",
        variant: "destructive",
      });
    }
  };

  // ✅ Called when user picks a new status — opens note dialog first
  function promptStatusChange(orderId: string, newStatus: string) {
    setPendingStatusChange({ orderId, newStatus });
    setStatusNote("");
    setStatusNoteDialogOpen(true);
  }

  // ✅ Called after user confirms in the dialog
  async function handleStatusChange(
    orderId: string,
    newStatus: string,
    note: string,
  ) {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notes: note || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update status");
      }

      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order._id === orderId ? { ...order, status: newStatus } : order,
        ),
      );

      toast({
        duration: 5000,
        title: "Success",
        description: `Order status updated to ${newStatus}`,
      });
    } catch (error) {
      toast({
        duration: 5000,
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function downloadReceipt(orderId: string) {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/receipt`, {
        method: "GET",
      });

      if (!response.ok) return;

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${orderId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading receipt:", error);
    }
  }

  // Generate thermal print data for order
  function generateThermalPrintData(order: Order): ThermalPrintItem[] {
    const printData: ThermalPrintItem[] = [];

    // Store Header
    printData.push({
      type: 0,
      content: shopkeeperInfo?.shopName || "Your Store",
      bold: 1,
      align: 1,
      format: 2,
    });

    // Store Info
    if (shopkeeperInfo?.address) {
      printData.push({
        type: 0,
        content: shopkeeperInfo.address,
        bold: 0,
        align: 1,
        format: 4,
      });
    }

    if (shopkeeperInfo?.phone) {
      printData.push({
        type: 0,
        content: `Tel: ${shopkeeperInfo.phone}`,
        bold: 0,
        align: 1,
        format: 4,
      });
    }

    if (shopkeeperInfo?.GSTNumber) {
      printData.push({
        type: 0,
        content: `GSTIN: ${shopkeeperInfo.GSTNumber}`,
        bold: 0,
        align: 1,
        format: 4,
      });
    }

    // Separator line
    printData.push({
      type: 0,
      content: "================================",
      bold: 0,
      align: 1,
      format: 4,
    });

    // Receipt title
    printData.push({
      type: 0,
      content: "ORDER RECEIPT",
      bold: 1,
      align: 1,
      format: 3,
    });

    // Order details
    printData.push({
      type: 0,
      content: `Order #: ${order.orderId}`,
      bold: 1,
      align: 0,
      format: 0,
    });

    printData.push({
      type: 0,
      content: `Date: ${new Date(order.createdAt).toLocaleDateString()}`,
      bold: 0,
      align: 0,
      format: 0,
    });

    printData.push({
      type: 0,
      content: `Time: ${new Date(order.createdAt).toLocaleTimeString()}`,
      bold: 0,
      align: 0,
      format: 0,
    });

    // Customer info
    printData.push({
      type: 0,
      content: "--------------------------------",
      bold: 0,
      align: 0,
      format: 4,
    });

    printData.push({
      type: 0,
      content: `Customer: ${order.userId.name}`,
      bold: 1,
      align: 0,
      format: 0,
    });

    printData.push({
      type: 0,
      content: `Email: ${order.userId.email}`,
      bold: 0,
      align: 0,
      format: 4,
    });

    if (order.userId.whatsAppNumber) {
      printData.push({
        type: 0,
        content: `Phone: ${order.userId.whatsAppNumber}`,
        bold: 0,
        align: 0,
        format: 4,
      });
    }

    // Order type and delivery details
    printData.push({
      type: 0,
      content: `Type: ${order.orderType.toUpperCase()}`,
      bold: 1,
      align: 0,
      format: 0,
    });

    if (order.orderType === "delivery" && order.deliveryAddress) {
      printData.push({
        type: 0,
        content: "Delivery Address:",
        bold: 1,
        align: 0,
        format: 0,
      });

      printData.push({
        type: 0,
        content: order.deliveryAddress.street,
        bold: 0,
        align: 0,
        format: 4,
      });

      printData.push({
        type: 0,
        content: `${order.deliveryAddress.city}, ${order.deliveryAddress.state}`,
        bold: 0,
        align: 0,
        format: 4,
      });

      if (order.instructions) {
        printData.push({
          type: 0,
          content: `Notes: ${order.instructions}`,
          bold: 0,
          align: 0,
          format: 4,
        });
      }
    }

    if (order.orderType === "pickup" && order.pickupDate) {
      printData.push({
        type: 0,
        content: `Pickup Date: ${new Date(
          order.pickupDate,
        ).toLocaleDateString()}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      if (order.pickupTime) {
        printData.push({
          type: 0,
          content: `Pickup Time: ${order.pickupTime}`,
          bold: 0,
          align: 0,
          format: 0,
        });
      }
    }

    // Items header
    printData.push({
      type: 0,
      content: "================================",
      bold: 0,
      align: 0,
      format: 4,
    });

    printData.push({
      type: 0,
      content: "ITEMS ORDERED",
      bold: 1,
      align: 1,
      format: 3,
    });

    printData.push({
      type: 0,
      content: "--------------------------------",
      bold: 0,
      align: 0,
      format: 4,
    });

    // Items list
    order.items.forEach((item) => {
      printData.push({
        type: 0,
        content: item.productName,
        bold: 1,
        align: 0,
        format: 0,
      });

      if (item.subcategoryName) {
        printData.push({
          type: 0,
          content: `Category: ${item.subcategoryName}`,
          bold: 0,
          align: 0,
          format: 4,
        });
      }

      if (item.variantTitle) {
        printData.push({
          type: 0,
          content: `Variant: ${item.variantTitle}`,
          bold: 0,
          align: 0,
          format: 4,
        });
      }

      printData.push({
        type: 0,
        content: `Qty: ${item.quantity} x ${item.price.toFixed(2)} = ${(
          item.quantity * item.price
        ).toFixed(2)}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      // Empty line between items
      printData.push({
        type: 0,
        content: " ",
        bold: 0,
        align: 0,
        format: 4,
      });
    });

    // Total section
    printData.push({
      type: 0,
      content: "================================",
      bold: 0,
      align: 0,
      format: 4,
    });

    const subtotal = order.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0,
    );
    const tax = order.totalAmount - subtotal;

    printData.push({
      type: 0,
      content: `Subtotal: $${subtotal.toFixed(2)}`,
      bold: 0,
      align: 2,
      format: 0,
    });

    if (tax > 0) {
      printData.push({
        type: 0,
        content: `Tax: $${tax.toFixed(2)}`,
        bold: 0,
        align: 2,
        format: 0,
      });
    }

    printData.push({
      type: 0,
      content: `TOTAL: $${order.totalAmount.toFixed(2)}`,
      bold: 1,
      align: 2,
      format: 1,
    });

    // Status
    printData.push({
      type: 0,
      content: "--------------------------------",
      bold: 0,
      align: 0,
      format: 4,
    });

    printData.push({
      type: 0,
      content: `Status: ${order.status.toUpperCase()}`,
      bold: 1,
      align: 1,
      format: 0,
    });

    // QR Code for order tracking (optional)
    printData.push({
      type: 3,
      value: `Order: ${order.orderId}`,
      size: 40,
      align: 1,
    });

    // Footer
    printData.push({
      type: 0,
      content: " ",
      bold: 0,
      align: 0,
      format: 4,
    });

    printData.push({
      type: 0,
      content: "Thank you for your order!",
      bold: 1,
      align: 1,
      format: 0,
    });

    printData.push({
      type: 0,
      content: "Visit us again!",
      bold: 0,
      align: 1,
      format: 4,
    });

    return printData;
  }

  // Create thermal print endpoint
  async function createThermalPrintEndpoint(order: Order): Promise<string> {
    const printData = generateThermalPrintData(order);
    try {
      // Create a temporary endpoint for the print data
      const response = await fetch(`${API_URL}/orders/create-print-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: order._id,
          printData: printData,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create print data");
      }

      const result = await response.json();
      return `${API_URL}/orders/print-data/${result.printId}`;
    } catch (error) {
      console.error("Error creating print endpoint:", error);
      // Fallback: create a data URL
      const dataUrl = `data:application/json,${encodeURIComponent(
        JSON.stringify(printData),
      )}`;
      return dataUrl;
    }
  }

  // Handle thermal print
  async function handleThermalPrint(order: Order) {
    try {
      // First show the preview
      setPrintOrder(order);
      setPrintPreviewOpen(true);
    } catch (error) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Failed to prepare print data",
        variant: "destructive",
      });
    }
  }

  const deliveryAddressLine = [
    printOrder?.deliveryAddress?.street,
    printOrder?.deliveryAddress?.city,
    printOrder?.deliveryAddress?.state,
  ]
    .filter(Boolean)
    .join(", ");

  // Execute thermal print
  async function executeThermalPrint() {
    if (!printOrder) return;

    try {
      const printEndpoint = await createThermalPrintEndpoint(printOrder);

      // Create the Bluetooth Print app link
      const bluetoothPrintLink = `bprint://${printEndpoint}`;

      // Try to open the Bluetooth Print app
      const printWindow = window.open(bluetoothPrintLink, "_blank");

      if (!printWindow) {
        toast({
          duration: 5000,
          title: "Print App Required",
          description:
            "Please install the Bluetooth Print app from the App Store to use thermal printing.",
          variant: "destructive",
        });
        return;
      }

      toast({
        duration: 5000,
        title: "Print Command Sent",
        description:
          "Opening Bluetooth Print app. Make sure your thermal printer is connected.",
      });

      setPrintPreviewOpen(false);
      setPrintOrder(null);
    } catch (error) {
      toast({
        duration: 5000,
        title: "Print Error",
        description: "Failed to send print command to thermal printer",
        variant: "destructive",
      });
    }
  }

  const handleShareOrDownload = async (orderId: string) => {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/receipt`, {
        method: "GET",
      });

      if (!response.ok) throw new Error("Failed to fetch receipt");

      const blob = await response.blob();
      const file = new File([blob], `receipt-${orderId}.pdf`, {
        type: "application/pdf",
      });

      // 📱 If Web Share API (mobile) supports file sharing:
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Order Receipt",
          text: "Here is your order receipt.",
          files: [file],
        });
      } else {
        // 💻 Fallback: download file (desktop)
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `receipt-${orderId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error sharing/downloading receipt:", error);
    }
  };

  // Other existing functions (handleDeleteOrder, etc.) remain the same...
  async function handleDeleteOrder() {
    if (!deletingOrderId) return;
    setDeleting(true);

    try {
      const res = await fetch(
        `${API_URL}/orders/delete-order/${deletingOrderId}`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) throw new Error("Failed to delete order");

      setOrders(orders.filter((order) => order.orderId !== deletingOrderId));
      toast({ duration: 5000, title: "Order deleted successfully." });
      setDeleteDialogOpen(false);
    } catch (error) {
      toast({
        duration: 5000,
        title: "Failed to delete order.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeletingOrderId(null);
    }
  }

  function openOrderDetails(order: Order) {
    setSelectedOrder(order);
    setViewOpen(true);
  }

  function closeModal() {
    setViewOpen(false);
    setSelectedOrder(null);
  }

  function openReceiptView(orderId: string) {
    setReceiptUrl(`${API_URL}/orders/${orderId}/receipt`);
    setReceiptViewOpen(true);
  }

  function closeReceiptView() {
    setReceiptViewOpen(false);
    setReceiptUrl(null);
  }

  const promptDeleteOrder = (orderId: string) => {
    setDeletingOrderId(orderId);
    setDeleteDialogOpen(true);
  };

  const clearFilters = () => {
    setStatusFilter("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
    setCustomerNameFilter("");
    setAmountSort("");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Filtered orders logic remains the same...
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (statusFilter) {
      result = result.filter((order) => order.status === statusFilter);
    }

    if (typeFilter) {
      result = result.filter((order) => order.orderType === typeFilter);
    }

    if (dateFrom || dateTo) {
      result = result.filter((order) => {
        const orderDate = new Date(order.createdAt).getTime();
        if (dateFrom && orderDate < new Date(dateFrom).getTime()) return false;
        if (dateTo && orderDate > new Date(dateTo).getTime() + 86400000)
          return false;
        return true;
      });
    }

    if (customerNameFilter) {
      const term = customerNameFilter.toLowerCase();
      result = result.filter((order) =>
        order.userId.name.toLowerCase().includes(term),
      );
    }

    if (amountSort === "asc") {
      result.sort((a, b) => a.totalAmount - b.totalAmount);
    } else if (amountSort === "desc") {
      result.sort((a, b) => b.totalAmount - a.totalAmount);
    }

    return result;
  }, [
    orders,
    statusFilter,
    typeFilter,
    dateFrom,
    dateTo,
    customerNameFilter,
    amountSort,
  ]);

  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((acc, o) => acc + o.totalAmount, 0);
  const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
  const todaysOrders = orders.filter((order) => {
    const orderDate = new Date(order.createdAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orderDate.toDateString() === today.toDateString();
  }).length;
  const pendingOrders = orders.filter(
    (order) =>
      order.status === "pending" ||
      order.status === "ready" ||
      order.status === "shipped" ||
      order.status === "processing",
  ).length;

  function ConfirmDeleteDialog({
    open,
    onConfirm,
    onCancel,
    loading,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    loading: boolean;
  }) {
    return (
      <Dialog open={open} onOpenChange={onCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Order?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this order? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="buttonOutline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function LoadingOverlay({ show }: { show: boolean }) {
    if (!show) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Blurred backdrop */}
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />

        {/* Loader */}
        <div className="relative z-10 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (orders.length === 0) return <div>No orders found.</div>;

  return (
    <>
      {/* Top stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* 🛒 Total Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Overall Orders
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
          </CardContent>
        </Card>

        {/* 💰 Total Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Overall Revenue
            </CardTitle>
            {shopkeeperInfo?.country === "IN" ? (
              <FaRupeeSign className="h-4 w-4 text-muted-foreground" />
            ) : (
              <FaDollarSign className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {" "}
              {formatPrice(totalRevenue)}
            </div>
            {/* <p className="text-xs text-muted-foreground">Till Today</p> */}
          </CardContent>
        </Card>

        {/* 📈 Average Order Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Today's Orders
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {todaysOrders}
            </div>
            {/* <p className="text-xs text-muted-foreground">Orders placed today</p> */}
          </CardContent>
        </Card>

        {/* 📅 New: Today's Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Orders
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {pendingOrders}
            </div>
            {/* <p className="text-xs text-muted-foreground">Waiting For Action</p> */}
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter and sort your orders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Order Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer Name</Label>
              <Input
                placeholder="Search by name"
                value={customerNameFilter}
                onChange={(e) => setCustomerNameFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Total Amount</Label>
              <Select
                value={amountSort}
                onValueChange={(v) => setAmountSort(v as any)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">None</SelectItem>
                  <SelectItem value="asc">Lowest First</SelectItem>
                  <SelectItem value="desc">Highest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={clearFilters}
            variant="buttonOutline"
            className="mt-4"
          >
            Clear All Filters
          </Button>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: Title */}
            <div>
              <CardTitle>Order Management</CardTitle>
              <CardDescription>
                Track and manage customer orders
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact Details</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center">
                    No orders match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order) => (
                  <TableRow key={order._id}>
                    <TableCell className="font-mono">{order.orderId}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {order.userId.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          <a
                            href={`mailto:${order.userId.email}`}
                            className="text-blue-600 hover:underline"
                          >
                            {order.userId.email}
                          </a>
                        </div>
                        {order.userId.whatsAppNumber && (
                          <div className="flex items-center gap-1 text-sm">
                            <FaWhatsapp className="h-3 w-3 text-green-500" />
                            <a
                              href={`https://wa.me/${order.userId.whatsAppNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:underline"
                            >
                              {order.userId.whatsAppNumber}
                            </a>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {order.items.length}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {/* ${order.totalAmount.toFixed(2)} */}
                      {formatPrice(order.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">{order.orderType}</span>
                    </TableCell>
                    <TableCell>{formatDate(order.createdAt)}</TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        onValueChange={(val) =>
                          promptStatusChange(order._id, val)
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="buttonOutline"
                          size="sm"
                          onClick={() => {
                            const url = generateWhatsAppMessage(order);
                            window.open(url, "_blank");
                          }}
                          className="flex items-center gap-1"
                        >
                          <FaRegPaperPlane className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="buttonOutline"
                          size="sm"
                          onClick={() => openOrderDetails(order)}
                          className="flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="buttonOutline"
                          size="sm"
                          onClick={() => handlePrintRequest(order)}
                          className="flex items-center gap-1"
                        >
                          <Printer className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="buttonOutline"
                          size="sm"
                          onClick={() => promptDeleteOrder(order.orderId)}
                          className="flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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

      {/* Existing modals... */}
      {selectedOrder && (
        <Dialog
          open={viewOpen}
          onOpenChange={(flag) => {
            if (!flag) closeModal();
          }}
        >
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order {selectedOrder.orderId}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Customer</h3>
                <p>Name: {selectedOrder.userId.name}</p>
                <p>Email: {selectedOrder.userId.email}</p>
                <p>WhatsApp Number: {selectedOrder.userId.whatsAppNumber}</p>
              </div>

              <div>
                <h3 className="font-semibold">Items Purchased</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 border rounded"
                    >
                      {item.image ? (
                        <img
                          loading="lazy"
                          src={API_URL + item.image}
                          alt={item.productName}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{item.productName}</p>
                        {item.subcategoryName && (
                          <p className="text-sm text-gray-600">
                            {item.subcategoryName}
                          </p>
                        )}
                        {item.variantTitle && (
                          <p className="text-sm text-gray-500">
                            Variant: {item.variantTitle}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p>Qty: {item.quantity}</p>
                        <p>
                          Price: {formatPrice(item.price)} / {item.measurement}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mt-4 mb-2">Order Timeline</h3>

                <div className="relative border-l pl-6 space-y-6">
                  {selectedOrder.statusHistory
                    .sort(
                      (a, b) =>
                        new Date(a.changedAt).getTime() -
                        new Date(b.changedAt).getTime(),
                    )
                    .map((history, index) => (
                      <div key={index} className="relative">
                        <span className="absolute -left-3 top-1 w-3 h-3 bg-green-600 rounded-full"></span>

                        <div className="bg-gray-50 p-3 rounded-md border">
                          <p className="font-medium capitalize">
                            {history.status}
                          </p>

                          <p className="text-sm text-gray-600">
                            {new Date(history.changedAt).toLocaleString()}
                          </p>

                          {history.note && (
                            <p className="text-sm mt-1">Note: {history.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold">Order Summary</h3>
                <p>Total Amount: {formatPrice(selectedOrder.totalAmount)}</p>
                <p>Order Type: {selectedOrder.orderType}</p>

                {selectedOrder.orderType === "delivery" &&
                  selectedOrder.deliveryAddress && (
                    <>
                      <h4 className="font-semibold mt-2">Delivery Address</h4>
                      <p>{selectedOrder.deliveryAddress.street}</p>
                      <p>
                        {selectedOrder.deliveryAddress.city},{" "}
                        {selectedOrder.deliveryAddress.state}
                      </p>
                      {selectedOrder.instructions && (
                        <p>
                          Special Instructions: {selectedOrder.instructions}
                        </p>
                      )}
                    </>
                  )}

                {selectedOrder.orderType === "pickup" && (
                  <>
                    <h4 className="font-semibold mt-2">Pickup Details</h4>
                    <p>
                      Date:{" "}
                      {new Date(selectedOrder.pickupDate!).toLocaleDateString()}
                    </p>
                    <p>Time: {selectedOrder.pickupTime}</p>
                    {selectedOrder.instructions && (
                      <p>Special Instructions: {selectedOrder.instructions}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={closeModal}>Close</Button>
              <Button variant="whatsApp" onClick={sendLatestStatusToWhatsApp}>
                <FaWhatsapp /> Send Status on WhatsApp
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Print Preview Dialog */}
      <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
        <DialogContent className="max-w-md w-[90vw] sm:w-full max-h-[85vh] overflow-y-auto p-4">
          <DialogHeader className="sticky top-0 bg-white z-10 pb-2 border-b">
            <DialogTitle className="text-base sm:text-lg font-semibold">
              Print Receipt
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Preview of thermal printer receipt
            </DialogDescription>
          </DialogHeader>

          {printOrder && (
            <div className="space-y-4 mt-2">
              {/* 🧾 Thermal Receipt Style */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 font-mono text-[13px] sm:text-sm shadow-sm">
                {/* Shop Info */}
                <div className="text-center mb-2">
                  <div className="font-bold text-lg">
                    {shopkeeperInfo?.shopName || "Shop Name"}
                  </div>
                  {shopkeeperInfo?.phone && (
                    <div>Phone: {shopkeeperInfo.phone}</div>
                  )}
                  {shopkeeperInfo?.businessEmail && (
                    <div>Email: {shopkeeperInfo.businessEmail}</div>
                  )}
                  {shopkeeperInfo?.GSTNumber && (
                    <div>GSTIN: {shopkeeperInfo.GSTNumber}</div>
                  )}
                  <div className="my-2 border-t border-dashed border-gray-300"></div>
                </div>

                {/* Order Info */}
                <div className="space-y-1">
                  <div className="font-bold">
                    Order #:{" "}
                    <span className="font-normal">
                      {printOrder.orderId?.slice(-6)?.toUpperCase() || "N/A"}
                    </span>
                  </div>
                  <div>
                    Date: {new Date(printOrder.createdAt).toLocaleDateString()}
                  </div>
                  <div>
                    Time:{" "}
                    {new Date(printOrder.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>

                <div className="my-2 border-t border-dashed border-gray-300"></div>

                {/* Customer Info */}
                <div className="space-y-1">
                  <div className="font-bold">Customer:</div>
                  <div>Name: {printOrder.userId.name}</div>
                  {printOrder.userId.whatsAppNumber && (
                    <div>Phone: {printOrder.userId.whatsAppNumber}</div>
                  )}
                  {printOrder.userId.email && (
                    <div>Email: {printOrder.userId.email}</div>
                  )}
                  {printOrder.orderType === "pickup" && (
                    <>
                      <div>Order Type: {printOrder?.orderType}</div>
                      <div>
                        PickUp Address:{" "}
                        {printOrder?.pickupDate
                          ? new Date(printOrder.pickupDate).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : ""}{" "}
                        {printOrder?.pickupTime}
                      </div>
                    </>
                  )}
                  {printOrder.orderType === "delivery" && (
                    <>
                      <div>Order Type: {printOrder.orderType}</div>
                      <div>Delivery Address: {deliveryAddressLine}</div>
                    </>
                  )}
                </div>

                <div className="my-2 border-t border-dashed border-gray-300"></div>

                {/* Items */}
                <div>
                  <div className="font-bold mb-1">Items:</div>
                  {printOrder.items.map((item, index) => (
                    <div key={index} className="mb-1">
                      <div className="font-semibold">{item.productName}</div>
                      {item.subcategoryName && (
                        <div className="text-xs text-gray-600">
                          ({item.subcategoryName}
                          {item.variantTitle ? `, ${item.variantTitle}` : ""})
                        </div>
                      )}
                      <div>
                        {item.quantity} × {formatPrice(item.price)} ={" "}
                        {formatPrice(item.quantity * item.price)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="my-2 border-t border-dashed border-gray-300"></div>

                {/* Totals */}
                <div className="text-right space-y-1">
                  {shopkeeperInfo?.taxPercentage && (
                    <div>
                      Tax: {getSymbol()}{" "}
                      {formatPrice(
                        (shopkeeperInfo.taxPercentage *
                          printOrder.totalAmount) /
                          (100 + shopkeeperInfo.taxPercentage),
                      )}
                    </div>
                  )}
                  <div className="font-bold">
                    Total: {formatPrice(printOrder.totalAmount)}
                  </div>
                </div>

                <div className="my-2 border-t border-dashed border-gray-300"></div>

                {/* Payment Info */}
                <div className="space-y-1">
                  <div>Payment: Online</div>
                  <div>Status: {printOrder.status?.toUpperCase()}</div>
                </div>

                <div className="my-2 border-t border-dashed border-gray-300"></div>

                {/* Footer */}
                <div className="text-center mt-3 text-[13px]">
                  <div className="font-semibold">Thank you for your order!</div>
                  <div>Visit us again!</div>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <p>This will be sent to your Bluetooth thermal printer.</p>
                <p>Ensure your printer is connected and ready.</p>
              </div>
            </div>
          )}

          {/* ✅ Buttons fixed at bottom */}
          <div className="flex justify-end gap-2 mt-4 sticky bottom-0 bg-white pt-3 border-t">
            <Button
              variant="buttonOutline"
              onClick={() => setPrintPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => await handleShareOrDownload(printOrder._id)}
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              onClick={async () => await downloadReceipt(printOrder._id)}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🧾 Receipt View Dialog */}
      <Dialog open={receiptViewOpen} onOpenChange={closeReceiptView}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader className="sticky top-0 bg-white z-10 pb-2 border-b">
            <DialogTitle className="text-base sm:text-lg">
              Receipt View
            </DialogTitle>
          </DialogHeader>

          <div className="h-[70vh] sm:h-[80vh]">
            {receiptUrl ? (
              <iframe
                src={receiptUrl}
                className="w-full h-full border-0 rounded-md"
                title="Receipt"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading...
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={closeReceiptView}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Format Selection Dialog */}
      <Dialog open={printSelectionOpen} onOpenChange={setPrintSelectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Print Format</DialogTitle>
            <DialogDescription>
              Choose the receipt format you want to generate for Order #
              {printingOrder?.orderId}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Option 1: Thermal 58mm */}
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover:bg-slate-50 border-2 hover:border-blue-500"
              onClick={() => fetchAndPreviewReceipt("58MM")}
            >
              <Receipt className="h-8 w-8 text-slate-600" />
              <span className="font-semibold">Thermal (58mm)</span>
            </Button>

            {/* Option 2: Standard A4 */}
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 hover:bg-slate-50 border-2 hover:border-blue-500"
              onClick={() => fetchAndPreviewReceipt("A4")}
            >
              <Printer className="h-8 w-8 text-slate-600" />
              <span className="font-semibold">Standard (A4)</span>
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => setPrintSelectionOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Change Notes Dialog */}
      <Dialog
        open={statusNoteDialogOpen}
        onOpenChange={setStatusNoteDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              Changing status to{" "}
              <span className="font-semibold capitalize">
                {pendingStatusChange?.newStatus}
              </span>
              . Add an optional note for this status change.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-2">
            <Label htmlFor="statusNote">Note (Optional)</Label>
            <Textarea
              id="statusNote"
              placeholder="e.g. Order dispatched via courier, expected delivery in 2 days..."
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="buttonOutline"
              onClick={() => {
                setStatusNoteDialogOpen(false);
                setPendingStatusChange(null);
                setStatusNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingStatusChange) {
                  handleStatusChange(
                    pendingStatusChange.orderId,
                    pendingStatusChange.newStatus,
                    statusNote,
                  );
                }
                setStatusNoteDialogOpen(false);
                setPendingStatusChange(null);
                setStatusNote("");
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeletingOrderId(null);
        }}
        onConfirm={handleDeleteOrder}
        loading={deleting}
      />

      <LoadingOverlay show={loading} />
    </>
  );
}
