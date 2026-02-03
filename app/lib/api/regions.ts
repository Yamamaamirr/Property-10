import { supabase } from '../supabase';
import type { Region, GeoJSONData, GeoJSONFeature } from '../types';

/**
 * Fetches all regions from the database with geometry
 */
export async function fetchRegions(): Promise<Region[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('id, name, slug, created_at, updated_at, geom, label_lng, label_lat, name_2, label_lng_2, label_lat_2')
    .order('name');

  if (error) {
    console.error('Error fetching regions:', error);
    throw new Error('Unable to load regions from the database.');
  }

  // Parse the geometry strings to GeoJSON objects
  const regions = (data || []).map(region => {
    if (region.geom && typeof region.geom === 'string') {
      try {
        // Remove SRID prefix if present and parse the JSON
        const geojsonStr = region.geom.replace(/^SRID=\d+;/, '');
        region.geom = JSON.parse(geojsonStr);
      } catch (err) {
        console.error(`Error parsing geometry for region ${region.name}:`, err);
        region.geom = null;
      }
    }
    return region;
  });

  return regions;
}

/**
 * Creates a slug from a name
 */
export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Extracts region name from GeoJSON feature properties
 */
export function extractRegionName(properties: Record<string, any>): string {
  return properties?.NAME ||
         properties?.name ||
         properties?.County ||
         properties?.county ||
         'Unnamed Region';
}

/**
 * Normalizes geometry to MultiPolygon format for database storage
 * Converts Polygon to MultiPolygon if needed
 */
export function normalizeGeometry(geometry: any): any {
  if (geometry.type === 'Polygon') {
    // Convert Polygon to MultiPolygon
    return {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates]
    };
  }
  return geometry;
}

/**
 * Calculates the visual center of a polygon using bounding box center
 */
export function getPolygonCenter(coords: number[][]): [number, number] {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  coords.forEach(coord => {
    if (coord[0] < minLng) minLng = coord[0];
    if (coord[0] > maxLng) maxLng = coord[0];
    if (coord[1] < minLat) minLat = coord[1];
    if (coord[1] > maxLat) maxLat = coord[1];
  });

  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Calculates default label position for any geometry type
 */
export function calculateDefaultLabelPosition(geometry: any): [number, number] {
  if (geometry.type === 'Polygon') {
    return getPolygonCenter(geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    // For MultiPolygon, use the largest polygon's center
    const polygons = geometry.coordinates;
    let largestPoly = polygons[0][0];
    let largestArea = largestPoly.length;

    polygons.forEach((poly: number[][][]) => {
      if (poly[0].length > largestArea) {
        largestArea = poly[0].length;
        largestPoly = poly[0];
      }
    });

    return getPolygonCenter(largestPoly);
  }

  // Fallback: return [0, 0] if geometry type is unknown
  return [0, 0];
}

/**
 * Converts GeoJSON to database format and saves regions
 * @param geojson - The GeoJSON data to save
 * @param customLabelPositions - Optional map of region names to [lng, lat] label positions
 * @param customLabelPositions2 - Optional map of region names to [lng, lat] second label positions
 * @param secondNames - Optional map of region names to their second name values
 */
export async function saveRegionsFromGeoJSON(
  geojson: GeoJSONData,
  customLabelPositions?: Map<string, [number, number]>,
  customLabelPositions2?: Map<string, [number, number]>,
  secondNames?: Map<string, string>
): Promise<number> {
  const features: GeoJSONFeature[] =
    geojson.type === 'FeatureCollection'
      ? geojson.features
      : [geojson];

  let successCount = 0;
  let errors: string[] = [];

  for (const feature of features) {
    try {
      const name = extractRegionName(feature.properties);
      const slug = createSlug(name);

      // Normalize geometry to MultiPolygon format for database
      const normalizedGeometry = normalizeGeometry(feature.geometry);
      const geojsonString = JSON.stringify(normalizedGeometry);

      // Use custom label position if provided, otherwise calculate default
      let labelLng: number, labelLat: number;
      if (customLabelPositions && customLabelPositions.has(name)) {
        [labelLng, labelLat] = customLabelPositions.get(name)!;
        console.log(`📤 Using custom label position for "${name}": [${labelLng}, ${labelLat}]`);
      } else {
        [labelLng, labelLat] = calculateDefaultLabelPosition(feature.geometry);
        console.log(`📤 Using calculated label position for "${name}": [${labelLng}, ${labelLat}]`);
      }

      // Handle second name and label position
      let name2: string | null = null;
      let labelLng2: number | null = null;
      let labelLat2: number | null = null;

      if (secondNames && secondNames.has(name)) {
        name2 = secondNames.get(name)!;

        // Use custom label position if provided, otherwise calculate offset from first label
        if (customLabelPositions2 && customLabelPositions2.has(name)) {
          [labelLng2, labelLat2] = customLabelPositions2.get(name)!;
          console.log(`📤 Using custom second label position for "${name}": [${labelLng2}, ${labelLat2}]`);
        } else {
          // Default: place second label slightly offset from first label
          labelLng2 = labelLng;
          labelLat2 = labelLat - 0.1; // Offset by ~0.1 degrees south
          console.log(`📤 Using offset second label position for "${name}": [${labelLng2}, ${labelLat2}]`);
        }
      }

      console.log(`📤 Attempting to insert region: "${name}" with geometry type: ${feature.geometry.type} (normalized to ${normalizedGeometry.type})`);

      // Use PostGIS ST_GeomFromGeoJSON to properly insert the geometry
      const { data, error } = await supabase.rpc('insert_region_from_geojson', {
        p_name: name,
        p_slug: slug,
        p_geojson: geojsonString,
        p_label_lng: labelLng,
        p_label_lat: labelLat,
        p_name_2: name2,
        p_label_lng_2: labelLng2,
        p_label_lat_2: labelLat2
      });

      if (error) {
        // Provide detailed error information
        console.error(`❌ Error inserting region "${name}":`, {
          fullError: error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          geometryType: feature.geometry.type,
          geometryPreview: geojsonString.substring(0, 200)
        });

        const errorMsg = error.message || error.hint || error.details || 'Unknown error';

        // Check if function doesn't exist
        if (error.message?.includes('function') || error.code === '42883') {
          throw new Error('Database setup is incomplete. Please contact your administrator.');
        }

        // Check for duplicate key error
        if (error.code === '23505') {
          errors.push(`${name} already exists in the database`);
          continue;
        }

        // Check for geometry type mismatch or validation errors
        if (error.message?.includes('Geometry type') || error.message?.includes('geometry') || error.code === '22023' || error.code === '23514') {
          errors.push(`${name} contains invalid geographic data`);
          continue;
        }

        // Generic error with region name
        errors.push(`Unable to add ${name}`);
        continue;
      }

      console.log(`✅ Successfully inserted region: "${name}"`);
      successCount++;
    } catch (err) {
      console.error('Error processing feature:', err);
      throw err; // Re-throw to show user
    }
  }

  if (errors.length > 0 && successCount === 0) {
    throw new Error(
      errors.length === 1
        ? errors[0]
        : `Unable to add regions:\n• ${errors.join('\n• ')}`
    );
  }

  // If some succeeded and some failed, log the errors but don't throw
  if (errors.length > 0) {
    console.warn(`Some regions were not added:\n• ${errors.join('\n• ')}`);
  }

  return successCount;
}

/**
 * Updates a region's name and slug, and optionally label coordinates and second name
 */
export async function updateRegion(
  id: string,
  name: string,
  labelLng?: number | null,
  labelLat?: number | null,
  name2?: string | null,
  labelLng2?: number | null,
  labelLat2?: number | null
): Promise<void> {
  const slug = createSlug(name);

  const updateData: any = {
    name,
    slug,
    updated_at: new Date().toISOString()
  };

  // Include label coordinates if provided
  if (labelLng !== undefined) {
    updateData.label_lng = labelLng;
  }
  if (labelLat !== undefined) {
    updateData.label_lat = labelLat;
  }

  // Include second name and label coordinates if provided
  if (name2 !== undefined) {
    updateData.name_2 = name2 || null; // Store null if empty string
  }
  if (labelLng2 !== undefined) {
    updateData.label_lng_2 = labelLng2;
  }
  if (labelLat2 !== undefined) {
    updateData.label_lat_2 = labelLat2;
  }

  const { error } = await supabase
    .from('regions')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Error updating region:', error);
    if (error.code === '23505') {
      throw new Error('A region with this name already exists.');
    }
    throw new Error('Unable to update the region. Please try again.');
  }
}

/**
 * Updates only the label position for a region
 */
export async function updateRegionLabel(
  id: string,
  labelLng: number,
  labelLat: number
): Promise<void> {
  const { error } = await supabase
    .from('regions')
    .update({
      label_lng: labelLng,
      label_lat: labelLat,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('Error updating region label:', error);
    throw new Error('Unable to update the region label. Please try again.');
  }
}

/**
 * Deletes a region by ID
 */
export async function deleteRegion(id: string): Promise<void> {
  const { error } = await supabase
    .from('regions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting region:', error);
    throw new Error('Unable to delete the region. Please try again.');
  }
}

/**
 * Gets the count of all regions
 */
export async function getRegionCount(): Promise<number> {
  const { count, error } = await supabase
    .from('regions')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error counting regions:', error);
    return 0;
  }

  return count || 0;
}
