"use client";

import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/app/components/ui/input";

interface PlaceResult {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
  place_type: string[];
  text: string;
}

interface PlacesSearchProps {
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  // Filter to restrict search to Florida
  restrictToFlorida?: boolean;
}

export function PlacesSearch({
  onPlaceSelect,
  placeholder = "Search for a city...",
  className = "",
  disabled = false,
  value: controlledValue,
  onValueChange,
  restrictToFlorida = true,
}: PlacesSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const displayValue = controlledValue !== undefined ? controlledValue : searchQuery;

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPlaces = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;

      // Build the geocoding URL with Florida restriction
      let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${apiKey}&limit=5&types=place`;

      if (restrictToFlorida) {
        // Restrict search to Florida bounding box
        // Florida bounds: approximately [-87.5, 24.5, -79.5, 31]
        url += `&bbox=-87.5,24.5,-79.5,31`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch places');
      }

      const data = await response.json();

      // Filter and format results
      const formattedResults: PlaceResult[] = data.features.map((feature: any) => ({
        id: feature.id,
        place_name: feature.place_name,
        center: feature.center,
        place_type: feature.place_type || [],
        text: feature.text,
      }));

      setResults(formattedResults);
      setShowResults(true);
    } catch (error) {
      console.error('Error searching places:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    if (onValueChange) {
      onValueChange(value);
    } else {
      setSearchQuery(value);
    }

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce search
    debounceTimer.current = setTimeout(() => {
      searchPlaces(value);
    }, 300);
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    if (onValueChange) {
      onValueChange(place.text);
    } else {
      setSearchQuery(place.text);
    }
    setShowResults(false);
    onPlaceSelect(place);
  };

  return (
    <div ref={searchContainerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={displayValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) {
              setShowResults(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 text-[11px] md:text-sm h-8 md:h-9"
        />
      </div>

      {/* Results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map((place) => (
            <button
              key={place.id}
              onClick={() => handlePlaceSelect(place)}
              className="w-full px-3 py-2 text-left hover:bg-cyan-500/10 transition-colors flex items-start gap-2 border-b border-border last:border-b-0"
            >
              <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] md:text-xs font-medium text-foreground truncate">
                  {place.text}
                </div>
                <div className="text-[9px] md:text-[10px] text-muted-foreground truncate">
                  {place.place_name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showResults && !loading && searchQuery.trim() && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg p-4 text-center">
          <p className="text-xs md:text-sm text-muted-foreground">No places found</p>
        </div>
      )}
    </div>
  );
}
