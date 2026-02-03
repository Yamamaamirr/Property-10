"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapTilerStyleURL } from '@/app/lib/mapUtils';
import { USA_MAP_CONFIG, STATE_COLORS } from '@/app/lib/constants';
import { useStateSelection } from '@/app/hooks/useStateSelection';
import { Loader2 } from 'lucide-react';

interface StateGlobeProps {
  onStateSelect?: (stateName: string) => void;
}

export default function StateGlobe({ onStateSelect }: StateGlobeProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const { selectState } = useStateSelection();
  const isAnimating = useRef(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let mounted = true;

    const initializeMap = async () => {
      try {
        console.log('Initializing map with style:', getMapTilerStyleURL());

        // Check if mobile device
        const isMobile = window.innerWidth < 768;

        // Initialize map - start with a pulled back view
        // Mobile needs to start more zoomed out to fit USA properly
        const mapInstance = new maplibregl.Map({
          container: mapContainer.current!,
          center: isMobile ? [-98.5795, 38] : [-98.5795, 25], // Start higher on mobile
          zoom: isMobile ? 1.5 : 2.0, // Much more zoomed out on mobile
          pitch: isMobile ? 40 : 55, // Less tilt on mobile
          bearing: 0,
          minZoom: USA_MAP_CONFIG.MIN_ZOOM,
          maxZoom: USA_MAP_CONFIG.MAX_ZOOM,
          style: getMapTilerStyleURL(),
          attributionControl: false,
          renderWorldCopies: false,
        });

        console.log('Map instance created');

        map.current = mapInstance;

        // Wait for style to load - use 'style.load' event
        await new Promise<void>((resolve, reject) => {
          mapInstance.on('style.load', () => {
            // Set globe projection after style loads
            try {
              mapInstance.setProjection({ type: 'globe' });
              console.log('Globe projection set');
            } catch (e) {
              console.error('Failed to set globe projection:', e);
            }
            resolve();
          });
          mapInstance.on('error', (e) => reject(e.error));
        });

        if (!mounted) {
          mapInstance.remove();
          return;
        }

        console.log('Map loaded with globe projection');

        // Load USA GeoJSON
        const response = await fetch('/USA.geojson');
        if (!response.ok) throw new Error('Failed to load USA.geojson');
        const usaGeoJSON: GeoJSON.FeatureCollection = await response.json();

        console.log('USA GeoJSON loaded:', usaGeoJSON.features.length, 'features');

        if (!mounted) return;

        // Filter out Alaska and Puerto Rico, then add feature IDs
        usaGeoJSON.features = usaGeoJSON.features
          .filter((feature) => feature.properties?.NAME !== 'Alaska' && feature.properties?.NAME !== 'Puerto Rico')
          .map((feature, index) => ({
            ...feature,
            id: index,
          }));

        console.log('Filtered features (without Alaska):', usaGeoJSON.features.length);

        // Add USA states source
        mapInstance.addSource('usa-states', {
          type: 'geojson',
          data: usaGeoJSON,
          generateId: true,
        });

        console.log('USA states source added');

        // Add fill layer for states
        mapInstance.addLayer({
          id: 'usa-states-fill',
          type: 'fill',
          source: 'usa-states',
          paint: {
            'fill-color': [
              'match',
              ['get', 'NAME'],
              'Florida',
              STATE_COLORS.FLORIDA_FILL,
              STATE_COLORS.OTHER_FILL,
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              [
                'match',
                ['get', 'NAME'],
                'Florida',
                STATE_COLORS.FLORIDA_OPACITY + 0.2,
                STATE_COLORS.OTHER_OPACITY + 0.15,
              ],
              [
                'match',
                ['get', 'NAME'],
                'Florida',
                STATE_COLORS.FLORIDA_OPACITY,
                STATE_COLORS.OTHER_OPACITY,
              ],
            ],
          },
        });

        // Add border layer for states
        mapInstance.addLayer({
          id: 'usa-states-border',
          type: 'line',
          source: 'usa-states',
          paint: {
            'line-color': STATE_COLORS.BORDER,
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              2,
              1,
            ],
            'line-opacity': 0.8,
          },
        });

        console.log('USA states layers added');

        // Hide loading overlay
        setIsLoading(false);

        // Animate to final upright position
        // Adjust zoom based on screen size (reuse isMobile from above)
        setTimeout(() => {
          mapInstance.easeTo({
            center: USA_MAP_CONFIG.INITIAL_CENTER,
            zoom: isMobile ? 2.5 : 3.2, // Much less zoomed on mobile to show full USA
            pitch: isMobile ? 25 : 35, // Less tilt on mobile
            bearing: 0,
            duration: 1800, // 1.8 second smooth animation
            easing: (t) => t * (2 - t), // Ease out
          });
          console.log('Globe entrance animation started');
        }, 300);

        // Hover state management
        let hoveredStateId: string | number | undefined = undefined;

        // Mouse move handler
        mapInstance.on('mousemove', 'usa-states-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const stateName = feature.properties?.NAME;

            // Update cursor
            mapInstance.getCanvas().style.cursor = 'pointer';

            // Update hover state
            if (hoveredStateId !== undefined) {
              mapInstance.setFeatureState(
                { source: 'usa-states', id: hoveredStateId },
                { hover: false }
              );
            }

            hoveredStateId = feature.id;

            if (hoveredStateId !== undefined) {
              mapInstance.setFeatureState(
                { source: 'usa-states', id: hoveredStateId },
                { hover: true }
              );
            }

            // Update tooltip
            setHoveredState(stateName);
            setTooltipPosition({ x: e.point.x, y: e.point.y });
          }
        });

        // Mouse leave handler
        mapInstance.on('mouseleave', 'usa-states-fill', () => {
          mapInstance.getCanvas().style.cursor = '';

          if (hoveredStateId !== undefined) {
            mapInstance.setFeatureState(
              { source: 'usa-states', id: hoveredStateId },
              { hover: false }
            );
          }

          hoveredStateId = undefined;
          setHoveredState(null);
          setTooltipPosition(null);
        });

        // Click handler
        mapInstance.on('click', 'usa-states-fill', (e) => {
          if (isAnimating.current || !e.features || e.features.length === 0) return;

          const feature = e.features[0];
          const stateName = feature.properties?.NAME;

          if (stateName === 'Florida') {
            isAnimating.current = true;

            // Zoom to Florida - adjust for mobile to fit properly
            const floridaZoom = isMobile ? 4.5 : USA_MAP_CONFIG.FLORIDA_SELECT_ZOOM;
            const floridaCenter: [number, number] = isMobile ? [-81.5158, 28.2] : [-81.5158, 27.6648];

            mapInstance.flyTo({
              center: floridaCenter,
              zoom: floridaZoom,
              duration: USA_MAP_CONFIG.ANIMATION_DURATION,
              essential: true,
            });

            // Notify parent and trigger navigation
            if (onStateSelect) {
              onStateSelect(stateName);
            }
            selectState(stateName);
          } else {
            // Show "Coming Soon" for other states (tooltip already visible on hover)
          }
        });

      } catch (err) {
        console.error('Error initializing map:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize map');
          setIsLoading(false);
        }
      }
    };

    initializeMap();

    return () => {
      mounted = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [selectState, onStateSelect]);

  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a1132] z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a1132] z-10">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-white text-xl font-semibold mb-2">Failed to Load Map</h3>
            <p className="text-white/70 text-sm mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-[#00d4ff] text-[#0a1132] rounded-lg font-medium hover:bg-[#00b8e6] transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Hover tooltip - adjusted for mobile */}
      {hoveredState && tooltipPosition && !isAnimating.current && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: Math.min(tooltipPosition.x + 15, window.innerWidth - 150),
            top: Math.max(tooltipPosition.y - 35, 10),
          }}
        >
          <div className="bg-[#0f1a34] border border-[#3a4a6a] rounded-lg px-3 md:px-4 py-1.5 md:py-2 shadow-xl">
            <p className="text-white font-medium text-xs md:text-sm">{hoveredState}</p>
            {hoveredState !== 'Florida' && (
              <p className="text-[#8b9dc3] text-[10px] md:text-xs mt-0.5 md:mt-1">Coming Soon!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
