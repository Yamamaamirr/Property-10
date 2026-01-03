"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";

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
  const [mapLoaded, setMapLoaded] = useState(false);

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
      attributionControl: false,
    });

    map.current = mapInstance;

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

  // Update city markers when cities change
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

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
      el.style.cssText = `
        position: relative;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
      `;

      // Create label element
      const labelEl = document.createElement('div');
      labelEl.className = 'marker-label';
      const isSelected = city.id === selectedCityId;
      labelEl.style.cssText = `
        white-space: nowrap;
        color: ${isSelected ? '#4a9eff' : 'white'};
        font-family: 'Open Sans', sans-serif;
        font-size: ${getFontSize(currentZoom)}px;
        font-weight: ${isSelected ? '600' : '500'};
        text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6);
        pointer-events: none;
        margin-bottom: 3px;
        padding: 2px;
        transition: all 0.2s ease;
      `;
      labelEl.textContent = city.name;

      // Create dot element
      const dotEl = document.createElement('div');
      dotEl.className = 'marker-dot';
      dotEl.style.cssText = `
        width: ${isSelected ? '12px' : '8px'};
        height: ${isSelected ? '12px' : '8px'};
        background-color: ${isSelected ? '#4a9eff' : 'white'};
        border-radius: 50%;
        box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5);
        transition: all 0.2s ease;
      `;

      el.appendChild(labelEl);
      el.appendChild(dotEl);

      // Add click event
      el.addEventListener('click', () => {
        if (onCityClick) {
          onCityClick(city.id);
        }
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([lng, lat])
        .addTo(map.current!);

      markers.current.push(marker);
    });

    // Update all marker label sizes on zoom
    const handleZoom = () => {
      const zoom = map.current!.getZoom();
      const fontSize = getFontSize(zoom);

      markers.current.forEach((marker) => {
        const element = marker.getElement();
        const label = element?.querySelector('.marker-label') as HTMLElement;
        if (label) {
          label.style.fontSize = `${fontSize}px`;
        }
      });
    };

    map.current.on('zoom', handleZoom);

    // Fit bounds to show all markers on initial load
    if (cities.length > 0 && !selectedCityId) {
      const bounds = new maplibregl.LngLatBounds();
      cities.forEach((city) => {
        if (city.geom && city.geom.type === "Point") {
          bounds.extend(city.geom.coordinates as [number, number]);
        }
      });

      if (!bounds.isEmpty()) {
        // Account for UI elements:
        // - Left sidebar: 256px on large screens (lg breakpoint)
        // - Bottom table: 35vh on mobile, 45vh on desktop (if open)
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const isLargeScreen = windowWidth >= 1024; // lg breakpoint
        const tableHeightPercent = isLargeScreen ? 0.45 : 0.35; // 45vh desktop, 35vh mobile
        const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;
        const sidebarWidth = isLargeScreen ? 256 : 0;

        // Calculate the actual visible area
        const visibleWidth = windowWidth - sidebarWidth;
        const visibleHeight = windowHeight - tableHeight;

        // Use proportional padding based on visible area
        const leftPadding = visibleWidth * 0.05; // 5% padding
        const rightPadding = visibleWidth * 0.15; // More padding on right
        const topPadding = visibleHeight * 0.15; // 15% padding
        const bottomPadding = tableHeight + (visibleHeight * 0.05); // Table height + padding

        map.current.fitBounds(bounds, {
          padding: {
            top: topPadding,
            bottom: bottomPadding,
            left: leftPadding,
            right: rightPadding
          },
          duration: 1000
        });
      }
    }

    return () => {
      if (map.current) {
        map.current.off('zoom', handleZoom);
      }
    };
  }, [cities, onCityClick, selectedCityId, mapLoaded, sheetOpen]);

  // Zoom to selected city
  useEffect(() => {
    if (!map.current || !selectedCityId) return;

    const selectedCity = cities.find(c => c.id === selectedCityId);
    if (!selectedCity || !selectedCity.geom) return;

    const [lng, lat] = selectedCity.geom.coordinates;

    // Account for UI elements:
    // - Left sidebar: 256px on large screens (lg breakpoint)
    // - Bottom table: 35vh on mobile, 45vh on desktop (if open)
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const isLargeScreen = windowWidth >= 1024; // lg breakpoint
    const tableHeightPercent = isLargeScreen ? 0.45 : 0.35; // 45vh desktop, 35vh mobile
    const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;

    // Offset the center point upward so the marker appears above the table
    const point = map.current.project([lng, lat]);
    const offsetCenter = map.current.unproject([point.x, point.y - (tableHeight / 2)]);

    map.current.flyTo({
      center: [offsetCenter.lng, offsetCenter.lat],
      zoom: 12,
      duration: 1000
    });
  }, [selectedCityId, cities, sheetOpen]);

  return (
    <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
  );
}
