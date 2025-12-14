"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { PropertyLocation } from '../lib/types';
import {
  MAP_CONFIG,
  MAP_COLORS,
  MAP_OPACITY,
  MAP_LINE_WIDTH,
  MAP_OFFSETS,
  POPUP_CONFIG
} from '../lib/constants';
import {
  extractFloridaCoordinates,
  createWorldMinusFloridaMask,
  getMapTilerStyleURL,
  createPopupHTML
} from '../lib/mapUtils';

interface UseMapSetupProps {
  locations: PropertyLocation[];
  onError?: (error: Error) => void;
}

interface UseMapSetupReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook to handle all map initialization and setup logic
 * Includes proper cleanup and error handling
 */
export function useMapSetup({ locations, onError }: UseMapSetupProps): UseMapSetupReturn {
  const mapContainer = useRef<HTMLDivElement>(null!);
  const map = useRef<maplibregl.Map | null>(null);
  const currentPopup = useRef<maplibregl.Popup | null>(null);
  const timeoutIds = useRef<NodeJS.Timeout[]>([]);
  const isInitialized = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Helper to register timeouts for cleanup
  const registerTimeout = useCallback((timeoutId: NodeJS.Timeout) => {
    timeoutIds.current.push(timeoutId);
  }, []);

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

        // Add navigation controls
        mapInstance.addControl(
          new maplibregl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true
          }),
          'top-right'
        );

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

          setIsLoading(false);

          // Animate initial zoom
          const zoomTimeout = setTimeout(() => {
            if (map.current && isActive) {
              map.current.easeTo({
                zoom: MAP_CONFIG.ANIMATED_ZOOM,
                duration: MAP_CONFIG.INITIAL_ANIMATION_DURATION,
                easing: MAP_CONFIG.EASE_OUT_QUAD
              });
            }
          }, MAP_CONFIG.INITIAL_ANIMATION_DELAY);
          registerTimeout(zoomTimeout);

          try {
            // Load Florida boundary GeoJSON
            const response = await fetch('/fl-state.json');
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

            // Add Florida highlight fill
            map.current.addLayer({
              id: 'florida-fill',
              type: 'fill',
              source: {
                type: 'geojson',
                data: floridaBoundary
              },
              paint: {
                'fill-color': MAP_COLORS.FLORIDA_FILL,
                'fill-opacity': MAP_OPACITY.FLORIDA_FILL
              }
            });

            // Add emboss shadow effect
            map.current.addLayer({
              id: 'florida-outline-shadow',
              type: 'line',
              source: {
                type: 'geojson',
                data: floridaBoundary
              },
              paint: {
                'line-color': MAP_COLORS.OUTLINE_SHADOW,
                'line-width': MAP_LINE_WIDTH.OUTLINE_SHADOW,
                'line-opacity': MAP_OPACITY.OUTLINE_SHADOW,
                'line-offset': MAP_OFFSETS.SHADOW
              }
            });

            // Add emboss highlight effect
            map.current.addLayer({
              id: 'florida-outline-highlight',
              type: 'line',
              source: {
                type: 'geojson',
                data: floridaBoundary
              },
              paint: {
                'line-color': MAP_COLORS.OUTLINE_HIGHLIGHT,
                'line-width': MAP_LINE_WIDTH.OUTLINE_HIGHLIGHT,
                'line-opacity': MAP_OPACITY.OUTLINE_HIGHLIGHT,
                'line-offset': MAP_OFFSETS.HIGHLIGHT
              }
            });

            // Add main border
            map.current.addLayer({
              id: 'florida-outline',
              type: 'line',
              source: {
                type: 'geojson',
                data: floridaBoundary
              },
              paint: {
                'line-color': MAP_COLORS.DARK_BACKGROUND,
                'line-width': MAP_LINE_WIDTH.OUTLINE_MAIN,
                'line-opacity': MAP_OPACITY.OUTLINE_MAIN
              }
            });

            // Show default popup for first property on page load
            if (locations.length > 0 && map.current) {
              const firstProperty = locations[0];
              const popupHTML = createPopupHTML({
                title: firstProperty.title,
                name: firstProperty.name,
                price: firstProperty.price,
                size: firstProperty.size,
                tags: firstProperty.tags,
                image: firstProperty.image
              });

              // Create popup immediately on load
              currentPopup.current = new maplibregl.Popup({
                closeButton: POPUP_CONFIG.CLOSE_BUTTON,
                closeOnClick: POPUP_CONFIG.CLOSE_ON_CLICK,
                offset: POPUP_CONFIG.OFFSET
              })
                .setLngLat(firstProperty.coordinates)
                .setHTML(popupHTML)
                .addTo(map.current);

              currentPopup.current.on('close', () => {
                currentPopup.current = null;
              });
            }
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

      // Clear all timeouts
      timeoutIds.current.forEach(clearTimeout);
      timeoutIds.current = [];

      // Remove popup
      if (currentPopup.current) {
        currentPopup.current.remove();
        currentPopup.current = null;
      }

      // Remove map
      if (map.current) {
        map.current.remove();
        map.current = null;
      }

      // Reset initialization flag so it can reinitialize if needed
      isInitialized.current = false;
    };
  }, [locations, onError, registerTimeout]);

  return { mapContainer, isLoading, error };
}
