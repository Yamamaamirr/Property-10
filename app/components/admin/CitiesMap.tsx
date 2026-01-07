"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, X } from "lucide-react";
import Image from "next/image";
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
  const markers = useRef<maplibregl.Marker[]>([]);
  const markerElements = useRef<Map<string, HTMLElement>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const initialBoundsFitted = useRef(false); // Track if initial bounds have been set
  const lastSelectedId = useRef<string | null | undefined>(undefined); // Track last selection to detect changes

  // Store onCityClick in a ref to avoid recreating markers when callback changes
  const onCityClickRef = useRef(onCityClick);
  onCityClickRef.current = onCityClick;

  // Popup state
  const [popupCityId, setPopupCityId] = useState<string | null>(null);
  const [popupMarkerElement, setPopupMarkerElement] = useState<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);

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
      pitch: 0, // Start flat
      maxPitch: 45, // Allow subtle tilt for city view
      attributionControl: false,
    });

    map.current = mapInstance;

    // Add pitch based on zoom level for better visual effect
    const getTargetPitch = (zoom: number) => zoom > 11 ? Math.min(45, (zoom - 11) * 15) : 0;

    // On desktop (non-touch), update pitch in real-time during zoom
    // On mobile, update pitch only when map becomes idle to avoid interrupting gestures
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
      // Mobile: update pitch when map is idle (after all interactions complete)
      mapInstance.on('idle', () => {
        const zoom = mapInstance.getZoom();
        const targetPitch = getTargetPitch(zoom);
        const currentPitch = mapInstance.getPitch();
        if (Math.abs(targetPitch - currentPitch) > 0.5) {
          mapInstance.easeTo({ pitch: targetPitch, duration: 300 });
        }
      });
    } else {
      // Desktop: real-time pitch updates during zoom
      mapInstance.on('zoom', () => {
        const zoom = mapInstance.getZoom();
        const targetPitch = getTargetPitch(zoom);
        mapInstance.setPitch(targetPitch);
      });
    }

    mapInstance.on("load", async () => {
      try {
        // Load Florida boundary to create mask (hide everything outside Florida)
        const response = await fetch('/fl-state.geojson');
        if (response.ok) {
          const floridaBoundary = await response.json();
          const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
          const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

          // Add dark mask layer to hide areas outside Florida
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
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Function to calculate font size based on zoom with smooth interpolation
  const getFontSize = (zoom: number) => {
    // Smooth interpolation between zoom levels
    if (zoom < 7) return 16;
    if (zoom < 9) {
      // Linear interpolation between 16px at zoom 7 and 18px at zoom 9
      return 16 + ((zoom - 7) / 2) * 2;
    }
    if (zoom < 11) {
      // Linear interpolation between 18px at zoom 9 and 20px at zoom 11
      return 18 + ((zoom - 9) / 2) * 2;
    }
    return 20;
  };

  // Function to calculate label opacity based on zoom
  // Labels start to appear at zoom 7 and are fully visible at zoom 8
  const getLabelOpacity = (zoom: number) => {
    if (zoom < 7) return 0;
    if (zoom < 8) {
      // Linear interpolation from 0 to 1 between zoom 7 and 8
      return zoom - 7;
    }
    return 1;
  };

  // Create city markers when cities change (NOT on selection change)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers and elements
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    markerElements.current.clear();

    // Close any open popup since markers are being recreated
    setPopupCityId(null);
    setPopupMarkerElement(null);

    if (cities.length === 0) return;

    const currentZoom = map.current.getZoom();

    // Add new markers
    cities.forEach((city) => {
      // Parse the geometry to get coordinates
      if (!city.geom || city.geom.type !== "Point") {
        console.warn(`City ${city.name} has invalid or missing geometry`);
        return;
      }

      const [lng, lat] = city.geom.coordinates;

      // Create custom marker element with label
      const el = document.createElement('div');
      el.className = 'custom-city-marker';
      el.dataset.cityId = city.id; // Store city ID for selection updates
      el.style.cssText = `
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
      `;

      // Create label element
      const labelEl = document.createElement('div');
      labelEl.className = 'marker-label';
      const initialOpacity = getLabelOpacity(currentZoom);
      labelEl.style.cssText = `
        white-space: nowrap;
        color: white;
        font-family: 'Open Sans', sans-serif;
        font-size: ${getFontSize(currentZoom)}px;
        font-weight: 500;
        text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6);
        pointer-events: none;
        margin-bottom: 3px;
        padding: 2px;
        transition: color 0.2s ease, font-weight 0.2s ease, opacity 0.3s ease;
        opacity: ${initialOpacity};
      `;
      labelEl.textContent = city.name;

      // Create dot element
      const dotEl = document.createElement('div');
      dotEl.className = 'marker-dot';
      dotEl.style.cssText = `
        width: 8px;
        height: 8px;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5);
        transition: all 0.2s ease;
      `;

      el.appendChild(labelEl);
      el.appendChild(dotEl);

      // Add click event - toggle popup on click (does NOT select/highlight marker)
      el.addEventListener('click', (e) => {
        e.stopPropagation();

        // Toggle popup for this city
        setPopupCityId(prev => {
          const newPopupId = prev === city.id ? null : city.id;

          // Reset z-index on previously open marker's wrapper
          if (prev && prev !== city.id) {
            const prevMarkerEl = markerElements.current.get(prev);
            if (prevMarkerEl?.parentElement) {
              prevMarkerEl.parentElement.style.zIndex = '';
            }
          }

          // Update marker element for popup portal
          if (newPopupId) {
            setPopupMarkerElement(el);
            // Hide label when popup is shown
            labelEl.style.display = 'none';
            // Raise MapLibre marker wrapper z-index so popup appears above other markers
            if (el.parentElement) {
              el.parentElement.style.zIndex = '1000';
            }
          } else {
            setPopupMarkerElement(null);
            // Show label when popup is hidden with correct opacity
            if (map.current) {
              const currentZoom = map.current.getZoom();
              labelEl.style.opacity = `${getLabelOpacity(currentZoom)}`;
            }
            labelEl.style.display = 'block';
            // Reset MapLibre marker wrapper z-index
            if (el.parentElement) {
              el.parentElement.style.zIndex = '';
            }
          }

          return newPopupId;
        });

        // Note: We do NOT call onCityClick here - marker selection only happens from table row clicks
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

    // Update all marker label sizes and opacity on zoom
    const handleZoom = () => {
      const zoom = map.current!.getZoom();
      const fontSize = getFontSize(zoom);
      const opacity = getLabelOpacity(zoom);

      markers.current.forEach((marker) => {
        const element = marker.getElement();
        const label = element?.querySelector('.marker-label') as HTMLElement;
        if (label) {
          label.style.fontSize = `${fontSize}px`;
          // Only set opacity if not currently showing popup (popup hides label via display:none)
          if (label.style.display !== 'none') {
            label.style.opacity = `${opacity}`;
          }
        }
      });
    };

    map.current.on('zoom', handleZoom);

    // Fit bounds to show Florida state ONLY on initial load
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

      map.current.fitBounds(FLORIDA_BOUNDS, {
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
      if (map.current) {
        map.current.off('zoom', handleZoom);
      }
    };
    // Note: onCityClick is intentionally NOT in deps - we use onCityClickRef to avoid marker recreation
  }, [cities, mapLoaded, sheetOpen]);

  // Update marker styling when selection changes (without recreating markers)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Update all marker styles based on selection
    markerElements.current.forEach((el, cityId) => {
      const isSelected = cityId === selectedCityId;
      const label = el.querySelector('.marker-label') as HTMLElement;
      const dot = el.querySelector('.marker-dot') as HTMLElement;

      if (label && label.style.display !== 'none') {
        label.style.color = isSelected ? '#4a9eff' : 'white';
        label.style.fontWeight = isSelected ? '600' : '500';
      }

      if (dot) {
        dot.style.width = isSelected ? '12px' : '8px';
        dot.style.height = isSelected ? '12px' : '8px';
        dot.style.backgroundColor = isSelected ? '#4a9eff' : 'white';
      }
    });

    // Fly to selected city when selection changes
    const selectionChanged = selectedCityId !== lastSelectedId.current;
    lastSelectedId.current = selectedCityId;

    if (selectionChanged && selectedCityId) {
      const selectedCity = cities.find(c => c.id === selectedCityId);
      if (selectedCity && selectedCity.geom) {
        const [lng, lat] = selectedCity.geom.coordinates;

        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const isLargeScreen = windowWidth >= 1024;
        const tableHeightPercent = isLargeScreen ? 0.45 : 0.35;
        const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;
        const visibleWidth = windowWidth;
        const visibleHeight = windowHeight - tableHeight;

        // Padding for city view
        const leftPadding = visibleWidth * 0.1;
        const rightPadding = visibleWidth * 0.2;
        const topPadding = visibleHeight * 0.1;
        const bottomPadding = tableHeight + (visibleHeight * 0.2);

        // Fly to selected city - zoom level 12+ triggers automatic tilt
        map.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          duration: 1000,
          padding: {
            top: topPadding,
            bottom: bottomPadding,
            left: leftPadding,
            right: rightPadding
          }
        });
      }
    }
  }, [selectedCityId, cities, mapLoaded, sheetOpen]);

  // Update connecting line position between popup and marker
  useEffect(() => {
    if (!popupCityId || !popupMarkerElement || !lineRef.current || !mapContainer.current) {
      return;
    }

    const updateLine = () => {
      requestAnimationFrame(() => {
        const container = mapContainer.current?.getBoundingClientRect();
        const marker = popupMarkerElement?.getBoundingClientRect();
        const popup = popupRef.current?.getBoundingClientRect();
        const line = lineRef.current;

        if (!container || !marker || !popup || !line) return;

        const centerX = marker.left - container.left + marker.width / 2;

        // Popup is always above marker: line goes from popup bottom to marker top
        const lineStartY = popup.bottom - container.top;
        const lineEndY = marker.top - container.top;

        line.setAttribute("x1", centerX.toString());
        line.setAttribute("y1", lineStartY.toString());
        line.setAttribute("x2", centerX.toString());
        line.setAttribute("y2", lineEndY.toString());
      });
    };

    // Initial line update
    updateLine();

    // Update line during map movement
    const mapInstance = map.current;

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
  }, [popupCityId, popupMarkerElement]);

  // Close popup when clicking outside
  useEffect(() => {
    if (!popupCityId) return;

    const handleMapClick = () => {
      // Restore label visibility with correct opacity and reset wrapper z-index
      if (popupMarkerElement && map.current) {
        const label = popupMarkerElement.querySelector('.marker-label') as HTMLElement;
        if (label) {
          const currentZoom = map.current.getZoom();
          label.style.opacity = `${getLabelOpacity(currentZoom)}`;
          label.style.display = 'block';
        }
        // Reset MapLibre marker wrapper z-index
        if (popupMarkerElement.parentElement) {
          popupMarkerElement.parentElement.style.zIndex = '';
        }
      }
      setPopupCityId(null);
      setPopupMarkerElement(null);
    };

    const mapInstance = map.current;
    if (mapInstance) {
      mapInstance.on('click', handleMapClick);
    }

    return () => {
      if (mapInstance) {
        mapInstance.off('click', handleMapClick);
      }
    };
  }, [popupCityId, popupMarkerElement]);

  // Get the city data for popup
  const popupCity = popupCityId ? cities.find(c => c.id === popupCityId) : null;

  return (
    <div className="absolute inset-0 w-full h-full">
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
      `}</style>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

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

      {/* Popup Card - rendered via Portal inside marker element */}
      {popupCity && popupMarkerElement && createPortal(
        <div
          ref={popupRef}
          className="absolute pointer-events-auto popup-enter"
          style={{
            bottom: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(85vw, 240px)',
            zIndex: 9999,
          }}
        >
          <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl border border-white/10">
            {/* Image */}
            <div className="relative h-24 overflow-hidden">
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
                  // Restore label visibility with correct opacity and reset wrapper z-index
                  if (popupMarkerElement && map.current) {
                    const label = popupMarkerElement.querySelector('.marker-label') as HTMLElement;
                    if (label) {
                      const currentZoom = map.current.getZoom();
                      label.style.opacity = `${getLabelOpacity(currentZoom)}`;
                      label.style.display = 'block';
                    }
                    // Reset MapLibre marker wrapper z-index
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
            <div className="p-3 space-y-3">
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
                  // Toggle preference - for now just visual feedback
                  const checkbox = e.currentTarget.querySelector('.preference-checkbox') as HTMLElement;
                  if (checkbox) {
                    const isChecked = checkbox.dataset.checked === 'true';
                    checkbox.dataset.checked = (!isChecked).toString();
                    checkbox.innerHTML = !isChecked ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-white"><path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clip-rule="evenodd" /></svg>' : '';
                    checkbox.style.backgroundColor = !isChecked ? '#0d9488' : 'transparent';
                    checkbox.style.borderColor = !isChecked ? '#0d9488' : 'rgba(255, 255, 255, 0.5)';
                  }
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-white/5"
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
    </div>
  );
}
