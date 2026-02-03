"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin, Trash2, Pencil, Plus, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import Image from "next/image";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import type { City, Region } from "@/app/lib/types";
import {
  fetchCities as loadCities,
  updateCity,
  deleteCity,
} from "@/app/lib/api/cities";
import { fetchRegions as loadRegions } from "@/app/lib/api/regions";
import { supabase } from "@/app/lib/supabase";
import CitiesMap from "@/app/components/admin/CitiesMap";
import { PlacesSearch } from "@/app/components/admin/PlacesSearch";
import { ImageUpload } from "@/app/components/admin/ImageUpload";
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";
import { toast } from "sonner";

/**
 * Normalize longitude for Florida - converts positive values to negative
 * Florida longitudes are in the range -79.5 to -87.5 (West)
 * Users often enter positive values like 80.1373 when they mean -80.1373
 */
function normalizeFloridaLongitude(lng: number): number {
  // If longitude is positive and in Florida's range (79-88), make it negative
  if (lng > 0 && lng >= 79 && lng <= 88) {
    return -lng;
  }
  return lng;
}

export default function CitiesPage() {
  const [cities, setCities] = useState<City[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  // Form state for new city
  const [newCity, setNewCity] = useState({
    name: "",
    region_id: "",
    image_url: "",
  });

  // Selected place from search
  const [selectedPlace, setSelectedPlace] = useState<{ lng: number; lat: number } | null>(null);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: "",
    name: "",
  });

  // Map preview refs for add dialog
  const previewMapContainer = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<maplibregl.Map | null>(null);
  const previewDraggableMarker = useRef<maplibregl.Marker | null>(null);
  const [previewMapInitialized, setPreviewMapInitialized] = useState(false);
  const [markerPlaced, setMarkerPlaced] = useState(false);

  // Popup preview state
  const [popupOpen, setPopupOpen] = useState(false);
  const popupOpenRef = useRef(false);
  const [markerElement, setMarkerElement] = useState<HTMLElement | null>(null);
  const markerElementRef = useRef<HTMLElement | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Map preview refs for edit dialog
  const editMapContainer = useRef<HTMLDivElement>(null);
  const editMapRef = useRef<maplibregl.Map | null>(null);
  const editDraggableMarker = useRef<maplibregl.Marker | null>(null);
  const [editMapInitialized, setEditMapInitialized] = useState(false);
  const [editMarkerPlaced, setEditMarkerPlaced] = useState(false);

  // Popup preview state for edit dialog
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const editPopupOpenRef = useRef(false);
  const [editMarkerElement, setEditMarkerElement] = useState<HTMLElement | null>(null);
  const editMarkerElementRef = useRef<HTMLElement | null>(null);
  const editPopupRef = useRef<HTMLDivElement>(null);

  // Keep popup refs in sync with state
  useEffect(() => {
    popupOpenRef.current = popupOpen;
  }, [popupOpen]);

  useEffect(() => {
    editPopupOpenRef.current = editPopupOpen;
  }, [editPopupOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [citiesData, regionsData] = await Promise.all([
        loadCities(),
        loadRegions(),
      ]);
      setCities(citiesData);
      setRegions(regionsData);
    } catch (err) {
      console.error("Error loading data:", err);
      toast.error("Unable to load cities. Please refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set default region when regions are loaded
  useEffect(() => {
    if (regions.length > 0 && !newCity.region_id) {
      setNewCity((prev) => ({ ...prev, region_id: regions[0].id }));
    }
  }, [regions, newCity.region_id]);

  // Check for query params to auto-open add dialog with pre-selected region
  useEffect(() => {
    if (typeof window === 'undefined' || regions.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const shouldAdd = params.get('add');
    const regionId = params.get('region');

    if (shouldAdd === 'true' && regionId) {
      setNewCity((prev) => ({ ...prev, region_id: regionId }));
      setAddDialogOpen(true);
      // Clean up URL
      window.history.replaceState({}, '', '/admin/cities');
    }
  }, [regions]);

  async function handleAddCity() {
    if (!newCity.name || !selectedPlace || !newCity.region_id) {
      toast.error("Please search and select a city location");
      return;
    }

    setAdding(true);
    const toastId = toast.loading(`Adding "${newCity.name}"...`);

    try {
      const { lat, lng } = selectedPlace;

      const slug = newCity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const geojsonString = JSON.stringify({
        type: "Point",
        coordinates: [lng, lat],
      });

      // Use PostGIS ST_GeomFromGeoJSON to properly insert the geometry
      const { error } = await supabase.rpc('insert_city_with_geojson', {
        p_name: newCity.name,
        p_slug: slug,
        p_region_id: newCity.region_id,
        p_image_url: newCity.image_url || null,
        p_geojson: geojsonString
      });

      if (error) throw error;

      toast.success(`Successfully added "${newCity.name}"!`, { id: toastId });

      setNewCity({
        name: "",
        region_id: regions[0]?.id || "",
        image_url: "",
      });
      setSelectedPlace(null);
      setMarkerPlaced(false);
      setAddDialogOpen(false);
      loadData();
    } catch (err) {
      console.error("Error adding city:", err);
      toast.error(`Unable to add "${newCity.name}". Please try again.`, {
        id: toastId,
        duration: 5000
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateCity() {
    if (!editingCity) return;

    const toastId = toast.loading(`Updating "${editingCity.name}"...`);

    try {
      await updateCity(editingCity.id, {
        name: editingCity.name,
        slug: editingCity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        image_url: editingCity.image_url,
        region_id: editingCity.region_id,
      });

      toast.success(`Successfully updated "${editingCity.name}"!`, { id: toastId });
      setEditingCity(null);
      loadData();
    } catch (err) {
      console.error("Error updating city:", err);
      toast.error(`Unable to update "${editingCity.name}". Please try again.`, {
        id: toastId,
        duration: 5000
      });
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeleteConfirm({ open: true, id, name });
  }

  async function confirmDelete() {
    const { id, name } = deleteConfirm;
    setDeleteConfirm({ open: false, id: "", name: "" });

    const toastId = toast.loading(`Deleting "${name}"...`);

    try {
      await deleteCity(id);
      toast.success(`Successfully deleted "${name}"!`, { id: toastId });
      loadData();
    } catch (err) {
      console.error("Error deleting city:", err);
      toast.error(`Unable to delete "${name}". Please try again.`, {
        id: toastId,
        duration: 5000
      });
    }
  }

  // Initialize preview map when add dialog opens
  useEffect(() => {
    if (!addDialogOpen) {
      // Cleanup map when dialog closes
      if (previewDraggableMarker.current) {
        previewDraggableMarker.current.remove();
        previewDraggableMarker.current = null;
      }
      if (previewMapRef.current) {
        // Clean up highlight layer
        if (previewMapRef.current.getLayer('preview-highlight-marker')) {
          previewMapRef.current.removeLayer('preview-highlight-marker');
        }
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
      setPreviewMapInitialized(false);
      setMarkerPlaced(false);
      setPopupOpen(false);
      if (markerElement) {
        markerElement.remove();
        setMarkerElement(null);
        markerElementRef.current = null;
      }
      return;
    }

    // IMPORTANT: Close any open popups on the main map when dialog opens
    // This prevents the main map popup from showing through the dialog
    setSelectedCityId(null);

    // Don't reinitialize if map already exists
    if (previewMapRef.current) {
      return;
    }

    setPreviewMapInitialized(false);

    // Wait for dialog to fully render
    const timer = setTimeout(() => {
      if (!previewMapContainer.current) {
        return;
      }

      const map = new maplibregl.Map({
        container: previewMapContainer.current,
        style: getMapTilerStyleURL(),
        center: MAP_CONFIG.INITIAL_CENTER,
        zoom: MAP_CONFIG.INITIAL_ZOOM,
        attributionControl: false,
      });

      previewMapRef.current = map;

      map.on("load", async () => {
        // Load Florida boundary to create mask
        try {
          const response = await fetch('/fl-state.geojson');
          if (response.ok) {
            const floridaBoundary = await response.json();
            const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
            const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

            map.addLayer({
              id: 'preview-dark-mask',
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

        setPreviewMapInitialized(true);

        // Auto-create marker using MapLibre layers if place is already selected
        if (selectedPlace) {
          createMarkerLayer(selectedPlace.lat, selectedPlace.lng, newCity.name, true);
        }
      });

      // Add pitch based on zoom level for better visual effect
      map.on('zoom', () => {
        const zoom = map.getZoom();
        let targetPitch = 0;

        if (zoom > 11) {
          // Gradually increase pitch from zoom 11 to 14
          targetPitch = Math.min(45, (zoom - 11) * 15);
        }

        map.setPitch(targetPitch);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDialogOpen]);

  // Initialize edit map when edit dialog opens
  useEffect(() => {
    if (!editingCity) {
      // Cleanup map when dialog closes
      if (editDraggableMarker.current) {
        editDraggableMarker.current.remove();
        editDraggableMarker.current = null;
      }
      if (editMapRef.current) {
        // Clean up highlight layer
        if (editMapRef.current.getLayer('edit-highlight-marker')) {
          editMapRef.current.removeLayer('edit-highlight-marker');
        }
        editMapRef.current.remove();
        editMapRef.current = null;
      }
      setEditMapInitialized(false);
      setEditMarkerPlaced(false);
      setEditPopupOpen(false);
      if (editMarkerElement) {
        editMarkerElement.remove();
        setEditMarkerElement(null);
        editMarkerElementRef.current = null;
      }
      return;
    }

    // IMPORTANT: Close any open popups on the main map when dialog opens
    setSelectedCityId(null);

    // Don't reinitialize if map already exists
    if (editMapRef.current) {
      return;
    }

    if (!editingCity.geom) {
      return;
    }

    setEditMapInitialized(false);

    // Wait for dialog to fully render
    const timer = setTimeout(() => {
      if (!editMapContainer.current) {
        return;
      }

      const [lng, lat] = editingCity.geom.coordinates;

      const map = new maplibregl.Map({
        container: editMapContainer.current,
        style: getMapTilerStyleURL(),
        center: [lng, lat],
        zoom: 10,
        attributionControl: false,
      });

      editMapRef.current = map;

      // Add pitch based on zoom level for better visual effect (same as add dialog)
      map.on('zoom', () => {
        const zoom = map.getZoom();
        let targetPitch = 0;

        if (zoom > 11) {
          // Gradually increase pitch from zoom 11 to 14
          targetPitch = Math.min(45, (zoom - 11) * 15);
        }

        map.setPitch(targetPitch);
      });

      map.on("load", async () => {
        // Load Florida boundary to create mask
        try {
          const response = await fetch('/fl-state.geojson');
          if (response.ok) {
            const floridaBoundary = await response.json();
            const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
            const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

            map.addLayer({
              id: 'edit-dark-mask',
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

        // Create marker using MapLibre layers - matching main map
        const cityGeoJSON = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              id: 'edit-city',
              name: editingCity.name
            },
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          }]
        };

        map.addSource('edit-city', {
          type: 'geojson',
          data: cityGeoJSON as any
        });

        // Add point layer - matching main map but always visible
        map.addLayer({
          id: 'edit-city-point',
          type: 'circle',
          source: 'edit-city',
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              6, 5,
              10, 7,
              14, 9
            ],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': 'rgba(0,0,0,0.4)',
            'circle-opacity': 1,
            'circle-stroke-opacity': 1
          }
        });

        // Add label layer - matching main map but always visible
        map.addLayer({
          id: 'edit-city-label',
          type: 'symbol',
          source: 'edit-city',
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

        // Add visible draggable marker for dragging functionality
        if (editDraggableMarker.current) {
          editDraggableMarker.current.remove();
        }

        // Create draggable marker element that looks like the actual marker
        const dragEl = document.createElement('div');
        dragEl.style.cssText = `
          width: 14px;
          height: 14px;
          background: white;
          border: 2.5px solid rgba(0,0,0,0.4);
          border-radius: 50%;
          cursor: grab;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        `;

        const draggableMarker = new maplibregl.Marker({
          element: dragEl,
          draggable: true,
          anchor: 'center'
        })
          .setLngLat([lng, lat])
          .addTo(map);

        draggableMarker.on('dragstart', () => {
          dragEl.style.cursor = 'grabbing';
          dragEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
          // Hide the layer-based marker AND label during drag
          if (map.getLayer('edit-city-point')) {
            map.setLayoutProperty('edit-city-point', 'visibility', 'none');
          }
          if (map.getLayer('edit-city-label')) {
            map.setLayoutProperty('edit-city-label', 'visibility', 'none');
          }
          if (map.getLayer('edit-highlight-marker')) {
            map.setLayoutProperty('edit-highlight-marker', 'visibility', 'none');
          }
        });

        draggableMarker.on('drag', () => {
          const lngLat = draggableMarker.getLngLat();

          // Update marker element position if popup is open (use ref for current value)
          if (editMarkerElementRef.current) {
            const point = map.project([lngLat.lng, lngLat.lat]);
            editMarkerElementRef.current.style.left = `${point.x}px`;
            editMarkerElementRef.current.style.top = `${point.y}px`;
          }
        });

        draggableMarker.on('dragend', () => {
          dragEl.style.cursor = 'grab';
          dragEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

          const lngLat = draggableMarker.getLngLat();

          // Update editingCity geom after drag ends
          setEditingCity(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              geom: {
                type: 'Point',
                coordinates: [lngLat.lng, lngLat.lat]
              }
            };
          });

          // Update the GeoJSON source with final position
          const source = map.getSource('edit-city') as maplibregl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                properties: {
                  id: 'edit-city',
                  name: editingCity.name
                },
                geometry: {
                  type: 'Point',
                  coordinates: [lngLat.lng, lngLat.lat]
                }
              }]
            } as any);
          }

          // Show the layer-based marker again
          if (map.getLayer('edit-city-point')) {
            map.setLayoutProperty('edit-city-point', 'visibility', 'visible');
          }

          // Only show label if popup is NOT open
          if (!editPopupOpenRef.current && map.getLayer('edit-city-label')) {
            map.setLayoutProperty('edit-city-label', 'visibility', 'visible');
          }

          // Only show highlight if popup is open
          if (editPopupOpenRef.current && map.getLayer('edit-highlight-marker')) {
            map.setLayoutProperty('edit-highlight-marker', 'visibility', 'visible');
          }
        });

        editDraggableMarker.current = draggableMarker;

        // Add click handler for popup toggle
        const clickHandler = (e: maplibregl.MapMouseEvent) => {
          e.preventDefault();
          e.originalEvent.stopPropagation();

          setEditPopupOpen(prev => {
            const newState = !prev;

            // Toggle label visibility
            if (map.getLayer('edit-city-label')) {
              if (newState) {
                map.setLayoutProperty('edit-city-label', 'visibility', 'none');
              } else {
                map.setLayoutProperty('edit-city-label', 'visibility', 'visible');
              }
            }

            // Add/remove highlight layer
            if (newState) {
              // Add highlight marker ABOVE the point layer (not below)
              if (!map.getLayer('edit-highlight-marker')) {
                map.addLayer({
                  id: 'edit-highlight-marker',
                  type: 'circle',
                  source: 'edit-city',
                  paint: {
                    'circle-color': '#00d4ff',
                    'circle-radius': 12,
                    'circle-opacity': 0.4,
                    'circle-stroke-width': 3,
                    'circle-stroke-color': '#00d4ff',
                    'circle-stroke-opacity': 0.8
                  }
                });
              }
            } else {
              // Remove highlight marker
              if (map.getLayer('edit-highlight-marker')) {
                map.removeLayer('edit-highlight-marker');
              }
            }

            // Create/remove marker element for popup portal
            if (newState) {
              const el = document.createElement('div');
              el.style.cssText = 'position: absolute; pointer-events: none;';
              map.getContainer().appendChild(el);

              // Always use current draggable marker position
              const currentLng = editDraggableMarker.current?.getLngLat().lng ?? editingCity.geom.coordinates[0];
              const currentLat = editDraggableMarker.current?.getLngLat().lat ?? editingCity.geom.coordinates[1];
              const point = map.project([currentLng, currentLat]);
              el.style.left = `${point.x}px`;
              el.style.top = `${point.y}px`;

              setEditMarkerElement(el);
              editMarkerElementRef.current = el;

              // Update position on map move
              const updatePosition = () => {
                // Always get fresh position from draggable marker
                if (editDraggableMarker.current) {
                  const lngLat = editDraggableMarker.current.getLngLat();
                  const point = map.project([lngLat.lng, lngLat.lat]);
                  el.style.left = `${point.x}px`;
                  el.style.top = `${point.y}px`;
                }
              };
              map.on('move', updatePosition);
              map.on('zoom', updatePosition);
            } else {
              if (editMarkerElement) {
                editMarkerElement.remove();
                setEditMarkerElement(null);
                editMarkerElementRef.current = null;
              }
            }

            return newState;
          });
        };

        map.on('click', 'edit-city-point', clickHandler);
        map.on('mouseenter', 'edit-city-point', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'edit-city-point', () => {
          map.getCanvas().style.cursor = '';
        });

        setEditMarkerPlaced(true);
        setEditMapInitialized(true);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCity]);

  // Update edit marker label when city name changes
  useEffect(() => {
    if (!editMapRef.current || !editMarkerPlaced || !editingCity?.name || !editingCity?.geom) return;

    const map = editMapRef.current;
    const source = map.getSource('edit-city') as maplibregl.GeoJSONSource;

    if (source) {
      // Update GeoJSON with new city name
      source.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            id: 'edit-city',
            name: editingCity.name
          },
          geometry: editingCity.geom
        }]
      } as any);
    }
  }, [editingCity?.name, editMarkerPlaced, editingCity?.geom]);

  // Function to create marker using MapLibre layers - matching main map
  const createMarkerLayer = useCallback((lat: number, lng: number, cityName: string, isInitialPlacement: boolean = false) => {
    if (!previewMapRef.current) return;

    const map = previewMapRef.current;
    const isUpdate = markerPlaced;

    // Create GeoJSON for single city
    const cityGeoJSON = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          id: 'preview-city',
          name: cityName || 'City Location'
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        }
      }]
    };

    // Add or update source
    const existingSource = map.getSource('preview-city') as maplibregl.GeoJSONSource;
    if (existingSource) {
      existingSource.setData(cityGeoJSON as any);
    } else {
      map.addSource('preview-city', {
        type: 'geojson',
        data: cityGeoJSON as any
      });
    }

    // Add point layer - matching main map but always visible
    if (!map.getLayer('preview-city-point')) {
      map.addLayer({
        id: 'preview-city-point',
        type: 'circle',
        source: 'preview-city',
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, 5,
            10, 7,
            14, 9
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
          'circle-opacity': 1,
          'circle-stroke-opacity': 1
        }
      });
    }

    // Add label layer - matching main map but always visible
    if (!map.getLayer('preview-city-label')) {
      map.addLayer({
        id: 'preview-city-label',
        type: 'symbol',
        source: 'preview-city',
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

    // Add click handler for popup toggle
    if (!markerPlaced) {
      const clickHandler = (e: maplibregl.MapMouseEvent) => {
        e.preventDefault();
        e.originalEvent.stopPropagation();

        setPopupOpen(prev => {
          const newState = !prev;

          // Toggle label visibility
          if (map.getLayer('preview-city-label')) {
            if (newState) {
              map.setLayoutProperty('preview-city-label', 'visibility', 'none');
            } else {
              map.setLayoutProperty('preview-city-label', 'visibility', 'visible');
            }
          }

          // Add/remove highlight layer
          if (newState) {
            // Add highlight marker ABOVE the point layer (not below)
            if (!map.getLayer('preview-highlight-marker')) {
              map.addLayer({
                id: 'preview-highlight-marker',
                type: 'circle',
                source: 'preview-city',
                paint: {
                  'circle-color': '#00d4ff',
                  'circle-radius': 12,
                  'circle-opacity': 0.4,
                  'circle-stroke-width': 3,
                  'circle-stroke-color': '#00d4ff',
                  'circle-stroke-opacity': 0.8
                }
              });
            }
          } else {
            // Remove highlight marker
            if (map.getLayer('preview-highlight-marker')) {
              map.removeLayer('preview-highlight-marker');
            }
          }

          // Create/remove marker element for popup portal
          if (newState) {
            const el = document.createElement('div');
            el.style.cssText = 'position: absolute; pointer-events: none;';
            map.getContainer().appendChild(el);

            // Always use current draggable marker position
            const currentLng = previewDraggableMarker.current?.getLngLat().lng ?? lng;
            const currentLat = previewDraggableMarker.current?.getLngLat().lat ?? lat;
            const point = map.project([currentLng, currentLat]);
            el.style.left = `${point.x}px`;
            el.style.top = `${point.y}px`;

            setMarkerElement(el);
            markerElementRef.current = el;

            // Update position on map move
            const updatePosition = () => {
              // Always get fresh position from draggable marker
              if (previewDraggableMarker.current) {
                const lngLat = previewDraggableMarker.current.getLngLat();
                const point = map.project([lngLat.lng, lngLat.lat]);
                el.style.left = `${point.x}px`;
                el.style.top = `${point.y}px`;
              }
            };
            map.on('move', updatePosition);
            map.on('zoom', updatePosition);
          } else {
            if (markerElement) {
              markerElement.remove();
              setMarkerElement(null);
              markerElementRef.current = null;
            }
          }

          return newState;
        });
      };

      map.on('click', 'preview-city-point', clickHandler);
      map.on('mouseenter', 'preview-city-point', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'preview-city-point', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    setMarkerPlaced(true);

    // Add visible draggable marker for dragging functionality
    if (previewDraggableMarker.current) {
      previewDraggableMarker.current.remove();
    }

    // Create draggable marker element that looks like the actual marker
    const dragEl = document.createElement('div');
    dragEl.style.cssText = `
      width: 14px;
      height: 14px;
      background: white;
      border: 2.5px solid rgba(0,0,0,0.4);
      border-radius: 50%;
      cursor: grab;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;

    const draggableMarker = new maplibregl.Marker({
      element: dragEl,
      draggable: true,
      anchor: 'center'
    })
      .setLngLat([lng, lat])
      .addTo(map);

    draggableMarker.on('dragstart', () => {
      dragEl.style.cursor = 'grabbing';
      dragEl.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
      // Hide the layer-based marker AND label during drag
      if (map.getLayer('preview-city-point')) {
        map.setLayoutProperty('preview-city-point', 'visibility', 'none');
      }
      if (map.getLayer('preview-city-label')) {
        map.setLayoutProperty('preview-city-label', 'visibility', 'none');
      }
      if (map.getLayer('preview-highlight-marker')) {
        map.setLayoutProperty('preview-highlight-marker', 'visibility', 'none');
      }
    });

    draggableMarker.on('drag', () => {
      const lngLat = draggableMarker.getLngLat();

      // Update marker element position if popup is open (use ref for current value)
      if (markerElementRef.current) {
        const point = map.project([lngLat.lng, lngLat.lat]);
        markerElementRef.current.style.left = `${point.x}px`;
        markerElementRef.current.style.top = `${point.y}px`;
      }
    });

    draggableMarker.on('dragend', () => {
      dragEl.style.cursor = 'grab';
      dragEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      const lngLat = draggableMarker.getLngLat();

      // Update selectedPlace after drag ends
      setSelectedPlace({
        lat: lngLat.lat,
        lng: lngLat.lng
      });

      // Update the GeoJSON source with final position
      const source = map.getSource('preview-city') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {
              id: 'preview-city',
              name: cityName || 'City Location'
            },
            geometry: {
              type: 'Point',
              coordinates: [lngLat.lng, lngLat.lat]
            }
          }]
        } as any);
      }

      // Show the layer-based marker again
      if (map.getLayer('preview-city-point')) {
        map.setLayoutProperty('preview-city-point', 'visibility', 'visible');
      }

      // Only show label if popup is NOT open
      if (!popupOpenRef.current && map.getLayer('preview-city-label')) {
        map.setLayoutProperty('preview-city-label', 'visibility', 'visible');
      }

      // Only show highlight if popup is open
      if (popupOpenRef.current && map.getLayer('preview-highlight-marker')) {
        map.setLayoutProperty('preview-highlight-marker', 'visibility', 'visible');
      }
    });

    previewDraggableMarker.current = draggableMarker;

    // Only fly with zoom on initial placement
    if (isInitialPlacement && !isUpdate) {
      map.flyTo({
        center: [lng, lat],
        zoom: 10,
        duration: 800
      });
    } else if (!isUpdate) {
      map.panTo([lng, lat], {
        duration: 500
      });
    }
  }, [markerPlaced, markerElement]);

  // Handle place selection from search
  const handlePlaceSelect = (place: { place_name: string; center: [number, number]; text: string }) => {
    const [lng, lat] = place.center;

    // Update city name and coordinates
    setNewCity(prev => ({
      ...prev,
      name: place.text
    }));
    setSelectedPlace({ lat, lng });

    // Create/update marker layer and zoom to location
    if (previewMapRef.current) {
      const isInitial = !markerPlaced;
      createMarkerLayer(lat, lng, place.text, isInitial);
    }
  };

  // Update marker label when city name changes
  useEffect(() => {
    if (!previewMapRef.current || !markerPlaced || !selectedPlace) return;

    const map = previewMapRef.current;
    const source = map.getSource('preview-city') as maplibregl.GeoJSONSource;

    if (source) {
      // Update GeoJSON with new city name
      source.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {
            id: 'preview-city',
            name: newCity.name || 'City Location'
          },
          geometry: {
            type: 'Point',
            coordinates: [selectedPlace.lng, selectedPlace.lat]
          }
        }]
      } as any);
    }
  }, [newCity.name, markerPlaced, selectedPlace]);


  return (
    <div className="relative h-screen">
      <style jsx global>{`
        @keyframes popupEnter {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(16px) scale(0.92);
            filter: blur(4px);
          }
          50% {
            opacity: 0.8;
            filter: blur(2px);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
            filter: blur(0px);
          }
        }
        .popup-enter {
          animation: popupEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      {/* Map Container */}
      <div className="absolute inset-0">
        <CitiesMap cities={cities} selectedCityId={selectedCityId} sheetOpen={sheetOpen} onCityClick={(cityId) => setSelectedCityId(cityId === selectedCityId ? null : cityId)} />
      </div>

      {/* Centralized Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
          <div className="text-center px-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading cities...</p>
          </div>
        </div>
      )}

      {/* Floating Add Button - Square Icon */}
      <div className="absolute top-3 right-3 md:top-4 md:right-4 z-20">
        <Button
          size="icon"
          className="shadow-lg w-9 h-9 md:w-10 md:h-10"
          disabled={adding}
          onClick={() => setAddDialogOpen(true)}
          title="Add City"
        >
          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </Button>
      </div>

      {/* Toggle Button for Bottom Sheet */}
      {!sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed left-1/2 lg:left-[calc(50%+128px)] -translate-x-1/2 z-20 bg-primary text-primary-foreground px-4 py-2 md:px-6 md:py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-all text-sm md:text-base flex items-center gap-2"
          style={{ bottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          <ChevronUp className="w-4 h-4 md:w-5 md:h-5" />
          <span>Cities</span>
        </button>
      )}



      {/* Bottom Sheet with Cities Table - Positioned to right of navbar */}
      <div
        className={`fixed bottom-0 right-0 left-0 lg:left-64 z-20 backdrop-blur-sm transition-all duration-300 ease-in-out h-[35vh] max-h-[35vh] md:h-[45vh] md:max-h-[45vh] ${
          sheetOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          backgroundColor: '#1d2a3e',
          borderTop: '1px solid #575c63',
          paddingBottom: "env(safe-area-inset-bottom)"
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1 md:px-3 md:py-1.5 shrink-0" style={{ backgroundColor: '#0f1a34', borderBottom: '1px solid #575c63' }}>
            <div>
              <h2 className="text-[11px] md:text-sm font-semibold text-white">
                Cities
              </h2>
              <p className="text-[9px] md:text-[11px] text-white/70">
                {cities.length} {cities.length === 1 ? 'city' : 'cities'} total
              </p>
            </div>
            <button
              onClick={() => setSheetOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-0.5 hover:bg-white/10 rounded-md"
              title="Close cities table"
            >
              <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {cities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 md:p-6">
                <MapPin className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-50" />
                <p className="text-sm md:text-base">No cities yet</p>
                <p className="text-xs md:text-sm opacity-75 mt-1">Click the + button to add a city</p>
              </div>
            ) : (
              <div className="p-1.5 md:p-2.5 space-y-0.5 md:space-y-1">
                {cities.map((city) => (
                  <div
                    key={city.id}
                    onClick={() => setSelectedCityId(city.id)}
                    className="group flex items-center justify-between gap-2 px-2 py-1 md:px-2.5 md:py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                    style={{
                      border: selectedCityId === city.id ? '1px solid #4a9eff' : '1px solid #575c63',
                      backgroundColor: selectedCityId === city.id ? 'rgba(74, 158, 255, 0.1)' : undefined
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[10px] md:text-[11px] font-medium truncate text-white">
                        {city.name}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-white/60 font-mono mt-0.5">
                        {regions.find((r) => r.id === city.region_id)?.name || "Unknown"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCity(city);
                        }}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        title={`Edit ${city.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(city.id, city.name);
                        }}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title={`Delete ${city.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add City Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        if (!adding) {
          if (!open) {
            // Reset form when closing dialog
            setNewCity({
              name: "",
              region_id: regions[0]?.id || "",
              image_url: "",
            });
            setSelectedPlace(null);
          }
          setAddDialogOpen(open);
        }
      }}>
        <DialogContent className="max-w-6xl w-full h-full md:w-[90vw] md:h-[90vh] p-0 gap-0 border-0">
          <div className="absolute inset-0 flex flex-col">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Add New City</DialogTitle>
              <p className="text-[11px] md:text-sm text-muted-foreground">
                Enter city details and drag the marker to set location
              </p>
            </DialogHeader>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-auto md:overflow-hidden">
              {/* Map Preview */}
              <div className="relative bg-gray-100 dark:bg-gray-900 h-[35vh] md:h-auto md:flex-1 overflow-hidden">
                {!previewMapInitialized && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                    <div className="text-center px-4">
                      <Loader2 className="w-5 h-5 md:w-8 md:h-8 animate-spin text-primary mx-auto mb-1.5 md:mb-2" />
                      <p className="text-[11px] md:text-sm text-muted-foreground">Loading map...</p>
                    </div>
                  </div>
                )}
                <div
                  ref={previewMapContainer}
                  className="absolute inset-0 w-full h-full"
                />

                {/* Popup Card - rendered via Portal inside marker element */}
                {popupOpen && markerElement && createPortal(
                  <div
                    ref={popupRef}
                    className="absolute pointer-events-auto popup-enter"
                    style={{
                      bottom: '20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 9999,
                    }}
                  >
                    <div className="relative">
                      {/* Premium connector - arrow pointing down */}
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <div className="relative flex items-center justify-center">
                          {/* Outer glow */}
                          <div className="absolute w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[13px]" style={{ borderTopColor: 'rgba(222, 233, 240, 0.3)' }} />
                          {/* Main arrow */}
                          <div className="relative w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[12px]" style={{ borderTopColor: '#DEE9F0', filter: 'drop-shadow(0 2px 4px rgba(222, 233, 240, 0.4))' }} />
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 w-[290px] shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(0,135,159,0.15)]">
                        {/* Image */}
                        <div className="popup-image relative h-40 overflow-hidden group">
                          <Image
                            src={newCity.image_url || "https://images.unsplash.com/photo-1505881502353-a1986add3762?w=800&auto=format&fit=crop"}
                            alt={newCity.name || "City"}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            unoptimized
                          />
                          {/* Multi-layer gradient for better depth */}
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
                          <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-slate-900/20" />

                          {/* Close Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPopupOpen(false);
                              // Show the marker label again
                              if (previewMapRef.current?.getLayer('preview-city-label')) {
                                previewMapRef.current.setLayoutProperty('preview-city-label', 'visibility', 'visible');
                              }
                              // Remove highlight marker
                              if (previewMapRef.current?.getLayer('preview-highlight-marker')) {
                                previewMapRef.current.removeLayer('preview-highlight-marker');
                              }
                              // Remove marker element
                              if (markerElement) {
                                markerElement.remove();
                                setMarkerElement(null);
                                markerElementRef.current = null;
                              }
                            }}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/95 backdrop-blur-md flex items-center justify-center hover:bg-white/10 hover:scale-110 transition-all duration-200 border border-white/20 shadow-lg group"
                          >
                            <X className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="popup-content p-4 space-y-3.5">
                          {/* Location Name */}
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <h3 className="text-sm font-semibold text-white">
                              {newCity.name || "City Location"}, Florida
                            </h3>
                          </div>

                          {/* Divider line */}
                          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                          {/* Add to Preferences Button - Visual feedback only */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const checkbox = e.currentTarget.querySelector('.preference-checkbox') as HTMLElement;
                              if (checkbox) {
                                const isChecked = checkbox.dataset.checked === 'true';
                                checkbox.dataset.checked = (!isChecked).toString();
                                checkbox.innerHTML = !isChecked ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-white animate-in fade-in zoom-in duration-200"><path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clip-rule="evenodd" /></svg>' : '';
                                checkbox.style.background = !isChecked ? 'linear-gradient(to bottom right, #06b6d4, #0891b2)' : 'transparent';
                                checkbox.style.borderColor = !isChecked ? '#22d3ee' : 'rgba(255, 255, 255, 0.3)';
                                checkbox.style.boxShadow = !isChecked ? '0 10px 15px -3px rgba(6, 182, 212, 0.3)' : '';
                                const button = e.currentTarget as HTMLElement;
                                button.className = !isChecked
                                  ? 'w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-gradient-to-r from-cyan-600/20 to-cyan-500/20 hover:from-cyan-600/30 hover:to-cyan-500/30 border-2 border-cyan-500/40'
                                  : 'w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-cyan-500/30';
                                const text = button.querySelector('.button-text') as HTMLElement;
                                if (text) {
                                  text.textContent = !isChecked ? 'Added to preferences' : 'Add to preferences';
                                  text.className = !isChecked ? 'button-text text-sm font-medium transition-colors duration-200 text-cyan-100' : 'button-text text-sm font-medium transition-colors duration-200 text-white/80 group-hover:text-white';
                                }
                              }
                            }}
                            className="w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-cyan-500/30"
                          >
                            <div className="flex items-center gap-3 relative z-10">
                              <div
                                className="preference-checkbox w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-transparent border-2 border-white/30 group-hover:border-cyan-400/50"
                                data-checked="false"
                              />
                              <span className="button-text text-sm font-medium transition-colors duration-200 text-white/80 group-hover:text-white">
                                Add to preferences
                              </span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>,
                  markerElement
                )}
              </div>

              {/* Form */}
              <div className="w-full md:w-80 md:overflow-auto border-t md:border-t-0 md:border-l p-2.5 md:p-4" style={{ borderColor: '#575c63' }}>
                <div className="space-y-2.5 md:space-y-4">
                  <div>
                    <Label className="text-[10px] md:text-xs mb-1.5 block">Search City *</Label>
                    <PlacesSearch
                      onPlaceSelect={handlePlaceSelect}
                      placeholder="Search for a city in Florida..."
                      disabled={adding}
                      value={newCity.name}
                      onValueChange={(value) => setNewCity({ ...newCity, name: value })}
                      restrictToFlorida={true}
                    />
                    <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1.5 md:mt-2">
                      Search and select a city. Drag the marker to adjust position.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="region" className="text-[10px] md:text-xs mb-1">Region *</Label>
                    <Select
                      value={newCity.region_id}
                      onValueChange={(value: string) => setNewCity({ ...newCity, region_id: value })}
                      disabled={adding}
                    >
                      <SelectTrigger className="h-8 md:h-9 text-[11px] md:text-sm">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((region) => (
                          <SelectItem key={region.id} value={region.id} className="text-[11px] md:text-sm">
                            {region.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-[10px] md:text-xs mb-1.5 block">City Image (Optional)</Label>
                    <ImageUpload
                      value={newCity.image_url}
                      onChange={(url) => setNewCity({ ...newCity, image_url: url })}
                      onClear={() => setNewCity({ ...newCity, image_url: "" })}
                      disabled={adding}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3 py-2.5 md:px-6 md:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 shrink-0" style={{ borderTop: '1px solid #575c63', paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={adding}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm hover:bg-white/10 hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCity}
                disabled={adding || !newCity.name || !selectedPlace || !newCity.region_id}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                {adding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-spin" />
                    <span className="text-xs md:text-sm">Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 sm:hidden" />
                    <span className="hidden sm:inline text-sm">Add City</span>
                    <span className="sm:hidden text-xs">Add</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit City Dialog */}
      <Dialog open={!!editingCity} onOpenChange={(open) => !open && setEditingCity(null)}>
        <DialogContent className="max-w-6xl w-full h-full md:w-[90vw] md:h-[90vh] p-0 gap-0 border-0">
          <div className="absolute inset-0 flex flex-col">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Edit City</DialogTitle>
              <p className="text-[11px] md:text-sm text-muted-foreground">
                Update city details and adjust marker position
              </p>
            </DialogHeader>

            {editingCity && (
              <>
                <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-auto md:overflow-hidden">
                  {/* Map Preview */}
                  <div className="relative bg-gray-100 dark:bg-gray-900 h-[35vh] md:h-auto md:flex-1 overflow-hidden">
                    {!editMapInitialized && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                        <div className="text-center px-4">
                          <Loader2 className="w-5 h-5 md:w-8 md:h-8 animate-spin text-primary mx-auto mb-1.5 md:mb-2" />
                          <p className="text-[11px] md:text-sm text-muted-foreground">Loading map...</p>
                        </div>
                      </div>
                    )}
                    <div
                      ref={editMapContainer}
                      className="absolute inset-0 w-full h-full"
                    />

                    {/* Popup Card - rendered via Portal inside marker element */}
                    {editPopupOpen && editMarkerElement && createPortal(
                      <div
                        ref={editPopupRef}
                        className="absolute pointer-events-auto popup-enter"
                        style={{
                          bottom: '20px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          zIndex: 9999,
                        }}
                      >
                        <div className="relative">
                          {/* Premium connector - arrow pointing down */}
                          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center">
                            <div className="relative flex items-center justify-center">
                              {/* Outer glow */}
                              <div className="absolute w-0 h-0 border-l-[11px] border-l-transparent border-r-[11px] border-r-transparent border-t-[13px]" style={{ borderTopColor: 'rgba(222, 233, 240, 0.3)' }} />
                              {/* Main arrow */}
                              <div className="relative w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[12px]" style={{ borderTopColor: '#DEE9F0', filter: 'drop-shadow(0 2px 4px rgba(222, 233, 240, 0.4))' }} />
                            </div>
                          </div>

                          <div className="bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 w-[290px] shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05),0_0_60px_rgba(0,135,159,0.15)]">
                            {/* Image */}
                            <div className="popup-image relative h-40 overflow-hidden group">
                              <Image
                                src={editingCity?.image_url || "https://images.unsplash.com/photo-1505881502353-a1986add3762?w=800&auto=format&fit=crop"}
                                alt={editingCity?.name || "City"}
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                                unoptimized
                              />
                              {/* Multi-layer gradient for better depth */}
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
                              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-slate-900/20" />

                              {/* Close Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditPopupOpen(false);
                                  // Show the marker label again
                                  if (editMapRef.current?.getLayer('edit-city-label')) {
                                    editMapRef.current.setLayoutProperty('edit-city-label', 'visibility', 'visible');
                                  }
                                  // Remove highlight marker
                                  if (editMapRef.current?.getLayer('edit-highlight-marker')) {
                                    editMapRef.current.removeLayer('edit-highlight-marker');
                                  }
                                  // Remove marker element
                                  if (editMarkerElement) {
                                    editMarkerElement.remove();
                                    setEditMarkerElement(null);
                                    editMarkerElementRef.current = null;
                                  }
                                }}
                                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/95 backdrop-blur-md flex items-center justify-center hover:bg-white/10 hover:scale-110 transition-all duration-200 border border-white/20 shadow-lg group"
                              >
                                <X className="w-4 h-4 text-white/80 group-hover:text-white transition-colors" />
                              </button>
                            </div>

                            {/* Content */}
                            <div className="popup-content p-4 space-y-3.5">
                              {/* Location Name */}
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                <h3 className="text-sm font-semibold text-white">
                                  {editingCity?.name}, Florida
                                </h3>
                              </div>

                              {/* Divider line */}
                              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                              {/* Add to Preferences Button - Visual feedback only */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const checkbox = e.currentTarget.querySelector('.preference-checkbox') as HTMLElement;
                                  if (checkbox) {
                                    const isChecked = checkbox.dataset.checked === 'true';
                                    checkbox.dataset.checked = (!isChecked).toString();
                                    checkbox.innerHTML = !isChecked ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5 text-white animate-in fade-in zoom-in duration-200"><path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clip-rule="evenodd" /></svg>' : '';
                                    checkbox.style.background = !isChecked ? 'linear-gradient(to bottom right, #06b6d4, #0891b2)' : 'transparent';
                                    checkbox.style.borderColor = !isChecked ? '#22d3ee' : 'rgba(255, 255, 255, 0.3)';
                                    checkbox.style.boxShadow = !isChecked ? '0 10px 15px -3px rgba(6, 182, 212, 0.3)' : '';
                                    const button = e.currentTarget as HTMLElement;
                                    button.className = !isChecked
                                      ? 'w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-gradient-to-r from-cyan-600/20 to-cyan-500/20 hover:from-cyan-600/30 hover:to-cyan-500/30 border-2 border-cyan-500/40'
                                      : 'w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-cyan-500/30';
                                    const text = button.querySelector('.button-text') as HTMLElement;
                                    if (text) {
                                      text.textContent = !isChecked ? 'Added to preferences' : 'Add to preferences';
                                      text.className = !isChecked ? 'button-text text-sm font-medium transition-colors duration-200 text-cyan-100' : 'button-text text-sm font-medium transition-colors duration-200 text-white/80 group-hover:text-white';
                                    }
                                  }
                                }}
                                className="w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden bg-white/5 hover:bg-white/10 border-2 border-white/10 hover:border-cyan-500/30"
                              >
                                <div className="flex items-center gap-3 relative z-10">
                                  <div
                                    className="preference-checkbox w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-transparent border-2 border-white/30 group-hover:border-cyan-400/50"
                                    data-checked="false"
                                  />
                                  <span className="button-text text-sm font-medium transition-colors duration-200 text-white/80 group-hover:text-white">
                                    Add to preferences
                                  </span>
                                </div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>,
                      editMarkerElement
                    )}
                  </div>

                  {/* Form */}
                  <div className="w-full md:w-80 md:overflow-auto border-t md:border-t-0 md:border-l p-2.5 md:p-4" style={{ borderColor: '#575c63' }}>
                    <div className="space-y-2.5 md:space-y-4">
                      <div>
                        <Label htmlFor="edit-name" className="text-[10px] md:text-xs mb-1">City Name *</Label>
                        <Input
                          id="edit-name"
                          value={editingCity.name}
                          onChange={(e) => setEditingCity({ ...editingCity, name: e.target.value })}
                          className="text-[11px] md:text-sm h-8 md:h-9"
                        />
                      </div>

                      <div>
                        <Label htmlFor="edit-region" className="text-[10px] md:text-xs mb-1">Region *</Label>
                        <Select
                          value={editingCity.region_id}
                          onValueChange={(value: string) => setEditingCity({ ...editingCity, region_id: value })}
                        >
                          <SelectTrigger className="h-8 md:h-9 text-[11px] md:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {regions.map((region) => (
                              <SelectItem key={region.id} value={region.id} className="text-[11px] md:text-sm">
                                {region.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="text-[9px] md:text-[10px] text-muted-foreground bg-muted/50 p-2 rounded-md">
                        <strong>Current Location:</strong><br />
                        Lat: {editingCity.geom?.coordinates?.[1]?.toFixed(6)}, Lng: {editingCity.geom?.coordinates?.[0]?.toFixed(6)}<br />
                        <span className="text-[8px] md:text-[9px] opacity-75">Drag marker on map to adjust position</span>
                      </div>

                      <div>
                        <Label className="text-[10px] md:text-xs mb-1.5 block">City Image (Optional)</Label>
                        <ImageUpload
                          value={editingCity.image_url || ""}
                          onChange={(url) => setEditingCity({ ...editingCity, image_url: url })}
                          onClear={() => setEditingCity({ ...editingCity, image_url: "" })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2.5 md:px-6 md:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 shrink-0" style={{ borderTop: '1px solid #575c63', paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
                  <Button
                    variant="outline"
                    onClick={() => setEditingCity(null)}
                    className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm hover:bg-white/10 hover:text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdateCity}
                    className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
                  >
                    Save Changes
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}
        title="Delete City"
        description={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
