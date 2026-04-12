import { useState, useEffect, useRef } from "react";

interface BannerCarouselProps {
  images: string[];
  bannerImage?: string;
  heroBannerImage?: string;
  height?: string;
  storeName?: string;
  description?: string;
  primaryColor?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  fontFamily?: string;
  apiUrl?: string;
  showOverlay?: boolean;
  children?: React.ReactNode;
}

export function BannerCarousel({
  images,
  bannerImage,
  heroBannerImage,
  height = "500px",
  storeName,
  description,
  primaryColor = "#6366f1",
  fontSize = 24,
  fontColor = "#ffffff",
  bold = false,
  fontFamily,
  apiUrl = "",
  showOverlay = true,
  children,
}: BannerCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine carousel images with fallback to single banner images
  const allImages = images && images.length > 0
    ? images
    : [heroBannerImage, bannerImage].filter(Boolean) as string[];

  useEffect(() => {
    if (allImages.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % allImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [allImages.length, isPaused]);

  if (allImages.length === 0) return null;

  const getImageUrl = (img: string) =>
    img.startsWith("http") ? img : `${apiUrl}${img}`;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ height }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Slides */}
      {allImages.map((img, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === currentSlide ? 1 : 0 }}
        >
          <img
            src={getImageUrl(img)}
            alt={`Banner ${i + 1}`}
            className="w-full h-full object-cover"
          />
        </div>
      ))}

      {/* Overlay */}
      {showOverlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
      )}

      {/* Content - use children if provided, otherwise default content */}
      {children ? (
        <div className="absolute inset-0 z-10">{children}</div>
      ) : (
        <div className="absolute inset-0 flex items-end p-6 sm:p-8 lg:p-12">
          <div>
            <h1
              style={{
                fontSize: `${fontSize}px`,
                color: fontColor,
                fontWeight: bold ? "bold" : "normal",
                fontFamily: fontFamily || "inherit",
              }}
            >
              {storeName}
            </h1>
            {description && (
              <p className="mt-2 max-w-lg text-sm" style={{ color: `${fontColor}cc` }}>
                {description}
              </p>
            )}
            <button
              className="mt-4 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Shop Now
            </button>
          </div>
        </div>
      )}

      {/* Dots */}
      {allImages.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {allImages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === currentSlide ? "w-7 bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
