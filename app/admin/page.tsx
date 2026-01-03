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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { supabase } from "@/app/lib/supabase";
import { Map as MapIcon, MapPin, Plus, Upload, X, ChevronDown, ChevronRight } from "lucide-react";
import type { Region, City, GeoJSONData } from "@/app/lib/types";
import { saveRegionsFromGeoJSON } from "@/app/lib/api/regions";

interface RegionWithCities extends Region {
  cities: City[];
  expanded?: boolean;
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
        regionsMap.set(region.id, { ...region, cities: [], expanded: false });
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

  function toggleRegion(regionId: string) {
    setRegionsWithCities((prev) =>
      prev.map((r) => (r.id === regionId ? { ...r, expanded: !r.expanded } : r))
    );
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
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage all regions and cities in the system
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowAddRegionModal(true)} className="shadow-lg">
            <Plus className="w-4 h-4 mr-2" />
            Add Region
          </Button>
          <Button onClick={() => setShowAddCityModal(true)} variant="secondary" className="shadow-lg">
            <Plus className="w-4 h-4 mr-2" />
            Add City
          </Button>
        </div>
      </div>

      {/* Regions & Cities Table */}
      <Card className="border-border">
        <div className="overflow-auto">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : regionsWithCities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <MapIcon className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground text-center mb-4">
                No regions yet. Upload a GeoJSON file or add regions manually to get started.
              </p>
              <Button onClick={() => setShowAddRegionModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Region
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Cities Count</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regionsWithCities.map((region) => (
                  <React.Fragment key={region.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => toggleRegion(region.id)}
                    >
                      <TableCell>
                        <button className="text-muted-foreground hover:text-foreground">
                          {region.expanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <MapIcon className="w-4 h-4 text-primary" />
                          {region.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {region.cities.length} {region.cities.length === 1 ? "city" : "cities"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(region.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                    {region.expanded && region.cities.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-secondary/20 p-0">
                          <div className="py-2 px-12">
                            <div className="space-y-1">
                              {region.cities.map((city) => (
                                <div
                                  key={city.id}
                                  className="flex items-center gap-2 py-2 px-3 rounded hover:bg-secondary/50 transition-colors text-sm"
                                >
                                  <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                                  <span className="flex-1 text-foreground">{city.name}</span>
                                  {city.image_url && (
                                    <span className="text-xs text-muted-foreground">Has image</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {region.expanded && region.cities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-secondary/20">
                          <div className="py-4 px-12 text-center text-sm text-muted-foreground italic">
                            No cities in this region yet
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* Add Region Modal */}
      {showAddRegionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-foreground">Add Region</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddRegionModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h4 className="font-medium text-foreground mb-2">Upload GeoJSON File</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a GeoJSON file containing region boundaries
                </p>
                <Button
                  disabled={uploading}
                  onClick={() => document.getElementById("dashboard-region-upload")?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
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
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-foreground">Add City</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCityModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
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

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAddCity} className="flex-1">
                  <Plus className="w-4 h-4 mr-2" />
                  Add City
                </Button>
                <Button
                  variant="outline"
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
