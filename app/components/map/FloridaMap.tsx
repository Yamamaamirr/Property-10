"use client";

import React from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './popup.css';
import { propertyLocations } from '../../data/locations';
import { useMapSetup } from '../../hooks/useMapSetup';

/**
 * FloridaMap Component
 *
 * Interactive map of Florida showing luxury property locations.
 * Uses MapLibre GL with a custom "cookie-cutter" effect to highlight Florida.
 * Styled with Tailwind CSS for maintainability.
 */
export default function FloridaMap() {
  const { mapContainer, isLoading, error } = useMapSetup({
    locations: propertyLocations,
    onError: (err) => {
      console.error('Map error:', err);
    }
  });

  return (
    <div className="w-full h-screen relative">
      <div
        ref={mapContainer}
        className="w-full h-screen"
      />
      {isLoading && (
        <div className="absolute inset-0 bg-p10-dark flex items-center justify-center text-p10-text-muted">
          Loading map...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-p10-dark text-white p-8 text-center">
          <h2 className="mb-4 text-xl font-semibold">Unable to load map</h2>
          <p className="text-p10-text-muted">{error.message}</p>
        </div>
      )}
    </div>
  );
}
