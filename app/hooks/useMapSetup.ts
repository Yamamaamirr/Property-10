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
  selectedRegion: Region | null;
  selectRegion: (region: Region) => void;
  deselectRegion: () => void;
  autoFocusedRegion: Region | null;
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
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [autoFocusedRegion, setAutoFocusedRegion] = useState<Region | null>(null);

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
                      id: region.id, // IMPORTANT: Add id for feature state to work
                      properties: {
                        id: region.id,
                        name: region.name
                      },
                      geometry: region.geom
                    }))
                };

                // Add regions fill layer (filled when zoomed out, fades as you zoom in)
                // Will be dynamically updated on hover
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
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, 0.25,
                      REGION_CONFIG.FADE_OUT_START, 0.25,
                      REGION_CONFIG.FADE_OUT_END, 0
                    ]
                  }
                });

                // Add regions border layer
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
                      REGION_CONFIG.MIN_ZOOM_VISIBLE, 0.8,
                      REGION_CONFIG.FADE_OUT_START, 0.8,
                      REGION_CONFIG.FADE_OUT_END, 0.4,
                      12, 0.2
                    ]
                  }
                });

                // Helper function to calculate visual center of polygon (better than simple average)
                const getPolygonCenter = (coords: number[][]): [number, number] => {
                  // Use bounding box center for better visual placement
                  let minLng = Infinity, maxLng = -Infinity;
                  let minLat = Infinity, maxLat = -Infinity;

                  coords.forEach(coord => {
                    if (coord[0] < minLng) minLng = coord[0];
                    if (coord[0] > maxLng) maxLng = coord[0];
                    if (coord[1] < minLat) minLat = coord[1];
                    if (coord[1] > maxLat) maxLat = coord[1];
                  });

                  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
                };

                // Create point features for region labels (one per region)
                const regionLabelFeatures = regionsData
                  .filter(region => region.geom)
                  .map(region => {
                    let center: [number, number];

                    // Use stored label position if available, otherwise calculate from geometry
                    if (region.label_lng !== null && region.label_lat !== null) {
                      center = [region.label_lng, region.label_lat];
                    } else {
                      // Calculate default position from geometry
                      if (region.geom.type === 'Polygon') {
                        center = getPolygonCenter(region.geom.coordinates[0]);
                      } else if (region.geom.type === 'MultiPolygon') {
                        // For MultiPolygon, use the largest polygon's center
                        const polygons = region.geom.coordinates;
                        let largestPoly = polygons[0][0];
                        let largestArea = largestPoly.length;

                        polygons.forEach((poly: number[][][]) => {
                          if (poly[0].length > largestArea) {
                            largestArea = poly[0].length;
                            largestPoly = poly[0];
                          }
                        });

                        center = getPolygonCenter(largestPoly);
                      } else {
                        return null;
                      }
                    }

                    return {
                      type: 'Feature' as const,
                      properties: {
                        name: region.name.toUpperCase() // Uppercase like Airbnb
                      },
                      geometry: {
                        type: 'Point' as const,
                        coordinates: center
                      }
                    };
                  })
                  .filter(Boolean);

                const regionLabelsSource = {
                  type: 'FeatureCollection' as const,
                  features: regionLabelFeatures
                };

                // Add region labels - Modern, clean, professional style
                map.current.addLayer({
                  id: 'regions-labels',
                  type: 'symbol',
                  source: {
                    type: 'geojson',
                    data: regionLabelsSource as any
                  },
                  layout: {
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans SemiBold', 'Arial Unicode MS Bold'],
                    'text-size': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      5, 10,   // Smaller when zoomed out
                      7, 12,
                      9, 12,
                      11, 11
                    ],
                    'text-anchor': 'center',
                    'text-allow-overlap': false,
                    'text-letter-spacing': 0.08, // Tighter, modern spacing
                    'text-transform': 'uppercase'
                  },
                  paint: {
                    'text-color': '#e8e8e8',
                    'text-halo-color': 'rgba(0, 0, 0, 0.75)',
                    'text-halo-width': 2,
                    'text-halo-blur': 0.8,
                    'text-opacity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      5, 0.85,
                      6.5, 1.0,   // Peak visibility
                      8, 0.6,     // Start fading when entering region
                      9, 0.3,     // Mostly faded
                      10, 0       // Gone - let city markers take over
                    ]
                  }
                });

                console.log('[MAP] ✓ Added regions layers from database');

                // Add interactive click functionality for regions (hover effects removed)
                let currentSelectedRegionId: string | null = null;
                let pitchResetTimeout: NodeJS.Timeout | null = null;

                // Listen for region deselection event
                map.current.on('region-deselected' as any, () => {
                  currentSelectedRegionId = null;
                  if (pitchResetTimeout) {
                    clearTimeout(pitchResetTimeout);
                    pitchResetTimeout = null;
                  }
                  console.log('[REGION] Local selected region ID reset');
                });

                // Click region to zoom into it and enter focus mode
                map.current.on('click', 'regions-fill', (e) => {
                  if (!map.current || !e.features || e.features.length === 0) return;

                  // CRITICAL: Check if click was on a cluster - if so, let cluster handler deal with it
                  // This prevents region selection from interfering with cluster expansion
                  const clusterFeatures = map.current.queryRenderedFeatures(e.point, {
                    layers: ['clusters-inner', 'clusters-outer']
                  });
                  if (clusterFeatures.length > 0) {
                    console.log('[REGION] Click was on cluster, ignoring region click');
                    return;
                  }

                  // Stop event propagation
                  e.preventDefault();
                  (e as any).originalEvent?.stopPropagation();

                  const feature = e.features[0];
                  const regionId = feature.properties?.id;
                  const regionName = feature.properties?.name;

                  // If clicking the same region, do nothing
                  if (currentSelectedRegionId === regionId) return;

                  console.log('[REGION] Clicked region:', regionName);

                  // Find the full region object
                  const clickedRegion = regionsData.find(r => r.id === regionId);
                  if (!clickedRegion) return;

                  // Clear any pending pitch reset timeout from previous region
                  if (pitchResetTimeout) {
                    clearTimeout(pitchResetTimeout);
                    pitchResetTimeout = null;
                  }

                  // Update selected region ID
                  currentSelectedRegionId = regionId;

                  // Set selected region state
                  setSelectedRegion(clickedRegion);

                  // Disable pitch updates during region zoom animation
                  (map.current as any)._allowPitchUpdate = false;

                  console.log('[REGION] Switching to region, fitting bounds...');

                  // Remove fill from all regions (show basemap)
                  map.current.setPaintProperty('regions-fill', 'fill-opacity', 0);

                  // Selected region gets darker cyan border, others get subtle grey
                  map.current.setPaintProperty('regions-border', 'line-color', [
                    'case',
                    ['==', ['get', 'id'], regionId],
                    '#3aa7d4', // Darker cyan for selected region
                    '#6b7280'  // Subtle grey for other regions
                  ]);

                  map.current.setPaintProperty('regions-border', 'line-width', [
                    'case',
                    ['==', ['get', 'id'], regionId],
                    2, // Moderate border for selected
                    0.8  // Thin subtle border for others
                  ]);

                  // Get the bounds from the clicked region's geometry
                  // Use the region object's geometry (not feature.geometry) for consistent results
                  const regionGeometry = clickedRegion.geom;

                  if (!regionGeometry) {
                    console.error('[REGION] No geometry found for region:', regionName);
                    return;
                  }

                  console.log('[REGION] Processing geometry type:', regionGeometry.type);

                  const bounds = new maplibregl.LngLatBounds();

                  if (regionGeometry.type === 'Polygon') {
                    const coords = regionGeometry.coordinates[0];
                    console.log('[REGION] Polygon coords count:', coords.length);
                    coords.forEach((coord: any) => {
                      bounds.extend(coord as [number, number]);
                    });
                  } else if (regionGeometry.type === 'MultiPolygon') {
                    console.log('[REGION] MultiPolygon parts:', regionGeometry.coordinates.length);
                    regionGeometry.coordinates.forEach((polygon: any) => {
                      polygon[0].forEach((coord: any) => {
                        bounds.extend(coord as [number, number]);
                      });
                    });
                  }

                  console.log('[REGION] Bounds calculated:', bounds.toArray());

                  // Fly to the region bounds
                  map.current.fitBounds(bounds, {
                    padding: 60,
                    duration: 1200,
                    easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
                  });

                  // Re-enable pitch updates after animation
                  pitchResetTimeout = setTimeout(() => {
                    if (map.current) {
                      (map.current as any)._allowPitchUpdate = true;
                      const finalZoom = map.current.getZoom();
                      const finalPitch = finalZoom > 11 ? Math.min(45, (finalZoom - 11) * 15) : 0;
                      map.current.setPitch(finalPitch);
                      console.log('[REGION] Bounds fit complete, pitch updated');
                    }
                  }, 1300);
                });

                // Auto-detect region when user manually zooms/pans (for intuitive UX)
                let autoFocusedRegionId: string | null = null;
                const ZOOM_THRESHOLD = 7.2; // Start auto-detecting at this zoom level

                const updateAutoFocusRegion = () => {
                  if (!map.current) return;

                  const zoom = map.current.getZoom();

                  // Only auto-focus if zoomed in enough and no region is explicitly selected
                  if (zoom < ZOOM_THRESHOLD || currentSelectedRegionId) {
                    // Reset auto-focus if zoomed out or region is selected
                    if (autoFocusedRegionId && !currentSelectedRegionId) {
                      autoFocusedRegionId = null;
                      setAutoFocusedRegion(null);
                      // Reset to default styles
                      map.current.setPaintProperty('regions-fill', 'fill-opacity', 0.25);
                      map.current.setPaintProperty('regions-fill', 'fill-color', '#4a9eff');
                      map.current.setPaintProperty('regions-border', 'line-color', '#76c8fe');
                      map.current.setPaintProperty('regions-border', 'line-width', 1);
                    }
                    return;
                  }

                  // Sample multiple points to determine which region is most dominant
                  const viewportWidth = map.current.getCanvas().width;
                  const viewportHeight = map.current.getCanvas().height;

                  // Sample points in a grid pattern
                  const samplePoints = [];
                  const gridSize = 5; // 5x5 grid = 25 sample points

                  for (let x = 0; x < gridSize; x++) {
                    for (let y = 0; y < gridSize; y++) {
                      samplePoints.push({
                        x: (viewportWidth / (gridSize + 1)) * (x + 1),
                        y: (viewportHeight / (gridSize + 1)) * (y + 1)
                      });
                    }
                  }

                  // Count which region appears at each sample point
                  const regionCounts: { [key: string]: { count: number; name: string } } = {};

                  samplePoints.forEach(point => {
                    const features = map.current!.queryRenderedFeatures([point.x, point.y], {
                      layers: ['regions-fill']
                    });

                    if (features && features.length > 0) {
                      const id = features[0].properties?.id;
                      const name = features[0].properties?.name;
                      if (id) {
                        if (!regionCounts[id]) {
                          regionCounts[id] = { count: 0, name: name || '' };
                        }
                        regionCounts[id].count++;
                      }
                    }
                  });

                  // Find the dominant region
                  let maxCount = 0;
                  let dominantRegionId: string | null = null;
                  let secondMaxCount = 0;

                  Object.entries(regionCounts).forEach(([id, data]) => {
                    if (data.count > maxCount) {
                      secondMaxCount = maxCount;
                      maxCount = data.count;
                      dominantRegionId = id;
                    } else if (data.count > secondMaxCount) {
                      secondMaxCount = data.count;
                    }
                  });

                  // Only highlight if:
                  // 1. A region is found
                  // 2. It occupies at least 40% of sample points (10 out of 25)
                  // 3. It's at least 2x more visible than the second region (or second doesn't exist)
                  const minSamples = Math.floor(samplePoints.length * 0.4);
                  const isDominant = dominantRegionId &&
                                     maxCount >= minSamples &&
                                     (secondMaxCount === 0 || maxCount >= secondMaxCount * 2);

                  if (isDominant && dominantRegionId) {
                    // Only update if the focused region changed
                    if (dominantRegionId !== autoFocusedRegionId) {
                      autoFocusedRegionId = dominantRegionId;

                      console.log('[REGION] Auto-focused region:', regionCounts[dominantRegionId].name,
                                  `(${maxCount}/${samplePoints.length} samples)`);

                      // Update state with the full region object
                      const focusedRegion = regionsData.find(r => r.id === dominantRegionId);
                      setAutoFocusedRegion(focusedRegion || null);

                      // Apply same styling as click selection - no fill, prominent border
                      map.current.setPaintProperty('regions-fill', 'fill-opacity', 0);

                      map.current.setPaintProperty('regions-border', 'line-color', [
                        'case',
                        ['==', ['get', 'id'], autoFocusedRegionId],
                        '#3aa7d4', // Darker cyan for auto-focused region (same as selected)
                        '#6b7280'  // Subtle grey for other regions
                      ]);

                      map.current.setPaintProperty('regions-border', 'line-width', [
                        'case',
                        ['==', ['get', 'id'], autoFocusedRegionId],
                        2, // Moderate border for auto-focused (same as selected)
                        0.8  // Thin subtle border for others
                      ]);
                    }
                  } else if (autoFocusedRegionId) {
                    // Not dominant enough - reset
                    console.log('[REGION] No clearly dominant region');
                    autoFocusedRegionId = null;
                    setAutoFocusedRegion(null);
                    map.current.setPaintProperty('regions-fill', 'fill-opacity', 0.25);
                    map.current.setPaintProperty('regions-fill', 'fill-color', '#4a9eff');
                    map.current.setPaintProperty('regions-border', 'line-color', '#76c8fe');
                    map.current.setPaintProperty('regions-border', 'line-width', 1);
                  }
                };

                // Listen to map movement and zoom changes
                map.current.on('moveend', updateAutoFocusRegion);
                map.current.on('zoomend', updateAutoFocusRegion);
              }

              // Add tilt/pitch logic based on zoom level (same as admin CitiesMap)
              const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

              if (isTouchDevice) {
                // Mobile: simple binary tilt - flat below zoom 12, tilted above
                const MOBILE_TILT_THRESHOLD = 12;
                const MOBILE_TILT_ANGLE = 40;
                let isTilted = false;

                map.current.on('idle', () => {
                  if (!map.current) return;
                  const zoom = map.current.getZoom();
                  const shouldTilt = zoom >= MOBILE_TILT_THRESHOLD;

                  // Only animate if state changed
                  if (shouldTilt && !isTilted) {
                    isTilted = true;
                    map.current.easeTo({ pitch: MOBILE_TILT_ANGLE, duration: 400 });
                  } else if (!shouldTilt && isTilted) {
                    isTilted = false;
                    map.current.easeTo({ pitch: 0, duration: 400 });
                  }
                });
              } else {
                // Desktop: real-time gradual pitch updates during zoom
                // Store flag on map instance to allow cluster animations to disable this temporarily
                (map.current as any)._allowPitchUpdate = true;

                map.current.on('zoom', () => {
                  if (!map.current) return;

                  // Skip pitch updates if disabled (during cluster animations)
                  if (!(map.current as any)._allowPitchUpdate) return;

                  const zoom = map.current.getZoom();
                  const targetPitch = zoom > 11 ? Math.min(45, (zoom - 11) * 15) : 0;
                  map.current.setPitch(targetPitch);
                });
              }
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

  // Function to select a region
  const selectRegion = useCallback((region: Region) => {
    if (!map.current || !region) return;

    console.log('[REGION] Programmatically selecting region:', region.name);

    // Set selected region state
    setSelectedRegion(region);

    // Update region styling to show selection
    map.current.setPaintProperty('regions-fill', 'fill-opacity', 0);
    map.current.setPaintProperty('regions-border', 'line-color', [
      'case',
      ['==', ['get', 'id'], region.id],
      '#3aa7d4',
      '#6b7280'
    ]);
    map.current.setPaintProperty('regions-border', 'line-width', [
      'case',
      ['==', ['get', 'id'], region.id],
      2,
      0.8
    ]);
  }, []);

  // Function to deselect region and return to default view
  const deselectRegion = useCallback(() => {
    if (!map.current || !selectedRegion) return;

    console.log('[REGION] Deselecting region, returning to default view');

    // Reset selected region state
    setSelectedRegion(null);

    // Restore all regions to default appearance
    map.current.setPaintProperty('regions-fill', 'fill-color', '#4a9eff');
    map.current.setPaintProperty('regions-fill', 'fill-opacity', 0.25);
    map.current.setPaintProperty('regions-border', 'line-color', '#76c8fe');
    map.current.setPaintProperty('regions-border', 'line-width', 1);

    // Emit a custom event to reset the local selected region ID
    map.current.fire('region-deselected' as any);

    // Zoom back to Florida view
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

    let initialCenter: [number, number];
    let initialZoom: number;

    if (isMobile) {
      initialCenter = [-83.5, 27.0]; // Mobile - shifted more right and south for portrait
      initialZoom = 5.0;
    } else if (isTablet) {
      initialCenter = [-82.2, 27.6648]; // Tablet - similar to desktop
      initialZoom = 5.5;
    } else {
      initialCenter = MAP_CONFIG.INITIAL_CENTER as [number, number];
      initialZoom = MAP_CONFIG.INITIAL_ZOOM;
    }

    // Disable pitch updates during zoom
    (map.current as any)._allowPitchUpdate = false;

    map.current.flyTo({
      center: initialCenter,
      zoom: initialZoom,
      duration: 1200,
      curve: 1.2,
      easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    });

    // Re-enable pitch updates after animation
    setTimeout(() => {
      if (map.current) {
        (map.current as any)._allowPitchUpdate = true;
        const finalZoom = map.current.getZoom();
        const finalPitch = finalZoom > 11 ? Math.min(45, (finalZoom - 11) * 15) : 0;
        map.current.setPitch(finalPitch);
      }
    }, 1300);
  }, [selectedRegion]);

  return {
    mapContainer,
    map,
    isLoading,
    error,
    regions,
    cities,
    mapLoaded,
    selectedRegion,
    selectRegion,
    deselectRegion,
    autoFocusedRegion
  };
}
