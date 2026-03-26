import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Lock, Eye, Gavel, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 selection:bg-primary/30">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -right-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[25%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
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
            Privacy Policy
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Governed by the laws of Singapore and compliant with international
            data protection standards.
          </p>
          <div className="h-1 w-20 bg-primary mx-auto rounded-full" />
        </div>

        <Card className="max-w-4xl mx-auto bg-slate-900/50 border-slate-800 backdrop-blur-sm shadow-2xl">
          <CardHeader className="pt-10 border-b border-slate-800/50">
            <div className="flex items-center justify-center gap-3 mb-2">
              <ShieldCheck className="text-primary h-6 w-6" />
              <CardTitle className="text-2xl text-white">
                Data Protection Statement
              </CardTitle>
            </div>
            <p className="text-center text-xs text-slate-500 uppercase tracking-widest">
              Last Updated: February 2026
            </p>
          </CardHeader>

          <CardContent className="p-8 md:p-12 overflow-y-auto max-h-[70vh] custom-scrollbar prose prose-invert prose-slate max-w-none">
            <div className="space-y-8 text-slate-300">
              <section>
                <h3 className="text-white flex items-center gap-2">
                  <Gavel className="h-5 w-5 text-primary" /> 1. Regulatory
                  Framework
                </h3>
                <p>
                  This Privacy Policy is governed by the laws of{" "}
                  <strong>Singapore</strong>, specifically the Personal Data
                  Protection Act 2012 (PDPA). As a company registered in
                  Singapore with engineering operations managed by Jicama Tech
                  in <strong>India</strong>, we ensure that cross-border data
                  transfers maintain a standard of protection comparable to the
                  PDPA.
                </p>
              </section>

              <section>
                <h3 className="text-white flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" /> 2. Information
                  Collection
                </h3>
                <p>
                  We collect information necessary to bridge your offline and
                  online commerce:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Identity Data:</strong> Full name and business
                    registration details.
                  </li>
                  <li>
                    <strong>Contact Data:</strong> Email address, mobile number,
                    and billing address.
                  </li>
                  <li>
                    <strong>Technical Data:</strong> IP addresses, browser
                    types, and usage patterns analyzed by our tech team to
                    optimize your storefront.
                  </li>
                  <li>
                    <strong>Transaction Data:</strong> Details about payments
                    and product movements between your physical kiosks and
                    digital store.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" /> 3. How We Use Your
                  Data
                </h3>
                <p>
                  Your data is processed to facilitate a "success-first" retail
                  environment:
                </p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>To provide and maintain the unified SaaS platform.</li>
                  <li>
                    To enable Jicama Tech’s engineering team to perform
                    technical support and system troubleshooting.
                  </li>
                  <li>
                    To integrate secure payment gateways and custom domain
                    hosting.
                  </li>
                  <li>
                    To communicate critical updates regarding your business
                    growth and platform features.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" /> 4. Data Security &
                  Sovereignty
                </h3>
                <p>
                  We implement industry-leading encryption. While our expert
                  engineering team operates out of India, all data remains
                  subject to Singapore's stringent privacy requirements. We
                  handle the "heavy lifting" of security so you can focus on
                  your brand.
                </p>
              </section>

              <section>
                <h3 className="text-white">5. Your Rights (PDPA Compliance)</h3>
                <p>Under the PDPA, you have the right to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Request access to your personal data held by us.</li>
                  <li>Request correction of any inaccuracies in your data.</li>
                  <li>
                    Withdraw consent for data processing at any time (noting
                    this may affect platform functionality).
                  </li>
                </ul>
              </section>

              <section className="pt-8 border-t border-slate-800">
                <h3 className="text-white">
                  6. Contact Our Data Protection Officer
                </h3>
                <p>
                  If you have questions regarding your data or our cross-border
                  processing between Singapore and India, please contact our
                  DPO:
                </p>
                <div className="bg-[#111] p-4 rounded-lg border border-slate-800 text-sm">
                  <p className="m-0 text-primary">
                    Email: hello@jicamatech.com
                  </p>
                  <p className="m-0">
                    Subject: Privacy Inquiry - Jicama Tech PTE. LTD.
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
