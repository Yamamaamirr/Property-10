-- Add label coordinate columns to regions table
-- These columns store the user-defined position for region name labels on the map
-- If NULL, the system will calculate the position from the polygon center

ALTER TABLE regions
ADD COLUMN IF NOT EXISTS label_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS label_lat DOUBLE PRECISION;

-- Add comments for documentation
COMMENT ON COLUMN regions.label_lng IS 'Longitude coordinate for region label position (user-draggable)';
COMMENT ON COLUMN regions.label_lat IS 'Latitude coordinate for region label position (user-draggable)';

-- Add check constraint to ensure valid coordinate ranges
ALTER TABLE regions
ADD CONSTRAINT valid_label_coordinates
CHECK (
  (label_lng IS NULL AND label_lat IS NULL) OR
  (label_lng >= -180 AND label_lng <= 180 AND
   label_lat >= -90 AND label_lat <= 90)
);

-- Update the RPC function to accept label coordinates
CREATE OR REPLACE FUNCTION insert_region_with_geojson(
  p_name TEXT,
  p_slug TEXT,
  p_geojson TEXT,
  p_label_lng DOUBLE PRECISION DEFAULT NULL,
  p_label_lat DOUBLE PRECISION DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO regions (name, slug, geom, label_lng, label_lat)
  VALUES (
    p_name,
    p_slug,
    ST_GeomFromGeoJSON(p_geojson),
    p_label_lng,
    p_label_lat
  );
END;
$$;
