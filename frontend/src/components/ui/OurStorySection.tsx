import { useEffect, useState } from "react";
import { Play, X, ChevronLeft, ChevronRight } from "lucide-react";

export interface OurStoryMediaItem {
  type: "image" | "video";
  url: string;
  thumbnail?: string;
}

interface OurStorySectionProps {
  title: string;
  description: string;
  media: OurStoryMediaItem[];
  primaryColor?: string;
  eyebrow?: string;
  eyebrowColor?: string;
  titleColor?: string;
  descColor?: string;
}

function getYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function getVideoPoster(item: OurStoryMediaItem): string | null {
  if (item.thumbnail) return item.thumbnail;
  const yt = getYoutubeId(item.url);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  return null;
}

function getVideoEmbedSrc(url: string): string | null {
  const yt = getYoutubeId(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  const vm = getVimeoId(url);
  if (vm) return `https://player.vimeo.com/video/${vm}?autoplay=1&title=0&byline=0&portrait=0`;
  return null;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
}

function ThumbCard({
  item,
  primaryColor,
  onClick,
  active = false,
}: {
  item: OurStoryMediaItem;
  primaryColor: string;
  onClick: () => void;
  active?: boolean;
}) {
  const poster = item.type === "image" ? item.url : getVideoPoster(item);
  return (
    <button
      onClick={onClick}
      className="group relative aspect-video w-full rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 ring-2"
      style={{
        // Highlight active thumb with primary color ring
        boxShadow: active ? `0 0 0 3px ${primaryColor}` : undefined,
        // @ts-expect-error — tailwind ring color via CSS var
        "--tw-ring-color": "transparent",
      }}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      {item.type === "video" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
            style={{ backgroundColor: `${primaryColor}e6` }}
          >
            <Play className="h-4 w-4 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
    </button>
  );
}

export function OurStorySection({
  title,
  description,
  media,
  primaryColor = "#6366f1",
  eyebrow,
  eyebrowColor,
  titleColor,
  descColor,
}: OurStorySectionProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const valid = (media || []).filter((m) => m && m.url && m.url.trim()).slice(0, 3);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight")
        setActiveIndex((i) => (i === null ? null : (i + 1) % valid.length));
      if (e.key === "ArrowLeft")
        setActiveIndex((i) =>
          i === null ? null : (i - 1 + valid.length) % valid.length,
        );
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [activeIndex, valid.length]);

  if (valid.length === 0 && !title && !description) return null;

  const current = activeIndex !== null ? valid[activeIndex] : null;

  return (
    <section className="relative py-14 sm:py-20 lg:py-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-gray-50 to-white overflow-hidden">
      {/* decorative backdrop */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${primaryColor}, transparent 70%)`,
        }}
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${primaryColor}, transparent 70%)`,
        }}
      />

      <div className="relative max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* LEFT: Headline + description + Watch our story CTA */}
          <div
            className={`order-1 ${
              valid.length > 0 ? "lg:col-span-8" : "lg:col-span-12"
            }`}
          >
            <div className="inline-flex items-center gap-2 mb-6">
              <span
                className="block h-[3px] w-10 rounded-full"
                style={{ backgroundColor: primaryColor }}
              />
              <span
                className="text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: eyebrowColor || primaryColor }}
              >
                {eyebrow || "How we started"}
              </span>
            </div>

            {title && (
              <h2
                className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 leading-[1.02] mb-6"
                style={titleColor ? { color: titleColor } : undefined}
              >
                {title}
              </h2>
            )}

            {description && (
              <div
                className="space-y-4 text-base sm:text-lg text-gray-600 leading-relaxed whitespace-pre-line max-w-2xl"
                style={descColor ? { color: descColor } : undefined}
              >
                {description}
              </div>
            )}

            {valid.length > 0 && (
              <button
                onClick={() => setActiveIndex(0)}
                className="mt-8 inline-flex items-center gap-3 px-7 py-3.5 rounded-full text-sm font-bold text-white shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all tracking-wide uppercase"
                style={{ backgroundColor: primaryColor }}
              >
                <Play className="h-4 w-4 fill-white" />
                Watch our story
              </button>
            )}
          </div>

          {/* RIGHT: small preview cards — overlapping stack */}
          {valid.length > 0 && (
            <div className="lg:col-span-4 order-2">
              <div className="relative">
                {valid.map((item, i) => {
                  const offsets = ["ml-0", "ml-8 sm:ml-12", "ml-3 sm:ml-6"];
                  const rotates = ["-rotate-3", "rotate-2", "-rotate-1"];
                  return (
                    <div
                      key={`${item.url}-${i}`}
                      className={`${offsets[i % offsets.length]} ${rotates[i % rotates.length]} hover:rotate-0 hover:z-20 hover:scale-[1.03] transition-all duration-300 ${i > 0 ? "-mt-16 sm:-mt-20" : ""}`}
                      style={{ zIndex: i + 1 }}
                    >
                      <ThumbCard
                        item={item}
                        primaryColor={primaryColor}
                        onClick={() => setActiveIndex(i)}
                        active={false}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Carousel Lightbox */}
      {current && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setActiveIndex(null)}
        >
          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex(null);
            }}
            aria-label="Close"
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm ring-1 ring-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev */}
          {valid.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex((i) =>
                  i === null ? null : (i - 1 + valid.length) % valid.length,
                );
              }}
              aria-label="Previous"
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm ring-1 ring-white/20 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next */}
          {valid.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex((i) =>
                  i === null ? null : (i + 1) % valid.length,
                );
              }}
              aria-label="Next"
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm ring-1 ring-white/20 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Media */}
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            {current.type === "image" ? (
              <img
                src={current.url}
                alt=""
                className="w-full max-h-[80vh] object-contain rounded-lg"
              />
            ) : (
              <div className="w-full aspect-video rounded-lg overflow-hidden bg-black shadow-2xl">
                {(() => {
                  const embed = getVideoEmbedSrc(current.url);
                  if (embed) {
                    return (
                      <iframe
                        key={activeIndex}
                        src={embed}
                        title="Story video"
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    );
                  }
                  if (isDirectVideo(current.url)) {
                    return (
                      <video
                        key={activeIndex}
                        src={current.url}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full"
                      />
                    );
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center text-white/70 text-sm">
                      Unsupported video URL
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Dot indicators */}
            {valid.length > 1 && (
              <div className="mt-5 flex items-center justify-center gap-2">
                {valid.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIndex(i);
                    }}
                    aria-label={`Go to slide ${i + 1}`}
                    className="w-2.5 h-2.5 rounded-full transition-all"
                    style={{
                      backgroundColor:
                        i === activeIndex ? primaryColor : "rgba(255,255,255,0.35)",
                      transform: i === activeIndex ? "scale(1.3)" : undefined,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
