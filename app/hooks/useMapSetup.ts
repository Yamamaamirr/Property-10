"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import {
  MAP_CONFIG,
  MAP_COLORS,
  MAP_OPACITY,
  MAP_LINE_WIDTH,
  MAP_OFFSETS,
  REGION_CONFIG
} from '../lib/constants';
import {
  extractFloridaCoordinates,
  createWorldMinusFloridaMask,
  getMapTilerStyleURL
} from '../lib/mapUtils';

interface UseMapSetupProps {
  onError?: (error: Error) => void;
}

interface UseMapSetupReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: React.RefObject<maplibregl.Map | null>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook to handle all map initialization and setup logic
 * Includes proper cleanup and error handling
 */
export function useMapSetup({ onError }: UseMapSetupProps): UseMapSetupReturn {
  const mapContainer = useRef<HTMLDivElement>(null!);
  const map = useRef<maplibregl.Map | null>(null);
  const isInitialized = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Debug logging for loading state changes
  useEffect(() => {
    console.log('[MAP STATE] isLoading changed to:', isLoading);
  }, [isLoading]);

  useEffect(() => {
    // Prevent double initialization (React Strict Mode)
    if (isInitialized.current) {
      return;
    }

    if (!mapContainer.current) {
      return;
    }

    // Track if this effect is still active
    let isActive = true;
    isInitialized.current = true;

    const initializeMap = async () => {
      if (!mapContainer.current || !isActive) return;

      try {
        const styleURL = getMapTilerStyleURL();

        console.log('[MAP] Initializing map instance...');
        // Initialize map
        const mapInstance = new maplibregl.Map({
          container: mapContainer.current,
          style: styleURL,
          center: MAP_CONFIG.INITIAL_CENTER,
          zoom: MAP_CONFIG.INITIAL_ZOOM,
          minZoom: MAP_CONFIG.MIN_ZOOM,
          maxZoom: MAP_CONFIG.MAX_ZOOM,
          attributionControl: false
        });

        map.current = mapInstance;
        console.log('[MAP] Map instance created');

        // Add error event listener
        mapInstance.on('error', (e) => {
          if (!isActive) return;
          console.error('Map error event:', e);
          const err = new Error(`Map failed to load: ${e.error?.message || 'Unknown error'}`);
          setError(err);
          setIsLoading(false);
          onError?.(err);
        });

        // Wait for map to load
        mapInstance.on('load', async () => {
          console.log('[MAP] Map load event fired');
          if (!isActive || !map.current) return;

          // Double-check style is loaded
          if (!mapInstance.isStyleLoaded()) {
            // Wait for style to be ready
            await new Promise<void>((resolve) => {
              const checkStyle = () => {
                if (mapInstance.isStyleLoaded()) {
                  resolve();
                } else {
                  setTimeout(checkStyle, 50);
                }
              };
              checkStyle();
            });
          }

          if (!isActive) return;

          // DON'T set isLoading to false yet - wait until masking is applied

          try {
            // Load Florida boundary GeoJSON
            const response = await fetch('/fl-state.geojson');
            if (!isActive) return;

            if (!response.ok) {
              throw new Error(`Failed to load Florida boundary: ${response.statusText}`);
            }

            const floridaBoundary = await response.json();
            if (!isActive || !map.current) return;

            // Extract coordinates
            const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
            const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

            // Add layers (with style loaded check)
            if (!map.current.isStyleLoaded()) return;

            console.log('[MAP] Adding masking layers...');

            // Add dark mask layer
            map.current.addLayer({
              id: 'dark-mask',
              type: 'fill',
              source: {
                type: 'geojson',
                data: worldMinusFlorida
              },
              paint: {
                'fill-color': MAP_COLORS.DARK_BACKGROUND,
                'fill-opacity': MAP_OPACITY.DARK_MASK
              }
            });
            console.log('[MAP] ✓ Added dark-mask layer');

            // Load and add regions layer
            try {
              const regionsResponse = await fetch('/new.geojson');
              if (regionsResponse.ok) {
                const regionsData = await regionsResponse.json();

                // Add regions fill layer (filled when zoomed out, fades as you zoom in)
                map.current.addLayer({
                  id: 'regions-fill',
                  type: 'fill',
                  source: {
                    type: 'geojson',
                    data: regionsData
                  },
                  paint: {
                    'fill-color': MAP_COLORS.REGION_HOVER_FILL,
                    'fill-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, // At zoom 5
                      MAP_OPACITY.REGION_FILL_ZOOMED_OUT, // visible when zoomed out
                      REGION_CONFIG.FADE_OUT_START, // At zoom 6.0
                      MAP_OPACITY.REGION_FILL_ZOOMED_OUT, // still visible
                      REGION_CONFIG.FADE_OUT_END, // At zoom 6.8
                      0 // completely transparent when zoomed in
                    ]
                  }
                });

                // Add regions border layer (fades as you zoom in)
                map.current.addLayer({
                  id: 'regions-border',
                  type: 'line',
                  source: {
                    type: 'geojson',
                    data: regionsData
                  },
                  paint: {
                    'line-color': MAP_COLORS.REGION_BORDER,
                    'line-width': MAP_LINE_WIDTH.REGION_BORDER,
                    'line-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, // At zoom 5
                      MAP_OPACITY.REGION_BORDER, // visible when zoomed out
                      REGION_CONFIG.FADE_OUT_START, // At zoom 6.0
                      MAP_OPACITY.REGION_BORDER, // still visible
                      REGION_CONFIG.FADE_OUT_END, // At zoom 6.8
                      0 // completely transparent when zoomed in
                    ]
                  }
                });

                console.log('[MAP] ✓ Added regions layers');
              }
            } catch (regionsError) {
              // Regions are optional, don't fail if they don't load
              console.warn('[MAP] Failed to load regions:', regionsError);
            }

            // Track when our masking layers are fully rendered
            let layersRendered = false;
            let renderCheckCount = 0;

            const checkLayersAndReveal = () => {
              if (!isActive || !map.current || layersRendered) return;

              renderCheckCount++;
              console.log(`[MAP] Render check #${renderCheckCount} - checking for layers...`);

              // Verify all our custom layers exist and are rendered
              const darkMask = map.current.getLayer('dark-mask');

              console.log('[MAP] Layer status:', {
                darkMask: !!darkMask
              });

              if (darkMask) {
                layersRendered = true;
                console.log('[MAP] ✓ All layers confirmed! Preparing to reveal map...');

                // Remove the render listener since we've confirmed layers exist
                if (map.current) {
                  map.current.off('render', checkLayersAndReveal);
                }

                // Use double requestAnimationFrame to ensure we're past the paint cycle
                requestAnimationFrame(() => {
                  console.log('[MAP] First RAF complete');
                  requestAnimationFrame(() => {
                    if (!isActive) return;

                    console.log('[MAP] Second RAF complete - hiding loader and revealing map');
                    // NOW set loading to false - masking layers are confirmed rendered
                    setIsLoading(false);
                  });
                });
              }
            };

            console.log('[MAP] Setting up render listeners...');
            // Listen for render events to confirm layers are painted
            map.current.on('render', checkLayersAndReveal);

            // Also check on idle as a backup
            map.current.once('idle', () => {
              console.log('[MAP] Map idle event fired');
              checkLayersAndReveal();
            });
          } catch (boundaryError) {
            if (!isActive) return;
            const err = boundaryError instanceof Error ? boundaryError : new Error('Failed to load Florida boundary');
            setError(err);
            onError?.(err);
          }
        });
      } catch (initError) {
        if (!isActive) return;
        const err = initError instanceof Error ? initError : new Error('Failed to initialize map');
        setError(err);
        setIsLoading(false);
        onError?.(err);
      }
    };

    initializeMap();

    // Cleanup function
    return () => {
      isActive = false;

      // Remove map
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      // Reset initialization flag so it can reinitialize if needed
      isInitialized.current = false;
    };
  }, [onError]);

  return { mapContainer, map, isLoading, error };
}
