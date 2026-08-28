"use client";

import { useState } from "react";
import Image from "next/image";
import { Upload, X, Loader2 } from "lucide-react";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
  folder?: string;
  className?: string;
  placeholder?: string;
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  disabled = false,
  folder = "pos-clothing-store",
  className = "",
  placeholder = "Click to upload image",
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size should be less than 5MB");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      // Upload to Cloudflare via API route
      const response = await fetch("/api/cloudflare/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      if (data.success) {
        onChange(data.url);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to upload image. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      // If it's an R2 URL, delete from R2
      if (
        value.includes(".r2.") ||
        value.includes("r2.cloudflarestorage.com")
      ) {
        await fetch("/api/cloudflare/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: value }),
        });
      }
    } catch (error) {
      console.error("Error deleting image:", error);
      // Continue with removal even if deletion fails
    }

    if (onRemove) {
      onRemove();
    } else {
      onChange("");
    }
  };

  return (
    <div className={`flex justify-center w-full ${className}`}>
      <div className="relative">
        {value ? (
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="relative w-72 h-60 rounded-xl overflow-hidden border-2 border-gray-200 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 hover:border-blue-300 transition-colors group">
                <img
                  src={value}
                  alt="Uploaded image"
                  className="h-full w-auto object-contain"
                />

                {!disabled && (
                  <>
                    <input
                      aria-label="Change image"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={disabled || isUploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center z-0">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-pink-400 to-pink-300 hover:from-pink-500 hover:to-pink-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md border-0">
                        <Upload className="h-3.5 w-3.5" />
                        Change
                      </div>
                    </div>
                  </>
                )}
              </div>
              {!disabled && (
                <button
                  title="Remove image"
                  type="button"
                  onClick={handleRemove}
                  className="absolute -top-2.5 -right-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-md transition-colors z-20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            <input
              aria-label="Upload image"
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={disabled || isUploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="w-72 h-60 border border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-blue-400 hover:bg-cyan-50/30 transition-all bg-gray-50">
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
                  <p className="text-xs text-gray-500 font-medium">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-gradient-to-r from-pink-400 to-pink-300 hover:from-pink-500 hover:to-pink-400 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm border-0">
                    <Upload className="h-3.5 w-3.5" />
                    Select File
                  </div>
                  <p className="text-xs text-gray-400">
                    PNG, JPG, GIF up to 5MB
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-xs text-red-600 font-medium text-center">{error}</p>}
      </div>
    </div>
  );
}
