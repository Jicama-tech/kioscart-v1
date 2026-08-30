import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import landingCss from "./landing/landing.css?raw";
import landingHtml from "./landing/landing.html?raw";
import { initLanding } from "./landing/landing.script";

/**
 * The kioscart.com landing page.
 *
 * The design ships as one self-contained HTML file — markup, a stylesheet and
 * an imperative DOM script (language switcher, hero checkout animation, the
 * canvas mosaic, scroll reveals, the Ask demo). It is mounted here verbatim
 * rather than rewritten as components, so what renders is exactly what was
 * designed. `landing/` holds the three pieces; edit them as HTML and CSS.
 *
 * Everything it touches is scoped to this route: the stylesheet styles `html`
 * and `body`, so it is injected on mount and removed on unmount rather than
 * imported globally, where it would repaint the rest of the app.
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

// Rich result for the homepage. Injected with the rest so it is only present
// on the page it describes.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "KiosCart",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://kioscart.com/",
  description:
    "In-shop kiosk and POS, online store, QR / card / net-banking payments, inventory, accounting exports, reviews and AI sales insights for small merchants.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function LandingPage() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);

  // Stylesheet, webfonts and structured data — added for this route only.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-landing", "");
    style.textContent = landingCss;

    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.id = "basefonts";
    fonts.href = FONTS_HREF;

    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify(STRUCTURED_DATA);

    document.head.append(fonts, style, ld);
    return () => {
      style.remove();
      fonts.remove();
      ld.remove();
      // The script sets this when a language is picked; the rest of the app
      // is English-only, so hand it back the way we found it.
      document.documentElement.lang = "en";
    };
  }, []);

  // The page's own behaviour. Runs after the markup is in the DOM, because it
  // queries for the nodes it drives and snapshots the English copy off them.
  useEffect(() => initLanding(), []);

  // In-app destinations are plain <a href="/..."> in the markup, so the page
  // stays a working static file on its own. Here they should navigate without
  // a full reload. Anchors, mailto:, tel: and external links are left alone.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement)?.closest?.("a");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (link.target && link.target !== "_self") return;
      e.preventDefault();
      navigate(href);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [navigate]);

  return (
    <div ref={hostRef} dangerouslySetInnerHTML={{ __html: landingHtml }} />
  );
}
