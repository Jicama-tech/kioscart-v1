import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navigate = useNavigate();

  const onShowLogin = () => {
    navigate("/estore/login");
  };

  const links = [
    { href: "/", label: "Home" },
    { href: "/contact", label: "Contact Us" },
    // { href: "/pricing", label: "Pricing" },
    // { href: "/blog", label: "Blog" },
    // { href: "/faq", label: "FAQ" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-auto flex items-center">
              <img
                src="/KiosCartLogo.png"
                alt="KiosCart - Build Sell Thrive"
                className="object-contain h-[8rem] sm:h-30 md:h-[8rem] lg:h-40 w-auto"
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
                  "font-medium transition-colors hover:text-landing",
                  location.pathname === link.href
                    ? "text-landing"
                    : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <Button variant="landing" onClick={onShowLogin}>
              Get Started
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden p-2" onClick={() => setIsOpen(!isOpen)}>
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
                  "block py-3 font-medium transition-colors hover:text-landing",
                  location.pathname === link.href
                    ? "text-landing"
                    : "text-muted-foreground",
                )}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
              <Button variant="landing" onClick={onShowLogin}>
                Sign In
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
