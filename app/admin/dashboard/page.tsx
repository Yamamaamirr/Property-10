"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { supabase } from "@/app/lib/supabase";
import { MapPin, Plus, Upload, X, Hexagon, Loader2 } from "lucide-react";
import type { Region, City, GeoJSONData } from "@/app/lib/types";
import { saveRegionsFromGeoJSON } from "@/app/lib/api/regions";
import { Badge } from "@/app/components/ui/badge";
import Link from "next/link";

interface RegionWithCities extends Region {
  cities: City[];
}

export default function AdminDashboard() {
  const [regionsWithCities, setRegionsWithCities] = useState<RegionWithCities[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRegionModal, setShowAddRegionModal] = useState(false);
  const [showAddCityModal, setShowAddCityModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state for new city
  const [newCity, setNewCity] = useState({
    name: "",
    latitude: "",
    longitude: "",
    region_id: "",
    image_url: "",
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      // Fetch all regions
      const { data: regionsData, error: regionsError } = await supabase
        .from("regions")
        .select("*")
        .order("name");

      if (regionsError) throw regionsError;

      // Fetch all cities
      const { data: citiesData, error: citiesError } = await supabase
        .from("cities")
        .select("*")
        .order("name");

      if (citiesError) throw citiesError;

      // Group cities by region
      const regionsMap = new Map<string, RegionWithCities>();
      (regionsData || []).forEach((region) => {
        regionsMap.set(region.id, { ...region, cities: [] });
      });

      (citiesData || []).forEach((city) => {
        const region = regionsMap.get(city.region_id);
        if (region) {
          region.cities.push(city);
        }
      });

      setRegionsWithCities(Array.from(regionsMap.values()));

      // Set default region for city form
      if (regionsData && regionsData.length > 0) {
        setNewCity((prev) => ({ ...prev, region_id: regionsData[0].id }));
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const geojson: GeoJSONData = JSON.parse(text);

      if (!geojson.type || (geojson.type !== "FeatureCollection" && geojson.type !== "Feature")) {
        throw new Error("Invalid GeoJSON format");
      }

      const count = await saveRegionsFromGeoJSON(geojson);
      alert(`Successfully added ${count} region(s)!`);
      setShowAddRegionModal(false);
      loadDashboardData();
    } catch (err) {
      alert("Error uploading file: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleAddCity() {
    if (!newCity.name || !newCity.latitude || !newCity.longitude || !newCity.region_id) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      const lat = parseFloat(newCity.latitude);
      const lng = parseFloat(newCity.longitude);

      if (isNaN(lat) || isNaN(lng)) {
        alert("Invalid coordinates");
        return;
      }

      const slug = newCity.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const geojsonString = JSON.stringify({
        type: "Point",
        coordinates: [lng, lat],
      });

      const { error } = await supabase.from("cities").insert({
        name: newCity.name,
        slug,
        region_id: newCity.region_id,
        image_url: newCity.image_url || null,
        geom: `SRID=4326;${geojsonString}`,
      });

      if (error) throw error;

      alert("City added successfully!");
      setNewCity({
        name: "",
        latitude: "",
        longitude: "",
        region_id: regionsWithCities[0]?.id || "",
        image_url: "",
      });
      setShowAddCityModal(false);
      loadDashboardData();
    } catch (err) {
      alert("Error adding city: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      {/* Header */}
      <div className="pb-4 border-b border-border pl-12 lg:pl-0">
        <h1 className="text-lg sm:text-xl font-semibold text-foreground">Regions Overview</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {regionsWithCities.length} {regionsWithCities.length === 1 ? 'region' : 'regions'} total
        </p>
      </div>

      {/* Regions Grid */}
      {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading dashboard data...</p>
            </div>
          </div>
        ) : regionsWithCities.length === 0 ? (
          <Card className="border-border">
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-3">
                <Hexagon className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No regions yet</h3>
              <p className="text-xs text-muted-foreground text-center mb-4 max-w-md">
                Upload a GeoJSON file to get started
              </p>
              <Button size="sm" onClick={() => setShowAddRegionModal(true)}>
                <Plus className="w-3 h-3 mr-1.5" />
                Add Region
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {regionsWithCities.map((region) => {
                const displayCities = region.cities.slice(0, 5);
                const remainingCount = region.cities.length - 5;

                return (
                  <Card key={region.id} className="border-border overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                    {/* Region Header */}
                    <div className="p-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                            <Hexagon className="w-4 h-4 text-primary" />
                          </div>
                          <h3 className="font-medium text-foreground text-sm leading-tight">{region.name}</h3>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {region.cities.length}
                        </Badge>
                      </div>
                    </div>

                    {/* Cities List */}
                    <div className="p-3 flex-1 flex flex-col min-h-[180px]">
                      {region.cities.length > 0 ? (
                        <div className="space-y-1.5">
                          {displayCities.map((city) => (
                            <div
                              key={city.id}
                              className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 transition-colors"
                            >
                              <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                              <span className="text-xs font-medium text-foreground truncate flex-1">{city.name}</span>
                              {city.image_url && (
                                <div className="h-4 w-4 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-[8px] font-medium text-green-600 dark:text-green-400">IMG</span>
                                </div>
                              )}
                            </div>
                          ))}
                          {remainingCount > 0 && (
                            <div className="text-xs text-muted-foreground text-center pt-1 pb-0.5">
                              +{remainingCount} more {remainingCount === 1 ? 'city' : 'cities'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-6 flex-1 flex flex-col items-center justify-center">
                          <MapPin className="w-8 h-8 text-muted-foreground mb-2 opacity-50" />
                          <p className="text-xs text-muted-foreground mb-2">No cities yet</p>
                          <Link href={`/admin/cities?add=true&region=${region.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add City
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
        )
      }

      {/* Add Region Modal */}
      {showAddRegionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Add Region</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddRegionModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground mb-1">Upload GeoJSON File</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload region boundaries
                </p>
                <Button
                  size="sm"
                  disabled={uploading}
                  onClick={() => document.getElementById("dashboard-region-upload")?.click()}
                >
                  <Upload className="w-3 h-3 mr-1.5" />
                  {uploading ? "Uploading..." : "Choose File"}
                </Button>
                <input
                  id="dashboard-region-upload"
                  type="file"
                  accept=".geojson,.json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Add City Modal */}
      {showAddCityModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-foreground">Add City</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCityModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="dashboard-city-name">City Name *</Label>
                <Input
                  id="dashboard-city-name"
                  value={newCity.name}
                  onChange={(e) => setNewCity({ ...newCity, name: e.target.value })}
                  placeholder="Enter city name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dashboard-latitude">Latitude *</Label>
                  <Input
                    id="dashboard-latitude"
                    value={newCity.latitude}
                    onChange={(e) => setNewCity({ ...newCity, latitude: e.target.value })}
                    placeholder="27.9506"
                  />
                </div>
                <div>
                  <Label htmlFor="dashboard-longitude">Longitude *</Label>
                  <Input
                    id="dashboard-longitude"
                    value={newCity.longitude}
                    onChange={(e) => setNewCity({ ...newCity, longitude: e.target.value })}
                    placeholder="-82.4572"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="dashboard-region">Region *</Label>
                <Select
                  value={newCity.region_id}
                  onValueChange={(value) => setNewCity({ ...newCity, region_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regionsWithCities.map((region) => (
                      <SelectItem key={region.id} value={region.id}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="dashboard-image-url">Image URL</Label>
                <Input
                  id="dashboard-image-url"
                  value={newCity.image_url}
                  onChange={(e) => setNewCity({ ...newCity, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button onClick={handleAddCity} size="sm" className="flex-1">
                  <Plus className="w-3 h-3 mr-1.5" />
                  Add City
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCityModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
