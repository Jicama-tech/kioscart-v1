import Navbar from "@/components/ui/navbar";
import Footer from "@/components/ui/footer";
import SectionHeader from "@/components/ui/sectionHeader";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ = () => {
  const generalFaqs = [
    {
      question: "What is KiosCart?",
      answer:
        "KiosCart is an all-in-one e-commerce platform for kiosks and cart-based businesses. It helps shopkeepers create, manage, and grow their online store with ease.",
    },
    {
      question: "Is there a free trial?",
      answer:
        "We offer a generous free plan for the KiosCart platform. You can start using KiosCart immediately without any credit card required.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit cards, PayPal, and bank transfers for subscription payments. For your customers, we support multiple payment gateways including Stripe, PayPal, and more.",
    },
    {
      question: "Can I use KiosCart on mobile?",
      answer:
        "Yes! KiosCart is fully responsive and available as a mobile app for iOS and Android via our Capacitor-powered app.",
    },
  ];

  const eshopFaqs = [
    {
      question: "How quickly can I set up my store?",
      answer:
        "Most users have their store live within 30 minutes. Our intuitive setup wizard guides you through product listing, payment configuration, and store design.",
    },
    {
      question: "Do you handle shipping?",
      answer:
        "We integrate with major shipping carriers and provide tools for shipping rate calculation, label printing, and tracking. You maintain control over your shipping strategy.",
    },
    {
      question: "Can I sell digital products?",
      answer:
        "Yes! KiosCart supports both physical and digital products. For digital goods, we handle secure delivery and download management automatically.",
    },
    {
      question: "What about inventory management?",
      answer:
        "Our platform includes robust inventory tracking, low-stock alerts, and automatic stock updates across all sales channels.",
    },
    {
      question: "Can I customize my storefront?",
      answer:
        "Absolutely! Both plans allow basic customization. Pro users get access to advanced branding options, custom domains, and white-label solutions.",
    },
    {
      question: "How do I manage orders and customers?",
      answer:
        "KiosCart includes a built-in CRM and order management system. You can track orders, manage customer relationships, and view analytics all from one dashboard.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-24 pb-16 gradient-hero">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground mb-6">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-primary-foreground/80">
              Find answers to common questions about KiosCart
            </p>
          </div>
        </div>
      </section>

      {/* General FAQs */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <SectionHeader title="General Questions" />
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {generalFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`general-${index}`}>
                  <AccordionTrigger className="text-left font-semibold">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Eshop FAQs */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <SectionHeader title="Store & E-commerce" />
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {eshopFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`eshop-${index}`}>
                  <AccordionTrigger className="text-left font-semibold">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default FAQ;
