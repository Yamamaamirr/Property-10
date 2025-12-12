"use client";

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function FloridaMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    // Initialize MapTiler map with your custom P10 style
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/019b0c46-bf3e-725a-ab49-336f71fa22af/style.json?key=eCZZ2tIYqyT9UxcwT28y',
      center: [-81.5158, 27.6648], // Florida center
      zoom: 6,
      minZoom: 5,
      maxZoom: 18,
      attributionControl: {}
    });

    map.current.on('load', async () => {
      if (!map.current) return;

      try {
        // Load Florida boundary GeoJSON
        const response = await fetch('/fl-state.json');
        const floridaBoundary = await response.json();

        // Extract Florida coordinates
        // Handle both FeatureCollection and single Feature
        let floridaCoordinates;
        if (floridaBoundary.type === 'FeatureCollection') {
          floridaCoordinates = floridaBoundary.features[0].geometry.coordinates;
        } else if (floridaBoundary.type === 'Feature') {
          floridaCoordinates = floridaBoundary.geometry.coordinates;
        } else {
          // Direct geometry object
          floridaCoordinates = floridaBoundary.coordinates;
        }

        // ⭐ COOKIE-CUTTER MAGIC ⭐
        // Create a polygon that covers the ENTIRE WORLD
        // with Florida as a "hole" inside it

        // Start with the world bounding box (outer ring)
        const worldRing = [
          [-180, -90],  // Bottom-left
          [180, -90],   // Bottom-right
          [180, 90],    // Top-right
          [-180, 90],   // Top-left
          [-180, -90]   // Close the ring
        ];

        // Reverse Florida coordinates to create holes (counter-clockwise)
        // Handle MultiPolygon (multiple rings) and Polygon (single ring)
        let floridaRings;
        if (Array.isArray(floridaCoordinates[0][0][0])) {
          // MultiPolygon: array of polygons
          floridaRings = floridaCoordinates.flatMap((polygon: number[][][]) =>
            polygon.map((ring: number[][]) => ring.slice().reverse())
          );
        } else {
          // Polygon: array of rings
          floridaRings = floridaCoordinates.map((ring: number[][]) =>
            ring.slice().reverse()
          );
        }

        // Combine world ring with reversed Florida rings
        const worldMinusFlorida: GeoJSON.Feature<GeoJSON.Polygon> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [worldRing, ...floridaRings]
          }
        };

        // Add the dark mask layer to cover everything except Florida
        map.current.addLayer({
          id: 'dark-mask',
          type: 'fill',
          source: {
            type: 'geojson',
            data: worldMinusFlorida
          },
          paint: {
            'fill-color': '#0D0D0D', // P10 Night - dark void
            'fill-opacity': 1
          }
        });

        // Add Florida outline border for definition
        map.current.addLayer({
          id: 'florida-outline',
          type: 'line',
          source: {
            type: 'geojson',
            data: floridaBoundary
          },
          paint: {
            'line-color': '#FFD700', // Gold outline for contrast
            'line-width': 2,
            'line-opacity': 0.8
          }
        });

      } catch (error) {
        console.error('Error loading Florida boundary:', error);
      }
    });

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative'
      }}
    />
  );
}
