import { useState, useEffect } from "react";
import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Feedback {
  name: string;
  rating: number;
  text: string;
  date: string;
}

interface FeedbackBarProps {
  feedbacks: Feedback[];
  primaryColor?: string;
  fontFamily?: string;
}

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

export function FeedbackBar({ feedbacks, primaryColor = "#6366f1", fontFamily }: FeedbackBarProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (feedbacks.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % feedbacks.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [feedbacks.length]);

  if (!feedbacks || feedbacks.length === 0) return null;

  // Calculate average rating
  const avgRating = feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length;
  const ratingCounts = [5, 4, 3, 2, 1].map((r) => ({
    stars: r,
    count: feedbacks.filter((f) => f.rating === r).length,
    percentage: (feedbacks.filter((f) => f.rating === r).length / feedbacks.length) * 100,
  }));

  return (
    <div className="py-10 px-4" style={{ fontFamily }}>
      <div className="max-w-7xl mx-auto">
        <h3 className="text-xl font-bold mb-6 text-center">What Our Customers Say</h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rating Summary */}
          <Card className="lg:col-span-1">
            <CardContent className="py-6 text-center">
              <div className="text-4xl font-bold mb-1">{avgRating.toFixed(1)}</div>
              <StarRating rating={Math.round(avgRating)} size={20} />
              <p className="text-sm text-muted-foreground mt-2">{feedbacks.length} reviews</p>

              <div className="mt-4 space-y-2">
                {ratingCounts.map((rc) => (
                  <div key={rc.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-3">{rc.stars}</span>
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${rc.percentage}%`, backgroundColor: primaryColor }}
                      />
                    </div>
                    <span className="w-6 text-right text-muted-foreground">{rc.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Testimonial Carousel */}
          <div className="lg:col-span-2 relative">
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {feedbacks.map((feedback, i) => (
                  <div key={i} className="w-full flex-shrink-0 px-2">
                    <Card className="h-full">
                      <CardContent className="py-6">
                        <Quote className="h-8 w-8 mb-3 opacity-20" style={{ color: primaryColor }} />
                        <p className="text-sm leading-relaxed mb-4 italic">"{feedback.text}"</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                              style={{ backgroundColor: primaryColor }}
                            >
                              {feedback.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{feedback.name}</p>
                              <p className="text-xs text-muted-foreground">{feedback.date}</p>
                            </div>
                          </div>
                          <StarRating rating={feedback.rating} size={14} />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation */}
            {feedbacks.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {feedbacks.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === currentIndex ? "w-6" : "opacity-40"
                    }`}
                    style={{ backgroundColor: primaryColor }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
