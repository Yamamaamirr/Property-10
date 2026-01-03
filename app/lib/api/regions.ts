import { supabase } from '../supabase';
import type { Region, GeoJSONData, GeoJSONFeature } from '../types';

/**
 * Fetches all regions from the database with geometry
 */
export async function fetchRegions(): Promise<Region[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('id, name, slug, created_at, updated_at, geom')
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
 * Converts GeoJSON to database format and saves regions
 */
export async function saveRegionsFromGeoJSON(geojson: GeoJSONData): Promise<number> {
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

      console.log(`📤 Attempting to insert region: "${name}" with geometry type: ${feature.geometry.type} (normalized to ${normalizedGeometry.type})`);

      // Use PostGIS ST_GeomFromGeoJSON to properly insert the geometry
      const { data, error } = await supabase.rpc('insert_region_with_geojson', {
        p_name: name,
        p_slug: slug,
        p_geojson: geojsonString
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
 * Updates a region's name and slug
 */
export async function updateRegion(id: string, name: string): Promise<void> {
  const slug = createSlug(name);

  const { error } = await supabase
    .from('regions')
    .update({ name, slug, updated_at: new Date().toISOString() })
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
