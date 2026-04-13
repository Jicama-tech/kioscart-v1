import React, { useState } from "react";
import { X, Sparkles } from "lucide-react";

interface AnnouncementBarProps {
  message?: string;
  backgroundColor?: string;
  textColor?: string;
  speed?: string;
  fontFamily?: string;
  position?: "top" | "floating";
}

const AnnouncementBar: React.FC<AnnouncementBarProps> = ({
  message = "Special Offer: Get 20% off on all new arrivals! Use code: WELCOME20",
  backgroundColor = "#000000",
  textColor = "#ffffff",
  speed = "40s",
  fontFamily = "Poppins",
  position = "top",
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isFloating = position === "floating";

  return (
    <div
      className={`w-full overflow-hidden relative ${
        isFloating
          ? "fixed bottom-0 left-0 right-0 z-50"
          : "sticky top-0 z-[1]"
      }`}
      style={{
        backgroundColor,
        ...(isFloating
          ? { borderTopLeftRadius: "16px", borderTopRightRadius: "16px", boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" }
          : {}),
      }}
    >
      <div className="py-2 sm:py-2.5">
        <div
          className="flex animate-ad-marquee hover:[animation-play-state:paused]"
          style={{ "--ad-speed": speed } as React.CSSProperties}
        >
          {[...Array(8)].map((_, i) => (
            <span
              key={i}
              className="flex items-center gap-2 sm:gap-3 whitespace-nowrap px-4 sm:px-6 md:px-8"
              style={{ color: textColor, fontFamily }}
            >
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0 opacity-70" />
              <span className="text-[11px] sm:text-xs md:text-sm font-semibold tracking-wide sm:tracking-wider uppercase">
                {message}
              </span>
            </span>
          ))}
        </div>
      </div>


      {/* Dismiss button */}
      {isFloating && (
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-1/2 right-3 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/20 transition-colors"
          style={{ color: textColor }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <style>{`
        @keyframes ad-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ad-marquee {
          display: flex;
          width: max-content;
          animation: ad-marquee var(--ad-speed, 40s) linear infinite;
        }
        @keyframes shimmer {
          0%, 100% { background-position: -200% 0; }
          50% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
};

export default AnnouncementBar;
