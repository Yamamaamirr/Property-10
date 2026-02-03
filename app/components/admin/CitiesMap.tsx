"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";

// Florida state bounds for initial view
const FLORIDA_BOUNDS: [[number, number], [number, number]] = [
  [-87.6, 24.5],  // Southwest corner [lng, lat]
  [-80.0, 31.0]   // Northeast corner [lng, lat]
];

interface CitiesMapProps {
  cities: any[];
  selectedCityId?: string | null;
  onCityClick?: (cityId: string) => void;
  sheetOpen?: boolean;
}

export default function CitiesMap({ cities, selectedCityId, onCityClick, sheetOpen = true }: CitiesMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const initialBoundsFitted = useRef(false);
  const lastSelectedId = useRef<string | null | undefined>(undefined);
  const animating = useRef(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapTilerStyleURL(),
      center: MAP_CONFIG.INITIAL_CENTER,
      zoom: MAP_CONFIG.INITIAL_ZOOM,
      minZoom: MAP_CONFIG.MIN_ZOOM,
      maxZoom: MAP_CONFIG.MAX_ZOOM,
      pitch: 0,
      maxPitch: 45,
      attributionControl: false,
    });

    map.current = mapInstance;

    // Initialize pitch update flag
    (mapInstance as any)._allowPitchUpdate = true;

    // Add pitch based on zoom level
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      const MOBILE_TILT_THRESHOLD = 12;
      const MOBILE_TILT_ANGLE = 40;
      let isTilted = false;

      mapInstance.on('idle', () => {
        const zoom = mapInstance.getZoom();
        const shouldTilt = zoom >= MOBILE_TILT_THRESHOLD;

        if (shouldTilt && !isTilted) {
          isTilted = true;
          mapInstance.easeTo({ pitch: MOBILE_TILT_ANGLE, duration: 400 });
        } else if (!shouldTilt && isTilted) {
          isTilted = false;
          mapInstance.easeTo({ pitch: 0, duration: 400 });
        }
      });
    } else {
      mapInstance.on('zoom', () => {
        // Check if pitch updates are allowed (prevents interference during animations)
        if ((mapInstance as any)._allowPitchUpdate === false || animating.current) return;

        const zoom = mapInstance.getZoom();
        const targetPitch = zoom > 11 ? Math.min(45, (zoom - 11) * 15) : 0;
        mapInstance.setPitch(targetPitch);
      });
    }

    mapInstance.on("load", async () => {
      try {
        const response = await fetch('/fl-state.geojson');
        if (response.ok) {
          const floridaBoundary = await response.json();
          const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
          const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

          mapInstance.addLayer({
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
        }
      } catch (error) {
        console.warn('Failed to load Florida boundary mask:', error);
      }

      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        // Clean up layers before removing map
        const mapInstance = map.current;
        if (mapInstance.getLayer('admin-unclustered-label')) mapInstance.removeLayer('admin-unclustered-label');
        if (mapInstance.getLayer('admin-unclustered-point')) mapInstance.removeLayer('admin-unclustered-point');
        if (mapInstance.getLayer('admin-cluster-count')) mapInstance.removeLayer('admin-cluster-count');
        if (mapInstance.getLayer('admin-clusters-inner')) mapInstance.removeLayer('admin-clusters-inner');
        if (mapInstance.getLayer('admin-clusters-outer')) mapInstance.removeLayer('admin-clusters-outer');
        if (mapInstance.getLayer('admin-highlight-marker')) mapInstance.removeLayer('admin-highlight-marker');
        if (mapInstance.getSource('admin-cities')) mapInstance.removeSource('admin-cities');

        mapInstance.remove();
        map.current = null;
      }
    };
  }, []);

  // Add MapLibre layers for cities - matching main map exactly
  useEffect(() => {
    if (!map.current || !mapLoaded || cities.length === 0) return;

    const mapInstance = map.current;

    // Convert cities to GeoJSON format
    const validCities = cities.filter(city => city.geom && city.geom.type === 'Point');

    const citiesGeoJSON = {
      type: 'FeatureCollection',
      features: validCities.map(city => ({
        type: 'Feature',
        properties: {
          id: city.id,
          name: city.name,
          image_url: city.image_url || '',
        },
        geometry: city.geom
      }))
    };

    // Add or update source WITH CLUSTERING
    const existingSource = mapInstance.getSource('admin-cities') as maplibregl.GeoJSONSource;
    if (existingSource) {
      existingSource.setData(citiesGeoJSON as any);
    } else {
      mapInstance.addSource('admin-cities', {
        type: 'geojson',
        data: citiesGeoJSON as any,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
    }

    // Add cluster outer ring layer - EXACTLY matching main map
    if (!mapInstance.getLayer('admin-clusters-outer')) {
      mapInstance.addLayer({
        id: 'admin-clusters-outer',
        type: 'circle',
        source: 'admin-cities',
        filter: ['has', 'point_count'],
        minzoom: 3,
        maxzoom: 15,
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#9DD9EC',    // Light maya blue for small clusters (< 5)
            5,
            '#8DD3EA',    // Slightly deeper for 5-10
            10,
            '#7DCDE8',    // Medium for 10-20
            20,
            '#76c8fe'     // p10-maya for 20+ clusters
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
          'circle-blur': 0
        }
      });
    }

    // Add cluster inner circle layer - EXACTLY matching main map
    if (!mapInstance.getLayer('admin-clusters-inner')) {
      mapInstance.addLayer({
        id: 'admin-clusters-inner',
        type: 'circle',
        source: 'admin-cities',
        filter: ['has', 'point_count'],
        minzoom: 3,
        maxzoom: 15,
        paint: {
          'circle-color': '#00879f', // p10-blue-munsell to match theme
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
            10, 1,
            13, 0.7,
            14, 0
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#DEE9F0',
          'circle-stroke-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.9,
            13, 0.6,
            14, 0
          ]
        }
      });
    }

    // Add cluster count labels - EXACTLY matching main map
    if (!mapInstance.getLayer('admin-cluster-count')) {
      mapInstance.addLayer({
        id: 'admin-cluster-count',
        type: 'symbol',
        source: 'admin-cities',
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
            5, ['step', ['get', 'point_count'], 10, 5, 12, 10, 14, 20, 16],
            7, ['step', ['get', 'point_count'], 12, 5, 14, 10, 16, 20, 18],
            9, ['step', ['get', 'point_count'], 14, 5, 16, 10, 18, 20, 20]
          ],
          'text-allow-overlap': true
        },
        paint: {
          'text-color': '#DEE9F0',
          'text-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 1,
            13, 0.7,
            14, 0
          ],
          'text-halo-color': 'rgba(0, 135, 159, 0.5)',
          'text-halo-width': 2,
          'text-halo-blur': 0.5
        }
      });
    }

    // Add unclustered point layer - EXACTLY matching main map
    if (!mapInstance.getLayer('admin-unclustered-point')) {
      mapInstance.addLayer({
        id: 'admin-unclustered-point',
        type: 'circle',
        source: 'admin-cities',
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
          'circle-opacity': 1,
          'circle-stroke-opacity': 1
        }
      });
    }

    // Add city name labels - EXACTLY matching main map
    if (!mapInstance.getLayer('admin-unclustered-label')) {
      mapInstance.addLayer({
        id: 'admin-unclustered-label',
        type: 'symbol',
        source: 'admin-cities',
        filter: ['!', ['has', 'point_count']],
        minzoom: 6,
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
          'text-opacity': 1
        }
      });
    }

    // Click handler for clusters - expands to next zoom level
    const clusterClickHandler = async (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      e.originalEvent.stopPropagation();

      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['admin-clusters-inner']
      });

      if (!features.length) return;

      const feature = features[0];
      if (!feature.geometry || feature.geometry.type !== 'Point') return;

      const clusterId = feature.properties?.cluster_id;
      const coordinates = (feature.geometry as any).coordinates as [number, number];

      if (clusterId === undefined || clusterId === null) return;

      const source = mapInstance.getSource('admin-cities') as maplibregl.GeoJSONSource;
      if (!source || typeof source.getClusterExpansionZoom !== 'function') return;

      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom === undefined || zoom === null) return;

        // Set animating flag
        animating.current = true;

        // Disable pitch updates during animation (prevents interference)
        (mapInstance as any)._allowPitchUpdate = false;

        mapInstance.easeTo({
          center: coordinates,
          zoom: zoom,
          duration: 300,
          easing: (t: number) => 1 - Math.pow(1 - t, 3)
        });

        // Re-enable pitch updates and clear animating flag after animation
        setTimeout(() => {
          (mapInstance as any)._allowPitchUpdate = true;
          animating.current = false;
        }, 350);
      } catch (err) {
        console.error('[ADMIN CLUSTER] Expansion error:', err);
        animating.current = false;
      }
    };

    // Click handler for points - opens popup and highlights marker (like main map)
    const pointClickHandler = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      e.originalEvent.stopPropagation();

      const features = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['admin-unclustered-point']
      });

      if (!features.length) return;

      const feature = features[0];
      const cityId = feature.properties?.id;

      // Use the onCityClick callback to update parent state
      // This triggers the same selection effect as table row clicks
      if (onCityClick) {
        onCityClick(cityId);
      }
    };

    // Hover effects
    const clusterMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };

    const clusterMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
    };

    const pointMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer';
    };

    const pointMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
    };


    // Add event listeners
    mapInstance.on('click', 'admin-clusters-inner', clusterClickHandler);
    mapInstance.on('click', 'admin-unclustered-point', pointClickHandler);
    mapInstance.on('mouseenter', 'admin-clusters-outer', clusterMouseEnter);
    mapInstance.on('mouseleave', 'admin-clusters-outer', clusterMouseLeave);
    mapInstance.on('mouseenter', 'admin-clusters-inner', clusterMouseEnter);
    mapInstance.on('mouseleave', 'admin-clusters-inner', clusterMouseLeave);
    mapInstance.on('mouseenter', 'admin-unclustered-point', pointMouseEnter);
    mapInstance.on('mouseleave', 'admin-unclustered-point', pointMouseLeave);

    // Fit bounds to Florida ONLY on initial load
    if (!initialBoundsFitted.current) {
      initialBoundsFitted.current = true;

      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const isLargeScreen = windowWidth >= 1024;
      const tableHeightPercent = isLargeScreen ? 0.45 : 0.35;
      const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;
      const visibleWidth = windowWidth;
      const visibleHeight = windowHeight - tableHeight;

      const leftPadding = visibleWidth * 0.05;
      const rightPadding = visibleWidth * 0.15;
      const topPadding = visibleHeight * 0.15;
      const bottomPadding = tableHeight + (visibleHeight * 0.05);

      mapInstance.fitBounds(FLORIDA_BOUNDS, {
        padding: {
          top: topPadding,
          bottom: bottomPadding,
          left: leftPadding,
          right: rightPadding
        },
        duration: 0,
        maxZoom: 9
      });
    }

    return () => {
      mapInstance.off('click', 'admin-clusters-inner', clusterClickHandler);
      mapInstance.off('click', 'admin-unclustered-point', pointClickHandler);
      mapInstance.off('mouseenter', 'admin-clusters-outer', clusterMouseEnter);
      mapInstance.off('mouseleave', 'admin-clusters-outer', clusterMouseLeave);
      mapInstance.off('mouseenter', 'admin-clusters-inner', clusterMouseEnter);
      mapInstance.off('mouseleave', 'admin-clusters-inner', clusterMouseLeave);
      mapInstance.off('mouseenter', 'admin-unclustered-point', pointMouseEnter);
      mapInstance.off('mouseleave', 'admin-unclustered-point', pointMouseLeave);

      // IMPORTANT: Don't remove layers/source on every re-render, only on unmount
      // Layers and source persist across re-renders - we just update the data
    };
    // IMPORTANT: Only depend on cities and mapLoaded - sheetOpen changes shouldn't recreate layers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, mapLoaded]);

  // Handle selection from table - zoom and highlight behavior
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    const selectionChanged = selectedCityId !== lastSelectedId.current;
    lastSelectedId.current = selectedCityId;

    if (!selectionChanged) return;

    // Prevent rapid re-triggering during animation
    if (animating.current) return;

    if (selectedCityId) {
      const selectedCity = cities.find(c => c.id === selectedCityId);
      if (!selectedCity || !selectedCity.geom) return;

      const coordinates = selectedCity.geom.coordinates;
      const targetZoom = 16;
      const targetPitch = Math.min(45, (targetZoom - 11) * 15);

      // Set animating flag
      animating.current = true;

      // Restore all labels first
      if (mapInstance.getLayer('admin-unclustered-label')) {
        mapInstance.setFilter('admin-unclustered-label', ['!', ['has', 'point_count']]);
      }

      // Add highlight marker layer
      if (!mapInstance.getLayer('admin-highlight-marker')) {
        mapInstance.addLayer({
          id: 'admin-highlight-marker',
          type: 'circle',
          source: 'admin-cities',
          filter: ['==', ['get', 'id'], selectedCityId],
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
        mapInstance.setFilter('admin-highlight-marker', ['==', ['get', 'id'], selectedCityId]);
      }

      // Hide label for selected city
      if (mapInstance.getLayer('admin-unclustered-label')) {
        mapInstance.setFilter('admin-unclustered-label', [
          'all',
          ['!', ['has', 'point_count']],
          ['!=', ['get', 'id'], selectedCityId]
        ]);
      }

      // Disable pitch updates during animation
      (mapInstance as any)._allowPitchUpdate = false;

      // Fly to city
      mapInstance.flyTo({
        center: coordinates as [number, number],
        zoom: targetZoom,
        pitch: targetPitch,
        duration: 3000,
        curve: 1.4,
        easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      });

      // Re-enable pitch updates and animating flag after animation
      setTimeout(() => {
        (mapInstance as any)._allowPitchUpdate = true;
        animating.current = false;
      }, 3050);
    } else {
      // Deselect - remove highlight and restore labels
      if (mapInstance.getLayer('admin-highlight-marker')) {
        mapInstance.setFilter('admin-highlight-marker', ['==', ['get', 'id'], '']);
      }
      if (mapInstance.getLayer('admin-unclustered-label')) {
        mapInstance.setFilter('admin-unclustered-label', ['!', ['has', 'point_count']]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCityId, cities, mapLoaded]);

  return (
    <div className="absolute inset-0 w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
