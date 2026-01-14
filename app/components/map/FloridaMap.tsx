"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapSetup } from '../../hooks/useMapSetup';
import { Loader2, MapPin, X, Trash2, Heart } from 'lucide-react';
import Image from 'next/image';
import type { City } from '@/app/lib/types';
import { REGION_CONFIG } from '@/app/lib/constants';

// Helper function for marker visibility based on zoom (appears after entering region)
const getMarkerVisibility = (zoom: number): { opacity: number; visible: boolean } => {
  if (zoom < REGION_CONFIG.CITY_MARKERS_START) {
    return { opacity: 0, visible: false };
  }
  if (zoom < REGION_CONFIG.CITY_MARKERS_FULL) {
    const opacity = (zoom - REGION_CONFIG.CITY_MARKERS_START) / (REGION_CONFIG.CITY_MARKERS_FULL - REGION_CONFIG.CITY_MARKERS_START);
    return { opacity, visible: true };
  }
  return { opacity: 1, visible: true };
};

// Helper to get just opacity value for label restoration
const getLabelOpacity = (zoom: number): number => {
  return getMarkerVisibility(zoom).opacity;
};

// Helper function for label scale based on zoom (using scale instead of font-size to avoid layout shifts)
const getLabelScale = (zoom: number) => {
  if (zoom < 8) return 0.85;
  if (zoom < 10) return 1;
  if (zoom < 12) return 1.1;
  return 1.2;
};

/**
 * FloridaMap Component
 *
 * Interactive map of Florida with a custom "cookie-cutter" effect to highlight Florida.
 * Displays city markers with labels and popup cards.
 */
export default function FloridaMap() {
  // Memoize the error callback to prevent map reinitialization on re-renders
  const handleMapError = useCallback((err: Error) => {
    console.error('Map error:', err);
  }, []);

  const { mapContainer, map, isLoading, error, cities, regions, mapLoaded, selectedRegion, selectRegion, deselectRegion, autoFocusedRegion } = useMapSetup({
    onError: handleMapError
  });

  // Marker and popup state
  const markers = useRef<maplibregl.Marker[]>([]);
  const spiderMarkers = useRef<maplibregl.Marker[]>([]); // For spider-web expanded markers
  const [popupCityId, setPopupCityId] = useState<string | null>(null);
  const [popupMarkerElement, setPopupMarkerElement] = useState<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const popupCityIdRef = useRef<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<{ lng: number; lat: number; cities: City[] } | null>(null);
  const mapContainerDiv = useRef<HTMLDivElement | null>(null);

  // Preferences state - maximum 2 cities
  const [preferredCities, setPreferredCities] = useState<City[]>([]);

  // Current zoom state
  const [currentZoom, setCurrentZoom] = useState<number>(5);

  // Prevent rapid cluster clicks during animation
  const isAnimating = useRef<boolean>(false);

  // Preference management functions
  const toggleCityPreference = useCallback((city: City) => {
    setPreferredCities(prev => {
      const isAlreadyPreferred = prev.some(c => c.id === city.id);

      if (isAlreadyPreferred) {
        // Remove from preferences
        return prev.filter(c => c.id !== city.id);
      } else {
        // Add to preferences (max 2)
        if (prev.length >= 2) {
          console.log('Maximum 2 cities can be added to preferences');
          return prev;
        }
        return [...prev, city];
      }
    });
  }, []);

  const removeCityPreference = useCallback((cityId: string) => {
    setPreferredCities(prev => prev.filter(c => c.id !== cityId));
  }, []);

  const isCityPreferred = useCallback((cityId: string) => {
    return preferredCities.some(c => c.id === cityId);
  }, [preferredCities]);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    popupCityIdRef.current = popupCityId;
  }, [popupCityId]);

  // Track zoom level
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    const updateZoom = () => {
      const zoom = mapInstance.getZoom();
      setCurrentZoom(zoom);
    };

    // Initial update
    updateZoom();

    // Listen for zoom events
    mapInstance.on('zoom', updateZoom);

    return () => {
      mapInstance.off('zoom', updateZoom);
    };
  }, [map, mapLoaded]);

  // Add clustered city markers when cities data is available and map is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded || cities.length === 0) return;

    console.log('[MARKERS] Setting up clustered markers for', cities.length, 'cities');

    const mapInstance = map.current;

    // Convert cities to GeoJSON format (include lng/lat as properties for conditional styling)
    const citiesGeoJSON = {
      type: 'FeatureCollection',
      features: cities
        .filter(city => city.geom && city.geom.type === 'Point')
        .map(city => ({
          type: 'Feature',
          properties: {
            id: city.id,
            name: city.name,
            image_url: city.image_url || '',
            lng: city.geom.coordinates[0],
            lat: city.geom.coordinates[1]
          },
          geometry: city.geom
        }))
    };

    // Add source with clustering enabled - show individual markers sooner
    if (!mapInstance.getSource('cities')) {
      mapInstance.addSource('cities', {
        type: 'geojson',
        data: citiesGeoJSON as any,
        cluster: true,
        clusterMaxZoom: 8, // Show individual markers at zoom 8+
        clusterRadius: 40 // Tighter grouping for cleaner look
      });
    }

    // Add cluster outer ring layer (ice white blue - lighter ring)
    if (!mapInstance.getLayer('clusters-outer')) {
      mapInstance.addLayer({
        id: 'clusters-outer',
        type: 'circle',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 5,
        maxzoom: 9,
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#B3D9E8',    // Ice white blue for small clusters (< 5)
            5,
            '#A8D5E6',    // Slightly deeper ice blue for 5-10
            10,
            '#9DD1E4',    // Medium ice blue for 10-20
            20,
            '#8ECDE1'     // Deeper ice blue for 20+ clusters
          ],
          'circle-radius': [
            'interpolate',
            ['exponential', 1.2],
            ['zoom'],
            5, ['step', ['get', 'point_count'], 18, 5, 24, 10, 30, 20, 38],  // Outer ring at zoom 5 (slightly larger)
            7, ['step', ['get', 'point_count'], 19, 5, 26, 10, 33, 20, 42],  // Outer ring at zoom 7
            9, ['step', ['get', 'point_count'], 24, 5, 32, 10, 40, 20, 50]   // Outer ring at zoom 9
          ],
          'circle-opacity': 0.6,
          'circle-stroke-width': 0,
          'circle-blur': 0.15
        }
      });
    }

    // Add cluster inner circle layer (blue munsell - main circle)
    if (!mapInstance.getLayer('clusters-inner')) {
      mapInstance.addLayer({
        id: 'clusters-inner',
        type: 'circle',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 5,
        maxzoom: 9,
        paint: {
          'circle-color': '#0085C9', // Consistent Blue Munsell for all clusters
          'circle-radius': [
            'interpolate',
            ['exponential', 1.2],
            ['zoom'],
            5, ['step', ['get', 'point_count'], 12, 5, 17, 10, 21, 20, 26],  // Inner circle at zoom 5 (slightly larger)
            7, ['step', ['get', 'point_count'], 13, 5, 18, 10, 23, 20, 28],  // Inner circle at zoom 7
            9, ['step', ['get', 'point_count'], 16, 5, 22, 10, 28, 20, 34]   // Inner circle at zoom 9
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.9
        }
      });
    }

    // Add cluster count labels
    if (!mapInstance.getLayer('cluster-count')) {
      mapInstance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 5,
        maxzoom: 9,
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, ['step', ['get', 'point_count'], 12, 5, 14, 10, 16, 20, 18],  // Slightly larger at zoom 5
            7, ['step', ['get', 'point_count'], 14, 5, 16, 10, 18, 20, 20],  // Medium at zoom 7
            9, ['step', ['get', 'point_count'], 16, 5, 18, 10, 20, 20, 22]   // Larger at zoom 9
          ],
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#ffffff',
          'text-opacity': 1,
          'text-halo-color': 'rgba(0, 133, 201, 0.5)', // Blue munsell halo for cohesion
          'text-halo-width': 2,
          'text-halo-blur': 0.5
        }
      });
    }

    // Add individual unclustered points - show at zoom 8+ (when clusters disappear)
    if (!mapInstance.getLayer('unclustered-point')) {
      mapInstance.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'cities',
        filter: ['!', ['has', 'point_count']],
        minzoom: 8, // Show individual markers at zoom 8+ (right when clusters disappear)
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': 7,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
          'circle-opacity': 1,
          'circle-stroke-opacity': 1
        }
      });
    }

    // Add city name labels for unclustered points
    if (!mapInstance.getLayer('unclustered-label')) {
      mapInstance.addLayer({
        id: 'unclustered-label',
        type: 'symbol',
        source: 'cities',
        filter: ['!', ['has', 'point_count']],
        minzoom: 8, // Show labels at same zoom as markers
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 14, // Slightly reduced
          'text-offset': [0, -1.0],  // Moved slightly down
          'text-anchor': 'bottom',    // Anchor at bottom
          'text-allow-overlap': true, // Allow overlap so labels always show
          'text-ignore-placement': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.9)',
          'text-halo-width': 2,
          'text-halo-blur': 0.8,
          'text-opacity': 1
        }
      });
    }

    // Click handler for clusters - zoom to expansion level
    const clusterClickHandler = (e: maplibregl.MapMouseEvent) => {
      // Prevent rapid clicks during animation
      if (isAnimating.current) {
        console.log('[CLUSTER] Animation in progress, ignoring click');
        return;
      }

      console.log('[CLUSTER] Click detected');

      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['clusters-outer', 'clusters-inner']
      });

      if (!features.length) {
        console.log('[CLUSTER] No cluster found');
        return;
      }

      const feature = features[0];
      if (!feature.geometry || feature.geometry.type !== 'Point') {
        console.log('[CLUSTER] Invalid geometry');
        return;
      }

      const clusterId = feature.properties?.cluster_id;
      const coordinates = (feature.geometry as any).coordinates as [number, number];

      const pointCount = feature.properties?.point_count || 0;

      console.log('[CLUSTER] Cluster ID:', clusterId, 'Coordinates:', coordinates, 'Point count:', pointCount);

      // Find which region this cluster is in and auto-select it
      const clusterRegion = regions.find(region => {
        if (!region.geom) return false;

        // Check if cluster coordinates are within region bounds
        const point = {
          type: 'Point' as const,
          coordinates: coordinates
        };

        // Simple point-in-polygon check using bounds
        if (region.geom.type === 'Polygon') {
          const coords = region.geom.coordinates[0];
          let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
          coords.forEach((coord: number[]) => {
            minLng = Math.min(minLng, coord[0]);
            maxLng = Math.max(maxLng, coord[0]);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
          });
          return coordinates[0] >= minLng && coordinates[0] <= maxLng &&
                 coordinates[1] >= minLat && coordinates[1] <= maxLat;
        } else if (region.geom.type === 'MultiPolygon') {
          return region.geom.coordinates.some((polygon: number[][][]) => {
            const coords = polygon[0];
            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
            coords.forEach((coord: number[]) => {
              minLng = Math.min(minLng, coord[0]);
              maxLng = Math.max(maxLng, coord[0]);
              minLat = Math.min(minLat, coord[1]);
              maxLat = Math.max(maxLat, coord[1]);
            });
            return coordinates[0] >= minLng && coordinates[0] <= maxLng &&
                   coordinates[1] >= minLat && coordinates[1] <= maxLat;
          });
        }
        return false;
      });

      if (clusterRegion && clusterRegion.id !== selectedRegion?.id) {
        console.log('[CLUSTER] Auto-selecting region:', clusterRegion.name);
        selectRegion(clusterRegion);
      }

      // Get the GeoJSON source that has clustering enabled
      const source = mapInstance.getSource('cities');

      if (!source) {
        console.error('[CLUSTER] Cities source not found');
        return;
      }

      console.log('[CLUSTER] workerOptions:', (source as any).workerOptions);
      console.log('[CLUSTER] Cluster settings:', (source as any).workerOptions?.cluster,
                  'clusterMaxZoom:', (source as any).workerOptions?.clusterMaxZoom);

      // Since the callback never fires, let's compute it ourselves based on cluster settings
      // Get cluster configuration from source options
      const clusterMaxZoom = (source as any).workerOptions?.clusterMaxZoom || 8;
      const currentZoom = mapInstance.getZoom();

      console.log('[CLUSTER] Current zoom:', currentZoom, 'clusterMaxZoom:', clusterMaxZoom);

      // Calculate target zoom based on cluster behavior:
      // - If we're below clusterMaxZoom, zoom to clusterMaxZoom (where clusters break into points)
      // - If we're near clusterMaxZoom, zoom a bit past it to ensure expansion
      // - For progressive breakdown, zoom incrementally
      let targetZoom: number;

      if (currentZoom < clusterMaxZoom - 2) {
        // Far from max zoom - zoom closer but not all the way (progressive)
        targetZoom = currentZoom + 2;
      } else if (currentZoom < clusterMaxZoom) {
        // Near max zoom - zoom to just past clusterMaxZoom to break cluster
        targetZoom = clusterMaxZoom + 0.5;
      } else {
        // Already past clusterMaxZoom - zoom in more to spread out points
        targetZoom = currentZoom + 1.5;
      }

      // Ensure we don't exceed map's max zoom
      targetZoom = Math.min(targetZoom, 13);

      console.log('[CLUSTER] Target zoom:', targetZoom, 'for cluster with', pointCount, 'points');

      // Set animation flag
      isAnimating.current = true;

      // Disable pitch updates during cluster animation
      (mapInstance as any)._allowPitchUpdate = false;

      console.log('[CLUSTER] Animating to target zoom level');

      // Zoom to the target level - this will cause the cluster to break down progressively
      mapInstance.easeTo({
        center: coordinates,
        zoom: targetZoom,
        duration: 1200
      });

      // Re-enable pitch updates and reset animation flag after animation completes
      setTimeout(() => {
        if (mapInstance && (mapInstance as any)._allowPitchUpdate !== undefined) {
          (mapInstance as any)._allowPitchUpdate = true;

          // Update pitch to match final zoom level
          const finalZoom = mapInstance.getZoom();
          const finalPitch = finalZoom > 11 ? Math.min(45, (finalZoom - 11) * 15) : 0;
          mapInstance.setPitch(finalPitch);

          isAnimating.current = false;
          console.log('[CLUSTER] Expansion animation complete, final zoom:', finalZoom);
        }
      }, 1300);
    };

    // Click handler for individual points - modern sequence: zoom → highlight → popup
    const pointClickHandler = (e: maplibregl.MapMouseEvent) => {
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['unclustered-point']
      });

      if (!features.length) return;

      const feature = features[0];
      const coordinates = (feature.geometry as any).coordinates.slice();
      const cityId = feature.properties?.id;

      // Immediately hide the label for this city
      if (mapInstance.getLayer('unclustered-label')) {
        mapInstance.setFilter('unclustered-label', [
          '!=', ['get', 'id'], cityId
        ]);
      }

      // Step 1: Highlight the marker with a pulse animation
      const markerLayer = mapInstance.getLayer('unclustered-point');
      if (markerLayer) {
        // Add a temporary highlight layer
        if (!mapInstance.getLayer('highlight-marker')) {
          mapInstance.addLayer({
            id: 'highlight-marker',
            type: 'circle',
            source: 'cities',
            filter: ['==', ['get', 'id'], cityId],
            paint: {
              'circle-color': '#00d4ff',
              'circle-radius': 12,
              'circle-opacity': 0.4,
              'circle-stroke-width': 3,
              'circle-stroke-color': '#00d4ff',
              'circle-stroke-opacity': 0.8
            }
          });
        } else {
          // Update filter to highlight this city
          mapInstance.setFilter('highlight-marker', ['==', ['get', 'id'], cityId]);
        }
      }

      // Step 2: Show popup immediately
      setPopupCityId(cityId);

      // Create a temporary marker element for the popup portal
      const el = document.createElement('div');
      el.style.cssText = 'position: absolute; pointer-events: none;';
      mapInstance.getContainer().appendChild(el);
      setPopupMarkerElement(el);

      // Position the element at the marker location
      const point = mapInstance.project(coordinates);
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;

      // Step 3: Smooth fly to the city with organic pitch animation
      // Calculate target pitch for the zoom level
      const targetZoom = 14.5; // Zoom in more on marker
      const targetPitch = Math.min(45, (targetZoom - 11) * 15);

      // Disable automatic pitch updates
      (mapInstance as any)._allowPitchUpdate = false;

      // Fly to with pitch animating during the movement (organic feel)
      mapInstance.flyTo({
        center: coordinates,
        zoom: targetZoom,
        pitch: targetPitch, // Pitch animates WITH the zoom
        duration: 2200, // Slightly slower
        curve: 1.4, // Gentler curve
        easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t // Ease in-out
      });

      // Re-enable pitch updates after animation
      setTimeout(() => {
        (mapInstance as any)._allowPitchUpdate = true;
      }, 2200);
    };

    // Hover effects - add visual feedback for points only
    let hoveredPointId: string | null = null;

    const pointMouseEnter = (e: maplibregl.MapMouseEvent) => {
      mapInstance.getCanvas().style.cursor = 'pointer';
      const features = mapInstance.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
      if (features && features.length > 0) {
        hoveredPointId = features[0].properties?.id;
        // Subtle glow on hover
        if (!mapInstance.getLayer('hover-glow')) {
          mapInstance.addLayer({
            id: 'hover-glow',
            type: 'circle',
            source: 'cities',
            filter: ['==', ['get', 'id'], hoveredPointId],
            paint: {
              'circle-color': '#00d4ff',
              'circle-radius': 10,
              'circle-opacity': 0.3,
              'circle-blur': 0.5
            }
          }, 'unclustered-point'); // Add below the point layer
        } else {
          mapInstance.setFilter('hover-glow', ['==', ['get', 'id'], hoveredPointId]);
        }
      }
    };

    const pointMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
      hoveredPointId = null;
      if (mapInstance.getLayer('hover-glow')) {
        mapInstance.setFilter('hover-glow', ['==', ['get', 'id'], '']);
      }
    };

    // Add event listeners
    mapInstance.on('click', 'clusters-outer', clusterClickHandler);
    mapInstance.on('click', 'clusters-inner', clusterClickHandler);
    mapInstance.on('click', 'unclustered-point', pointClickHandler);

    // Cursor change on cluster hover - ensure pointer cursor always shows
    const clusterMouseEnter = () => {
      if (!mapInstance) return;
      const canvas = mapInstance.getCanvas();
      canvas.style.cursor = 'pointer';
      // Force the cursor style to override any default map cursor
      canvas.classList.add('cursor-pointer');
    };

    const clusterMouseLeave = () => {
      if (!mapInstance) return;
      const canvas = mapInstance.getCanvas();
      canvas.style.cursor = '';
      canvas.classList.remove('cursor-pointer');
    };

    mapInstance.on('mouseenter', 'clusters-outer', clusterMouseEnter);
    mapInstance.on('mouseleave', 'clusters-outer', clusterMouseLeave);
    mapInstance.on('mouseenter', 'clusters-inner', clusterMouseEnter);
    mapInstance.on('mouseleave', 'clusters-inner', clusterMouseLeave);

    mapInstance.on('mouseenter', 'unclustered-point', pointMouseEnter);
    mapInstance.on('mouseleave', 'unclustered-point', pointMouseLeave);

    return () => {
      // Remove event listeners
      mapInstance.off('click', 'clusters-outer', clusterClickHandler);
      mapInstance.off('click', 'clusters-inner', clusterClickHandler);
      mapInstance.off('click', 'unclustered-point', pointClickHandler);
      mapInstance.off('mouseenter', 'unclustered-point', pointMouseEnter);
      mapInstance.off('mouseleave', 'unclustered-point', pointMouseLeave);
      mapInstance.off('mouseenter', 'clusters-outer', clusterMouseEnter);
      mapInstance.off('mouseleave', 'clusters-outer', clusterMouseLeave);
      mapInstance.off('mouseenter', 'clusters-inner', clusterMouseEnter);
      mapInstance.off('mouseleave', 'clusters-inner', clusterMouseLeave);

      // Remove layers
      if (mapInstance.getLayer('clusters-outer')) mapInstance.removeLayer('clusters-outer');
      if (mapInstance.getLayer('clusters-inner')) mapInstance.removeLayer('clusters-inner');
      if (mapInstance.getLayer('cluster-count')) mapInstance.removeLayer('cluster-count');
      if (mapInstance.getLayer('unclustered-point')) mapInstance.removeLayer('unclustered-point');
      if (mapInstance.getLayer('unclustered-label')) mapInstance.removeLayer('unclustered-label');
      if (mapInstance.getLayer('hover-glow')) mapInstance.removeLayer('hover-glow');
      if (mapInstance.getLayer('highlight-marker')) mapInstance.removeLayer('highlight-marker');

      // Remove source
      if (mapInstance.getSource('cities')) mapInstance.removeSource('cities');
    };
  }, [cities, mapLoaded, map, regions, selectRegion, selectedRegion]);

  // Update marker/cluster opacity when region selection changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    if (selectedRegion) {
      // When a region is selected, fade markers/clusters OUTSIDE that region
      // Calculate bounds of selected region
      const regionGeom = selectedRegion.geom;
      if (!regionGeom) return;

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

      if (regionGeom.type === 'Polygon') {
        const coords = regionGeom.coordinates[0];
        coords.forEach((coord: number[]) => {
          minLng = Math.min(minLng, coord[0]);
          maxLng = Math.max(maxLng, coord[0]);
          minLat = Math.min(minLat, coord[1]);
          maxLat = Math.max(maxLat, coord[1]);
        });
      } else if (regionGeom.type === 'MultiPolygon') {
        regionGeom.coordinates.forEach((polygon: number[][][]) => {
          const coords = polygon[0];
          coords.forEach((coord: number[]) => {
            minLng = Math.min(minLng, coord[0]);
            maxLng = Math.max(maxLng, coord[0]);
            minLat = Math.min(minLat, coord[1]);
            maxLat = Math.max(maxLat, coord[1]);
          });
        });
      }

      // Create conditional opacity expression for unclustered points only:
      // Full opacity if within selected region bounds, faded if outside
      const conditionalPointOpacity = (fullOpacity: number, fadedOpacity: number) => [
        'case',
        ['all',
          ['has', 'lng'], // Only apply to points with lng/lat properties
          ['>=', ['get', 'lng'], minLng],
          ['<=', ['get', 'lng'], maxLng],
          ['>=', ['get', 'lat'], minLat],
          ['<=', ['get', 'lat'], maxLat]
        ],
        fullOpacity, // Inside selected region
        fadedOpacity  // Outside selected region
      ] as any;

      // For clusters, keep normal opacity so they remain clickable and visible
      // Users need to click clusters to see the individual markers inside them
      if (mapInstance.getLayer('clusters-outer')) {
        mapInstance.setPaintProperty('clusters-outer', 'circle-opacity', 0.3); // Keep normal
      }
      if (mapInstance.getLayer('clusters-inner')) {
        mapInstance.setPaintProperty('clusters-inner', 'circle-opacity', 1); // Keep normal
      }
      if (mapInstance.getLayer('cluster-count')) {
        mapInstance.setPaintProperty('cluster-count', 'text-opacity', 1); // Keep normal
      }

      // For unclustered points, use conditional opacity based on region
      if (mapInstance.getLayer('unclustered-point')) {
        mapInstance.setPaintProperty('unclustered-point', 'circle-opacity', conditionalPointOpacity(1, 0.25));
      }
      if (mapInstance.getLayer('unclustered-label')) {
        mapInstance.setPaintProperty('unclustered-label', 'text-opacity', conditionalPointOpacity(1, 0.3));
      }
    } else {
      // Reset to default opacity when no region is selected
      if (mapInstance.getLayer('clusters-outer')) {
        mapInstance.setPaintProperty('clusters-outer', 'circle-opacity', 0.3);
      }
      if (mapInstance.getLayer('clusters-inner')) {
        mapInstance.setPaintProperty('clusters-inner', 'circle-opacity', 1);
      }
      if (mapInstance.getLayer('cluster-count')) {
        mapInstance.setPaintProperty('cluster-count', 'text-opacity', 1);
      }
      if (mapInstance.getLayer('unclustered-point')) {
        mapInstance.setPaintProperty('unclustered-point', 'circle-opacity', 1);
      }
      if (mapInstance.getLayer('unclustered-label')) {
        mapInstance.setPaintProperty('unclustered-label', 'text-opacity', 1);
      }
    }
  }, [selectedRegion, mapLoaded, map]);

  // Update popup marker position when map moves
  useEffect(() => {
    if (!popupCityId || !map.current) return;

    const mapInstance = map.current;
    const popupCity = cities.find(c => c.id === popupCityId);
    if (!popupCity || !popupCity.geom) return;

    const coordinates = popupCity.geom.coordinates;

    const updatePopupPosition = () => {
      if (!popupMarkerElement) return;
      const point = mapInstance.project(coordinates);
      popupMarkerElement.style.left = `${point.x}px`;
      popupMarkerElement.style.top = `${point.y}px`;
    };

    updatePopupPosition();

    mapInstance.on('move', updatePopupPosition);
    mapInstance.on('zoom', updatePopupPosition);

    return () => {
      mapInstance.off('move', updatePopupPosition);
      mapInstance.off('zoom', updatePopupPosition);
    };
  }, [popupCityId, popupMarkerElement, map, cities]);

  // Update beam line connecting popup to marker
  useEffect(() => {
    if (!popupCityId || !map.current || !popupMarkerElement || !lineRef.current || !mapContainer.current) return;

    const mapInstance = map.current;
    const popupCity = cities.find(c => c.id === popupCityId);
    if (!popupCity || !popupCity.geom) return;

    const coordinates = popupCity.geom.coordinates;

    const updateBeamLine = () => {
      requestAnimationFrame(() => {
        const container = mapContainer.current?.getBoundingClientRect();
        const popup = popupRef.current?.getBoundingClientRect();
        const line = lineRef.current;

        if (!container || !popup || !line || !mapInstance) return;

        // Get marker position from map coordinates
        const markerPoint = mapInstance.project(coordinates);
        const markerX = markerPoint.x;
        const markerY = markerPoint.y;

        // Get popup bottom center
        const popupCenterX = popup.left - container.left + popup.width / 2;
        const popupBottom = popup.bottom - container.top;

        // Draw vertical beam from popup bottom to marker
        line.setAttribute("x1", popupCenterX.toString());
        line.setAttribute("y1", popupBottom.toString());
        line.setAttribute("x2", markerX.toString());
        line.setAttribute("y2", markerY.toString());
      });
    };

    updateBeamLine();

    mapInstance.on('move', updateBeamLine);
    mapInstance.on('zoom', updateBeamLine);

    return () => {
      mapInstance.off('move', updateBeamLine);
      mapInstance.off('zoom', updateBeamLine);
    };
  }, [popupCityId, popupMarkerElement, map, cities, mapContainer]);

  // Auto-close popup when zooming out below threshold
  useEffect(() => {
    if (!popupCityId || !map.current) return;

    const mapInstance = map.current;
    const ZOOM_THRESHOLD = 10; // Close popup when zoom goes below this level

    const handleZoomEnd = () => {
      const currentZoom = mapInstance.getZoom();
      if (currentZoom < ZOOM_THRESHOLD) {
        console.log('[POPUP] Auto-closing popup due to zoom out below', ZOOM_THRESHOLD);

        // Clear line ref immediately to prevent flickering
        if (lineRef.current) {
          lineRef.current.setAttribute('opacity', '0');
        }

        // Clean up popup
        setPopupCityId(null);
        if (popupMarkerElement) {
          popupMarkerElement.remove();
          setPopupMarkerElement(null);
        }

        // Remove highlight
        if (mapInstance.getLayer('highlight-marker')) {
          mapInstance.setFilter('highlight-marker', ['==', ['get', 'id'], '']);
        }
        // Restore all labels
        if (mapInstance.getLayer('unclustered-label')) {
          mapInstance.setFilter('unclustered-label', ['!', ['has', 'point_count']]);
        }
      }
    };

    mapInstance.on('zoomend', handleZoomEnd);

    return () => {
      mapInstance.off('zoomend', handleZoomEnd);
    };
  }, [popupCityId, map, popupMarkerElement]);

  // Close popup when clicking on map (but not on markers or clusters)
  useEffect(() => {
    if (!popupCityId || !map.current) return;

    const mapInstance = map.current;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      // Check if click was on a city marker or cluster
      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['unclustered-point', 'clusters-outer', 'clusters-inner']
      });

      // Only close popup if not clicking on a marker or cluster
      if (features.length === 0) {
        console.log('[MAP] Closing popup - click on empty map');
        setPopupCityId(null);
        if (popupMarkerElement) {
          popupMarkerElement.remove();
          setPopupMarkerElement(null);
        }
        // Remove highlight when popup closes
        if (mapInstance.getLayer('highlight-marker')) {
          mapInstance.setFilter('highlight-marker', ['==', ['get', 'id'], '']);
        }
        // Restore all labels
        if (mapInstance.getLayer('unclustered-label')) {
          mapInstance.setFilter('unclustered-label', ['!', ['has', 'point_count']]);
        }
      } else {
        console.log('[MAP] Not closing popup - clicked on feature:', features[0].layer.id);
      }
    };

    mapInstance.on('click', handleMapClick);

    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [popupCityId, popupMarkerElement, map]);

  // Get popup city data
  const popupCity = popupCityId ? cities.find(c => c.id === popupCityId) : null;

  return (
    <div className="w-full h-screen relative bg-p10-dark">
      <style jsx global>{`
        @keyframes popupEnter {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(8px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        @keyframes clusterPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }
        @keyframes pulseSlow {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.15);
          }
        }
        .popup-enter {
          animation: popupEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .back-button-animate {
          animation: slideInFromLeft 0.4s ease-out;
        }
        .animate-pulse-slow {
          animation: pulseSlow 2s ease-in-out infinite;
        }
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .city-popup {
          width: min(80vw, 320px);
        }
        @media (max-width: 640px) {
          .city-popup {
            width: min(80vw, 280px);
          }
          .city-popup .popup-image {
            height: 110px;
          }
          .city-popup .popup-content {
            padding: 0.625rem;
          }
        }
        /* Ensure pointer cursor on clusters */
        .cursor-pointer {
          cursor: pointer !important;
        }
      `}</style>

      {/* Map Container */}
      <div className="absolute inset-0">
        <div
          ref={(el) => {
            mapContainer.current = el;
            mapContainerDiv.current = el;
          }}
          className="w-full h-full relative"
        >
          {/* Elegant vertical beam connecting popup to marker */}
          {popupCityId && (
            <svg
              className="absolute inset-0 pointer-events-none z-[9998]"
              style={{ width: "100%", height: "100%" }}
            >
              <defs>
                <linearGradient id="beamGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity="0" />
                  <stop offset="20%" stopColor="#00d4ff" stopOpacity="0.3" />
                  <stop offset="80%" stopColor="#00d4ff" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
                </linearGradient>
                <filter id="beamGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <line
                ref={lineRef}
                stroke="url(#beamGradient)"
                strokeWidth="5"
                opacity="1"
                filter="url(#beamGlow)"
              />
            </svg>
          )}
        </div>

        {/* Back Button - appears when region is selected */}
        {selectedRegion && (
          <button
            onClick={deselectRegion}
            className="absolute top-4 left-4 z-[1000] bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-lg px-4 py-2.5 border border-white/10 shadow-2xl hover:from-slate-800/95 hover:to-slate-700/95 transition-all duration-300 ease-out hover:scale-105 hover:shadow-cyan-500/20 flex items-center gap-2.5 group back-button-animate"
          >
            <svg
              className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-white/90 font-medium text-sm">
              Back to All Regions
            </span>
          </button>
        )}

        {/* Popup Card */}
        {popupCity && popupMarkerElement && createPortal(
          <div
            ref={popupRef}
            className="absolute pointer-events-auto popup-enter city-popup"
            style={{
              bottom: '55px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
            }}
          >
            <div className="relative">
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl border border-white/10">
                {/* Image */}
                <div className="popup-image relative h-32 overflow-hidden">
                  <Image
                    src={popupCity.image_url || "https://images.unsplash.com/photo-1505881502353-a1986add3762?w=800&auto=format&fit=crop"}
                    alt={popupCity.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />

                {/* Close Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Hide line immediately to prevent flickering
                    if (lineRef.current) {
                      lineRef.current.setAttribute('opacity', '0');
                    }
                    setPopupCityId(null);
                    if (popupMarkerElement) {
                      popupMarkerElement.remove();
                      setPopupMarkerElement(null);
                    }
                    // Remove highlight when popup closes
                    if (map.current?.getLayer('highlight-marker')) {
                      map.current.setFilter('highlight-marker', ['==', ['get', 'id'], '']);
                    }
                    // Restore all labels
                    if (map.current?.getLayer('unclustered-label')) {
                      map.current.setFilter('unclustered-label', ['!', ['has', 'point_count']]);
                    }
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 backdrop-blur-sm flex items-center justify-center hover:bg-slate-900 transition-colors border border-white/10"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="popup-content p-3 space-y-2.5">
                {/* Location Name */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <h3 className="text-sm font-semibold text-white">
                    {popupCity.name}, Florida
                  </h3>
                </div>

                {/* Add to Preferences Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (preferredCities.length >= 2 && !isCityPreferred(popupCity.id)) {
                      // Show alert or feedback that max 2 cities allowed
                      return;
                    }
                    toggleCityPreference(popupCity);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(30, 70, 90, 0.5)' }}
                  disabled={preferredCities.length >= 2 && !isCityPreferred(popupCity.id)}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={{
                      border: '2px solid rgba(255, 255, 255, 0.5)',
                      backgroundColor: isCityPreferred(popupCity.id) ? '#0d9488' : 'transparent',
                      borderColor: isCityPreferred(popupCity.id) ? '#0d9488' : 'rgba(255, 255, 255, 0.5)'
                    }}
                  >
                    {isCityPreferred(popupCity.id) && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-white/80">
                    {isCityPreferred(popupCity.id) ? 'Added to your preferences' : 'Add to preferences'}
                  </span>
                </button>
              </div>
            </div>

          </div>
        </div>,
        popupMarkerElement
      )}

        {/* Preferred Cities Panel - Modern Design */}
        {preferredCities.length > 0 && (
          <div className="absolute bottom-4 md:bottom-6 md:right-6 left-1/2 md:left-auto -translate-x-1/2 md:translate-x-0 z-[1000] animate-slide-up max-w-[95vw]">
            {/* Panel Container */}
            <div className="bg-gradient-to-br from-slate-900/98 to-slate-800/98 backdrop-blur-2xl rounded-xl md:rounded-2xl border border-cyan-400/20 shadow-2xl shadow-cyan-500/10 overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 md:px-4 md:py-3 border-b border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-xs md:text-sm font-semibold text-white tracking-wide">Your Preferences</h3>
                    <p className="text-[9px] md:text-[10px] text-cyan-400/80">{preferredCities.length}/2 cities selected</p>
                  </div>
                </div>
              </div>

              {/* Cities Grid */}
              <div className="p-2 md:p-3 flex flex-row gap-2 md:gap-3">
                {preferredCities.map((city, index) => (
                  <div
                    key={city.id}
                    className="group relative w-[110px] md:w-[200px]"
                    style={{
                      animation: `slideInCard 0.4s ease-out ${index * 0.1}s both`
                    }}
                  >
                    {/* Card */}
                    <div className="relative rounded-lg md:rounded-xl overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 shadow-lg hover:shadow-cyan-500/30 transition-shadow duration-300">
                      {/* City Image */}
                      <div className="relative h-16 md:h-28 overflow-hidden">
                        <Image
                          src={city.image_url || "https://images.unsplash.com/photo-1505881502353-a1986add3762?w=800&auto=format&fit=crop"}
                          alt={city.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

                        {/* Remove Button */}
                        <button
                          onClick={() => removeCityPreference(city.id)}
                          className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-800/90 backdrop-blur-sm flex items-center justify-center hover:bg-slate-700/90 transition-all duration-200 border border-white/20 shadow-lg"
                          title="Remove from preferences"
                        >
                          <Trash2 className="w-3 h-3 md:w-4 md:h-4 text-white/80" />
                        </button>
                      </div>

                      {/* City Info */}
                      <div className="px-2 py-2 md:px-3 md:py-3">
                        {/* City Name */}
                        <p className="text-[11px] md:text-sm text-white font-semibold leading-tight">
                          {city.name}
                        </p>
                        <p className="text-[9px] md:text-[10px] text-cyan-400/70 font-medium">Florida</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Add Placeholder if only 1 city */}
                {preferredCities.length === 1 && (
                  <div
                    onClick={() => {
                      // Zoom back to the region where the first city was selected from
                      if (preferredCities[0] && map.current) {
                        const cityRegionId = preferredCities[0].region_id;
                        const cityRegion = regions.find(r => r.id === cityRegionId);

                        if (cityRegion) {
                          const regionGeometry = cityRegion.geom;
                          if (regionGeometry) {
                            const bounds = new maplibregl.LngLatBounds();

                            if (regionGeometry.type === 'Polygon') {
                              const coords = regionGeometry.coordinates[0];
                              coords.forEach((coord: any) => {
                                bounds.extend(coord as [number, number]);
                              });
                            } else if (regionGeometry.type === 'MultiPolygon') {
                              regionGeometry.coordinates.forEach((polygon: any) => {
                                polygon[0].forEach((coord: any) => {
                                  bounds.extend(coord as [number, number]);
                                });
                              });
                            }

                            map.current.fitBounds(bounds, {
                              padding: 60,
                              duration: 1200,
                              easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
                            });
                          }
                        }
                      }
                    }}
                    className="w-[110px] md:w-[200px] rounded-lg md:rounded-xl border-2 border-dashed border-white/20 bg-slate-800/30 flex flex-col items-center justify-center gap-1.5 md:gap-2 py-4 md:py-6 hover:border-cyan-400/40 hover:bg-slate-800/50 transition-all duration-300 group cursor-pointer"
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                      <MapPin className="w-4 h-4 md:w-5 md:h-5 text-white/40 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <p className="text-[10px] md:text-xs text-white/50 group-hover:text-white/70 transition-colors font-medium text-center px-2">Add another city</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Subtle Vignette Effect - Focus Attention */}
        <div className="absolute inset-0 pointer-events-none z-[1] bg-gradient-radial from-transparent via-transparent to-slate-900/20" />

        {/* Loading overlay */}
        <div
          className={`absolute inset-0 bg-p10-dark flex flex-col items-center justify-center gap-4 z-10 transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
