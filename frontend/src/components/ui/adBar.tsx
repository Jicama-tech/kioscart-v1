import React, { useState } from "react";
import { X } from "lucide-react";

interface AnnouncementBarProps {
  message?: string;
  backgroundColor?: string;
  textColor?: string;
  speed?: string;
  fontFamily?: string;
  position?: "top" | "floating";
}

const AnnouncementBar: React.FC<AnnouncementBarProps> = ({
  message = "✨ Special Offer: Get 20% off on all new arrivals! Use code: WELCOME20 ✨",
  backgroundColor = "#000000",
  textColor = "#ffffff",
  speed = "50s",
  fontFamily = "Poppins",
  position = "top",
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isFloating = position === "floating";

  return (
    <div
      className={`w-full overflow-hidden py-1.5 sm:py-2 md:py-2.5 relative ${
        isFloating
          ? "fixed bottom-0 left-0 right-0 z-50 shadow-lg"
          : "sticky top-0 z-[1]"
      }`}
      style={{
        backgroundColor,
        ...(isFloating ? { borderTopLeftRadius: "12px", borderTopRightRadius: "12px" } : {}),
      }}
    >
      <div
        className="flex animate-marquee hover:[animation-play-state:paused]"
        style={{ "--speed": speed } as React.CSSProperties}
      >
        {[...Array(7)].map((_, i) => (
          <span
            key={i}
            className="text-xs sm:text-sm md:text-base font-semibold px-3 sm:px-4 md:px-6 uppercase tracking-wide md:tracking-widest whitespace-nowrap"
            style={{ color: textColor, fontFamily }}
          >
            {message}
          </span>
        ))}
      </div>

      {isFloating && (
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-1/2 right-2 -translate-y-1/2 p-1 rounded-full hover:bg-white/20 transition-colors"
          style={{ color: textColor }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          --gap: 2rem;
          animation: marquee var(--speed, 40s) linear infinite;
        }
        @media (max-width: 640px) {
          .animate-marquee {
            --gap: 1rem;
          }
        }
        @media (max-width: 425px) {
          .animate-marquee {
            --gap: 0.5rem;
            animation: marquee var(--speed, 30s) linear infinite;
          }
        }
      `}</style>
    </div>
  );
};

export default AnnouncementBar;
