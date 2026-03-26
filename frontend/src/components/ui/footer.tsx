import { Link } from "react-router-dom";
import { Globe, Phone, Mail, MapPin, ShoppingCart } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

const Footer = () => {
  return (
    <footer className="gradient-hero text-primary-foreground py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-landing-foreground rounded-xl flex items-center justify-center">
                <ShoppingCart size={16} className="text-landing font-bold" />
              </div>
              <span className="font-bold text-xl">KiosCart</span>
            </div>
            <p className="text-primary-foreground/80 text-sm leading-relaxed">
              Bridging the gap between the physical storefront and the digital
              world. No counters, no friction—just pure growth
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Products</h4>
            <ul className="space-y-2 text-primary-foreground/80">
              <li>
                <a
                  href="/estore/login"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Kiosk Management
                </a>
              </li>
              <li>
                <a
                  href="/estore/login"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Cart Management
                </a>
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
              <li>
                <a
                  href="/admin-login"
                  className="hover:text-primary-foreground transition-colors"
                >
                  Admin
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
                  href={`https://wa.me/${+6590037950}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                >
                  <FaWhatsapp size={16} />
                  <span>+65 9003 7950</span>
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail size={16} />
                <a href={`mailto:hello@jicama.tech`}>
                  <span>hello@jicama.tech</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-primary-foreground/60 text-sm">
            © 2025 KiosCart. All rights reserved. Powered By{" "}
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
  );
};

export default Footer;
