import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";
import FeatureCard from "@/components/ui/featureCard";
import SectionHeader from "@/components/ui/sectionHeader";
import {
  ShoppingBag,
  BarChart3,
  Users,
  Shield,
  Zap,
  Globe,
  Smartphone,
  ArrowRight,
  MonitorSmartphone,
  Code2Icon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Store,
  CreditCard,
  Layers,
  Palette,
  Clock,
  Tags,
  Box,
  FileSpreadsheet,
  Rocket,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { cn } from "@/lib/utils";
import { useEffect, useState, useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";

// --- STATIC DATA & HELPER COMPONENTS (Moved Outside) ---

const faqs = [
  {
    question: "How much does it cost to use KiosCart?",
    answer:
      "KiosCart offers flexible pricing tailored to your scale. Our 'Starter' plan is perfect for local shops, while our 'Enterprise' tier provides multi-location kiosk sync and advanced analytics.",
  },
  {
    question: "Can I manage both physical and online shops together?",
    answer:
      "Absolutely. KiosCart features a Unified Dashboard. Inventory levels and sales data are updated in real-time across your self-kiosk and online E-Shop.",
  },
  {
    question: "Do I need special hardware?",
    answer:
      "KiosCart is hardware-agnostic. Run it on professional terminals, tablets (iPad/Android), or large touch-screens. We also support standard thermal printers and scanners.",
  },
  {
    question: "Is it suitable for pop-up events?",
    answer:
      "Yes! Designed for mobility, you can set up temporary kiosks for festivals or trade shows while keeping your main E-Shop running smoothly.",
  },
  {
    question: "How secure are payments?",
    answer:
      "We use fully encrypted, PCI-compliant payment processing. Support for 'Tap-to-Pay', EMV chips, Apple Pay, Google Pay, and UPI.",
  },
  {
    question: "Can I customize my shop design?",
    answer:
      "Yes! Our builder includes professional themes, and we allow custom CSS/HTML injection for complete brand control.",
  },
];

const steps = [
  {
    title: "Register Your Store",
    description:
      "Create your identity. Upload logos, set brand colors, and configure your business profile in under 2 minutes.",
    images: [
      "/assets/step-1.png",
      "/assets/step-2.png",
      "/assets/step-3.png",
      "/assets/step-4.png",
    ],
    icon: Store,
  },
  {
    title: "Setting Up Store",
    description:
      "Bulk upload products or add them manually. Set variants, prices, and stock levels that sync everywhere.",
    images: ["/assets/step-5.png", "/assets/step-6.png"],
    icon: Box,
  },
  {
    title: "Inventory & Products",
    description:
      "Connect any tablet or touch screen. The interface automatically adapts to your hardware for instant selling.",
    images: ["/assets/step-7.png", "/assets/step-8.png", "/assets/step-9.png"],
    icon: MonitorSmartphone,
  },
  {
    title: "Go Live",
    description:
      "Start accepting payments securely. Monitor real-time analytics from both your online store and physical kiosk.",
    images: ["/assets/step-10.png", "/assets/step-11.png"],
    icon: Rocket,
  },
];

const GlassCard = ({
  children,
  className = "",
  gradient = "",
}: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    whileHover={{ y: -5 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className={cn(
      "group relative overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-xl transition-all duration-300 hover:border-landing/50",
      className,
    )}
  >
    {/* CSS Gradient Background */}
    {gradient && (
      <div
        className={cn(
          "absolute inset-0 z-0 bg-gradient-to-br opacity-60 group-hover:opacity-80 transition-opacity duration-500",
          gradient,
        )}
      />
    )}

    {/* Content wrapper */}
    <div className="relative z-20 h-full flex flex-col">{children}</div>
  </motion.div>
);

const ParallaxSection = ({
  children,
  offset = 50,
}: {
  children: React.ReactNode;
  offset?: number;
}) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.9, 1], [0, 1, 1, 0]);

  return (
    <motion.div ref={ref} style={{ y, opacity }} className="relative z-10">
      {children}
    </motion.div>
  );
};

// Pure CSS animated hero background — no images, zero network cost
const gradientCards = [
  "from-blue-600/40 to-indigo-800/40",
  "from-purple-600/40 to-pink-700/40",
  "from-emerald-500/40 to-teal-700/40",
  "from-orange-500/40 to-red-600/40",
  "from-cyan-500/40 to-blue-700/40",
  "from-violet-600/40 to-purple-800/40",
  "from-rose-500/40 to-pink-700/40",
  "from-amber-500/40 to-orange-700/40",
  "from-teal-500/40 to-emerald-700/40",
  "from-indigo-500/40 to-violet-700/40",
];

const AnimatedHeroBg = () => {
  const row = [...gradientCards, ...gradientCards];
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden z-0">
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/80 via-background/30 to-background/90" />
      <div className="flex flex-col gap-6 h-full justify-center rotate-[-5deg] scale-110">
        <div className="flex gap-6 animate-infinite-scroll">
          {row.map((g, idx) => (
            <div
              key={idx}
              className={cn(
                "flex-shrink-0 w-80 h-60 rounded-xl border border-white/10 bg-gradient-to-br",
                g,
              )}
            />
          ))}
        </div>
        <div className="flex gap-6 animate-infinite-scroll-reverse">
          {row.map((g, idx) => (
            <div
              key={`r-${idx}`}
              className={cn(
                "flex-shrink-0 w-80 h-60 rounded-xl border border-white/10 bg-gradient-to-br",
                g,
              )}
            />
          ))}
        </div>
        <div className="flex gap-6 animate-infinite-scroll">
          {row.map((g, idx) => (
            <div
              key={`t-${idx}`}
              className={cn(
                "flex-shrink-0 w-80 h-60 rounded-xl border border-white/10 bg-gradient-to-br",
                g,
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// --- MAIN COMPONENT ---

const LandingPage = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const navigate = useNavigate();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [activeStep, setActiveStep] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const toggleDropdown = (categoryName) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }));
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    sessionStorage.removeItem("token");
  }, []);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [activeStep]);

  useEffect(() => {
    const interval = setInterval(() => {
      const totalImagesInStep = steps[activeStep].images.length;
      if (currentImageIndex < totalImagesInStep - 1) {
        setCurrentImageIndex((prev) => prev + 1);
      } else {
        setActiveStep((prev) => (prev + 1) % steps.length);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeStep, currentImageIndex]);

  const onShowLogin = () => navigate("/estore/login");
  const contactUs = () => navigate("/contact");

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div
      className={cn(
        "min-h-screen font-sans selection:bg-landing/30",
        isDarkMode
          ? "bg-slate-950 text-slate-50"
          : "bg-slate-50 text-slate-900",
      )}
    >
      <Navbar />

      {/* --- HERO SECTION --- */}
      <section
        id="home"
        className="relative min-h-[110vh] flex items-center justify-center pt-20 overflow-hidden"
      >
        <AnimatedHeroBg />

        <div className="container relative z-20 px-4 mx-auto text-center">
          {/* Glassmorphic Container for Text to ensure readability over busy background */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            // transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-5xl mx-auto bg-background/30 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-2xl rounded-3xl p-8 md:p-12"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-landing/90 text-white border border-landing/20 backdrop-blur-sm mb-8 shadow-[0_0_20px_rgba(var(--landing),0.3)]"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span className="text-xs md:text-sm font-bold uppercase tracking-widest">
                Unified Commerce Engine
              </span>
            </motion.div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-8 tracking-tighter leading-[1.1] drop-shadow-sm">
              Kiosks & Carts <br className="hidden md:block" />
            </h1>

            <p className="text-lg md:text-2xl text-foreground/90 font-medium mb-12 max-w-2xl mx-auto leading-relaxed drop-shadow-sm">
              Frictionless In-Shop kiosk and Online Cart management for
              ECommerce. Deploy your vision, expand your reach, and scale on
              demand.
            </p>

            <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
              <Button
                size="lg"
                onClick={onShowLogin}
                className="h-14 px-10 text-lg rounded-full bg-landing hover:bg-landing/90 text-white shadow-[0_10px_40px_-10px_rgba(var(--landing),0.5)] transition-all hover:scale-105"
              >
                Get Started Free
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => scrollToSection("features")}
                className="h-14 px-10 text-lg rounded-full bg-background/60 backdrop-blur-xl border-2 border-foreground/10 hover:bg-background/80 transition-all hover:scale-105"
              >
                Explore Features
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- CORE PILLARS (Glass Cards) --- */}
      <section className="relative py-32 -mt-20 z-30" id="how-it-works">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {[
              {
                title: "Self-Kiosk",
                desc: "Turn any tablet into a high-velocity checkout terminal. Slash wait times and reduce labor costs immediately.",
                icon: MonitorSmartphone,
                color: "text-blue-500",
                gradient: "from-blue-600/20 to-indigo-800/20",
              },
              {
                title: "E-Commerce",
                desc: "Your brand, globally accessible. A pixel-perfect online store that syncs inventory in real-time with your physical shop.",
                icon: ShoppingBag,
                color: "text-purple-500",
                gradient: "from-purple-600/20 to-pink-700/20",
              },
              {
                title: "Unified Customer",
                desc: "One account for everywhere. Customers can start an order online and pick it up at a kiosk instantly.",
                icon: Users,
                color: "text-emerald-500",
                gradient: "from-emerald-500/20 to-teal-700/20",
              },
            ].map((item, idx) => (
              <GlassCard key={idx} gradient={item.gradient}>
                <div
                  className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center bg-background/50 mb-6 shadow-inner backdrop-blur-sm",
                    item.color,
                  )}
                >
                  <item.icon className="w-7 h-7" />
                </div>
                <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* --- BENTO GRID FEATURES --- */}
      <section className="py-12 bg-background relative" id="features">
        <div className="container mx-auto px-4">
          <SectionHeader
            title="Everything You Need"
            subtitle="A complete toolkit for the modern merchant."
          />

          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
            {[
              {
                title: "Profile Setup",
                icon: Store,
                desc: "Complete business identity management.",
              },
              {
                title: "Custom Domain",
                icon: Globe,
                desc: "Connect your own .com in seconds.",
              },
              {
                title: "Tax Engine",
                icon: FileSpreadsheet,
                desc: "Automated regional tax calculation.",
              },
              {
                title: "Smart Hours",
                icon: Clock,
                desc: "Auto-open/close storefronts.",
              },
              {
                title: "Responsive",
                icon: Smartphone,
                desc: "Looks perfect on every device.",
              },
              {
                title: "Code Editor",
                icon: Code2Icon,
                desc: "Full CSS/HTML control for devs.",
              },
              {
                title: "Product Mgmt",
                icon: Layers,
                desc: "Variants, categories & attributes.",
              },
              {
                title: "Bulk Import",
                icon: BarChart3,
                desc: "CSV export/import support.",
              },
              {
                title: "Inventory",
                icon: Box,
                desc: "Low stock alerts & real-time sync.",
              },
              {
                title: "Promotions",
                icon: Tags,
                desc: "Coupons, BOGO, and flash sales.",
              },
              {
                title: "Payments",
                icon: CreditCard,
                desc: "PCI-compliant secure processing.",
              },
              {
                title: "Analytics",
                icon: BarChart3,
                desc: "Revenue & behavior insights.",
              },
            ].map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02, y: -5 }}
                viewport={{ margin: "-20px" }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Card className="h-full bg-card/50 hover:bg-card border-border/50 hover:border-landing/30 transition-all duration-300 hover:shadow-lg group">
                  <CardHeader>
                    <div className="w-10 h-10 rounded-lg bg-landing/10 flex items-center justify-center text-landing mb-3 group-hover:bg-landing group-hover:text-white transition-colors">
                      <feat.icon className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg">{feat.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feat.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- INTERACTIVE STEPS --- */}
      <section
        className="py-24 bg-muted/20 relative overflow-hidden"
        id="steps"
      >
        {/* Background blobs */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-landing/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              // transition={{ duration: 0.6 }}
            >
              <SectionHeader
                title="Launch in Minutes"
                subtitle="Complex infrastructure, simplified into four easy steps."
              />
            </motion.div>
          </div>

          <div className="mt-16 max-w-7xl mx-auto">
            {/* UPDATED: Floating Cards Container with Gap */}
            <div className="relative px-4 md:px-8 mb-8">
              {/* Added gap-4 for equal spacing between floating cards */}
              <div className="flex flex-col md:flex-row gap-4 relative">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = activeStep === index;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: -20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="flex-1"
                    >
                      {/* Tab Header - Floating Design */}
                      <motion.div
                        onClick={() => {
                          setActiveStep(index);
                        }}
                        className="relative cursor-pointer h-full"
                        whileHover={{ y: -4, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {/* Tab Background - Removed border-b-0, changed to full rounded-2xl */}
                        <div
                          className={cn(
                            "relative p-4 rounded-2xl transition-all duration-300 h-full border",
                            isActive
                              ? "bg-background border-landing shadow-lg shadow-landing/20 ring-1 ring-landing"
                              : "bg-background/40 border-transparent hover:border-border/50 hover:bg-background/60 hover:shadow-md",
                          )}
                        >
                          {/* Step Number Badge and Title */}
                          <div className="flex items-center gap-3">
                            <motion.div
                              className={cn(
                                "flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center font-bold text-sm md:text-base transition-all duration-300 relative z-30",
                                isActive
                                  ? "bg-landing text-white shadow-glow"
                                  : "bg-muted text-muted-foreground",
                              )}
                              animate={
                                isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }
                              }
                              transition={{ duration: 0.5 }}
                            >
                              {index + 1}
                            </motion.div>

                            {/* Icon and Title */}
                            <div className="flex items-center gap-2 flex-1">
                              <motion.div
                                animate={
                                  isActive
                                    ? { rotate: [0, 5, -5, 0] }
                                    : { rotate: 0 }
                                }
                                transition={{ duration: 0.5 }}
                              >
                                <Icon
                                  className={cn(
                                    "w-4 h-4 md:w-5 md:h-5 transition-colors duration-300",
                                    isActive
                                      ? "text-landing"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </motion.div>
                              <h3
                                className={cn(
                                  "font-bold text-sm md:text-base transition-colors duration-300 line-clamp-1",
                                  isActive ? "text-landing" : "text-foreground",
                                )}
                              >
                                {step.title}
                              </h3>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* UPDATED: Image Display with Margin to create floating effect */}
            <motion.div
              className="w-full mt-8 px-4 md:px-8" // Added mt-8 for spacing, removed negative margins
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              // transition={{ delay: 0.4, duration: 0.6 }}
            >
              <div className="relative w-full aspect-[17/10] bg-black border-2 border-landing rounded-2xl overflow-hidden shadow-2xl">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeStep}-${currentImageIndex}`}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    // transition={{ duration: 0.5, ease: "easeInOut" }}
                    className="absolute inset-0"
                  >
                    <motion.img
                      src={steps[activeStep].images[currentImageIndex]}
                      alt={`${steps[activeStep].title} - Image ${currentImageIndex + 1}`}
                      className="w-full h-full object-contain"
                      initial={{ filter: "blur(10px)" }}
                      animate={{ filter: "blur(0px)" }}
                      // transition={{ duration: 0.4 }}
                    />

                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
                  </motion.div>
                </AnimatePresence>

                {/* Image Navigation Controls */}
                {steps[activeStep].images.length > 1 && (
                  <>
                    {/* Previous Button */}
                    <motion.button
                      onClick={() =>
                        setCurrentImageIndex((prev) =>
                          prev === 0
                            ? steps[activeStep].images.length - 1
                            : prev - 1,
                        )
                      }
                      className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full text-white transition-all hover:scale-110"
                      aria-label="Previous image"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </motion.button>

                    {/* Next Button */}
                    <motion.button
                      onClick={() =>
                        setCurrentImageIndex((prev) =>
                          prev === steps[activeStep].images.length - 1
                            ? 0
                            : prev + 1,
                        )
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-full text-white transition-all hover:scale-110"
                      aria-label="Next image"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <ChevronRight className="w-6 h-6" />
                    </motion.button>

                    {/* Dot Indicators */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full">
                      {steps[activeStep].images.map((_, idx) => (
                        <motion.button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={cn(
                            "w-2 h-2 rounded-full transition-all",
                            currentImageIndex === idx
                              ? "bg-landing w-8"
                              : "bg-white/50 hover:bg-white/70",
                          )}
                          aria-label={`Go to image ${idx + 1}`}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                        />
                      ))}
                    </div>

                    {/* Image Counter */}
                    <motion.div
                      className="absolute top-6 right-6 z-10 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1.5"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      // transition={{ delay: 0.2 }}
                    >
                      <span className="text-white text-sm font-medium">
                        {currentImageIndex + 1} /{" "}
                        {steps[activeStep].images.length}
                      </span>
                    </motion.div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* --- FAQ SECTION --- */}
      <section className="py-24 bg-muted/30" id="faq">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-12 gap-12 max-w-7xl mx-auto">
            <div className="md:col-span-4">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Common Questions
              </h2>
              <p className="text-muted-foreground mb-8">
                Can't find what you're looking for? <br />
                <span
                  onClick={contactUs}
                  className="text-landing cursor-pointer hover:underline"
                >
                  Contact our support team
                </span>
                .
              </p>
            </div>
            <div className="md:col-span-8 space-y-4">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  // transition={{ delay: index * 0.1 }}
                  className="border border-border rounded-xl bg-background overflow-hidden"
                >
                  <div
                    className="p-5 cursor-pointer flex justify-between items-center hover:bg-muted/50 transition-colors"
                    onClick={() => toggleDropdown(`faq-${index}`)}
                  >
                    <h3 className="font-semibold text-lg">{faq.question}</h3>
                    <ChevronDown
                      className={cn(
                        "w-5 h-5 text-muted-foreground transition-transform duration-300",
                        openDropdowns[`faq-${index}`] && "rotate-180",
                      )}
                    />
                  </div>
                  <AnimatePresence>
                    {openDropdowns[`faq-${index}`] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        // transition={{ duration: 0.3 }}
                      >
                        <div className="p-5 pt-0 text-muted-foreground border-t border-dashed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- CTA / PRICING TEASER --- */}
      <section className="py-32 relative overflow-hidden">
        {/* Dynamic Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-landing/20 via-background to-purple-500/10" />

        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to <span className="text-landing">Transform</span> Your
              Business?
            </h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of successful entrepreneurs using KiosCart today.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <motion.div
              whileHover={{ y: -10 }}
              // transition={{ type: "spring", stiffness: 300 }}
            >
              <Card className="h-full border-2 border-transparent hover:border-landing/30 shadow-2xl relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-2xl">Promotion</CardTitle>
                  <div className="text-4xl font-bold mt-2">
                    Free
                    {/* <span className="text-lg font-normal text-muted-foreground">
                      /mo
                    </span> */}
                  </div>
                  <CardDescription>
                    Usual US$20/mo - US$200/year
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-left">
                  <ul className="space-y-3">
                    {[
                      "Self-Kiosk and Cart Management",
                      "Basic E-Commerce Store",
                      "Standard Support",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-white"
                      >
                        <div className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center text-xs">
                          ✓
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-6">
                    <Button
                      onClick={onShowLogin}
                      className="w-full btn-animated bg-slate-900 text-white dark:bg-white dark:text-black h-12 text-lg"
                    >
                      Get Started
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Custom Plan */}
            <motion.div
              whileHover={{ y: -10 }}
              // transition={{ type: "spring", stiffness: 300 }}
            >
              <Card className="h-full border-2 border-landing bg-landing/5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-landing text-white text-xs px-3 py-1 rounded-bl-lg font-bold">
                  POPULAR
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl">Enterprise</CardTitle>
                  <div className="text-4xl font-bold mt-2">Custom</div>
                  <CardDescription>
                    For scaling franchises & events
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-left">
                  <ul className="space-y-3">
                    {[
                      "Customised Domain",
                      "Advanced Analytics",
                      "Unlimited Products",
                      "24/7 Priority Support",
                      "White-label Options",
                    ].map((item, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-foreground font-medium"
                      >
                        <div className="w-5 h-5 rounded-full bg-landing text-white flex items-center justify-center text-xs">
                          ✓
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-6">
                    <Button
                      onClick={contactUs}
                      variant="outline"
                      className="w-full h-12 text-lg border-landing text-landing hover:bg-landing hover:text-white transition-all"
                    >
                      Contact Us
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default LandingPage;
