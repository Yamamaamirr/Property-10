"use client";

import { useState, useRef } from "react";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { supabase } from "@/app/lib/supabase";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  bucket?: string;
  folder?: string;
}

export function ImageUpload({
  value,
  onChange,
  onClear,
  disabled = false,
  bucket = "city-images",
  folder = "cities",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      setPreview(publicUrl);
      onChange(publicUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClear = () => {
    setPreview(null);
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  return (
    <div className="space-y-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Preview or Upload Button */}
      {preview ? (
        <div className="relative w-full h-32 md:h-40 rounded-lg overflow-hidden border border-border bg-muted">
          <Image
            src={preview}
            alt="Preview"
            fill
            className="object-cover"
            unoptimized
          />
          {!disabled && (
            <button
              onClick={handleClear}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-destructive/90 hover:bg-destructive flex items-center justify-center transition-colors"
              title="Remove image"
            >
              <X className="w-3 h-3 text-destructive-foreground" />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="w-full h-32 md:h-40 rounded-lg border-2 border-dashed border-border hover:border-cyan-400/50 bg-slate-800/30 hover:bg-slate-700/30 transition-colors flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin text-cyan-400" />
              <span className="text-[10px] md:text-xs text-cyan-400">Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 md:w-8 md:h-8" />
              <div className="text-center">
                <p className="text-[10px] md:text-xs font-medium">Click to upload image</p>
                <p className="text-[8px] md:text-[10px] mt-0.5 opacity-75">PNG, JPG up to 5MB</p>
              </div>
            </>
          )}
        </button>
      )}

      {/* Optional: Show upload button below preview */}
      {preview && !disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full text-[10px] md:text-xs h-7 md:h-8"
        >
          <Upload className="w-2.5 h-2.5 md:w-3 md:h-3 mr-1.5 md:mr-2" />
          {uploading ? 'Uploading...' : 'Change Image'}
        </Button>
      )}
    </div>
  );
}
