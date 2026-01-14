import type { Map as MapLibreMap, Popup } from 'maplibre-gl';

/**
 * Property Location Data
 */
export interface PropertyLocation {
  name: string;
  coordinates: [number, number]; // [longitude, latitude]
  title: string;
  price: string;
  size: string;
  tags: string[];
  image: string;
}

/**
 * GeoJSON Feature Properties for Location Markers
 */
export interface LocationFeatureProperties {
  name: string;
  title: string;
  price: string;
  size: string;
  tags: string; // JSON stringified array
  image: string;
}

/**
 * MapLibre Map Click Event Feature
 */
export interface LocationFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: LocationFeatureProperties;
}

/**
 * Map References used in component
 */
export interface MapRefs {
  mapContainer: React.RefObject<HTMLDivElement>;
  map: React.RefObject<MapLibreMap | null>;
  currentPopup: React.RefObject<Popup | null>;
  isMapScrolled: React.RefObject<boolean>;
}

/**
 * Cleanup Functions for useEffect
 */
export type CleanupFunction = () => void;

/**
 * Florida GeoJSON Data Structure
 */
export interface FloridaGeoJSON {
  type: 'FeatureCollection' | 'Feature';
  features?: Array<{
    geometry: {
      coordinates: number[][][] | number[][][][];
    };
  }>;
  geometry?: {
    coordinates: number[][][] | number[][][][];
  };
  coordinates?: number[][][] | number[][][][];
}

/**
 * Map Configuration for initialization
 */
export interface MapConfig {
  apiKey: string;
  styleId: string;
}

/**
 * Popup HTML Props
 */
export interface PopupProps {
  title: string;
  name: string;
  price: string;
  size: string;
  tags: string[];
  image: string;
}

// ===== Admin & Database Types =====

/**
 * Region Database Table
 */
export interface Region {
  id: string;
  name: string;
  slug: string;
  geom: any;
  label_lng: number | null;
  label_lat: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * City Database Table
 */
export interface City {
  id: string;
  name: string;
  slug: string;
  region_id: string;
  image_url: string | null;
  geom: any;
  created_at: string;
  updated_at: string;
}

/**
 * GeoJSON Feature
 */
export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, any>;
}

/**
 * GeoJSON Feature Collection
 */
export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * GeoJSON Data (Feature or FeatureCollection)
 */
export type GeoJSONData = GeoJSONFeature | GeoJSONFeatureCollection;
