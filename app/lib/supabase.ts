import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Type definitions for our database tables
export interface Region {
  id: string;
  name: string;
  slug: string;
  geom: any; // PostGIS geometry
  created_at: string;
  updated_at: string;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  region_id: string;
  image_url?: string | null;
  geom: any; // PostGIS point geometry
  created_at: string;
  updated_at: string;
}
