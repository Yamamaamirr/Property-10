import type { PropertyLocation, FloridaGeoJSON, PopupProps } from './types';
import { WORLD_BOUNDING_BOX } from './constants';
import { createLogoSVG } from './svgUtils';

/**
 * Converts property locations to GeoJSON format for MapLibre
 */
export function locationsToGeoJSON(locations: PropertyLocation[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map(loc => ({
      type: 'Feature',
      properties: {
        name: loc.name,
        title: loc.title,
        price: loc.price,
        size: loc.size,
        tags: JSON.stringify(loc.tags),
        image: loc.image
      },
      geometry: {
        type: 'Point',
        coordinates: loc.coordinates
      }
    }))
  };
}

/**
 * Extracts Florida coordinates from GeoJSON with proper error handling
 * Handles FeatureCollection, Feature, and direct geometry objects
 */
export function extractFloridaCoordinates(floridaBoundary: FloridaGeoJSON): number[][][] | number[][][][] {
  if (!floridaBoundary) {
    throw new Error('Florida boundary data is missing');
  }

  // Handle FeatureCollection
  if (floridaBoundary.type === 'FeatureCollection') {
    if (!floridaBoundary.features || floridaBoundary.features.length === 0) {
      throw new Error('FeatureCollection has no features');
    }
    const feature = floridaBoundary.features[0];
    if (!feature?.geometry?.coordinates) {
      throw new Error('Feature is missing geometry or coordinates');
    }
    return feature.geometry.coordinates;
  }

  // Handle single Feature
  if (floridaBoundary.type === 'Feature') {
    if (!floridaBoundary.geometry?.coordinates) {
      throw new Error('Feature is missing geometry or coordinates');
    }
    return floridaBoundary.geometry.coordinates;
  }

  // Handle direct geometry object
  if (floridaBoundary.coordinates) {
    return floridaBoundary.coordinates;
  }

  throw new Error('Invalid GeoJSON structure: unable to extract coordinates');
}

/**
 * Creates the "cookie-cutter" mask that darkens everything except Florida
 * This creates a polygon covering the world with Florida as holes
 */
export function createWorldMinusFloridaMask(floridaCoordinates: number[][][] | number[][][][]): GeoJSON.Feature<GeoJSON.Polygon> {
  // Determine if we have a MultiPolygon or Polygon
  const isMultiPolygon = Array.isArray(floridaCoordinates[0]?.[0]?.[0]);

  let floridaRings: number[][][];

  if (isMultiPolygon) {
    // MultiPolygon: flatten array of polygons and reverse each ring
    floridaRings = (floridaCoordinates as number[][][][]).flatMap((polygon) =>
      polygon.map((ring) => ring.slice().reverse())
    );
  } else {
    // Polygon: reverse each ring
    floridaRings = (floridaCoordinates as number[][][]).map((ring) =>
      ring.slice().reverse()
    );
  }

  // Combine world bounding box with reversed Florida rings to create holes
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[...WORLD_BOUNDING_BOX], ...floridaRings]
    }
  };
}

/**
 * Calculate bounding box from Florida coordinates
 * Returns [minLng, minLat, maxLng, maxLat] format for fitBounds
 */
export function calculateFloridaBounds(floridaCoordinates: number[][][] | number[][][][]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  // Determine if we have a MultiPolygon or Polygon
  const isMultiPolygon = Array.isArray(floridaCoordinates[0]?.[0]?.[0]);

  let allCoordinates: number[][][] = [];

  if (isMultiPolygon) {
    allCoordinates = (floridaCoordinates as number[][][][]).flat();
  } else {
    allCoordinates = floridaCoordinates as number[][][];
  }

  // Iterate through all rings and find min/max coordinates
  allCoordinates.forEach((ring) => {
    ring.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
  });

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Generates the HTML for the property popup
 */
export function createPopupHTML(props: PopupProps): string {
  const { title, name, price, size, tags, image } = props;

  const tagsHTML = tags.map((tag: string) => `<span class="popup-tag">${tag}</span>`).join('');

  return `
    <div class="property-popup">
      <div class="popup-header">
        <svg class="popup-logo-text" viewBox="0 0 200 70" xmlns="http://www.w3.org/2000/svg">
          <text x="0" y="30" font-family="Poppins" font-weight="700" font-size="27" fill="white">PROPERTY 10</text>
          <text x="0" y="55" font-family="Poppins" font-weight="400" font-size="19" fill="white" letter-spacing="4">F L O R I D A</text>
        </svg>
        ${createLogoSVG()}
      </div>
      <div class="popup-image-container">
        <img src="${image}" alt="${title}" class="popup-image" loading="lazy" />
        <button class="view-full-map">View full Map</button>
      </div>
      <div class="popup-content">
        <h3 class="popup-title">${title}</h3>
        <div class="popup-location">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
          </svg>
          <span>${name}</span>
        </div>
        <div class="popup-details">
          <span class="popup-price">${price}</span>
          <span class="popup-size">${size}</span>
        </div>
        <div class="popup-tags">
          ${tagsHTML}
        </div>
        <button class="popup-preference">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor"/>
          </svg>
          Add to Preferences
        </button>
      </div>
    </div>
  `;
}

/**
 * Safely parses tags from JSON string with error handling
 */
export function parseTags(tagsString: string | null | undefined): string[] {
  if (!tagsString) return [];

  try {
    const parsed = JSON.parse(tagsString);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse tags:', error);
    return [];
  }
}

/**
 * Gets the MapTiler style URL with API key
 */
export function getMapTilerStyleURL(): string {
  const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
  const styleId = process.env.MAPTILER_STYLE_ID || '019b0c46-bf3e-725a-ab49-336f71fa22af';

  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_MAPTILER_API_KEY is not set in environment variables');
  }

  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${apiKey}`;
}
