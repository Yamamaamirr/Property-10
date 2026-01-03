"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Trash2, Edit, Plus, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
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
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";
import { toast } from "sonner";

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
    latitude: "",
    longitude: "",
    region_id: "",
    image_url: "",
  });

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: "",
    name: "",
  });

  // Map preview refs for add dialog
  const previewMapContainer = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [previewMapInitialized, setPreviewMapInitialized] = useState(false);
  const [markerPlaced, setMarkerPlaced] = useState(false);

  // Map preview refs for edit dialog
  const editMapContainer = useRef<HTMLDivElement>(null);
  const editMapRef = useRef<maplibregl.Map | null>(null);
  const editMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [editMapInitialized, setEditMapInitialized] = useState(false);
  const [editMarkerPlaced, setEditMarkerPlaced] = useState(false);

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

  async function handleAddCity() {
    if (!newCity.name || !newCity.latitude || !newCity.longitude || !newCity.region_id) {
      return;
    }

    setAdding(true);
    const toastId = toast.loading(`Adding "${newCity.name}"...`);

    try {
      const lat = parseFloat(newCity.latitude);
      const lng = parseFloat(newCity.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        toast.error("Invalid coordinates. Please enter valid latitude and longitude values.", { id: toastId });
        return;
      }

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
        latitude: "",
        longitude: "",
        region_id: regions[0]?.id || "",
        image_url: "",
      });
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
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      setPreviewMapInitialized(false);
      setMarkerPlaced(false);
      return;
    }

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

        // Auto-create marker at default location when map loads
        const lat = newCity.latitude ? parseFloat(newCity.latitude) : MAP_CONFIG.INITIAL_CENTER[1];
        const lng = newCity.longitude ? parseFloat(newCity.longitude) : MAP_CONFIG.INITIAL_CENTER[0];

        if (!isNaN(lat) && !isNaN(lng)) {
          createMarker(lat, lng, newCity.name, true);
        }
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDialogOpen]);

  // Initialize edit map when edit dialog opens
  useEffect(() => {
    if (!editingCity) {
      // Cleanup map when dialog closes
      if (editMapRef.current) {
        editMapRef.current.remove();
        editMapRef.current = null;
      }
      if (editMarkerRef.current) {
        editMarkerRef.current.remove();
        editMarkerRef.current = null;
      }
      setEditMapInitialized(false);
      setEditMarkerPlaced(false);
      return;
    }

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

        // Create marker for editing
        const el = document.createElement('div');
        el.style.cssText = `
          position: relative;
          cursor: grab;
          display: flex;
          flex-direction: column;
          align-items: center;
        `;

        const labelEl = document.createElement('div');
        labelEl.className = 'edit-marker-label';
        labelEl.style.cssText = `
          white-space: nowrap;
          color: white;
          font-family: 'Open Sans', sans-serif;
          font-size: 20px;
          font-weight: 500;
          text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6);
          pointer-events: none;
          margin-bottom: 3px;
          padding: 2px;
        `;
        labelEl.textContent = editingCity.name;

        const dotEl = document.createElement('div');
        dotEl.style.cssText = `
          width: 8px;
          height: 8px;
          background-color: white;
          border-radius: 50%;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5);
        `;

        el.appendChild(labelEl);
        el.appendChild(dotEl);

        const marker = new maplibregl.Marker({
          element: el,
          draggable: true,
          anchor: 'bottom'
        })
          .setLngLat([lng, lat])
          .addTo(map);

        editMarkerRef.current = marker;

        // Update cursor on drag
        marker.on('dragstart', () => {
          el.style.cursor = 'grabbing';
        });

        marker.on('dragend', () => {
          el.style.cursor = 'grab';
          const lngLat = marker.getLngLat();
          setEditingCity(prev => prev ? {
            ...prev,
            geom: {
              type: "Point",
              coordinates: [lngLat.lng, lngLat.lat]
            }
          } : null);
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
    if (!editMarkerRef.current || !editMarkerPlaced || !editingCity?.name) return;

    const markerElement = editMarkerRef.current.getElement();
    if (!markerElement) return;

    const labelElement = markerElement.querySelector('.edit-marker-label');
    if (labelElement) {
      labelElement.textContent = editingCity.name;
    }
  }, [editingCity?.name, editMarkerPlaced, editingCity]);

  // Function to create custom marker with city name
  const createMarker = useCallback((lat: number, lng: number, cityName: string, isInitialPlacement: boolean = false) => {
    if (!previewMapRef.current) return;

    // Remove existing marker if any
    const isUpdate = markerRef.current !== null;
    if (markerRef.current) {
      markerRef.current.remove();
    }

    // Create custom marker element with proper structure
    const el = document.createElement('div');
    el.className = 'custom-city-marker';
    el.style.cssText = `
      position: relative;
      cursor: grab;
      display: flex;
      flex-direction: column;
      align-items: center;
    `;

    // Create label element
    const labelEl = document.createElement('div');
    labelEl.className = 'marker-label';
    labelEl.style.cssText = `
      white-space: nowrap;
      color: white;
      font-family: 'Open Sans', sans-serif;
      font-size: 20px;
      font-weight: 500;
      text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.6);
      pointer-events: none;
      margin-bottom: 3px;
      padding: 2px;
    `;
    labelEl.textContent = cityName || 'City Location';

    // Create dot element
    const dotEl = document.createElement('div');
    dotEl.className = 'marker-dot';
    dotEl.style.cssText = `
      width: 8px;
      height: 8px;
      background-color: white;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.5);
    `;

    // Append elements
    el.appendChild(labelEl);
    el.appendChild(dotEl);

    const marker = new maplibregl.Marker({
      element: el,
      draggable: true,
      anchor: 'bottom'
    })
      .setLngLat([lng, lat])
      .addTo(previewMapRef.current);

    markerRef.current = marker;

    // Update form when marker is dragged
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      setNewCity(prev => ({
        ...prev,
        latitude: lngLat.lat.toFixed(6),
        longitude: lngLat.lng.toFixed(6),
      }));

      // Just pan to the new position without zoom
      if (previewMapRef.current) {
        previewMapRef.current.panTo([lngLat.lng, lngLat.lat], {
          duration: 300
        });
      }
    });

    // Update cursor style on drag
    marker.on('dragstart', () => {
      el.style.cursor = 'grabbing';
    });

    marker.on('dragend', () => {
      el.style.cursor = 'grab';
    });

    setMarkerPlaced(true);

    // Only fly with zoom on initial placement, otherwise just pan
    if (isInitialPlacement && !isUpdate) {
      previewMapRef.current.flyTo({
        center: [lng, lat],
        zoom: 10,
        duration: 800
      });
    } else if (!isUpdate) {
      // Pan without zoom change for updates
      previewMapRef.current.panTo([lng, lat], {
        duration: 500
      });
    }
  }, []);

  // Handle place marker button click
  const handlePlaceMarker = () => {
    const lat = newCity.latitude ? parseFloat(newCity.latitude) : MAP_CONFIG.INITIAL_CENTER[1];
    const lng = newCity.longitude ? parseFloat(newCity.longitude) : MAP_CONFIG.INITIAL_CENTER[0];

    if (!isNaN(lat) && !isNaN(lng)) {
      // Only zoom on initial placement (when marker doesn't exist yet)
      const isInitial = !markerPlaced;
      createMarker(lat, lng, newCity.name, isInitial);
    }
  };

  // Update marker position when lat/lng changes (typing coordinates)
  useEffect(() => {
    if (!markerRef.current || !newCity.latitude || !newCity.longitude) return;

    const lat = parseFloat(newCity.latitude);
    const lng = parseFloat(newCity.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      markerRef.current.setLngLat([lng, lat]);
      // Just pan to the new position without changing zoom
      if (previewMapRef.current) {
        previewMapRef.current.panTo([lng, lat], {
          duration: 500
        });
      }
    }
  }, [newCity.latitude, newCity.longitude]);

  // Update marker label when city name changes
  useEffect(() => {
    if (!markerRef.current || !markerPlaced) return;

    const markerElement = markerRef.current.getElement();
    if (!markerElement) return;

    // Update the city name label in the marker
    const labelElement = markerElement.querySelector('.marker-label');
    if (labelElement) {
      labelElement.textContent = newCity.name || 'City Location';
    }
  }, [newCity.name, markerPlaced]);

  return (
    <div className="relative h-screen">
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
                    onClick={() => setSelectedCityId(city.id === selectedCityId ? null : city.id)}
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
                        <Edit className="w-3 h-3" />
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
              latitude: "",
              longitude: "",
              region_id: regions[0]?.id || "",
              image_url: "",
            });
          }
          setAddDialogOpen(open);
        }
      }}>
        <DialogContent className="max-w-6xl w-full h-full md:w-[90vw] md:h-[90vh] p-0 gap-0 border-0">
          <div className="flex flex-col h-full">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Add New City</DialogTitle>
              <p className="text-[11px] md:text-sm text-muted-foreground">
                Enter city details and drag the marker to set location
              </p>
            </DialogHeader>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Map Preview */}
              <div className="relative bg-gray-100 dark:bg-gray-900 h-[35vh] md:h-auto md:flex-1">
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
              </div>

              {/* Form */}
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l overflow-auto p-2.5 md:p-4" style={{ borderColor: '#575c63' }}>
                <div className="space-y-2.5 md:space-y-4">
                  <div>
                    <Label htmlFor="city-name" className="text-[10px] md:text-xs mb-1">City Name *</Label>
                    <Input
                      id="city-name"
                      value={newCity.name}
                      onChange={(e) => setNewCity({ ...newCity, name: e.target.value })}
                      placeholder="Enter city name"
                      className="text-[11px] md:text-sm h-8 md:h-9"
                      disabled={adding}
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] md:text-xs mb-1">Coordinates *</Label>
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <Input
                        id="latitude"
                        value={newCity.latitude}
                        onChange={(e) => setNewCity({ ...newCity, latitude: e.target.value })}
                        placeholder="Latitude"
                        className="text-[11px] md:text-sm h-8 md:h-9"
                        disabled={adding}
                      />
                      <Input
                        id="longitude"
                        value={newCity.longitude}
                        onChange={(e) => setNewCity({ ...newCity, longitude: e.target.value })}
                        placeholder="Longitude"
                        className="text-[11px] md:text-sm h-8 md:h-9"
                        disabled={adding}
                      />
                    </div>
                    <p className="text-[9px] md:text-[10px] text-muted-foreground mt-1.5 md:mt-2">
                      Drag the marker on the map to set the exact location
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
                    <Label htmlFor="image-url" className="text-[10px] md:text-xs mb-1">Image URL (Optional)</Label>
                    <Input
                      id="image-url"
                      value={newCity.image_url}
                      onChange={(e) => setNewCity({ ...newCity, image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      className="text-[11px] md:text-sm h-8 md:h-9"
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
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCity}
                disabled={adding || !newCity.name || !newCity.latitude || !newCity.longitude || !newCity.region_id}
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
          <div className="flex flex-col h-full">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Edit City</DialogTitle>
              <p className="text-[11px] md:text-sm text-muted-foreground">
                Update city details and adjust marker position
              </p>
            </DialogHeader>

            {editingCity && (
              <>
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  {/* Map Preview */}
                  <div className="relative bg-gray-100 dark:bg-gray-900 h-[35vh] md:h-auto md:flex-1">
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
                  </div>

                  {/* Form */}
                  <div className="w-full md:w-80 border-t md:border-t-0 md:border-l overflow-auto p-2.5 md:p-4" style={{ borderColor: '#575c63' }}>
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

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="edit-latitude" className="text-[10px] md:text-xs mb-1">Latitude</Label>
                          <Input
                            id="edit-latitude"
                            value={editingCity.geom?.coordinates?.[1]?.toFixed(6) || ""}
                            onChange={(e) => {
                              const lat = parseFloat(e.target.value);
                              if (!isNaN(lat) && editingCity.geom) {
                                setEditingCity({
                                  ...editingCity,
                                  geom: {
                                    type: "Point",
                                    coordinates: [editingCity.geom.coordinates[0], lat]
                                  }
                                });
                                // Update marker position
                                if (editMarkerRef.current) {
                                  editMarkerRef.current.setLngLat([editingCity.geom.coordinates[0], lat]);
                                }
                              }
                            }}
                            placeholder="27.994402"
                            className="text-[11px] md:text-sm h-8 md:h-9"
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-longitude" className="text-[10px] md:text-xs mb-1">Longitude</Label>
                          <Input
                            id="edit-longitude"
                            value={editingCity.geom?.coordinates?.[0]?.toFixed(6) || ""}
                            onChange={(e) => {
                              const lng = parseFloat(e.target.value);
                              if (!isNaN(lng) && editingCity.geom) {
                                setEditingCity({
                                  ...editingCity,
                                  geom: {
                                    type: "Point",
                                    coordinates: [lng, editingCity.geom.coordinates[1]]
                                  }
                                });
                                // Update marker position
                                if (editMarkerRef.current) {
                                  editMarkerRef.current.setLngLat([lng, editingCity.geom.coordinates[1]]);
                                }
                              }
                            }}
                            placeholder="-81.760254"
                            className="text-[11px] md:text-sm h-8 md:h-9"
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="edit-image" className="text-[10px] md:text-xs mb-1">Image URL (Optional)</Label>
                        <Input
                          id="edit-image"
                          value={editingCity.image_url || ""}
                          onChange={(e) => setEditingCity({ ...editingCity, image_url: e.target.value })}
                          placeholder="https://example.com/image.jpg"
                          className="text-[11px] md:text-sm h-8 md:h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2.5 md:px-6 md:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 shrink-0" style={{ borderTop: '1px solid #575c63', paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
                  <Button
                    variant="outline"
                    onClick={() => setEditingCity(null)}
                    className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
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
