import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Scale, FileText, Globe, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function TermsAndConditionsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 selection:bg-primary/30">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <div className="container relative mx-auto px-4 py-16">
        {/* Back Button */}
        <div className="absolute top-6 left-4 md:left-8">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-white/10 text-slate-300"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
        </div>

        <div className="text-center mb-16 space-y-4">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
            Terms of Service
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Governing the use of the Jicama.Tech commerce ecosystem.
          </p>
          <div className="h-1 w-20 bg-primary mx-auto rounded-full" />
        </div>

        <Card className="max-w-4xl mx-auto bg-slate-900/50 border-slate-800 backdrop-blur-sm shadow-2xl">
          <CardHeader className="pt-10 border-b border-slate-800/50">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Scale className="text-primary h-6 w-6" />
              <CardTitle className="text-2xl text-white">
                Service Agreement
              </CardTitle>
            </div>
            <p className="text-center text-xs text-slate-500 uppercase tracking-widest font-semibold">
              Proprietary Technology of Jicama.Tech
            </p>
          </CardHeader>

          <CardContent className="p-8 md:p-12 overflow-y-auto max-h-[70vh] custom-scrollbar prose prose-invert prose-slate max-w-none">
            <div className="space-y-10 text-slate-300">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-5 w-5 text-primary" />
                  <h3 className="text-white m-0">1. Acceptance of Terms</h3>
                </div>
                <p>
                  Welcome to the platform operated by{" "}
                  <strong>Jicama.Tech</strong> (registered in Singapore). By
                  accessing our software-as-a-service (SaaS) platform, you agree
                  to be bound by these Terms. Our technology, managed by our
                  specialized engineering team in <strong>India</strong>, is
                  designed to bridge physical kiosks with digital storefronts.
                  If you do not agree to these terms, you must cease use of{" "}
                  <strong>Jicama.Tech</strong> services immediately.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="text-white m-0">2. Licensing & Use</h3>
                </div>
                <p>
                  <strong>Jicama.Tech</strong> grants you a limited,
                  non-exclusive, non-transferable license to use our platform to
                  manage your business. You acknowledge that all underlying
                  source code, design systems, and technical infrastructure are
                  the exclusive intellectual property of{" "}
                  <strong>Jicama.Tech</strong>.
                </p>
              </section>

              <section className="bg-slate-800/30 p-6 rounded-lg border border-slate-700">
                <h3 className="text-primary mt-0">
                  3. "Pay-as-you-Grow" Model
                </h3>
                <p className="m-0">
                  We pioneer a success-first partnership. While{" "}
                  <strong>Jicama.Tech</strong> allows businesses to launch for
                  free, specific transaction fees or subscription tiers apply as
                  your business scales. All billing is processed through our
                  secure
                  <strong> Singapore-based</strong> financial gateways.
                </p>
              </section>

              <section>
                <h3 className="text-white">4. Technical Maintenance</h3>
                <p>
                  Our "heavy lifting" philosophy means{" "}
                  <strong>Jicama.Tech</strong> handles all hosting, security,
                  and payment integrations. You agree to allow our
                  <strong> Indian engineering headquarters</strong> to perform
                  necessary maintenance, updates, and technical troubleshooting
                  to ensure your custom domain remains operational 24/7.
                </p>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-white m-0">5. Prohibited Conduct</h3>
                </div>
                <p>Users are strictly prohibited from:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    Attempting to reverse-engineer any{" "}
                    <strong>Jicama.Tech</strong> proprietary software.
                  </li>
                  <li>
                    Using the platform for fraudulent trade or illegal commerce
                    in Singapore or India.
                  </li>
                  <li>
                    Bypassing <strong>Jicama.Tech</strong>’s integrated payment
                    systems to avoid agreed-upon fees.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-white">6. Limitation of Liability</h3>
                <p>
                  <strong>Jicama.Tech</strong> shall not be liable for any
                  indirect, incidental, or consequential damages resulting from
                  your business operations. Our role is strictly that of a SaaS
                  provider; the commercial success of your brand on your custom
                  domain is your responsibility.
                </p>
              </section>

              <section className="pt-8 border-t border-slate-800">
                <h3 className="text-white">7. Governing Law</h3>
                <p>
                  These Terms are governed by the laws of{" "}
                  <strong>Singapore</strong>. Any disputes arising from the use
                  of <strong>Jicama.Tech</strong> services shall be subject to
                  the exclusive jurisdiction of the courts of Singapore.
                </p>
                <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="m-0 text-sm italic text-slate-400">
                    For legal inquiries, contact:{" "}
                    <span className="text-primary font-semibold">
                      hello@jicama.tech
                    </span>
                  </p>
                </div>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `,
        }}
      />
    </div>
  );
}
