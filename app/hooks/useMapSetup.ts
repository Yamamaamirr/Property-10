"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { PropertyLocation } from '../lib/types';
import {
  MAP_CONFIG,
  MAP_COLORS,
  MAP_OPACITY,
  MAP_LINE_WIDTH,
  MAP_OFFSETS,
  MARKER_CONFIG,
  MARKER_COLORS
} from '../lib/constants';
import {
  extractFloridaCoordinates,
  createWorldMinusFloridaMask,
  getMapTilerStyleURL
} from '../lib/mapUtils';

interface UseMapSetupProps {
  locations: PropertyLocation[];
  selectedPropertyIndex: number | null;
  onPropertySelect: (index: number | null) => void;
  onError?: (error: Error) => void;
}

interface UseMapSetupReturn {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: React.RefObject<maplibregl.Map | null>;
  isLoading: boolean;
  error: Error | null;
  flyToProperty: (index: number) => void;
}

/**
 * Custom hook to handle all map initialization and setup logic
 * Includes proper cleanup and error handling
 */
export function useMapSetup({ locations, selectedPropertyIndex, onPropertySelect, onError }: UseMapSetupProps): UseMapSetupReturn {
  const mapContainer = useRef<HTMLDivElement>(null!);
  const map = useRef<maplibregl.Map | null>(null);
  const isInitialized = useRef(false);
  const markersReady = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fly to a specific property
  const flyToProperty = useCallback((index: number) => {
    if (!map.current || !locations[index]) return;

    const property = locations[index];
    map.current.flyTo({
      center: property.coordinates,
      zoom: MARKER_CONFIG.FLY_TO_ZOOM,
      duration: MARKER_CONFIG.FLY_TO_DURATION,
      curve: MARKER_CONFIG.FLY_TO_CURVE,
      essential: true
    });
  }, [locations]);

  // Debug logging for loading state changes
  useEffect(() => {
    console.log('[MAP STATE] isLoading changed to:', isLoading);
  }, [isLoading]);

  // Update marker selection state when selectedPropertyIndex changes
  useEffect(() => {
    if (!map.current || !markersReady.current) return;

    // Create the updated GeoJSON with selection state
    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: locations.map((loc, index) => ({
        type: 'Feature' as const,
        properties: {
          index,
          name: loc.name,
          title: loc.title,
          isSelected: index === selectedPropertyIndex
        },
        geometry: {
          type: 'Point' as const,
          coordinates: loc.coordinates
        }
      }))
    };

    // Update the source data
    const source = map.current.getSource('property-markers') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData);
    }
  }, [selectedPropertyIndex, locations]);

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
            console.log('[MAP] ✓ Added florida-fill layer');

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
                'line-color': MAP_COLORS.OUTLINE_CORE,
                'line-width': MAP_LINE_WIDTH.OUTLINE_MAIN,
                'line-opacity': MAP_OPACITY.OUTLINE_MAIN
              }
            });
            console.log('[MAP] ✓ Added florida-outline layer');

            // Create GeoJSON for property markers
            const markersGeoJSON: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: locations.map((loc, index) => ({
                type: 'Feature' as const,
                properties: {
                  index,
                  name: loc.name,
                  title: loc.title,
                  isSelected: false
                },
                geometry: {
                  type: 'Point' as const,
                  coordinates: loc.coordinates
                }
              }))
            };

            // Add markers source
            map.current.addSource('property-markers', {
              type: 'geojson',
              data: markersGeoJSON
            });

            // Add outer glow layer (renders behind)
            map.current.addLayer({
              id: 'markers-glow',
              type: 'circle',
              source: 'property-markers',
              paint: {
                'circle-radius': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_CONFIG.OUTER_RING_RADIUS_SELECTED,
                  MARKER_CONFIG.OUTER_RING_RADIUS
                ],
                'circle-color': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_COLORS.SELECTED_GLOW,
                  MARKER_COLORS.GLOW
                ],
                'circle-opacity': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_COLORS.SELECTED_GLOW_OPACITY,
                  MARKER_COLORS.GLOW_OPACITY
                ],
                'circle-blur': 0.8
              }
            });

            // Add main marker circles
            map.current.addLayer({
              id: 'markers-main',
              type: 'circle',
              source: 'property-markers',
              paint: {
                'circle-radius': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_CONFIG.RADIUS_SELECTED,
                  MARKER_CONFIG.RADIUS
                ],
                'circle-color': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_COLORS.SELECTED_FILL,
                  MARKER_COLORS.FILL
                ],
                'circle-opacity': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_COLORS.SELECTED_FILL_OPACITY,
                  MARKER_COLORS.FILL_OPACITY
                ],
                'circle-stroke-width': [
                  'case',
                  ['get', 'isSelected'],
                  MARKER_CONFIG.STROKE_WIDTH_SELECTED,
                  MARKER_CONFIG.STROKE_WIDTH
                ],
                'circle-stroke-color': MARKER_COLORS.STROKE,
                'circle-stroke-opacity': MARKER_COLORS.STROKE_OPACITY
              }
            });
            console.log('[MAP] ✓ Added marker layers');

            // Add click handler for markers
            map.current.on('click', 'markers-main', (e) => {
              if (!e.features || e.features.length === 0) return;

              const feature = e.features[0];
              const index = feature.properties?.index;

              if (typeof index === 'number') {
                onPropertySelect(index);
              }
            });

            // Change cursor on marker hover
            map.current.on('mouseenter', 'markers-main', () => {
              if (map.current) {
                map.current.getCanvas().style.cursor = 'pointer';
              }
            });

            map.current.on('mouseleave', 'markers-main', () => {
              if (map.current) {
                map.current.getCanvas().style.cursor = '';
              }
            });

            // Click on map (not marker) to deselect
            map.current.on('click', (e) => {
              if (!map.current) return;

              // Check if click was on a marker
              const features = map.current.queryRenderedFeatures(e.point, {
                layers: ['markers-main']
              });

              // If no marker was clicked, deselect
              if (features.length === 0) {
                onPropertySelect(null);
              }
            });

            markersReady.current = true;
            console.log('[MAP] ✓ Marker click handlers added');

            // Track when our masking layers are fully rendered
            let layersRendered = false;
            let renderCheckCount = 0;

            const checkLayersAndReveal = () => {
              if (!isActive || !map.current || layersRendered) return;

              renderCheckCount++;
              console.log(`[MAP] Render check #${renderCheckCount} - checking for layers...`);

              // Verify all our custom layers exist and are rendered
              const darkMask = map.current.getLayer('dark-mask');
              const floridaFill = map.current.getLayer('florida-fill');
              const floridaOutline = map.current.getLayer('florida-outline');

              console.log('[MAP] Layer status:', {
                darkMask: !!darkMask,
                floridaFill: !!floridaFill,
                floridaOutline: !!floridaOutline
              });

              if (darkMask && floridaFill && floridaOutline) {
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
  }, [locations, onError, onPropertySelect]);

  return { mapContainer, map, isLoading, error, flyToProperty };
}
