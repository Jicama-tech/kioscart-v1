import { Button } from "@/components/ui/button";
import Navbar from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";
import FeatureCard from "@/components/ui/featureCard";
import PricingCard from "@/components/ui/PricingCard";
import StepCard from "@/components/ui/StepCard";
import SectionHeader from "@/components/ui/sectionHeader";
import {
  ShoppingBag,
  CreditCard,
  MessageCircle,
  Palette,
  BarChart3,
  Globe,
  Shield,
  Cog,
  Monitor,
  Package,
  Truck,
  Tags,
  ArrowRight,
  Percent,
  Layers,
  Smartphone,
  RefreshCw,
  Headphones,
  Mail,
} from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Check, Gift, Rocket } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

const Eshop = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const [openDropdowns, setOpenDropdowns] = useState({});

  const toggleDropdown = (categoryName) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }));
  };
  const onShowOrganizerLogin = () => {
    navigate("/estore/login");
  };

  const contactUs = () => {
    navigate("/contact");
  };

  const links = [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
    { href: "/estore", label: "Eshop" },
    { href: "/contact", label: "Contact Us" },
    // { href: "/pricing", label: "Pricing" },
    // { href: "/blog", label: "Blog" },
    // { href: "/faq", label: "FAQ" },
  ];

  const howItWorksRef = useRef<HTMLDivElement | null>(null);

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-auto flex items-center">
                <img
                  src="/KiosCartLogo.png"
                  alt="KiosCart - Build Sell Thrive"
                  className="object-contain h-30 sm:h-30 md:h-30 lg:h-40 w-auto"
                  loading="lazy"
                />
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "font-medium transition-colors hover:text-eshop",
                    location.pathname === link.href
                      ? "text-eshop"
                      : "text-muted-foreground",
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Button variant="eshop" onClick={onShowOrganizerLogin}>
                Get Started
              </Button>
              {/* <Button variant="event">Get Started</Button> */}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isOpen && (
            <div className="md:hidden py-4 border-t border-border animate-fade-up">
              {links.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    "block py-3 font-medium transition-colors hover:text-eShop",
                    location.pathname === link.href
                      ? "text-eShop"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
                <Button variant="eshop" onClick={onShowOrganizerLogin}>
                  Sign In
                </Button>
                {/* <Button variant="buttonOutline" onClick={onShowLogin}>
                  Get Started
                </Button> */}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 gradient-eshop min-h-[85vh] flex items-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6 animate-fade-up">
              <ShoppingBag className="w-4 h-4 text-primary-foreground" />
              <span className="text-primary-foreground text-sm font-medium">
                E-Commerce Platform
              </span>
            </div>

            <h1
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-primary-foreground mb-6 animate-fade-up"
              style={{ animationDelay: "0.1s" }}
            >
              Launch Your Store in Minutes
            </h1>

            <p
              className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto animate-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              Sell smarter. Grow Faster. Scale Effortlessly. Everything you need
              to build and run a successful online store.
            </p>

            <div
              className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up"
              style={{ animationDelay: "0.3s" }}
            >
              {/* <Button variant="eshopOutline" size="xl">
                Start Selling Now <ArrowRight className="ml-2" />
              </Button> */}
              <Button
                variant="eshopOutline"
                size="xl"
                className="bg-transparent"
                onClick={scrollToHowItWorks}
              >
                How it Works
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Features Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader
            title="Powerful E-Commerce Features"
            subtitle="Everything you need to build, launch, and scale your online store"
          />

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <FeatureCard
              icon={Package}
              title="Unlimited Products"
              description="Add unlimited products with variants, images, and detailed descriptions."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={CreditCard}
              title="Smart Payments"
              description="QR payments, multiple gateways, and secure checkout experiences."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={MessageCircle}
              title="WhatsApp Power"
              description="Marketing automation, order notifications, and customer support."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={Palette}
              title="Your Brand, Your Way"
              description="Unlimited customization to match your brand identity perfectly."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={BarChart3}
              title="Real-Time Analytics"
              description="Data-driven decisions with comprehensive sales dashboards."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={Globe}
              title="Global Ready"
              description="Multi-language support and international shipping options."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={Shield}
              title="Enterprise-Level Security"
              description="Secure payments, auto backups, and SSL encryption included."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={Cog}
              title="Full Customization"
              description="Automate orders, receipts, inventory, and everything else."
              iconClassName="gradient-eshop"
            />
            <FeatureCard
              icon={Monitor}
              title="Kiosk Mode"
              description="In-store selling made easy with POS functionality."
              iconClassName="gradient-eshop"
            />
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <SectionHeader
            title="Built for Growth"
            subtitle="Advanced features to take your business to the next level"
          />

          <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Truck
                className="w-10 h-10 text-eshop mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Shipping Integration
              </h4>
              <p className="text-muted-foreground text-sm">
                Connect with major carriers
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Tags
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Discount Codes
              </h4>
              <p className="text-muted-foreground text-sm">
                Create powerful promotions
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Percent
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Tax Management
              </h4>
              <p className="text-muted-foreground text-sm">
                Automatic tax calculations
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Layers
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Inventory Sync
              </h4>
              <p className="text-muted-foreground text-sm">
                Real-time stock tracking
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Smartphone
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">Mobile App</h4>
              <p className="text-muted-foreground text-sm">Manage on the go</p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <RefreshCw
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Easy Returns
              </h4>
              <p className="text-muted-foreground text-sm">
                Streamlined return process
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Headphones
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Customer Support
              </h4>
              <p className="text-muted-foreground text-sm">
                Built-in help desk
              </p>
            </div>
            <div className="bg-card p-6 rounded-2xl shadow-card text-center hover:shadow-hover transition-all duration-300 hover:-translate-y-1">
              <Globe
                className="w-10 h-10 text-secondary mx-auto mb-4"
                style={{ stroke: "hsl(var(--eShop))" }}
              />
              <h4 className="font-semibold text-foreground mb-2">
                Custom Domain
              </h4>
              <p className="text-muted-foreground text-sm">
                Your brand, your domain
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20" ref={howItWorksRef}>
        <div className="container mx-auto px-4">
          <SectionHeader
            title="How It Works"
            subtitle="Start selling in four simple steps"
          />

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className={cn("flex items-start gap-4")}>
              <div className="w-12 h-12 gradient-eshop rounded-full flex items-center justify-center flex-shrink-0 shadow-card">
                <span className="text-accent-foreground font-bold text-lg">
                  1
                </span>
              </div>
              <div className="bg-card p-5 rounded-xl shadow-card flex-1 hover:shadow-hover transition-all duration-300">
                <h4 className="font-semibold text-foreground mb-1">
                  Create Account
                </h4>
                <p className="text-muted-foreground text-sm">
                  Just your GSTIN/UIN + Bank Account. Get started in under 5
                  minutes.
                </p>
              </div>
            </div>
            <div className={cn("flex items-start gap-4")}>
              <div className="w-12 h-12 gradient-eshop rounded-full flex items-center justify-center flex-shrink-0 shadow-card">
                <span className="text-accent-foreground font-bold text-lg">
                  2
                </span>
              </div>
              <div className="bg-card p-5 rounded-xl shadow-card flex-1 hover:shadow-hover transition-all duration-300">
                <h4 className="font-semibold text-foreground mb-1">
                  List Products
                </h4>
                <p className="text-muted-foreground text-sm">
                  Add products to your supplier panel with images and
                  descriptions.
                </p>
              </div>
            </div>
            <div className={cn("flex items-start gap-4")}>
              <div className="w-12 h-12 gradient-eshop rounded-full flex items-center justify-center flex-shrink-0 shadow-card">
                <span className="text-accent-foreground font-bold text-lg">
                  3
                </span>
              </div>
              <div className="bg-card p-5 rounded-xl shadow-card flex-1 hover:shadow-hover transition-all duration-300">
                <h4 className="font-semibold text-foreground mb-1">
                  Get Orders
                </h4>
                <p className="text-muted-foreground text-sm">
                  Orders from millions of active shoppers start flowing in.
                </p>
              </div>
            </div>
            <div className={cn("flex items-start gap-4")}>
              <div className="w-12 h-12 gradient-eshop rounded-full flex items-center justify-center flex-shrink-0 shadow-card">
                <span className="text-accent-foreground font-bold text-lg">
                  4
                </span>
              </div>
              <div className="bg-card p-5 rounded-xl shadow-card flex-1 hover:shadow-hover transition-all duration-300">
                <h4 className="font-semibold text-foreground mb-1">
                  Receive Payments
                </h4>
                <p className="text-muted-foreground text-sm">
                  Direct to bank in 7-day cycle. Fast and reliable payouts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <SectionHeader
            title="Choose Your Plan"
            subtitle="Start free and upgrade as you grow"
          />

          <div className="max-w-5xl mx-auto">
            {/* Plan Headers */}
            <div className="bg-card rounded-t-2xl shadow-card border border-border overflow-hidden">
              <div className="grid grid-cols-3 gap-4 p-6 gradient-eshop">
                <div className="col-span-1">
                  <h3 className="font-bold text-xl text-white">Features</h3>
                </div>
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-6 h-6 text-white" />
                    <h3 className="font-bold text-xl text-white">Basic</h3>
                  </div>
                  <p className="text-sm text-white">Perfect to Start</p>
                </div>
                <div className="flex flex-col items-center">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Rocket className="w-6 h-6 text-white" />
                      <h3 className="font-bold text-xl text-white">Pro</h3>
                    </div>
                  </div>
                  <p className="text-sm text-center w-auto text-white">
                    EveryThing Unlimited
                  </p>
                </div>
              </div>

              {/* Feature Categories */}
              <div className="bg-card">
                {/* Store Setup & Configuration */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("store-setup")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Store Management
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["store-setup"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["store-setup"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Store profile creation (business name, logo,
                        description, contact details)
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Custom domain mapping
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Tax configuration by region
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Store hours & availability
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Terms of service & privacy policy
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Theme & Design */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("theme-design")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Theme & Design
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["theme-design"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["theme-design"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Pre-built responsive templates
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Custom CSS/HTML editing
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Mobile-first design options
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Storefront customization
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Product Catalog */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("product-catalog")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Product Catalog
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["product-catalog"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["product-catalog"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Add, edit, delete products
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Bulk product import/export{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Product categories, subcategories & variants
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Product tags & attributes
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Inventory tracking & alerts
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Multiple product images
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        SKU & barcode management{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Digital product support{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing & Promotions */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("pricing-promotions")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Pricing & Promotions
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["pricing-promotions"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["pricing-promotions"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Flexible pricing options
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Discount codes & coupons
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Percentage or fixed discounts
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        BOGO offers <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Flash sales & time-limited promotions{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Automatic sale scheduling{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inventory Management */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("inventory-management")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Inventory Management
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["inventory-management"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["inventory-management"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Real-time stock tracking
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Low stock notifications
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Automatic stock adjustments{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Inventory Analysis & history
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Purchase order creation{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Barcode scanning integration{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shopping Cart & Checkout */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("cart-checkout")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Shopping Cart & Checkout
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["cart-checkout"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["cart-checkout"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Multi-step checkout
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Address auto-complete{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Express checkout options{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Gateway Integration */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("payment-gateway")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Payment Gateway Integration
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["payment-gateway"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["payment-gateway"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Credit/debit card processing{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    {/* <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                  <div className="col-span-1 text-sm text-foreground/80">Digital wallets (PayPal, Apple Pay)</div>
                  <div className="flex justify-center"><X className="w-5 h-5 text-red-500" /></div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                </div>
                <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                  <div className="col-span-1 text-sm text-foreground/80">Cash on delivery (COD)</div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                </div>
                <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                  <div className="col-span-1 text-sm text-foreground/80">Buy now, pay later options</div>
                  <div className="flex justify-center"><X className="w-5 h-5 text-red-500" /></div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                </div>
                <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                  <div className="col-span-1 text-sm text-foreground/80">Cryptocurrency payments</div>
                  <div className="flex justify-center"><X className="w-5 h-5 text-red-500" /></div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                </div>
                <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                  <div className="col-span-1 text-sm text-foreground/80">Refund & partial refund processing</div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                  <div className="flex justify-center"><Check className="w-5 h-5 text-green-600" /></div>
                </div> */}
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Static QR Payments
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Dynamic QR Payments
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Management */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("order-management")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Order Management
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["order-management"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["order-management"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Order dashboard & queue
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Order status tracking
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Print invoices
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Shipping label generation{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Management */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("customer-management")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Customer Management
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["customer-management"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["customer-management"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Customer profiles & accounts
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Purchase history tracking
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        WhatsApp marketing campaigns
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Marketing & SEO */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("marketing-seo")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Marketing & SEO
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["marketing-seo"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["marketing-seo"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        SEO-friendly URLs{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Meta titles & descriptions{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Social media integration
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Email campaign builder{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analytics & Reporting */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("analytics-reporting")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Analytics & Reporting
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["analytics-reporting"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["analytics-reporting"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Sales reports & summaries
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Revenue analytics
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Product performance tracking
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security & Compliance */}
                <div className="border-b border-border">
                  <button
                    onClick={() => toggleDropdown("security-compliance")}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <h3 className="font-semibold text-lg text-left">
                      Security & Compliance
                    </h3>
                    <span className="text-muted-foreground text-xl">
                      {openDropdowns["security-compliance"] ? "-" : "+"}
                    </span>
                  </button>
                  <div
                    className={`pb-4 ${openDropdowns["security-compliance"] ? "" : "hidden"}`}
                  >
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        SSL certificates
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Two-factor authentication
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        PCI DSS compliance(stripe integration)
                      </div>
                      <div className="flex justify-center">
                        <X className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        GDPR compliance tools{" "}
                        <span className="text-gray-400">*</span>
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-muted/20">
                      <div className="col-span-1 text-sm text-foreground/80">
                        Regular security updates
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex justify-center">
                        <Check className="w-5 h-5 text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-center text-l text-gray-400 mt-2">
            (*) Describes Coming Soon
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 gradient-eshop relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-6">
              Ready to Dominate E-Commerce?
            </h2>
            <p className="text-xl text-primary-foreground/80 mb-10">
              Join thousands of successful sellers using KiosCart to grow their
              business.
            </p>
            <Button variant="eshopOutline" size="xl" onClick={contactUs}>
              Contact Us <ArrowRight className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      <footer className="gradient-eshop text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-primary-foreground/20 rounded-xl flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-xl">
                    K
                  </span>
                </div>
                <span className="font-bold text-xl">KiosCart</span>
              </div>
              <p className="text-primary-foreground/80 text-sm leading-relaxed">
                Your complete solution for event management and e-commerce.
                Scale your business effortlessly.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">SaaS Products</h4>
              <ul className="space-y-2 text-primary-foreground/80">
                <li>
                  <Link
                    to="/events"
                    className="hover:text-primary-foreground transition-colors"
                  >
                    Event Management
                  </Link>
                </li>
                <li>
                  <Link
                    to="/estore"
                    className="hover:text-primary-foreground transition-colors"
                  >
                    Eshop Platform
                  </Link>
                </li>
                {/* <li>
                <a
                  href="#"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Analytics
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Integrations
                </a>
              </li> */}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-primary-foreground/80">
                {/* <li>
                <Link
                  to="/pricing"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/blog"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  to="/faq"
                  className="hover:text-primary-foreground transition-colors"
                >
                  FAQ
                </Link>
              </li> */}
                <li>
                  <a
                    href="/about"
                    className="hover:text-primary-foreground transition-colors"
                  >
                    About Us
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-primary-foreground/80">
                <li className="flex items-center gap-2">
                  <a
                    href="https://kioscart.com"
                    className="flex items-center gap-1"
                  >
                    <Globe size={16} />
                    <span>kioscart.com</span>
                  </a>
                </li>

                <li className="flex items-center gap-2">
                  <a
                    href={`https://wa.me/${+917021512020}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <FaWhatsapp size={16} />
                    <span>+91 702 151 2020</span>
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail size={16} />
                  <a href={`mailto:hello@kioscart.com`}>
                    <span>hello@kioscart.com</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-foreground/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-primary-foreground/60 text-sm">
              © 2025 kioscart. All rights reserved. Powered By{" "}
              <a href="https://jicama.tech" className="text-white text-l">
                Jicama.tech
              </a>
            </p>
            <div className="flex gap-6 text-sm text-primary-foreground/60">
              <a
                href="/privacy-policy"
                className="hover:text-primary-foreground transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                className="hover:text-primary-foreground transition-colors"
              >
                Terms of Service
              </a>
              {/* <a
              href="#"
              className="hover:text-primary-foreground transition-colors"
            >
              Cookies
            </a> */}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Eshop;
