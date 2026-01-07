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
import { fetchRegions } from '../lib/api/regions';
import { fetchCities } from '../lib/api/cities';
import type { Region, City } from '../lib/types';

interface UseMapSetupProps {
  onError?: (error: Error) => void;
}

interface UseMapSetupReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: React.RefObject<maplibregl.Map | null>;
  isLoading: boolean;
  error: Error | null;
  regions: Region[];
  cities: City[];
  mapLoaded: boolean;
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
  const [regions, setRegions] = useState<Region[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

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

        // Responsive zoom and center based on screen size
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

        // Adjust zoom based on screen size
        let initialZoom = 5.8; // Default for laptop/desktop
        if (isMobile) {
          initialZoom = 5.0; // Mobile needs to fit Florida in portrait
        } else if (isTablet) {
          initialZoom = 5.5;
        }

        // Adjust center - shift west so Florida appears more to the right
        let initialCenter: [number, number] = [-82.2, 27.6648]; // Desktop - shifted right
        if (isMobile) {
          initialCenter = [-83.5, 27.0]; // Mobile - shifted more right and south for portrait
        }

        console.log('[MAP] Initializing map instance...', { isMobile, isTablet, initialZoom });
        // Initialize map
        const mapInstance = new maplibregl.Map({
          container: mapContainer.current,
          style: styleURL,
          center: initialCenter,
          zoom: initialZoom,
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

            // Load regions and cities from database
            try {
              console.log('[MAP] Fetching regions and cities from database...');
              const [regionsData, citiesData] = await Promise.all([
                fetchRegions(),
                fetchCities()
              ]);

              if (!isActive) return;

              // Store regions and cities in state
              setRegions(regionsData);
              setCities(citiesData);
              console.log(`[MAP] ✓ Fetched ${regionsData.length} regions and ${citiesData.length} cities`);

              // Convert regions to GeoJSON FeatureCollection for map layers
              if (regionsData.length > 0) {
                const regionsGeoJSON = {
                  type: 'FeatureCollection' as const,
                  features: regionsData
                    .filter(region => region.geom)
                    .map(region => ({
                      type: 'Feature' as const,
                      properties: {
                        id: region.id,
                        name: region.name
                      },
                      geometry: region.geom
                    }))
                };

                // Add regions fill layer (filled when zoomed out, fades as you zoom in)
                // Using same colors as admin RegionsMap: #4a9eff fill, #76c8fe border
                map.current.addLayer({
                  id: 'regions-fill',
                  type: 'fill',
                  source: {
                    type: 'geojson',
                    data: regionsGeoJSON as any
                  },
                  paint: {
                    'fill-color': '#4a9eff',
                    'fill-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, // At zoom 5
                      0.3, // visible when zoomed out (same as admin)
                      REGION_CONFIG.FADE_OUT_START, // At zoom 6.0
                      0.3, // still visible
                      REGION_CONFIG.FADE_OUT_END, // At zoom 6.8
                      0 // completely transparent when zoomed in
                    ]
                  }
                });

                // Add regions border layer (lighter, stays subtle when zoomed in)
                map.current.addLayer({
                  id: 'regions-border',
                  type: 'line',
                  source: {
                    type: 'geojson',
                    data: regionsGeoJSON as any
                  },
                  paint: {
                    'line-color': '#76c8fe',
                    'line-width': 1,
                    'line-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, 1,
                      REGION_CONFIG.FADE_OUT_START, 1,
                      REGION_CONFIG.FADE_OUT_END, 0.5,
                      12, 0.3
                    ]
                  }
                });

                console.log('[MAP] ✓ Added regions layers from database');
              }

              // Add tilt/pitch logic based on zoom level (same as admin CitiesMap)
              // Track touch state to avoid interrupting mobile pinch gestures
              let isTouching = false;

              map.current.on('touchstart', () => { isTouching = true; });
              map.current.on('touchend', () => {
                if (!map.current) return;
                isTouching = false;
                // Update pitch after touch gesture ends
                const zoom = map.current.getZoom();
                const targetPitch = zoom > 11 ? Math.min(45, (zoom - 11) * 15) : 0;
                map.current.setPitch(targetPitch);
              });

              map.current.on('zoom', () => {
                if (!map.current || isTouching) return; // Skip during touch gestures
                const zoom = map.current.getZoom();
                let targetPitch = 0;
                if (zoom > 11) {
                  // Gradually increase pitch from 0 to 45 as zoom goes from 11 to 14
                  targetPitch = Math.min(45, (zoom - 11) * 15);
                }
                map.current.setPitch(targetPitch);
              });
              console.log('[MAP] ✓ Added zoom-based tilt logic');
            } catch (dataError) {
              // Data loading is optional, don't fail if it doesn't load
              console.warn('[MAP] Failed to load data from database:', dataError);
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
                    setMapLoaded(true);
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

  return { mapContainer, map, isLoading, error, regions, cities, mapLoaded };
}
