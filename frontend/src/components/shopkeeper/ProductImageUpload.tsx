import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Image as ImageIcon, Plus } from "lucide-react";
import ImageCropModal from "../ui/imageCropModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProductImageUploadProps {
  images: (string | File)[];
  onImagesChange: (images: (string | File)[]) => void;
  maxImages?: number;
}

export function ProductImageUpload({
  images,
  onImagesChange,
  maxImages = 3,
}: ProductImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const apiURL = __API_URL__;
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  const handleFileSelect = (files: FileList) => {
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith("image/")) {
        toast({
          duration: 5000,
          title: "Invalid File",
          description: `${file.name} is not an image file.`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          duration: 5000,
          title: "File Too Large",
          description: `${file.name} is larger than 5MB.`,
          variant: "destructive",
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    if (images.length + validFiles.length > maxImages) {
      toast({
        duration: 5000,
        title: "Too Many Images",
        description: `Maximum ${maxImages} images allowed.`,
        variant: "destructive",
      });
      return;
    }

    console.log("Valid files for cropping:", validFiles);

    // ⬇️ Start cropping instead of directly adding
    setCropQueue(validFiles);
    openNextCrop(validFiles);
  };

  const openNextCrop = (queue: File[]) => {
    if (queue.length === 0) return;

    const file = queue[0];
    setCurrentFile(file);
    setCropImage(URL.createObjectURL(file));
    console.log("Opening crop modal for:", file);
    setCropOpen(true);
    console.log("Crop modal opened", cropOpen);
  };

  const handleCroppedImage = (croppedFile: File) => {
    if (editIndex !== null) {
      const updatedImages = [...images];
      updatedImages[editIndex] = croppedFile;
      onImagesChange(updatedImages);
      setEditIndex(null);
    } else {
      onImagesChange([...images, croppedFile]);
    }

    if (cropImage) {
      URL.revokeObjectURL(cropImage);
    }

    const remaining = cropQueue.slice(1);
    setCropQueue(remaining);

    if (remaining.length > 0) {
      openNextCrop(remaining);
    } else {
      setCropOpen(false);
      setCurrentFile(null);
      setCropImage(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  // **This function is already correct and working**
  const moveImage = (fromIdx: number, toIdx: number) => {
    const newImages = [...images];
    const [moved] = newImages.splice(fromIdx, 1);
    newImages.splice(toIdx, 0, moved);
    onImagesChange(newImages);
  };

  return (
    <div className="space-y-4">
      <Label>
        Product Images ({images.length}/{maxImages})
      </Label>

      {/* Upload Area */}
      <Card>
        <CardContent className="p-6">
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center transition-colors hover:border-muted-foreground/50"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFileSelect(e.target.files);
                }
              }}
            />

            {uploading ? (
              <div className="space-y-2">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Uploading images...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto h-12 w-12 text-muted-foreground">
                  <Upload className="h-full w-full" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Drag and drop images here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, GIF up to 5MB each. Maximum {maxImages} images.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="buttonOutline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={images.length >= maxImages}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <Card key={index} className="relative group">
              <CardContent className="p-2">
                <div className="relative aspect-square">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <img
                          src={
                            typeof image === "string"
                              ? image.startsWith("http")
                                ? image
                                : `${apiURL}${image}`
                              : URL.createObjectURL(image)
                          }
                          alt={`Product image ${index + 1}`}
                          className="w-full h-full object-cover rounded-md cursor-pointer hover:opacity-80 transition"
                          loading="lazy"
                          onClick={() => {
                            setEditIndex(index);

                            if (typeof image === "string") {
                              setCropImage(
                                image.startsWith("http")
                                  ? image
                                  : `${apiURL}${image}`,
                              );
                            } else {
                              setCropImage(URL.createObjectURL(image));
                            }

                            setCropOpen(true);
                          }}
                        />
                      </TooltipTrigger>

                      <TooltipContent side="top">
                        <p>Click to crop</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    <span className="text-white text-xs font-medium">
                      Click to crop
                    </span>
                  </div> */}

                  {index === 0 && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-medium">
                      Primary
                    </div>
                  )}

                  {/* Remove Button */}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>

                  {/* Move Buttons */}
                  <div className="absolute bottom-2 left-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {index > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-xs flex-1"
                        onClick={() => moveImage(index, index - 1)}
                      >
                        ←
                      </Button>
                    )}
                    {index < images.length - 1 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-xs flex-1"
                        onClick={() => moveImage(index, index + 1)}
                      >
                        →
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Add More Button */}
          {images.length < maxImages && (
            <Card className="border-dashed">
              <CardContent className="p-2">
                <Button
                  variant="ghost"
                  className="w-full h-full aspect-square flex flex-col gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">Add More</span>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {images.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="mx-auto h-12 w-12 mb-2" />
          <p className="text-sm">No images uploaded yet</p>
        </div>
      )}

      {cropImage && (
        <ImageCropModal
          open={cropOpen}
          image={cropImage}
          onClose={() => {
            setCropOpen(false);
            setCropImage(null);
            setCurrentFile(null);
            setCropQueue([]);
          }}
          onCropComplete={handleCroppedImage}
        />
      )}
    </div>
  );
}
