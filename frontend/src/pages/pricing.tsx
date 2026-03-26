import Navbar from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";
import SectionHeader from "@/components/ui/sectionHeader";
import PricingCard from "@/components/ui/PricingCard";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

const Pricing = () => {
  const eshopFeatures = {
    free: [
      "Up to 50 products",
      "Basic storefront",
      "Standard payment processing",
      "Email order notifications",
      "Community support",
    ],
    pro: [
      "Unlimited products",
      "Custom storefront themes",
      "Advanced inventory management",
      "Multi-currency support",
      "Priority support",
      "Custom domain",
      "API access",
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-16 gradient-hero">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-primary-foreground/80">
              Choose the plan that fits your needs. Start free and upgrade as
              you grow.
            </p>
          </div>
        </div>
      </section>

      {/* Eshop Pricing */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader
            title="KiosCart Plans"
            subtitle="Launch your online store with powerful features"
          />
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <PricingCard
              plan="free"
              title="Free"
              subtitle="Start selling today"
              features={eshopFeatures.free}
            />
            <PricingCard
              plan="pro"
              title="Pro"
              subtitle="Scale your business"
              features={eshopFeatures.pro}
              highlighted
            />
          </div>
        </div>
      </section>

      {/* FAQ Teaser */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4 text-center">
          <HelpCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Have Questions?
          </h2>
          <p className="text-muted-foreground mb-6">
            Check out our FAQ for answers to common questions.
          </p>
          <Button variant="hero" asChild>
            <a href="/faq">View FAQ</a>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
