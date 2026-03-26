// This file contains mock data for the store information and products.
// In a real application, this would come from your database.

export const mockStoreInfo = {
  name: "KiosCart Shop",
  tagline:
    "Premium artisanal products crafted to perfection. We deliver the finest experience.",
  logo: "/lovable-uploads/7cfe0914-4b43-4b77-a7a8-a82d46f48197.png",
  banner: "https://images.unsplash.com/photo-1441986300917-64674bd600d8",
  phone: "+1 (555) 123-4567",
  email: "hello@kioscart.com",
  address: "123 Main Street, City, State 12345",
  hours: "Mon-Fri: 9AM-6PM, Sat-Sun: 10AM-4PM",
  website: "www.kioscart.com",
};

export const mockProducts = [
  {
    id: 1,
    name: "Premium Coffee Blend",
    description:
      "Single-origin coffee with bright floral notes and citrus undertones. Light to medium roast that highlights the bean's natural complexity.",
    price: 24.99,
    originalPrice: 29.99,
    rating: 4.8,
    reviews: 124,
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e",
    category: "Coffee",
    featured: true,
    sale: true,
    badge: "Featured",
  },
  {
    id: 2,
    name: "Organic Cotton T-Shirt",
    description:
      "Full-bodied coffee with rich chocolate and caramel notes. Medium-dark roast perfect for espresso or drip brewing.",
    price: 35.0,
    rating: 4.9,
    reviews: 89,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
    category: "Apparel",
  },
  {
    id: 3,
    name: "Eco Water Bottle",
    description:
      "Bold and intense dark roast with smoky undertones. Perfect for those who prefer strong, robust coffee.",
    price: 45.0,
    originalPrice: 55.0,
    rating: 4.7,
    reviews: 156,
    image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8",
    category: "Drinkware",
    sale: true,
  },
  {
    id: 4,
    name: "Artisan Chips",
    description:
      "Hand-cooked kettle chips with sea salt. Crispy, crunchy, and made with organic potatoes.",
    price: 4.99,
    rating: 4.6,
    reviews: 73,
    image: "https://images.unsplash.com/photo-1566478989037-eec170784d0b",
    category: "Snacks",
  },
  {
    id: 5,
    name: "Dark Chocolate Bar",
    description:
      "Protein-packed energy bars with dark chocolate and almonds. Perfect for on-the-go nutrition.",
    price: 12.99,
    rating: 4.8,
    reviews: 92,
    image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52",
    category: "Snacks",
  },
  {
    id: 8,
    name: "Honey Cashews",
    description:
      "Premium cashews roasted with natural honey and a touch of sea salt.",
    price: 11.99,
    rating: 4.8,
    reviews: 145,
    image: "https://images.unsplash.com/photo-1599599810694-57a2ca8276a8",
    category: "Nuts & Seeds",
  },
];
