"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapSetup } from '../../hooks/useMapSetup';
import { Loader2, MapPin, X, Hexagon } from 'lucide-react';
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

  const { mapContainer, map, isLoading, error, cities, regions, mapLoaded } = useMapSetup({
    onError: handleMapError
  });

  // Marker and popup state
  const markers = useRef<maplibregl.Marker[]>([]);
  const markerElements = useRef<Map<string, HTMLElement>>(new Map());
  const [popupCityId, setPopupCityId] = useState<string | null>(null);
  const [popupMarkerElement, setPopupMarkerElement] = useState<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const popupCityIdRef = useRef<string | null>(null);

  // Current region and zoom state for UI indicator
  const [currentRegion, setCurrentRegion] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(5);
  const [showRegionIndicator, setShowRegionIndicator] = useState(false);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    popupCityIdRef.current = popupCityId;
  }, [popupCityId]);

  // Track zoom level and determine current region
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    let debounceTimer: NodeJS.Timeout | null = null;

    const updateZoomAndRegion = () => {
      const zoom = mapInstance.getZoom();
      setCurrentZoom(zoom);

      // Show region indicator when zoomed in past threshold
      const shouldShowIndicator = zoom >= REGION_CONFIG.REGION_INDICATOR_ZOOM;
      setShowRegionIndicator(shouldShowIndicator);

      if (shouldShowIndicator && regions.length > 0) {
        // Get map center and bounds
        const center = mapInstance.getCenter();
        const centerPoint: [number, number] = [center.lng, center.lat];
        const bounds = mapInstance.getBounds();

        // First, check if center is inside any region
        let foundRegion: string | null = null;
        for (const region of regions) {
          if (region.geom && isPointInRegion(centerPoint, region.geom)) {
            foundRegion = region.name;
            break;
          }
        }

        // If center is not in any region, find the closest visible region
        if (!foundRegion) {
          let closestRegion: string | null = null;
          let closestDistance = Infinity;

          for (const region of regions) {
            if (!region.geom) continue;

            // Get region centroid and check if it's visible in viewport
            const centroid = getRegionCentroid(region.geom);
            if (centroid && bounds.contains(centroid)) {
              const distance = Math.sqrt(
                Math.pow(centroid[0] - centerPoint[0], 2) +
                Math.pow(centroid[1] - centerPoint[1], 2)
              );
              if (distance < closestDistance) {
                closestDistance = distance;
                closestRegion = region.name;
              }
            }
          }
          foundRegion = closestRegion;
        }

        setCurrentRegion(foundRegion);
      } else {
        setCurrentRegion(null);
      }
    };

    // Debounced update for smooth experience during zooming
    const debouncedUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateZoomAndRegion, 100);
    };

    // Initial update
    updateZoomAndRegion();

    // Listen for zoom end and move end events (not continuous zoom)
    mapInstance.on('zoomend', updateZoomAndRegion);
    mapInstance.on('moveend', updateZoomAndRegion);
    // Also update during zoom but debounced for smoother UX
    mapInstance.on('zoom', debouncedUpdate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      mapInstance.off('zoomend', updateZoomAndRegion);
      mapInstance.off('moveend', updateZoomAndRegion);
      mapInstance.off('zoom', debouncedUpdate);
    };
  }, [map, mapLoaded, regions]);

  // Helper to get centroid of a region geometry
  function getRegionCentroid(geom: any): [number, number] | null {
    let coords: number[][];
    if (geom.type === 'Polygon') {
      coords = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      coords = geom.coordinates[0][0];
    } else {
      return null;
    }

    let sumLng = 0, sumLat = 0;
    for (const coord of coords) {
      sumLng += coord[0];
      sumLat += coord[1];
    }
    return [sumLng / coords.length, sumLat / coords.length];
  }

  // Helper function to check if a point is inside a region polygon
  function isPointInRegion(point: [number, number], geom: any): boolean {
    const [x, y] = point;

    let coordinates: number[][][];
    if (geom.type === 'Polygon') {
      coordinates = [geom.coordinates[0]];
    } else if (geom.type === 'MultiPolygon') {
      coordinates = geom.coordinates.map((poly: number[][][]) => poly[0]);
    } else {
      return false;
    }

    for (const ring of coordinates) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];

        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  // Create city markers when cities data is available and map is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded || cities.length === 0) return;

    console.log('[MARKERS] Creating markers for', cities.length, 'cities');

    // Clear existing markers
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    markerElements.current.clear();

    // Close any open popup
    setPopupCityId(null);
    setPopupMarkerElement(null);

    const currentZoom = map.current.getZoom();
    const initialVisibility = getMarkerVisibility(currentZoom);

    cities.forEach((city) => {
      if (!city.geom || city.geom.type !== 'Point') return;

      const [lng, lat] = city.geom.coordinates;

      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'custom-city-marker';
      el.dataset.cityId = city.id;
      el.style.cssText = `
        cursor: pointer;
        display: ${initialVisibility.visible ? 'flex' : 'none'};
        flex-direction: column;
        align-items: center;
        opacity: ${initialVisibility.opacity};
        transition: opacity 0.4s ease;
        pointer-events: ${initialVisibility.visible ? 'auto' : 'none'};
      `;

      // Create label element
      const labelEl = document.createElement('div');
      labelEl.className = 'marker-label';
      labelEl.style.cssText = `
        white-space: nowrap;
        color: white;
        font-family: 'Open Sans', sans-serif;
        font-size: 16px;
        font-weight: 500;
        text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6);
        pointer-events: none;
        margin-bottom: 4px;
        padding: 2px;
        transition: opacity 0.3s ease, transform 0.15s ease;
        opacity: ${initialVisibility.opacity};
        transform: scale(${getLabelScale(currentZoom)});
        transform-origin: center bottom;
      `;
      labelEl.textContent = city.name;

      // Create marker dot
      const dotEl = document.createElement('div');
      dotEl.className = 'marker-dot';
      dotEl.style.cssText = `
        width: 10px;
        height: 10px;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5);
        transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.4s ease;
        pointer-events: auto;
        cursor: pointer;
      `;

      el.appendChild(labelEl);
      el.appendChild(dotEl);

      // Add click event for popup
      el.addEventListener('click', (e) => {
        e.stopPropagation();

        setPopupCityId(prev => {
          const newPopupId = prev === city.id ? null : city.id;

          // Reset z-index and dot state on previously open marker
          if (prev && prev !== city.id) {
            const prevMarkerEl = markerElements.current.get(prev);
            if (prevMarkerEl) {
              if (prevMarkerEl.parentElement) {
                prevMarkerEl.parentElement.style.zIndex = '';
              }
              // Reset previous marker's dot to normal state
              const prevDot = prevMarkerEl.querySelector('div:last-child') as HTMLElement;
              if (prevDot) {
                prevDot.style.transform = 'scale(1)';
                prevDot.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)';
              }
            }
          }

          if (newPopupId) {
            setPopupMarkerElement(el);
            labelEl.style.display = 'none';
            if (el.parentElement) {
              el.parentElement.style.zIndex = '1000';
            }
            // Keep dot in selected/hovered state
            dotEl.style.transform = 'scale(1.3)';
            dotEl.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.6)';
          } else {
            setPopupMarkerElement(null);
            if (map.current) {
              const zoom = map.current.getZoom();
              labelEl.style.opacity = `${getLabelOpacity(zoom)}`;
            }
            labelEl.style.display = 'block';
            if (el.parentElement) {
              el.parentElement.style.zIndex = '';
            }
            // Reset dot to normal state
            dotEl.style.transform = 'scale(1)';
            dotEl.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)';
          }

          return newPopupId;
        });
      });

      // Hover effects - only on the dot, not the label
      dotEl.addEventListener('mouseenter', () => {
        dotEl.style.transform = 'scale(1.3)';
        dotEl.style.boxShadow = '0 0 0 3px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.6)';
      });

      dotEl.addEventListener('mouseleave', () => {
        dotEl.style.transform = 'scale(1)';
        dotEl.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)';
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      markers.current.push(marker);
      markerElements.current.set(city.id, el);
    });

    // Capture map instance for cleanup
    const mapInstance = map.current;

    // Update marker visibility, label opacity and scale on zoom
    const handleZoom = () => {
      if (!mapInstance) return;
      const zoom = mapInstance.getZoom();
      const visibility = getMarkerVisibility(zoom);
      const scale = getLabelScale(zoom);

      markerElements.current.forEach((el, cityId) => {
        // Show/hide markers based on zoom level
        el.style.display = visibility.visible ? 'flex' : 'none';
        el.style.opacity = `${visibility.opacity}`;
        el.style.pointerEvents = visibility.visible ? 'auto' : 'none';

        const label = el.querySelector('.marker-label') as HTMLElement;
        // Use ref to get current popupCityId without triggering effect re-run
        if (label && cityId !== popupCityIdRef.current) {
          label.style.opacity = `${visibility.opacity}`;
          label.style.transform = `scale(${scale})`;
        }
      });
    };

    mapInstance.on('zoom', handleZoom);

    return () => {
      mapInstance.off('zoom', handleZoom);
    };
  }, [cities, mapLoaded, map]);

  // Update connecting line position
  useEffect(() => {
    if (!popupCityId || !popupMarkerElement || !lineRef.current || !mapContainer.current) return;

    // Capture refs for use in callbacks
    const containerRef = mapContainer.current;
    const mapInstance = map.current;

    const updateLine = () => {
      requestAnimationFrame(() => {
        const container = containerRef?.getBoundingClientRect();
        const marker = popupMarkerElement?.getBoundingClientRect();
        const popup = popupRef.current?.getBoundingClientRect();
        const line = lineRef.current;

        if (!container || !marker || !popup || !line) return;

        const centerX = marker.left - container.left + marker.width / 2;
        const lineStartY = popup.bottom - container.top;
        const lineEndY = marker.top - container.top;

        line.setAttribute("x1", centerX.toString());
        line.setAttribute("y1", lineStartY.toString());
        line.setAttribute("x2", centerX.toString());
        line.setAttribute("y2", lineEndY.toString());
      });
    };

    updateLine();

    if (mapInstance) {
      mapInstance.on('move', updateLine);
      mapInstance.on('zoom', updateLine);
    }

    return () => {
      if (mapInstance) {
        mapInstance.off('move', updateLine);
        mapInstance.off('zoom', updateLine);
      }
    };
  }, [popupCityId, popupMarkerElement, map, mapContainer]);

  // Close popup when clicking on map
  useEffect(() => {
    if (!popupCityId) return;

    // Capture map instance for cleanup
    const mapInstance = map.current;

    const handleMapClick = () => {
      if (popupMarkerElement && mapInstance) {
        const label = popupMarkerElement.querySelector('.marker-label') as HTMLElement;
        if (label) {
          const zoom = mapInstance.getZoom();
          label.style.opacity = `${getLabelOpacity(zoom)}`;
          label.style.display = 'block';
        }
        // Reset dot to normal state
        const dot = popupMarkerElement.querySelector('div:last-child') as HTMLElement;
        if (dot) {
          dot.style.transform = 'scale(1)';
          dot.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)';
        }
        if (popupMarkerElement.parentElement) {
          popupMarkerElement.parentElement.style.zIndex = '';
        }
      }
      setPopupCityId(null);
      setPopupMarkerElement(null);
    };

    if (mapInstance) {
      mapInstance.on('click', handleMapClick);
    }

    return () => {
      if (mapInstance) {
        mapInstance.off('click', handleMapClick);
      }
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
        .popup-enter {
          animation: popupEnter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .city-popup {
          width: min(80vw, 280px);
        }
        @media (max-width: 640px) {
          .city-popup {
            width: min(75vw, 240px);
          }
          .city-popup .popup-image {
            height: 90px;
          }
          .city-popup .popup-content {
            padding: 0.5rem;
          }
        }
      `}</style>

      {/* Region Indicator - Attached to top center */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ease-out ${
          showRegionIndicator && currentRegion
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="bg-background/95 backdrop-blur-sm px-5 py-2.5 rounded-b-lg shadow-lg border-x border-b border-primary/40 flex items-center gap-2">
          <Hexagon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-white tracking-wide">
            {currentRegion}
          </span>
        </div>
      </div>

      {/* Map Container */}
      <div className="absolute inset-0">
        <div
          ref={mapContainer}
          className="w-full h-full"
        />

        {/* Connecting Line */}
        {popupCityId && (
          <svg
            className="absolute inset-0 pointer-events-none z-20"
            style={{ width: "100%", height: "100%" }}
          >
            <line
              ref={lineRef}
              stroke="#8ce3ff"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              opacity="0.7"
            />
          </svg>
        )}

        {/* Popup Card */}
        {popupCity && popupMarkerElement && createPortal(
          <div
            ref={popupRef}
            className="absolute pointer-events-auto popup-enter city-popup"
            style={{
              bottom: '50px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
            }}
          >
            <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl border border-white/10">
              {/* Image */}
              <div className="popup-image relative h-28 overflow-hidden">
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
                    if (popupMarkerElement && map.current) {
                      const label = popupMarkerElement.querySelector('.marker-label') as HTMLElement;
                      if (label) {
                        const zoom = map.current.getZoom();
                        label.style.opacity = `${getLabelOpacity(zoom)}`;
                        label.style.display = 'block';
                      }
                      // Reset dot to normal state
                      const dot = popupMarkerElement.querySelector('div:last-child') as HTMLElement;
                      if (dot) {
                        dot.style.transform = 'scale(1)';
                        dot.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5)';
                      }
                      if (popupMarkerElement.parentElement) {
                        popupMarkerElement.parentElement.style.zIndex = '';
                      }
                    }
                    setPopupCityId(null);
                    setPopupMarkerElement(null);
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 backdrop-blur-sm flex items-center justify-center hover:bg-slate-900 transition-colors border border-white/10"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>

              {/* Content */}
              <div className="popup-content p-2.5 space-y-2">
                {/* Location Name */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                  <h3 className="text-xs font-semibold text-white">
                    {popupCity.name}, Florida
                  </h3>
                </div>

                {/* Add to Preferences Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const checkbox = e.currentTarget.querySelector('.preference-checkbox') as HTMLElement;
                    if (checkbox) {
                      const isChecked = checkbox.dataset.checked === 'true';
                      checkbox.dataset.checked = (!isChecked).toString();
                      checkbox.innerHTML = !isChecked ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-white"><path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clip-rule="evenodd" /></svg>' : '';
                      checkbox.style.backgroundColor = !isChecked ? '#0d9488' : 'transparent';
                      checkbox.style.borderColor = !isChecked ? '#0d9488' : 'rgba(255, 255, 255, 0.5)';
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-200 hover:bg-white/5"
                  style={{ backgroundColor: 'rgba(30, 70, 90, 0.5)' }}
                >
                  <div
                    className="preference-checkbox w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    data-checked="false"
                    style={{ border: '2px solid rgba(255, 255, 255, 0.5)' }}
                  />
                  <span className="text-xs text-white/80">
                    Add to preferences
                  </span>
                </button>
              </div>
            </div>
          </div>,
          popupMarkerElement
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
