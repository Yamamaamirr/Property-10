"use client";

import { useState, useCallback } from 'react';

interface FileUploadProps {
  onUpload: (data: any) => void;
  accept?: string;
  label?: string;
  description?: string;
}

export default function FileUpload({
  onUpload,
  accept = '.geojson,.json',
  label = 'Upload GeoJSON',
  description = 'Drag and drop your GeoJSON file here, or click to browse'
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate it's GeoJSON
      if (!data.type || (data.type !== 'FeatureCollection' && data.type !== 'Feature')) {
        throw new Error('Invalid GeoJSON format. Expected FeatureCollection or Feature.');
      }

      onUpload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setFileName(null);
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="w-full">
      <label
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          flex flex-col items-center justify-center w-full h-48
          border-2 border-dashed rounded-lg cursor-pointer
          transition-all duration-300
          ${isDragging
            ? 'border-p10-accent bg-p10-accent/10'
            : 'border-p10-border hover:border-p10-maya bg-p10-blue-dark hover:bg-p10-blue'
          }
        `}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg
            className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-p10-accent' : 'text-p10-text-muted'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>

          <p className="mb-2 text-sm font-semibold text-white">
            {label}
          </p>
          <p className="text-xs text-p10-text-muted text-center px-4">
            {description}
          </p>

          {fileName && (
            <div className="mt-4 px-4 py-2 bg-p10-accent/20 rounded-md">
              <p className="text-sm text-p10-maya">✓ {fileName}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 px-4 py-2 bg-red-500/20 rounded-md">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
        <input
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
