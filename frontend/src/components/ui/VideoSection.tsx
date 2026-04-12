import { useRef, useState } from "react";
import { Volume2, VolumeX, Sparkles } from "lucide-react";

interface VideoSectionProps {
  videoUrl: string;
  storeName?: string;
  primaryColor?: string;
  title?: string;
  description?: string;
  titleColor?: string;
  descColor?: string;
}

type Embed =
  | { type: "youtube"; src: string }
  | { type: "vimeo"; src: string }
  | { type: "direct"; src: string }
  | { type: "invalid"; src: string };

function getEmbedUrl(url: string): Embed {
  const trimmed = (url || "").trim();
  if (!trimmed) return { type: "invalid", src: "" };

  const yt = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
  );
  if (yt) {
    const id = yt[1];
    const params = new URLSearchParams({
      autoplay: "1",
      mute: "1",
      loop: "1",
      playlist: id,
      controls: "1",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
    });
    return {
      type: "youtube",
      src: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
    };
  }

  const vimeo = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return {
      type: "vimeo",
      src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0`,
    };
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(trimmed)) {
    return { type: "direct", src: trimmed };
  }

  return { type: "invalid", src: trimmed };
}

export function VideoSection({ videoUrl, storeName, primaryColor = "#6366f1", title, description, titleColor, descColor }: VideoSectionProps) {
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!videoUrl) return null;

  const embed = getEmbedUrl(videoUrl);

  if (embed.type === "invalid") {
    return (
      <section className="py-10 px-4 text-center text-sm text-muted-foreground">
        <p>Invalid video URL. Paste a YouTube, Vimeo, or direct .mp4 link.</p>
      </section>
    );
  }

  return (
    <section className="relative py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-8 sm:mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider mb-4"
            style={{
              backgroundColor: `${primaryColor}15`,
              color: primaryColor,
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Our Story
          </div>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-3"
            style={titleColor ? { color: titleColor } : undefined}
          >
            {title || `Watch ${storeName || "Our Store"} in Action`}
          </h2>
          <p
            className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto"
            style={descColor ? { color: descColor } : undefined}
          >
            {description || "Get a behind-the-scenes look at what makes us special"}
          </p>
        </div>

        {/* Video card */}
        <div className="relative mx-auto max-w-5xl">
          {/* Decorative glow */}
          <div
            className="absolute -inset-4 rounded-3xl opacity-30 blur-2xl"
            style={{
              background: `radial-gradient(circle at center, ${primaryColor}, transparent 70%)`,
            }}
          />

          {/* Player frame */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5 bg-black aspect-video">
            {embed.type === "direct" ? (
              <video
                ref={videoRef}
                src={embed.src}
                autoPlay
                loop
                muted={muted}
                playsInline
                controls
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <iframe
                src={embed.src}
                title="Store video"
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}

            {/* Mute toggle for direct videos */}
            {embed.type === "direct" && (
              <button
                onClick={() => {
                  setMuted(!muted);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
                className="absolute top-4 right-4 p-2.5 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-all ring-1 ring-white/10"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
