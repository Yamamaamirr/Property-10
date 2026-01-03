import { supabase } from '../supabase';
import type { City, GeoJSONData, GeoJSONFeature } from '../types';
import { createSlug } from './regions';

/**
 * Fetches all cities from the database with geometry
 */
export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, slug, region_id, image_url, created_at, updated_at, geom')
    .order('name');

  if (error) {
    console.error('Error fetching cities:', error);
    throw new Error(error.message);
  }

  // Parse the geometry strings to GeoJSON objects
  const cities = (data || []).map(city => {
    if (city.geom && typeof city.geom === 'string') {
      try {
        // Remove SRID prefix if present and parse the JSON
        const geojsonStr = city.geom.replace(/^SRID=\d+;/, '');
        city.geom = JSON.parse(geojsonStr);
      } catch (err) {
        console.error(`Error parsing geometry for city ${city.name}:`, err);
        city.geom = null;
      }
    }
    return city;
  });

  return cities;
}

/**
 * Extracts city name from GeoJSON feature properties
 */
export function extractCityName(properties: Record<string, any>): string {
  return properties?.NAME ||
         properties?.name ||
         properties?.City ||
         properties?.city ||
         'Unnamed City';
}

/**
 * Converts GeoJSON to database format and saves cities
 * Note: Requires region_id to be provided for each city
 */
export async function saveCitiesFromGeoJSON(
  geojson: GeoJSONData,
  defaultRegionId: string
): Promise<number> {
  const features: GeoJSONFeature[] =
    geojson.type === 'FeatureCollection'
      ? geojson.features
      : [geojson];

  let successCount = 0;

  for (const feature of features) {
    try {
      const name = extractCityName(feature.properties);
      const slug = createSlug(name);
      const image_url = feature.properties?.image_url || null;
      const geojsonString = JSON.stringify(feature.geometry);

      const { error } = await supabase
        .from('cities')
        .insert({
          name,
          slug,
          region_id: defaultRegionId,
          image_url,
          geom: `SRID=4326;${geojsonString}`
        });

      if (error) {
        console.error(`Error inserting city "${name}":`, error);
        continue;
      }

      successCount++;
    } catch (err) {
      console.error('Error processing feature:', err);
    }
  }

  return successCount;
}

/**
 * Updates a city's information
 */
export async function updateCity(
  id: string,
  updates: Partial<Pick<City, 'name' | 'slug' | 'image_url' | 'region_id'>>
): Promise<void> {
  const { error } = await supabase
    .from('cities')
    .update(updates)
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Deletes a city by ID
 */
export async function deleteCity(id: string): Promise<void> {
  const { error } = await supabase
    .from('cities')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Gets the count of all cities
 */
export async function getCityCount(): Promise<number> {
  const { count, error } = await supabase
    .from('cities')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error counting cities:', error);
    return 0;
  }

  return count || 0;
}
