import { useEffect, useState } from "react";
import { Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface PublicFeedback {
  _id: string;
  name: string;
  description: string;
  image: string;
  createdAt: string;
}

export function AppFeedbackCarousel() {
  const [items, setItems] = useState<PublicFeedback[]>([]);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiURL}/app-feedback/public`);
        if (!res.ok) return;
        const data: PublicFeedback[] = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        // Carousel is decorative — fail silent, just render nothing.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-advance every 6 seconds.
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(id);
  }, [items.length]);

  if (!loaded || items.length === 0) return null;

  const current = items[index];
  const goPrev = () =>
    setIndex((i) => (i === 0 ? items.length - 1 : i - 1));
  const goNext = () => setIndex((i) => (i + 1) % items.length);

  const imageSrc = current.image.startsWith("http")
    ? current.image
    : `${apiURL}${current.image}`;

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="relative rounded-2xl border border-white/10 bg-background/40 backdrop-blur-xl shadow-xl overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={current._id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="grid md:grid-cols-[200px_1fr] gap-6 p-8"
          >
            <div className="flex items-center justify-center">
              <img
                src={imageSrc}
                alt={current.name}
                className="w-32 h-32 md:w-48 md:h-48 object-cover rounded-2xl border-2 border-landing/30 shadow-lg"
                loading="lazy"
              />
            </div>
            <div className="flex flex-col justify-center">
              <Quote className="w-8 h-8 text-landing/60 mb-2" />
              <p className="text-base md:text-lg text-foreground/90 leading-relaxed mb-4">
                {current.description}
              </p>
              <div className="font-semibold text-foreground">{current.name}</div>
            </div>
          </motion.div>
        </AnimatePresence>

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur hover:bg-background border border-border/50 transition"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/60 backdrop-blur hover:bg-background border border-border/50 transition"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-landing" : "w-1.5 bg-foreground/30"
              }`}
              aria-label={`Show feedback ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
