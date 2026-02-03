-- Add support for a second region name and label position
-- This allows regions to display up to two names on the map

-- Add new columns for second name and label position
ALTER TABLE regions
ADD COLUMN IF NOT EXISTS name_2 TEXT,
ADD COLUMN IF NOT EXISTS label_lng_2 DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS label_lat_2 DOUBLE PRECISION;

-- Add comments
COMMENT ON COLUMN regions.name_2 IS 'Optional second name for the region';
COMMENT ON COLUMN regions.label_lng_2 IS 'Longitude coordinate for second region label position (user-draggable)';
COMMENT ON COLUMN regions.label_lat_2 IS 'Latitude coordinate for second region label position (user-draggable)';

-- Add constraint to ensure label coordinates are valid if provided
ALTER TABLE regions
DROP CONSTRAINT IF EXISTS valid_label_coordinates_2;

ALTER TABLE regions
ADD CONSTRAINT valid_label_coordinates_2 CHECK (
  (label_lng_2 IS NULL AND label_lat_2 IS NULL) OR
  (label_lng_2 >= -180 AND label_lng_2 <= 180 AND
   label_lat_2 >= -90 AND label_lat_2 <= 90)
);

-- Update the insert_region_from_geojson function to support second name and label
CREATE OR REPLACE FUNCTION insert_region_from_geojson(
  p_name TEXT,
  p_slug TEXT,
  p_geojson TEXT,
  p_label_lng DOUBLE PRECISION DEFAULT NULL,
  p_label_lat DOUBLE PRECISION DEFAULT NULL,
  p_name_2 TEXT DEFAULT NULL,
  p_label_lng_2 DOUBLE PRECISION DEFAULT NULL,
  p_label_lat_2 DOUBLE PRECISION DEFAULT NULL
) RETURNS void AS $$
BEGIN
  -- Check if region with same slug already exists
  IF EXISTS (SELECT 1 FROM regions WHERE slug = p_slug) THEN
    RETURN; -- Skip silently if already exists
  END IF;

  INSERT INTO regions (name, slug, geom, label_lng, label_lat, name_2, label_lng_2, label_lat_2)
  VALUES (
    p_name,
    p_slug,
    ST_GeomFromGeoJSON(p_geojson),
    p_label_lng,
    p_label_lat,
    p_name_2,
    p_label_lng_2,
    p_label_lat_2
  );
END;
$$ LANGUAGE plpgsql;
