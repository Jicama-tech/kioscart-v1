import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { jwtDecode } from "jwt-decode";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  variantTitle?: string;
  subcategoryName?: string;
  image?: string;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  date: string;
  items: OrderItem[];
  total: number;
  shopkeeperName: string;
  whatsappNumber?: string;
  status: string;
  deliveryDate?: string;
  shopkeeperAddress?: string;
}

export function RecentOrders() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<RecentOrder | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchOrders() {
      try {
        setLoading(true);
        const token = sessionStorage.getItem("token");
        if (!token) throw new Error("User not authenticated");

        const decoded = jwtDecode<{ sub: string }>(token);
        const userId = decoded.sub;

        const res = await fetch(
          `${__API_URL__}/orders/get-orders/user/${userId}`,
        );
        if (!res.ok) throw new Error("Failed to fetch orders");

        const data = await res.json();

        const mapped: RecentOrder[] = data.map((order: any) => ({
          id: order._id,
          orderNumber: order.orderId,
          date: order.createdAt || order.updatedAt || new Date().toISOString(),
          items: order.items,
          total: order.totalAmount,
          shopkeeperName: order.shopkeeperId?.shopName || "Unknown",
          whatsappNumber: order.shopkeeperId?.whatsappNumber,
          status: order.status || "Unknown",
          deliveryDate: order.deliveryDate,
          shopkeeperAddress: order.shopkeeper?.address,
        }));

        setOrders(mapped);
      } catch (err: any) {
        toast({
          duration: 5000,
          title: "Error loading orders",
          description: err.message || "Please try again later",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [toast]);

  if (loading)
    return (
      <div className="flex justify-center items-center h-48 text-gray-700">
        <span className="animate-pulse font-semibold">Loading orders...</span>
      </div>
    );

  if (orders.length === 0)
    return (
      <div className="flex justify-center items-center h-48 text-black/70">
        <p>No orders yet.</p>
      </div>
    );

  return (
    <>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        <h2 className="text-4xl font-extrabold tracking-tight text-black mb-6">
          My Orders
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {orders.map((order) => (
            <Card
              key={order.id}
              className="cursor-pointer border border-black/10 rounded-lg hover:ring-2 hover:ring-black transition"
              onClick={() => setSelectedOrder(order)}
              aria-label={`View details for order ${order.orderNumber}`}
            >
              <CardHeader className="pb-2 border-b border-black/10">
                <CardTitle className="text-xl font-semibold text-black">
                  {order.orderNumber}
                </CardTitle>
                <CardDescription className="text-sm text-black/60">
                  {new Date(order.date).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 pt-4">
                <div className="space-y-1 text-black">
                  <p className="font-medium">{order.shopkeeperName}</p>
                  <p className="text-sm">
                    {order.items.length} item
                    {order.items.length !== 1 ? "s" : ""}
                  </p>
                  <Badge
                    variant={
                      order.status === "cancelled" ? "destructive" : "outline"
                    }
                    className="capitalize text-black border-black/20"
                  >
                    {order.status}
                  </Badge>
                </div>
                <div className="text-right font-semibold text-lg text-black flex flex-col justify-center">
                  <span>${order.total.toFixed(2)}</span>
                  {order.deliveryDate && (
                    <Badge className="bg-black/10 text-black mt-2 py-1 rounded">
                      Delivered{" "}
                      {new Date(order.deliveryDate).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Dialog.Root
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 max-w-3xl m-auto rounded-lg bg-white shadow-xl p-8 overflow-y-auto outline-none w-full max-h-[90vh]">
            {selectedOrder && (
              <>
                <div className="flex justify-between items-center border-b border-black/10 pb-4 mb-6">
                  <Dialog.Title className="text-3xl font-extrabold leading-tight text-black">
                    Order #{selectedOrder.orderNumber}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close dialog"
                    >
                      <X className="w-6 h-6 text-black/60 hover:text-black transition" />
                    </Button>
                  </Dialog.Close>
                </div>

                <div className="text-black space-y-6">
                  <section>
                    <h3 className="text-2xl font-semibold mb-2">
                      Shopkeeper Details
                    </h3>
                    <p className="font-medium">
                      {selectedOrder.shopkeeperName}
                    </p>
                    {selectedOrder.shopkeeperAddress && (
                      <p className="text-black/70">
                        {selectedOrder.shopkeeperAddress}
                      </p>
                    )}
                    {selectedOrder.whatsappNumber && (
                      <p className="flex items-center gap-2 mt-2">
                        <a
                          href={`https://wa.me/${selectedOrder.whatsappNumber.replace(
                            /\D/g,
                            "",
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-green-600 hover:text-black transition"
                        >
                          <FaWhatsapp size={24} />
                          <span className="font-medium">
                            {selectedOrder.whatsappNumber}
                          </span>
                        </a>
                      </p>
                    )}
                    <Badge
                      variant={
                        selectedOrder.status === "cancelled"
                          ? "destructive"
                          : "outline"
                      }
                      className="capitalize mt-3 text-black border-black/20 px-3 py-1 inline-block"
                    >
                      {selectedOrder.status}
                    </Badge>
                  </section>

                  <section>
                    <h3 className="text-2xl font-semibold mb-4">
                      Purchased Items
                    </h3>
                    <ul className="divide-y divide-black/10 max-h-80 overflow-y-auto">
                      {selectedOrder.items.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-6 py-4">
                          {item.image && (
                            <img
                              src={__API_URL__ + item.image}
                              alt={item.productName}
                              loading="lazy"
                              className="w-24 h-24 rounded-md object-cover flex-shrink-0 border border-black/10"
                            />
                          )}
                          <div className="flex-1 space-y-1">
                            <p className="text-xl font-semibold">
                              {item.productName}
                            </p>
                            <div className="flex flex-wrap gap-3 text-black/70 text-sm">
                              {item.subcategoryName && (
                                <span className="border border-black/20 rounded-full px-3 py-1">
                                  {item.subcategoryName}
                                </span>
                              )}
                              {item.variantTitle && (
                                <span className="border border-black/20 rounded-full px-3 py-1">
                                  {item.variantTitle}
                                </span>
                              )}
                            </div>
                            <p className="text-black/80">
                              Qty: {item.quantity}
                            </p>
                          </div>
                          <p className="text-lg font-semibold w-20 text-right">
                            ${(item.price * item.quantity).toFixed(2)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="text-right mt-6 mb-4">
                    <p className="text-3xl font-extrabold">
                      ${selectedOrder.total.toFixed(2)}
                    </p>
                  </section>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
