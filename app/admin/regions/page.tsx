"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, Trash2, ChevronUp, ChevronDown, X, Loader2, Pencil } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { ConfirmDialog } from "@/app/components/ui/confirm-dialog";
import type { Region, GeoJSONData, GeoJSONFeature } from "@/app/lib/types";
import {
  fetchRegions as loadRegions,
  saveRegionsFromGeoJSON,
  deleteRegion,
  updateRegion,
  calculateDefaultLabelPosition,
} from "@/app/lib/api/regions";
import RegionsMap from "@/app/components/admin/RegionsMap";
import { toast } from "sonner";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMapTilerStyleURL, extractFloridaCoordinates, createWorldMinusFloridaMask } from "@/app/lib/mapUtils";
import { MAP_CONFIG, MAP_COLORS, MAP_OPACITY } from "@/app/lib/constants";

interface EditableRegion {
  name: string;
  slug: string;
  originalName: string;
  geometry: any;
}

function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Converts technical error messages to user-friendly messages
 */
function formatErrorMessage(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  const errorMsg = error instanceof Error ? error.message : String(error);

  // Database function errors
  if (errorMsg.includes('function') && errorMsg.includes('does not exist')) {
    return "Database setup incomplete. Please contact your administrator.";
  }

  // Duplicate region errors
  if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
    return "This region already exists in the database.";
  }

  // Geometry/validation errors
  if (errorMsg.includes('geometry') || errorMsg.includes('Geometry')) {
    return "The file contains invalid geographic data. Please check the file and try again.";
  }

  // File reading errors
  if (errorMsg.includes('JSON') || errorMsg.includes('parse')) {
    return "Unable to read the file. Please ensure it's a valid GeoJSON file.";
  }

  // Network/connection errors
  if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
    return "Connection error. Please check your internet connection and try again.";
  }

  // Generic fallback for known errors
  if (errorMsg.length > 100) {
    return "An error occurred while processing your request. Please try again.";
  }

  return errorMsg;
}

export default function RegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  // Upload preview modal states
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editableRegions, setEditableRegions] = useState<EditableRegion[]>([]);
  const [pendingGeojson, setPendingGeojson] = useState<GeoJSONData | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [labelPositions, setLabelPositions] = useState<Map<string, [number, number]>>(new Map());

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({
    open: false,
    id: "",
    name: "",
  });

  // Edit dialog
  const [editDialog, setEditDialog] = useState<{ open: boolean; region: Region | null }>({
    open: false,
    region: null,
  });
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [updating, setUpdating] = useState(false);
  const [editLabelPosition, setEditLabelPosition] = useState<[number, number] | null>(null);

  // Map preview refs
  const previewMapContainer = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<maplibregl.Map | null>(null);
  const editMapContainer = useRef<HTMLDivElement>(null);
  const editMapRef = useRef<maplibregl.Map | null>(null);
  const [editMapInitialized, setEditMapInitialized] = useState(false);

  useEffect(() => {
    loadRegionsData();
  }, []);

  // Initialize preview map when modal opens
  useEffect(() => {
    if (!showPreviewModal) {
      // Cleanup map when modal closes
      if (previewMapRef.current) {
        previewMapRef.current.remove();
        previewMapRef.current = null;
      }
      setMapInitialized(false);
      return;
    }

    if (editableRegions.length === 0) {
      return;
    }

    // Don't reinitialize if map already exists (prevents re-render on name edits)
    if (previewMapRef.current) {
      return;
    }

    setMapInitialized(false);

    // Wait for dialog to fully render
    const timer = setTimeout(() => {
      if (!previewMapContainer.current) {
        console.error("Map container not found");
        return;
      }

      console.log("Initializing map...");

      const map = new maplibregl.Map({
        container: previewMapContainer.current,
        style: getMapTilerStyleURL(),
        center: MAP_CONFIG.INITIAL_CENTER,
        zoom: MAP_CONFIG.INITIAL_ZOOM,
        attributionControl: false, // Remove attribution control
      });

      previewMapRef.current = map;

      map.on("load", async () => {
        console.log("Map loaded");

        // Load Florida boundary to create mask (hide everything outside Florida)
        try {
          const response = await fetch('/fl-state.geojson');
          if (response.ok) {
            const floridaBoundary = await response.json();
            const floridaCoordinates = extractFloridaCoordinates(floridaBoundary);
            const worldMinusFlorida = createWorldMinusFloridaMask(floridaCoordinates);

            // Add dark mask layer to hide areas outside Florida
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

        // Add GeoJSON source
        const features = editableRegions.map((region, idx) => ({
          type: "Feature" as const,
          properties: {
            name: region.name,
            index: idx,
          },
          geometry: region.geometry,
        }));

        const geojsonData = {
          type: "FeatureCollection" as const,
          features,
        };

        map.addSource("preview-regions", {
          type: "geojson",
          data: geojsonData as any,
        });

        map.addLayer({
          id: "preview-regions-fill",
          type: "fill",
          source: "preview-regions",
          paint: {
            "fill-color": "#4a9eff",
            "fill-opacity": 0.4,
          },
        });

        map.addLayer({
          id: "preview-regions-outline",
          type: "line",
          source: "preview-regions",
          paint: {
            "line-color": "#76c8fe",
            "line-width": 2,
          },
        });

        // Add draggable region labels
        const labelFeatures = editableRegions.map((region, idx) => {
          const position = labelPositions.get(region.name) || [0, 0];
          return {
            type: "Feature" as const,
            properties: {
              name: region.name,
              index: idx,
            },
            geometry: {
              type: "Point" as const,
              coordinates: position,
            },
          };
        });

        map.addSource("preview-region-labels", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: labelFeatures as any,
          },
        });

        map.addLayer({
          id: "preview-region-labels",
          type: "symbol",
          source: "preview-region-labels",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": 14,
            "text-transform": "uppercase",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.8)",
            "text-halo-width": 2,
          },
        });

        // Make labels draggable
        let draggedFeature: any = null;
        let allFeatures: any[] = labelFeatures;

        map.on("mouseenter", "preview-region-labels", () => {
          map.getCanvas().style.cursor = "grab";
        });

        map.on("mouseleave", "preview-region-labels", () => {
          if (!draggedFeature) {
            map.getCanvas().style.cursor = "";
          }
        });

        map.on("mousedown", "preview-region-labels", (e) => {
          if (!e.features || e.features.length === 0) return;
          e.preventDefault();

          map.getCanvas().style.cursor = "grabbing";
          draggedFeature = e.features[0];
          const featureIndex = draggedFeature.properties.index;

          const onMove = (e: maplibregl.MapMouseEvent) => {
            if (!draggedFeature) return;

            map.getCanvas().style.cursor = "grabbing";

            // Update feature position
            const coords = [e.lngLat.lng, e.lngLat.lat];
            const updatedFeature = {
              ...allFeatures[featureIndex],
              geometry: {
                type: "Point" as const,
                coordinates: coords,
              },
            };

            allFeatures[featureIndex] = updatedFeature;

            // Update source data
            const source = map.getSource("preview-region-labels") as maplibregl.GeoJSONSource;
            if (source) {
              source.setData({
                type: "FeatureCollection",
                features: allFeatures as any,
              });
            }

            // Update state
            const regionName = draggedFeature.properties.name;
            setLabelPositions((prev) => {
              const updated = new Map(prev);
              updated.set(regionName, coords as [number, number]);
              return updated;
            });
          };

          const onUp = () => {
            map.getCanvas().style.cursor = "";
            map.off("mousemove", onMove);
            draggedFeature = null;
          };

          map.on("mousemove", onMove);
          map.once("mouseup", onUp);
        });

        // Fit map to bounds of all features
        try {
          const bounds = new maplibregl.LngLatBounds();
          features.forEach(feature => {
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

          if (!bounds.isEmpty()) {
            console.log("Fitting to bounds");
            map.fitBounds(bounds, { padding: 50, duration: 1000 });
          }
        } catch (err) {
          console.error("Error fitting bounds:", err);
        }

        setMapInitialized(true);
      });

      map.on("error", (e) => {
        console.error("Map error:", e);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreviewModal, editableRegions]);

  // Initialize edit map when dialog opens
  useEffect(() => {
    if (!editDialog.open) {
      // Cleanup map when dialog closes
      if (editMapRef.current) {
        editMapRef.current.remove();
        editMapRef.current = null;
      }
      setEditMapInitialized(false);
      return;
    }

    if (!editDialog.region || !editDialog.region.geom) {
      return;
    }

    // Don't reinitialize if map already exists
    if (editMapRef.current) {
      return;
    }

    setEditMapInitialized(false);

    // Wait for dialog to fully render
    const timer = setTimeout(() => {
      if (!editMapContainer.current) {
        console.error("Edit map container not found");
        return;
      }

      const map = new maplibregl.Map({
        container: editMapContainer.current,
        style: getMapTilerStyleURL(),
        center: MAP_CONFIG.INITIAL_CENTER,
        zoom: MAP_CONFIG.INITIAL_ZOOM,
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

        // Add region to map
        const feature = {
          type: "Feature" as const,
          properties: {
            name: editDialog.region!.name,
          },
          geometry: editDialog.region!.geom,
        };

        const geojsonData = {
          type: "FeatureCollection" as const,
          features: [feature],
        };

        map.addSource("edit-region", {
          type: "geojson",
          data: geojsonData as any,
        });

        map.addLayer({
          id: "edit-region-fill",
          type: "fill",
          source: "edit-region",
          paint: {
            "fill-color": "#4a9eff",
            "fill-opacity": 0.4,
          },
        });

        map.addLayer({
          id: "edit-region-outline",
          type: "line",
          source: "edit-region",
          paint: {
            "line-color": "#76c8fe",
            "line-width": 2,
          },
        });

        // Initialize label position (use stored position or calculate default)
        const region = editDialog.region!;
        let labelPos: [number, number];

        if (region.label_lng !== null && region.label_lat !== null) {
          labelPos = [region.label_lng, region.label_lat];
        } else {
          labelPos = calculateDefaultLabelPosition(region.geom);
        }

        setEditLabelPosition(labelPos);

        // Add draggable region label
        const labelFeature = {
          type: "Feature" as const,
          properties: {
            name: region.name,
          },
          geometry: {
            type: "Point" as const,
            coordinates: labelPos,
          },
        };

        map.addSource("edit-region-label", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [labelFeature] as any,
          },
        });

        map.addLayer({
          id: "edit-region-label",
          type: "symbol",
          source: "edit-region-label",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-size": 14,
            "text-transform": "uppercase",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0, 0, 0, 0.8)",
            "text-halo-width": 2,
          },
        });

        // Make label draggable
        let draggedLabel = false;
        let currentFeature = labelFeature;

        map.on("mouseenter", "edit-region-label", () => {
          map.getCanvas().style.cursor = "grab";
        });

        map.on("mouseleave", "edit-region-label", () => {
          if (!draggedLabel) {
            map.getCanvas().style.cursor = "";
          }
        });

        map.on("mousedown", "edit-region-label", (e) => {
          if (!e.features || e.features.length === 0) return;
          e.preventDefault();

          map.getCanvas().style.cursor = "grabbing";
          draggedLabel = true;

          const onMove = (e: maplibregl.MapMouseEvent) => {
            if (!draggedLabel) return;

            map.getCanvas().style.cursor = "grabbing";

            // Update feature position
            const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
            currentFeature = {
              ...currentFeature,
              geometry: {
                type: "Point" as const,
                coordinates: coords,
              },
            };

            // Update source data
            const source = map.getSource("edit-region-label") as maplibregl.GeoJSONSource;
            if (source) {
              source.setData({
                type: "FeatureCollection",
                features: [currentFeature] as any,
              });
            }

            // Update state
            setEditLabelPosition(coords);
          };

          const onUp = () => {
            map.getCanvas().style.cursor = "";
            map.off("mousemove", onMove);
            draggedLabel = false;
          };

          map.on("mousemove", onMove);
          map.once("mouseup", onUp);
        });

        // Fit map to region bounds
        try {
          const bounds = new maplibregl.LngLatBounds();
          const geometry = editDialog.region!.geom;

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
            map.fitBounds(bounds, { padding: 50, duration: 1000 });
          }
        } catch (err) {
          console.error("Error fitting bounds:", err);
        }

        setEditMapInitialized(true);
      });

      map.on("error", (e) => {
        console.error("Edit map error:", e);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [editDialog.open, editDialog.region]);

  async function loadRegionsData() {
    setLoading(true);
    try {
      const data = await loadRegions();
      setRegions(data);
    } catch (err) {
      console.error("Error loading regions:", err);
      toast.error("Unable to load regions. Please refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const geojson: GeoJSONData = JSON.parse(text);

      // Validate GeoJSON format
      if (!geojson.type || (geojson.type !== "FeatureCollection" && geojson.type !== "Feature")) {
        toast.error("This file is not a valid GeoJSON file. Please select a valid GeoJSON file and try again.");
        return;
      }

      // Extract features
      const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];

      if (!features || features.length === 0) {
        toast.error("The selected file doesn't contain any regions. Please choose a different file.");
        return;
      }

      // Validate geometry exists
      const invalidFeatures = features.filter(f => !f.geometry || !f.geometry.type);
      if (invalidFeatures.length > 0) {
        toast.error("The file contains incomplete data. Some regions are missing geographic information.");
        return;
      }

      // Create editable regions
      const editable = features.map((feature, idx) => {
        const name = feature.properties?.NAME ||
                    feature.properties?.name ||
                    feature.properties?.County ||
                    feature.properties?.county ||
                    `Region ${idx + 1}`;
        return {
          name,
          slug: createSlug(name),
          originalName: name,
          geometry: feature.geometry,
        };
      });

      // Calculate default label positions for all regions
      const defaultLabelPositions = new Map<string, [number, number]>();
      editable.forEach(region => {
        const position = calculateDefaultLabelPosition(region.geometry);
        defaultLabelPositions.set(region.name, position);
      });

      setSelectedFile(file);
      setEditableRegions(editable);
      setPendingGeojson(geojson);
      setLabelPositions(defaultLabelPositions);
      setShowPreviewModal(true);

    } catch (err) {
      console.error("Error reading file:", err);
      toast.error(formatErrorMessage(err));
    } finally {
      e.target.value = "";
    }
  }

  function updateRegionName(index: number, newName: string) {
    setEditableRegions(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        name: newName,
        slug: createSlug(newName),
      };
      return updated;
    });
  }

  async function confirmUpload() {
    if (!pendingGeojson) return;

    setUploading(true);
    const toastId = toast.loading("Uploading regions...");

    try {
      // Update the GeoJSON with edited names
      const features = pendingGeojson.type === 'FeatureCollection'
        ? pendingGeojson.features
        : [pendingGeojson];

      features.forEach((feature, idx) => {
        if (editableRegions[idx]) {
          feature.properties = {
            ...feature.properties,
            NAME: editableRegions[idx].name,
          };
        }
      });

      // Pass custom label positions to save function
      const count = await saveRegionsFromGeoJSON(pendingGeojson, labelPositions);

      if (count === 0) {
        toast.error(
          'No regions were uploaded. Please contact your administrator for assistance.',
          { id: toastId, duration: 5000 }
        );
      } else {
        // Close the dialog and clear form state
        setShowPreviewModal(false);
        setPendingGeojson(null);
        setEditableRegions([]);
        setSelectedFile(null);
        setLabelPositions(new Map());

        // Reload regions data (will show loading spinner on map)
        await loadRegionsData();

        // Show success toast after data is loaded
        toast.success(`Successfully added ${count} region${count !== 1 ? 's' : ''}!`, { id: toastId });
      }
    } catch (err) {
      console.error("Error uploading regions:", err);
      toast.error(formatErrorMessage(err), {
        id: toastId,
        duration: 5000
      });
    } finally {
      setUploading(false);
    }
  }

  function cancelUpload() {
    setShowPreviewModal(false);
    setPendingGeojson(null);
    setEditableRegions([]);
    setSelectedFile(null);
    setLabelPositions(new Map());
  }

  async function handleDelete(id: string, name: string) {
    setDeleteConfirm({ open: true, id, name });
  }

  async function confirmDelete() {
    const { id, name } = deleteConfirm;
    setDeleteConfirm({ open: false, id: "", name: "" });

    const toastId = toast.loading(`Deleting "${name}"...`);

    try {
      await deleteRegion(id);
      toast.success(`Successfully deleted "${name}"`, { id: toastId });
      loadRegionsData();
    } catch (err) {
      console.error("Error deleting region:", err);
      toast.error(`Unable to delete "${name}". Please try again.`, {
        id: toastId,
        duration: 5000
      });
    }
  }

  function handleEditNameChange(newName: string) {
    setEditName(newName);
    setEditSlug(createSlug(newName));
  }

  async function confirmEdit() {
    if (!editDialog.region || !editName.trim()) return;

    setUpdating(true);
    const toastId = toast.loading("Updating region...");

    try {
      // Pass label position if it was set/changed
      const labelLng = editLabelPosition ? editLabelPosition[0] : undefined;
      const labelLat = editLabelPosition ? editLabelPosition[1] : undefined;

      await updateRegion(editDialog.region.id, editName.trim(), labelLng, labelLat);
      toast.success("Region updated successfully!", { id: toastId });

      // Close dialog
      setEditDialog({ open: false, region: null });
      setEditLabelPosition(null);

      // Reload regions
      await loadRegionsData();
    } catch (err) {
      console.error("Error updating region:", err);
      toast.error(formatErrorMessage(err), {
        id: toastId,
        duration: 5000
      });
    } finally {
      setUpdating(false);
    }
  }

  function cancelEdit() {
    setEditDialog({ open: false, region: null });
    setEditName("");
    setEditSlug("");
    setEditLabelPosition(null);
  }

  return (
    <div className="relative h-screen">
      {/* Map Container */}
      <div className="absolute inset-0">
        <RegionsMap regions={regions} selectedRegionId={selectedRegionId} sheetOpen={sheetOpen} />
      </div>

      {/* Centralized Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background flex items-center justify-center z-50">
          <div className="text-center px-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading regions...</p>
          </div>
        </div>
      )}

      {/* Floating Upload Button - Square Icon */}
      <div className="absolute top-3 right-3 md:top-4 md:right-4 z-20">
        <Button
          size="icon"
          className="shadow-lg w-9 h-9 md:w-10 md:h-10"
          disabled={uploading}
          onClick={() => document.getElementById("region-upload")?.click()}
          title="Upload GeoJSON"
        >
          <Upload className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </Button>
        <input
          id="region-upload"
          type="file"
          accept=".geojson,.json"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Toggle Button for Bottom Sheet */}
      {!sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed left-1/2 lg:left-[calc(50%+128px)] -translate-x-1/2 z-20 bg-primary text-primary-foreground px-4 py-2 md:px-6 md:py-2 rounded-lg shadow-lg hover:bg-primary/90 transition-all text-sm md:text-base flex items-center gap-2"
          style={{ bottom: "max(1rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
        >
          <ChevronUp className="w-4 h-4 md:w-5 md:h-5" />
          <span>Regions</span>
        </button>
      )}

      {/* Bottom Sheet with Table */}
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
                Regions
              </h2>
              <p className="text-[9px] md:text-[11px] text-white/70">
                {regions.length} {regions.length === 1 ? 'region' : 'regions'} total
              </p>
            </div>
            <button
              onClick={() => setSheetOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-0.5 hover:bg-white/10 rounded-md"
              title="Close regions table"
            >
              <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {regions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 md:p-6">
                <Upload className="w-12 h-12 md:w-16 md:h-16 mb-3 md:mb-4 opacity-50" />
                <p className="text-sm md:text-base">No regions yet</p>
                <p className="text-xs md:text-sm opacity-75 mt-1">Upload a GeoJSON file to get started</p>
              </div>
            ) : (
              <div className="p-1.5 md:p-2.5 space-y-0.5 md:space-y-1">
                {regions.map((region) => (
                  <div
                    key={region.id}
                    onClick={() => setSelectedRegionId(selectedRegionId === region.id ? null : region.id)}
                    className={`group flex items-center justify-between gap-2 px-2 py-1 md:px-2.5 md:py-1.5 rounded-md cursor-pointer transition-all ${
                      selectedRegionId === region.id
                        ? 'bg-primary/20 shadow-sm'
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                    style={{
                      border: selectedRegionId === region.id ? '1px solid rgb(59, 130, 246)' : '1px solid #575c63'
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-[10px] md:text-[11px] font-medium truncate ${
                        selectedRegionId === region.id ? 'text-blue-400' : 'text-white'
                      }`}>
                        {region.name}
                      </h3>
                      <p className="text-[8px] md:text-[9px] text-white/60 font-mono mt-0.5">
                        {region.slug}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditName(region.name);
                          setEditSlug(region.slug);
                          setEditDialog({ open: true, region });
                        }}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        title={`Edit ${region.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(region.id, region.name);
                        }}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title={`Delete ${region.name}`}
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

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={(open) => !uploading && setShowPreviewModal(open)}>
        <DialogContent className="max-w-6xl w-full h-full md:w-[90vw] md:h-[90vh] p-0 gap-0 border-0">
          <div className="flex flex-col h-full">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Preview & Edit Regions</DialogTitle>
              {selectedFile && (
                <p className="text-[11px] md:text-sm text-muted-foreground">
                  File: {selectedFile.name} ({editableRegions.length} region{editableRegions.length !== 1 ? 's' : ''})
                </p>
              )}
            </DialogHeader>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Map Preview */}
              <div className="relative bg-gray-100 dark:bg-gray-900 h-[35vh] md:h-auto md:flex-1">
                {!mapInitialized && (
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

              {/* Editable Form */}
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l overflow-auto p-2.5 md:p-4 space-y-2.5 md:space-y-4" style={{ borderColor: '#575c63' }}>
                <div className="space-y-2.5 md:space-y-4">
                  <div>
                    <h3 className="font-semibold text-xs md:text-base mb-1 md:mb-2">Regions to Upload</h3>
                    <p className="text-[11px] md:text-sm text-muted-foreground mb-2 md:mb-4 leading-tight md:leading-normal">
                      Edit region names below. Slugs will update automatically.
                    </p>
                  </div>

                  {editableRegions.map((region, idx) => (
                    <Card key={idx} className="p-2.5 md:p-4 space-y-2 md:space-y-3">
                      {region.originalName !== region.name && (
                        <div className="mb-1">
                          <span className="text-[10px] md:text-xs text-muted-foreground">
                            Was: {region.originalName}
                          </span>
                        </div>
                      )}

                      <div>
                        <Label htmlFor={`region-name-${idx}`} className="text-[11px] md:text-sm mb-1">Region Name</Label>
                        <Input
                          id={`region-name-${idx}`}
                          value={region.name}
                          onChange={(e) => updateRegionName(idx, e.target.value)}
                          placeholder="Enter region name"
                          className="text-xs md:text-base h-8 md:h-10"
                        />
                      </div>

                      <div>
                        <Label className="text-[11px] md:text-sm mb-1">Slug (auto-generated)</Label>
                        <Input
                          value={region.slug}
                          disabled
                          className="bg-muted text-xs md:text-base h-8 md:h-10"
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer with iPhone safe area support */}
            <div
              className="px-3 py-2.5 md:px-6 md:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 shrink-0"
              style={{ borderTop: '1px solid #575c63', paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
            >
              <Button
                variant="outline"
                onClick={cancelUpload}
                disabled={uploading}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmUpload}
                disabled={uploading}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-spin" />
                    <span className="text-xs md:text-sm">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 sm:hidden" />
                    <span className="hidden sm:inline text-sm">Upload {editableRegions.length} Region{editableRegions.length !== 1 ? 's' : ''}</span>
                    <span className="sm:hidden text-xs">Upload ({editableRegions.length})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Region Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !updating && (open ? null : cancelEdit())}>
        <DialogContent className="max-w-6xl w-full h-full md:w-[90vw] md:h-[90vh] p-0 gap-0 border-0">
          <div className="flex flex-col h-full">
            <DialogHeader className="px-3 py-2 md:px-6 md:py-4 shrink-0" style={{ borderBottom: '1px solid #575c63' }}>
              <DialogTitle className="text-sm md:text-lg">Edit Region</DialogTitle>
              {editDialog.region && (
                <p className="text-[11px] md:text-sm text-muted-foreground">
                  Editing: {editDialog.region.name}
                </p>
              )}
            </DialogHeader>

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

              {/* Edit Form */}
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l overflow-auto p-2.5 md:p-4" style={{ borderColor: '#575c63' }}>
                <div className="space-y-2.5 md:space-y-4">
                  <div>
                    <h3 className="font-semibold text-xs md:text-base mb-1 md:mb-2">Region Name</h3>
                    <p className="text-[11px] md:text-sm text-muted-foreground mb-2 md:mb-4 leading-tight md:leading-normal">
                      Update the region name. The slug will be updated automatically.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="edit-region-name" className="text-[11px] md:text-sm mb-1">Name</Label>
                    <Input
                      id="edit-region-name"
                      value={editName}
                      onChange={(e) => handleEditNameChange(e.target.value)}
                      placeholder="Enter region name"
                      className="text-xs md:text-base h-8 md:h-10"
                      disabled={updating}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px] md:text-sm mb-1">Slug (auto-generated)</Label>
                    <Input
                      value={editSlug}
                      disabled
                      className="bg-muted text-xs md:text-base h-8 md:h-10"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className="px-3 py-2.5 md:px-6 md:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3 shrink-0"
              style={{ borderTop: '1px solid #575c63', paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
            >
              <Button
                variant="outline"
                onClick={cancelEdit}
                disabled={updating}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmEdit}
                disabled={updating || !editName.trim()}
                className="w-full sm:w-auto h-9 md:h-10 text-xs md:text-sm"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 animate-spin" />
                    <span className="text-xs md:text-sm">Updating...</span>
                  </>
                ) : (
                  <span className="text-xs md:text-sm">Save Changes</span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}
        title="Delete Region"
        description={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
