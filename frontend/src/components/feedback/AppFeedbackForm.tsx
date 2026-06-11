import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Heart, ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface AppFeedbackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function AppFeedbackForm({ open, onOpenChange }: AppFeedbackFormProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [emailId, setEmailId] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setEmailId("");
    setDescription("");
    setImage(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPickImage = (file: File | null) => {
    if (!file) {
      setImage(null);
      setImagePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please choose an image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({
        title: "Image too large",
        description: "Max 5MB.",
        variant: "destructive",
      });
      return;
    }
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image) {
      toast({
        title: "Image required",
        description: "Please add a photo to go with your feedback.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("emailId", emailId.trim());
      fd.append("description", description.trim());
      fd.append("image", image);

      const res = await fetch(`${apiURL}/app-feedback`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to submit feedback");
      }
      toast({
        title: "Thanks for your feedback!",
        description: "We review every submission before publishing.",
      });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Couldn't submit",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Theme-aware input class — matches the landing page's glassmorphic feel
  // (semi-transparent dark/light background, soft border, landing accent on focus).
  const inputClass = cn(
    "bg-background/60 backdrop-blur-sm border-foreground/10",
    "focus-visible:ring-landing focus-visible:ring-offset-0 focus-visible:border-landing/50",
    "rounded-xl",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md p-0 overflow-hidden border-white/10",
          "bg-background/95 backdrop-blur-xl",
          "rounded-2xl shadow-2xl",
          "max-h-[90vh] flex flex-col",
        )}
      >
        {/* Compact header — icon inline with title */}
        <div className="relative bg-gradient-to-br from-landing/15 via-landing/8 to-purple-500/10 px-5 py-4 border-b border-white/5 flex items-center gap-3 shrink-0">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-landing/90 text-white shadow-[0_4px_14px_-4px_rgba(var(--landing),0.6)] shrink-0"
          >
            <Heart className="w-4 h-4 fill-current" />
          </motion.div>
          <DialogHeader className="text-left space-y-0 flex-1 min-w-0">
            <DialogTitle className="text-base font-bold tracking-tight">
              Share Your Experience
            </DialogTitle>
            <DialogDescription className="text-xs text-foreground/60">
              Your story helps other merchants discover KiosCart.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Scrollable body — won't push the dialog off-screen on short laptops */}
        <form
          onSubmit={handleSubmit}
          className="px-5 py-4 space-y-3 overflow-y-auto"
        >
          {/* Photo + name/email side-by-side */}
          <div className="flex gap-3">
            {imagePreview ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative shrink-0"
              >
                <img
                  src={imagePreview}
                  alt="preview"
                  className="h-20 w-20 rounded-xl object-cover border-2 border-landing/40 shadow"
                />
                <button
                  type="button"
                  onClick={() => onPickImage(null)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 shadow"
                  aria-label="Remove image"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </motion.div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className={cn(
                  "h-20 w-20 rounded-xl border-2 border-dashed shrink-0",
                  "border-foreground/20 bg-background/40",
                  "flex flex-col items-center justify-center gap-0.5",
                  "text-foreground/50 hover:text-landing hover:border-landing/60 hover:bg-landing/5",
                  "transition-all duration-200",
                )}
              >
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] font-medium">Photo</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
            />

            <div className="flex-1 space-y-2 min-w-0">
              <Input
                id="fb-name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={cn(inputClass, "h-9")}
              />
              <Input
                id="fb-email"
                type="email"
                required
                value={emailId}
                onChange={(e) => setEmailId(e.target.value)}
                placeholder="you@example.com"
                className={cn(inputClass, "h-9")}
              />
            </div>
          </div>

          <div>
            <Textarea
              id="fb-desc"
              required
              minLength={10}
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you love about KiosCart?"
              className={cn(inputClass, "resize-none")}
            />
            <div className="text-[10px] text-foreground/50 text-right mt-0.5 tabular-nums">
              {description.length}/500
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-full bg-background/60 border-foreground/10 hover:bg-background/80"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className={cn(
                "rounded-full bg-landing hover:bg-landing/90 text-white",
                "shadow-[0_4px_14px_-4px_rgba(var(--landing),0.6)]",
                "transition-all hover:scale-[1.02]",
              )}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
