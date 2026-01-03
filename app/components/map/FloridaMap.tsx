"use client";

import React, { useCallback } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapSetup } from '../../hooks/useMapSetup';
import Spinner from '../ui/Spinner';

/**
 * FloridaMap Component
 *
 * Interactive map of Florida with a custom "cookie-cutter" effect to highlight Florida.
 * Uses MapLibre GL styled with Tailwind CSS for maintainability.
 */
export default function FloridaMap() {
  // Memoize the error callback to prevent map reinitialization on re-renders
  const handleMapError = useCallback((err: Error) => {
    console.error('Map error:', err);
  }, []);

  const { mapContainer, isLoading, error } = useMapSetup({
    onError: handleMapError
  });

  return (
    <div className="w-full h-screen relative bg-p10-dark">
      {/* Map Container */}
      <div className="absolute inset-0">
        {/* Map container - always rendered but covered by overlay when loading */}
        <div
          ref={mapContainer}
          className="w-full h-full"
        />
        {/* Loading overlay - covers the map completely until masking layers are ready */}
        <div
          className={`absolute inset-0 bg-p10-dark flex flex-col items-center justify-center gap-4 z-10 transition-opacity duration-500 ${isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Spinner />
          <p className="text-p10-text-muted text-sm">Loading map...</p>
        </div>
        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-p10-dark text-white p-8 text-center z-10">
            <h2 className="mb-4 text-xl font-semibold">Unable to load map</h2>
            <p className="text-p10-text-muted">{error.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
