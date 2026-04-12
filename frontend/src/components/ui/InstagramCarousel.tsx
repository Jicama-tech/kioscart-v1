import { useEffect, useMemo, useRef, useState } from "react";
import { Instagram } from "lucide-react";

interface InstagramCarouselProps {
  urls: string[];
  primaryColor?: string;
  title?: string;
  description?: string;
  titleColor?: string;
  descColor?: string;
}

function extractReelId(url: string): string | null {
  const reel = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
  if (reel) return reel[1];
  const post = url.match(/\/p\/([A-Za-z0-9_-]+)/);
  if (post) return post[1];
  const tv = url.match(/\/tv\/([A-Za-z0-9_-]+)/);
  if (tv) return tv[1];
  return null;
}

function toEmbedSrc(url: string): string | null {
  const id = extractReelId(url);
  if (!id) return null;
  return `https://www.instagram.com/p/${id}/embed/?cr=1&v=14&rd=https%3A%2F%2Fwww.instagram.com`;
}

export function InstagramCarousel({ urls, title, description, titleColor, descColor }: InstagramCarouselProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const validEmbeds = useMemo(
    () =>
      (urls || [])
        .map((u) => u.trim())
        .filter(Boolean)
        .map((u) => ({ url: u, src: toEmbedSrc(u) }))
        .filter((e): e is { url: string; src: string } => !!e.src),
    [urls],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView]);

  if (validEmbeds.length === 0) {
    return (
      <div className="py-8 px-4 text-center text-sm text-muted-foreground">
        <Instagram className="h-8 w-8 mx-auto mb-2" style={{ color: "#E1306C" }} />
        <p>Instagram section enabled — add reel URLs in Storefront Customizer</p>
      </div>
    );
  }

  const marqueeItems = [...validEmbeds, ...validEmbeds];

  return (
    <section ref={containerRef} className="pt-8 sm:pt-12 lg:pt-16 pb-12 sm:pb-16 lg:pb-20 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 sm:mb-8">
        <div className="text-center">
          <h2
            className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3 sm:mb-4 flex items-center justify-center gap-2"
            style={titleColor ? { color: titleColor } : undefined}
          >
            <Instagram className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: "#E1306C" }} />
            {title || "Follow Us on Instagram"}
          </h2>
          <p
            className="text-base sm:text-lg text-muted-foreground"
            style={descColor ? { color: descColor } : undefined}
          >
            {description || "Check out our latest reels and posts"}
          </p>
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="track-ltr">
          {marqueeItems.map((item, i) => {
            const realIndex = i % validEmbeds.length;
            const isActive = activeIndex === realIndex;
            return (
              <div
                key={`ig-${i}`}
                className="pc-card"
                style={{ width: "220px", cursor: "pointer" }}
                onClick={() => setActiveIndex(isActive ? null : realIndex)}
              >
                <div className="overflow-hidden relative" style={{ height: "280px" }}>
                  {inView ? (
                    isActive ? (
                      <iframe
                        key={`active-${realIndex}`}
                        src={item.src}
                        title="Instagram reel"
                        allow="encrypted-media"
                        allowFullScreen
                        scrolling="no"
                        style={{
                          width: "100%",
                          height: "820px",
                          border: 0,
                          display: "block",
                          marginTop: "-60px",
                        }}
                      />
                    ) : (
                      <iframe
                        src={item.src}
                        title={`Instagram thumb ${i}`}
                        loading="lazy"
                        scrolling="no"
                        tabIndex={-1}
                        style={{
                          width: "100%",
                          height: "820px",
                          border: 0,
                          display: "block",
                          marginTop: "-60px",
                          pointerEvents: "none",
                        }}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
                      <Instagram className="h-8 w-8" style={{ color: "#E1306C" }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
