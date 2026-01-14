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

// Fallback images for cities without custom images
const CITY_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1535498730771-e735b998cd64?w=800&auto=format&fit=crop", // Miami skyline
  "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&auto=format&fit=crop", // Beach sunset
  "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop", // Palm trees beach
  "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=800&auto=format&fit=crop", // Florida sunset
  "https://images.unsplash.com/photo-1605723517503-3cadb5818a0c?w=800&auto=format&fit=crop", // Coastal view
  "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&auto=format&fit=crop", // Beach house
];

// Get a consistent fallback image for a city based on its name
const getCityFallbackImage = (cityName: string): string => {
  let hash = 0;
  for (let i = 0; i < cityName.length; i++) {
    hash = ((hash << 5) - hash) + cityName.charCodeAt(i);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % CITY_FALLBACK_IMAGES.length;
  return CITY_FALLBACK_IMAGES[index];
};

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

  // Preferences state - maximum 2 cities
  const [preferredCities, setPreferredCities] = useState<City[]>([]);

  // Contact form modal state
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });

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
    const validCities = cities.filter(city => city.geom && city.geom.type === 'Point');
    console.log('[MARKERS] Total cities:', cities.length, 'Valid cities with Point geometry:', validCities.length);

    // Log any cities that don't have valid Point geometry
    const invalidCities = cities.filter(city => !city.geom || city.geom.type !== 'Point');
    if (invalidCities.length > 0) {
      console.warn('[MARKERS] Cities without valid Point geometry:', invalidCities.map(c => c.name));
    }

    const citiesGeoJSON = {
      type: 'FeatureCollection',
      features: validCities.map(city => ({
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

    console.log('[MARKERS] GeoJSON features count:', citiesGeoJSON.features.length);

    // Add source with clustering enabled
    const existingSource = mapInstance.getSource('cities') as maplibregl.GeoJSONSource;
    if (existingSource) {
      // Update existing source data
      console.log('[MARKERS] Updating existing source with new data');
      existingSource.setData(citiesGeoJSON as any);
    } else {
      // Create new source
      console.log('[MARKERS] Creating new source');
      mapInstance.addSource('cities', {
        type: 'geojson',
        data: citiesGeoJSON as any,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    // Add cluster outer ring layer (ice white blue - lighter ring) - VISUAL ONLY, not clickable
    if (!mapInstance.getLayer('clusters-outer')) {
      mapInstance.addLayer({
        id: 'clusters-outer',
        type: 'circle',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 3,
        maxzoom: 15,
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
            5, ['step', ['get', 'point_count'], 18, 5, 24, 10, 30, 20, 38],
            7, ['step', ['get', 'point_count'], 19, 5, 26, 10, 33, 20, 42],
            9, ['step', ['get', 'point_count'], 24, 5, 32, 10, 40, 20, 50],
            12, ['step', ['get', 'point_count'], 28, 5, 36, 10, 44, 20, 54]
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.6,
            13, 0.3,
            14, 0
          ],
          'circle-stroke-width': 0,
          'circle-blur': 0.15
        }
      });
    }

    // Add cluster inner circle layer (blue munsell - main circle) - PRIMARY CLICKABLE LAYER
    if (!mapInstance.getLayer('clusters-inner')) {
      mapInstance.addLayer({
        id: 'clusters-inner',
        type: 'circle',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 3,
        maxzoom: 15,
        paint: {
          'circle-color': '#0085C9',
          'circle-radius': [
            'interpolate',
            ['exponential', 1.2],
            ['zoom'],
            5, ['step', ['get', 'point_count'], 12, 5, 17, 10, 21, 20, 26],
            7, ['step', ['get', 'point_count'], 13, 5, 18, 10, 23, 20, 28],
            9, ['step', ['get', 'point_count'], 16, 5, 22, 10, 28, 20, 34],
            12, ['step', ['get', 'point_count'], 18, 5, 24, 10, 30, 20, 38]
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 1,    // Fully visible
            13, 0.7,  // Start fading
            14, 0     // Fade out before breaking
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.9,
            13, 0.6,
            14, 0
          ]
        }
      });
    }

    // Add cluster count labels - VISUAL ONLY, not clickable
    if (!mapInstance.getLayer('cluster-count')) {
      mapInstance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'cities',
        filter: ['has', 'point_count'],
        minzoom: 3,
        maxzoom: 15,
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
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 1,
            13, 0.7,
            14, 0
          ],
          'text-halo-color': 'rgba(0, 133, 201, 0.5)',
          'text-halo-width': 2,
          'text-halo-blur': 0.5
        }
      });
    }

    // Add individual unclustered points - show when not clustered
    if (!mapInstance.getLayer('unclustered-point')) {
      mapInstance.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'cities',
        filter: ['!', ['has', 'point_count']],
        minzoom: 3,
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 5,   // Smaller at low zoom
            10, 7,  // Normal size
            14, 9   // Slightly larger at high zoom
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            6, 0,    // Fade in starts
            7, 1     // Fully visible
          ],
          'circle-stroke-opacity': [
            'interpolate', ['linear'], ['zoom'],
            6, 0,
            7, 1
          ]
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
        minzoom: 6, // Match unclustered-point visibility
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': [
            'interpolate', ['linear'], ['zoom'],
            6, 11,
            8, 13,
            10, 14
          ],
          'text-offset': [0, -1.0],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          'text-ignore-placement': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0, 0, 0, 0.9)',
          'text-halo-width': 2,
          'text-halo-blur': 0.8,
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            6, 0,
            7, 1
          ]
        }
      });
    }

    // Click handler for clusters - expands cluster to next zoom level
    const clusterClickHandler = async (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      e.originalEvent.stopPropagation();

      if (isAnimating.current) return;

      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['clusters-inner']
      });

      if (!features.length) return;

      const feature = features[0];
      if (!feature.geometry || feature.geometry.type !== 'Point') return;

      const clusterId = feature.properties?.cluster_id;
      const coordinates = (feature.geometry as any).coordinates as [number, number];

      if (clusterId === undefined || clusterId === null) return;

      const source = mapInstance.getSource('cities') as maplibregl.GeoJSONSource;
      if (!source || typeof source.getClusterExpansionZoom !== 'function') return;

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom === undefined || zoom === null) return;

        const mapRef = map.current;
        if (!mapRef) return;

        // Disable pitch updates during animation (prevents interference)
        (mapRef as any)._allowPitchUpdate = false;
        isAnimating.current = true;

        mapRef.easeTo({
          center: coordinates,
          zoom: zoom,
          duration: 300,
          easing: (t: number) => 1 - Math.pow(1 - t, 3) // Ease-out cubic
        });

        setTimeout(() => {
          isAnimating.current = false;
          (mapRef as any)._allowPitchUpdate = true;
        }, 350);
      } catch (err) {
        console.error('[CLUSTER] Expansion error:', err);
      }
    };

    // Click handler for individual points - modern sequence: zoom → highlight → popup
    const pointClickHandler = (e: maplibregl.MapMouseEvent) => {
      // Prevent click from bubbling to region layer
      e.preventDefault();
      e.originalEvent.stopPropagation();

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
    // ONLY attach click handler to clusters-inner (the primary cluster layer)
    // clusters-outer is visual only, not clickable
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

      // Remove source - ONLY on unmount, not on re-renders
      if (mapInstance.getSource('cities')) mapInstance.removeSource('cities');
    };
    // IMPORTANT: Only depend on cities and mapLoaded - NOT selectedRegion
    // Changing selectedRegion should NOT destroy/recreate the source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, mapLoaded, map]);

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

        // Draw dotted line from popup bottom to marker
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
          ref={mapContainer}
          className="w-full h-full relative"
        >
          {/* Shiny ribbon line connecting popup to marker */}
          {popupCityId && (
            <svg
              className="absolute inset-0 pointer-events-none z-[9998]"
              style={{ width: "100%", height: "100%" }}
            >
              <defs>
                {/* Main gradient - light cyan with shine effect */}
                <linearGradient id="ribbonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#a8d8ea" stopOpacity="0.1" />
                  <stop offset="30%" stopColor="#88c8d8" stopOpacity="0.4" />
                  <stop offset="60%" stopColor="#7ac0d0" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#6bb8c8" stopOpacity="0.6" />
                </linearGradient>
                {/* Glow filter for shiny effect */}
                <filter id="ribbonGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="glow"/>
                  <feMerge>
                    <feMergeNode in="glow"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Outer glow line */}
              <line
                ref={lineRef}
                stroke="url(#ribbonGradient)"
                strokeWidth="3"
                strokeLinecap="round"
                filter="url(#ribbonGlow)"
                opacity="0.8"
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
                    src={popupCity.image_url || getCityFallbackImage(popupCity.name)}
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs md:text-sm font-semibold text-white tracking-wide">Your Preferences</h3>
                    <p className="text-[9px] md:text-[10px] text-cyan-400/80">{preferredCities.length}/2 cities selected</p>
                  </div>
                  <button
                    onClick={() => {
                      // Close any open popup before showing form
                      setPopupCityId(null);
                      if (popupMarkerElement) {
                        popupMarkerElement.remove();
                        setPopupMarkerElement(null);
                      }
                      setShowContactForm(true);
                    }}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-primary text-primary-foreground text-xs md:text-sm font-medium rounded-lg shadow-md hover:bg-primary/90 transition-all"
                  >
                    Continue
                  </button>
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
                          src={city.image_url || getCityFallbackImage(city.name)}
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

        {/* Contact Form Modal */}
        {showContactForm && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 md:p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowContactForm(false)}
            />

            {/* Modal */}
            <div className="relative w-full max-w-sm md:max-w-lg bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl md:rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">
              {/* Close Button */}
              <button
                onClick={() => setShowContactForm(false)}
                className="absolute top-3 right-3 md:top-4 md:right-4 w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
              >
                <X className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
              </button>

              {/* Header */}
              <div className="px-4 pt-4 pb-3 md:px-6 md:pt-6 md:pb-4">
                <h2 className="text-base md:text-xl font-semibold text-white mb-0.5">Get Started</h2>
                <p className="text-xs md:text-sm text-white/60">Enter your details and we&apos;ll be in touch shortly.</p>
              </div>

              {/* Selected Cities Preview */}
              <div className="px-4 pb-3 md:px-6 md:pb-4">
                <p className="text-[10px] md:text-xs text-cyan-400 font-medium uppercase tracking-wider mb-2">Your Selected Cities</p>
                <div className="flex gap-2 md:gap-3">
                  {preferredCities.map((city) => (
                    <div key={city.id} className="flex-1 relative rounded-lg md:rounded-xl overflow-hidden h-16 md:h-24">
                      <Image
                        src={city.image_url || getCityFallbackImage(city.name)}
                        alt={city.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-1.5 left-2 right-2 md:bottom-2 md:left-3 md:right-3">
                        <p className="text-white font-semibold text-xs md:text-sm">{city.name}</p>
                        <p className="text-cyan-400/80 text-[10px] md:text-xs">Florida</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              {/* Form */}
              <div className="px-4 py-3 md:px-6 md:py-5">
                <div className="space-y-3 md:space-y-4">
                  {/* Name Row */}
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <div>
                      <label className="block text-[10px] md:text-xs text-white/50 mb-1 md:mb-1.5 font-medium">First Name</label>
                      <input
                        type="text"
                        value={contactForm.firstName}
                        onChange={(e) => setContactForm(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs md:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] md:text-xs text-white/50 mb-1 md:mb-1.5 font-medium">Last Name</label>
                      <input
                        type="text"
                        value={contactForm.lastName}
                        onChange={(e) => setContactForm(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs md:text-sm"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[10px] md:text-xs text-white/50 mb-1 md:mb-1.5 font-medium">Email Address</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs md:text-sm"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-[10px] md:text-xs text-white/50 mb-1 md:mb-1.5 font-medium">Phone Number</label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-3 py-2 md:px-4 md:py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-all text-xs md:text-sm"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={() => {
                    console.log('Form submitted:', { ...contactForm, cities: preferredCities.map(c => c.name) });
                    // TODO: Add API endpoint
                    setShowContactForm(false);
                  }}
                  className="w-full mt-4 md:mt-5 py-2.5 md:py-3 bg-primary text-primary-foreground font-medium rounded-lg shadow-md hover:bg-primary/90 transition-all text-sm md:text-base"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        )}

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
