"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";

interface RegionsMapProps {
  regions: any[];
  selectedRegionId?: string | null;
  sheetOpen?: boolean;
}


export default function RegionsMap({ regions, selectedRegionId, sheetOpen = true }: RegionsMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const layersAdded = useRef(false);
  const initialBoundsFitted = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Calculate initial bounds if we have regions
    let initialCenter = MAP_CONFIG.INITIAL_CENTER;
    let initialZoom = MAP_CONFIG.INITIAL_ZOOM;

    // Initialize map with better starting position
    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: getMapTilerStyleURL(),
      center: initialCenter,
      zoom: initialZoom,
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

      // Mark map as loaded and ready
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

  // Update regions when they change
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !mapLoaded) return;

    if (regions.length === 0) {
      // Remove layers if no regions
      if (layersAdded.current) {
        if (map.current.getLayer("regions-fill")) map.current.removeLayer("regions-fill");
        if (map.current.getLayer("regions-outline")) map.current.removeLayer("regions-outline");
        if (map.current.getSource("regions")) map.current.removeSource("regions");
        layersAdded.current = false;
      }
      return;
    }

    const geojsonFeatures = regions.map((region) => ({
      type: "Feature",
      properties: {
        name: region.name,
        id: region.id,
      },
      geometry: region.geom,
    }));

    const geojsonData = {
      type: "FeatureCollection",
      features: geojsonFeatures,
    };

    // If source exists, just update the data (smoother, no flicker)
    const source = map.current.getSource("regions") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojsonData as any);
      return;
    }

    // First time: Add source and layers
    map.current.addSource("regions", {
      type: "geojson",
      data: geojsonData as any,
    });

    map.current.addLayer({
      id: "regions-fill",
      type: "fill",
      source: "regions",
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "id"], selectedRegionId || ""],
          "#10b981", // Green for selected
          "#4a9eff"  // Blue for non-selected
        ],
        "fill-opacity": [
          "case",
          ["==", ["get", "id"], selectedRegionId || ""],
          0.5, // More opaque for selected
          0.3  // Less opaque for non-selected
        ],
      },
    });

    map.current.addLayer({
      id: "regions-outline",
      type: "line",
      source: "regions",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "id"], selectedRegionId || ""],
          "#059669", // Darker green for selected
          "#76c8fe"  // Light blue for non-selected
        ],
        "line-width": [
          "case",
          ["==", ["get", "id"], selectedRegionId || ""],
          2, // Selected
          1  // Normal for non-selected
        ],
      },
    });

    layersAdded.current = true;

    // Fit map to bounds of all regions on first load only
    if (!initialBoundsFitted.current) {
      try {
        const bounds = new maplibregl.LngLatBounds();
        geojsonFeatures.forEach(feature => {
          if (feature.geometry.type === "Polygon") {
            feature.geometry.coordinates[0].forEach((coord: number[]) => {
              bounds.extend(coord as [number, number]);
            });
          } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon[0].forEach((coord: number[]) => {
                bounds.extend(coord as [number, number]);
              });
            });
          }
        });

        if (!bounds.isEmpty() && map.current) {
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
          // Shift down and left by reducing left padding and increasing top padding
          const leftPadding = visibleWidth * 0.05; // 5% padding (reduced to shift left)
          const rightPadding = visibleWidth * 0.15; // More padding on right
          const topPadding = visibleHeight * 0.15; // 15% padding (increased to shift down)
          const bottomPadding = tableHeight + (visibleHeight * 0.05); // Table height + less bottom padding

          map.current.fitBounds(bounds, {
            padding: {
              top: topPadding,
              bottom: bottomPadding,
              left: leftPadding,
              right: rightPadding
            },
            duration: 0,
            maxZoom: 9
          });
          initialBoundsFitted.current = true;
        }
      } catch (err) {
        console.error("Error fitting bounds:", err);
      }
    }

    // Add hover effect (only once)
    map.current.on("mouseenter", "regions-fill", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "pointer";
      }
    });

    map.current.on("mouseleave", "regions-fill", () => {
      if (map.current) {
        map.current.getCanvas().style.cursor = "";
      }
    });

    // Add click event to show region info (only once)
    map.current.on("click", "regions-fill", (e) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const coordinates = e.lngLat;

      new maplibregl.Popup()
        .setLngLat(coordinates)
        .setHTML(
          `<div style="color: #000; padding: 8px;">
            <h3 style="margin: 0 0 4px 0; font-weight: bold;">${feature.properties.name}</h3>
          </div>`
        )
        .addTo(map.current!);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, sheetOpen, mapLoaded]);

  // Handle region selection - zoom to selected region and update colors
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !mapLoaded) return;

    // Update paint properties for fill and outline layers
    if (map.current.getLayer("regions-fill")) {
      map.current.setPaintProperty("regions-fill", "fill-color", [
        "case",
        ["==", ["get", "id"], selectedRegionId || ""],
        "#10b981", // Green for selected
        "#4a9eff"  // Blue for non-selected
      ]);

      map.current.setPaintProperty("regions-fill", "fill-opacity", [
        "case",
        ["==", ["get", "id"], selectedRegionId || ""],
        0.5, // More opaque for selected
        0.3  // Less opaque for non-selected
      ]);
    }

    if (map.current.getLayer("regions-outline")) {
      map.current.setPaintProperty("regions-outline", "line-color", [
        "case",
        ["==", ["get", "id"], selectedRegionId || ""],
        "#059669", // Darker green for selected
        "#76c8fe"  // Light blue for non-selected
      ]);

      map.current.setPaintProperty("regions-outline", "line-width", [
        "case",
        ["==", ["get", "id"], selectedRegionId || ""],
        2, // Selected
        1  // Normal for non-selected
      ]);
    }

    // Zoom to selected region
    if (selectedRegionId && regions.length > 0) {
      const selectedRegion = regions.find(r => r.id === selectedRegionId);
      if (selectedRegion && selectedRegion.geom) {
        try {
          const bounds = new maplibregl.LngLatBounds();
          const geometry = selectedRegion.geom;

          if (geometry.type === "Polygon") {
            geometry.coordinates[0].forEach((coord: number[]) => {
              bounds.extend(coord as [number, number]);
            });
          } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon[0].forEach((coord: number[]) => {
                bounds.extend(coord as [number, number]);
              });
            });
          }

          if (!bounds.isEmpty()) {
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            const isLargeScreen = windowWidth >= 1024; // lg breakpoint
            const tableHeightPercent = isLargeScreen ? 0.45 : 0.35; // 45vh desktop, 35vh mobile
            const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;
            const sidebarWidth = isLargeScreen ? 256 : 0;

            const visibleWidth = windowWidth - sidebarWidth;
            const visibleHeight = windowHeight - tableHeight;

            const leftPadding = visibleWidth * 0.1; // 10% padding for zoom
            const rightPadding = visibleWidth * 0.2; // More padding on right
            const topPadding = visibleHeight * 0.1;
            const bottomPadding = tableHeight + (visibleHeight * 0.2); // Table height + padding

            map.current.fitBounds(bounds, {
              padding: {
                top: topPadding,
                bottom: bottomPadding, // Add extra for the table
                left: leftPadding,
                right: rightPadding
              },
              duration: 800,
              maxZoom: 10
            });
          }
        } catch (err) {
          console.error("Error zooming to region:", err);
        }
      }
    }
  }, [selectedRegionId, regions, sheetOpen, mapLoaded]);

  // Re-fit bounds when table opens/closes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded() || !mapLoaded || regions.length === 0) return;

    // Wait a bit for the animation to complete
    const timer = setTimeout(() => {
      try {
        const bounds = new maplibregl.LngLatBounds();

        regions.forEach((region) => {
          const geometry = region.geom;
          if (geometry.type === "Polygon") {
            geometry.coordinates[0].forEach((coord: number[]) => {
              bounds.extend(coord as [number, number]);
            });
          } else if (geometry.type === "MultiPolygon") {
            geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon[0].forEach((coord: number[]) => {
                bounds.extend(coord as [number, number]);
              });
            });
          }
        });

        if (!bounds.isEmpty() && map.current) {
          const windowHeight = window.innerHeight;
          const windowWidth = window.innerWidth;
          const isLargeScreen = windowWidth >= 1024;
          const tableHeightPercent = isLargeScreen ? 0.45 : 0.35; // 45vh desktop, 35vh mobile
          const tableHeight = sheetOpen ? windowHeight * tableHeightPercent : 0;
          const sidebarWidth = isLargeScreen ? 256 : 0;

          const visibleWidth = windowWidth - sidebarWidth;
          const visibleHeight = windowHeight - tableHeight;

          const leftPadding = visibleWidth * 0.05;
          const rightPadding = visibleWidth * 0.15;
          const topPadding = visibleHeight * 0.15;
          const bottomPadding = tableHeight + (visibleHeight * 0.05);

          map.current.fitBounds(bounds, {
            padding: {
              top: topPadding,
              bottom: bottomPadding,
              left: leftPadding,
              right: rightPadding
            },
            duration: 600, // Smooth animation
            maxZoom: 9
          });
        }
      } catch (err) {
        console.error("Error re-fitting bounds:", err);
      }
    }, 300); // Wait for sheet animation to complete

    return () => clearTimeout(timer);
  }, [sheetOpen, regions, mapLoaded]);

  return (
    <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
  );
}
