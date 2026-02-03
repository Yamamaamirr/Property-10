import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env.local');
    console.log('Loading env from:', envPath);
    const envFile = readFileSync(envPath, 'utf8');
    const lines = envFile.split(/\r?\n/);

    const env = {};
    lines.forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        env[key] = value;
        console.log(`  Loaded: ${key} = ${value.substring(0, 20)}...`);
      }
    });

    return env;
  } catch (err) {
    console.error('Error loading .env.local:', err.message);
    return {};
  }
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Loaded environment:');
console.log('  URL:', supabaseUrl ? '✓' : '✗');
console.log('  Key:', supabaseKey ? `✓ (${supabaseKey.length} chars)` : '✗');

if (!supabaseUrl || !supabaseKey) {
  console.error('\nMissing Supabase credentials in .env.local');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// City data with coordinates (Florida cities)
const citiesData = {
  'Tampa Bay': [
    { name: 'Tampa', lat: 27.9506, lng: -82.4572 },
    { name: 'Indian Shores', lat: 27.8897, lng: -82.8460 },
    { name: 'St. Petersburg', lat: 27.7676, lng: -82.6403 },
    { name: 'Anna Maria', lat: 27.5297, lng: -82.7332 },
    { name: 'Longboat Key', lat: 27.4103, lng: -82.6565 },
    { name: 'Lakewood Ranch', lat: 27.3961, lng: -82.4026 },
    { name: 'Sarasota', lat: 27.3364, lng: -82.5307 },
    { name: 'Siesta Key', lat: 27.2678, lng: -82.5465 },
    { name: 'Venice', lat: 27.0998, lng: -82.4543 },
    { name: 'Englewood', lat: 26.9620, lng: -82.3526 },
  ],
  'Miami': [
    { name: 'Ft. Lauderdale', lat: 26.1224, lng: -80.1373 },
    { name: 'Aventura', lat: 25.9565, lng: -80.1393 },
    { name: 'Miami', lat: 25.7617, lng: -80.1918 },
    { name: 'Coral Gables', lat: 25.7217, lng: -80.2683 },
    { name: 'Key Biscayne', lat: 25.6926, lng: -80.1631 },
  ],
  'Martin': [
    { name: 'Melbourne', lat: 28.0836, lng: -80.6081 },
    { name: 'Vero Beach', lat: 27.6386, lng: -80.3928 },
    { name: 'Stuart', lat: 27.1973, lng: -80.2528 },
    { name: 'Jupiter', lat: 26.9342, lng: -80.0942 },
    { name: 'Palm Beach Gardens', lat: 26.8234, lng: -80.1387 },
    { name: 'Palm Beach', lat: 26.7056, lng: -80.0364 },
    { name: 'West Palm Beach', lat: 26.7153, lng: -80.0534 },
    { name: 'Delray Beach', lat: 26.4615, lng: -80.0728 },
    { name: 'Boca Raton', lat: 26.3683, lng: -80.1289 },
  ],
  'Jacksonville': [
    { name: 'Amelia Island', lat: 30.6693, lng: -81.4596 },
    { name: 'Jacksonville', lat: 30.3322, lng: -81.6557 },
    { name: 'Ponte Vedra Beach', lat: 30.2369, lng: -81.3862 },
    { name: 'St. Augustine', lat: 29.9012, lng: -81.3124 },
  ],
  'Orlando': [
    { name: 'Melbourne', lat: 28.0836, lng: -80.6081 },
    { name: 'Port Orange', lat: 29.1383, lng: -81.0059 },
    { name: 'New Smyrna Beach', lat: 29.0258, lng: -80.9270 },
    { name: 'Lake Mary', lat: 28.7589, lng: -81.3178 },
    { name: 'Winter Park', lat: 28.5999, lng: -81.3392 },
    { name: 'Orlando', lat: 28.5383, lng: -81.3792 },
  ],
  'Naples': [
    { name: 'Boca Grande', lat: 26.7723, lng: -82.2651 },
    { name: 'Captiva', lat: 26.5281, lng: -82.1940 },
    { name: 'Sanibel', lat: 26.4487, lng: -82.1126 },
    { name: 'Bonita Springs', lat: 26.3398, lng: -81.7787 },
    { name: 'Naples', lat: 26.1420, lng: -81.7948 },
    { name: 'Marco Island', lat: 25.9412, lng: -81.7187 },
  ],
  'Destin': [
    { name: 'Destin', lat: 30.3935, lng: -86.4958 },
    { name: 'Santa Rosa Beach', lat: 30.3938, lng: -86.1574 },
    { name: 'Inlet Beach', lat: 30.2769, lng: -85.9774 },
  ],
  'Tallahassee': [
    { name: 'Ocala', lat: 29.1872, lng: -82.1401 },
  ],
  // Note: Florida Keys region not found in database, cities will be skipped
  // 'Florida Keys': [
  //   { name: 'Key West', lat: 24.5551, lng: -81.7800 },
  //   { name: 'Marathon', lat: 24.7137, lng: -81.0362 },
  //   { name: 'Ocean Reef Club', lat: 25.3260, lng: -80.2754 },
  // ],
};

async function clearAllCities() {
  console.log('Clearing all existing cities...');
  const { error } = await supabase.from('cities').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    console.error('Error clearing cities:', error);
    throw error;
  }

  console.log('✓ All cities cleared');
}

async function getRegions() {
  const { data, error } = await supabase
    .from('regions')
    .select('id, name, slug')
    .order('name');

  if (error) {
    console.error('Error fetching regions:', error);
    throw error;
  }

  return data;
}

async function addCities() {
  console.log('\nFetching regions...');
  const regions = await getRegions();

  if (!regions || regions.length === 0) {
    console.error('No regions found in database. Please add regions first.');
    return;
  }

  console.log(`Found ${regions.length} regions:`);
  regions.forEach(r => console.log(`  - ${r.name} (${r.slug})`));

  console.log('\nAdding cities...');
  let successCount = 0;
  let errorCount = 0;

  for (const [regionName, cities] of Object.entries(citiesData)) {
    const region = regions.find(r => r.name === regionName);

    if (!region) {
      console.error(`\n❌ Region not found: "${regionName}"`);
      console.log('   Available regions:', regions.map(r => r.name).join(', '));
      errorCount += cities.length;
      continue;
    }

    console.log(`\n${regionName}:`);

    for (const city of cities) {
      try {
        const slug = city.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const geojsonString = JSON.stringify({
          type: 'Point',
          coordinates: [city.lng, city.lat],
        });

        const { error } = await supabase.rpc('insert_city_with_geojson', {
          p_name: city.name,
          p_slug: slug,
          p_region_id: region.id,
          p_image_url: null,
          p_geojson: geojsonString
        });

        if (error) {
          console.error(`  ❌ ${city.name}: ${error.message}`);
          errorCount++;
        } else {
          console.log(`  ✓ ${city.name}`);
          successCount++;
        }
      } catch (err) {
        console.error(`  ❌ ${city.name}: ${err.message}`);
        errorCount++;
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Summary: ${successCount} cities added successfully`);
  if (errorCount > 0) {
    console.log(`         ${errorCount} cities failed`);
  }
}

async function main() {
  const action = process.argv[2];

  if (action === 'clear') {
    await clearAllCities();
  } else if (action === 'add') {
    await addCities();
  } else if (action === 'reset') {
    await clearAllCities();
    await addCities();
  } else {
    console.log('Usage: node manage-cities.mjs [clear|add|reset]');
    console.log('  clear - Remove all cities');
    console.log('  add   - Add cities from the list');
    console.log('  reset - Clear all cities and add new ones');
  }
}

main().catch(console.error);
