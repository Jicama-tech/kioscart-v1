import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Rocket, Globe, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AboutUsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 selection:bg-primary/30">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="container relative mx-auto px-4 py-16">
        <div className="absolute top-6 left-4 md:left-8">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-white/10 text-slate-300"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </div>

        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            About Us
          </h2>
          <div className="h-1 w-20 bg-primary mx-auto rounded-full" />
        </div>

        <div className="space-y-12 max-w-5xl mx-auto">
          {/* Main Story Card */}
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardContent className="pt-8 leading-relaxed text-slate-300 space-y-6 text-lg">
              <p>
                Born and design in the heart of{" "}
                <span className="text-white font-semibold">Singapore’s</span>{" "}
                and build from{" "}
                <span className="text-white font-semibold">India's</span>{" "}
                vibrant tech ecosystem, we are a forward-thinking startup built
                and managed by the expert engineering team at{" "}
                <span className="text-primary font-medium">Jicama Tech</span>.
                Our mission is to simplify the future of commerce by removing
                the traditional barriers between offline and online retail.
              </p>
              <p>
                We believe that every business, from budding entrepreneurs to
                established brands, deserves a seamless bridge between their
                physical kiosks and digital storefronts. By merging these two
                worlds into one unified platform, we empower you to provide a
                consistent, world-class shopping experience to your customers,
                no matter where they choose to browse or buy.
              </p>
              <p>
                Our philosophy is rooted in a{" "}
                <span className="italic text-slate-100 italic">
                  "success-first"
                </span>{" "}
                partnership, which is why we pioneered a model that allows you
                to launch for free and only pay as you grow. As a specialized
                SaaS provider, we handle all the technical heavy lifting—from
                secure hosting to complex payment gateway integrations—so you
                can focus entirely on building your brand identity on your own
                custom domain.
              </p>
              <p>
                We aren’t just a software platform; we are your long-term
                partners in retail innovation, dedicated to helping every
                businesses and beyond scale with confidence in an increasingly
                digital world.
              </p>
            </CardContent>
          </Card>

          {/* Core Values / Features Grid */}
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="bg-[#111] border-slate-800 text-center hover:border-primary/50 transition-colors">
              <CardHeader>
                <Globe className="h-8 w-8 text-primary mx-auto mb-2" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Global Roots
                </CardTitle>
                <p className="text-xs text-slate-900 mt-2">
                  Singapore x India Tech
                </p>
              </CardHeader>
            </Card>

            <Card className="bg-[#111] border-slate-800 text-center hover:border-primary/50 transition-colors">
              <CardHeader>
                <Rocket className="h-8 w-8 text-primary mx-auto mb-2" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Zero Barrier
                </CardTitle>
                <p className="text-xs text-slate-500 mt-2">
                  Launch for free today
                </p>
              </CardHeader>
            </Card>

            <Card className="bg-[#111] border-slate-800 text-center hover:border-primary/50 transition-colors">
              <CardHeader>
                <ShieldCheck className="h-8 w-8 text-primary mx-auto mb-2" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Managed SaaS
                </CardTitle>
                <p className="text-xs text-slate-500 mt-2">
                  Secure & Scalable Hosting
                </p>
              </CardHeader>
            </Card>

            <Card className="bg-[#111] border-slate-800 text-center hover:border-primary/50 transition-colors">
              <CardHeader>
                <Zap className="h-8 w-8 text-primary mx-auto mb-2" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-400">
                  Hybrid Retail
                </CardTitle>
                <p className="text-xs text-slate-500 mt-2">
                  Kiosk to Storefront
                </p>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
