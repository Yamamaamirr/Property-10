"use client";

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './popup.css';

export default function FloridaMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isClient, setIsClient] = useState(false);
  const currentPopup = useRef<maplibregl.Popup | null>(null);
  const isMapScrolled = useRef(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || map.current || !mapContainer.current) return;

    // Initialize MapTiler map with your custom P10 style
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/019b0c46-bf3e-725a-ab49-336f71fa22af/style.json?key=eCZZ2tIYqyT9UxcwT28y',
      center: [-81.5158, 27.6648], // Florida center
      zoom: 4.5, // Start zoomed out
      minZoom: 5,
      maxZoom: 18,
      attributionControl: {}
    });

    // Add zoom and navigation controls
    map.current.addControl(new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true
    }), 'top-right');

    map.current.on('load', async () => {
      if (!map.current) return;

      // Animate zoom in on first load
      setTimeout(() => {
        if (map.current) {
          map.current.easeTo({
            zoom: 5.8,
            duration: 2000,
            easing: (t) => t * (2 - t) // ease out quad
          });
        }
      }, 500);

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

        // Add semi-transparent dark overlay outside Florida
        map.current.addLayer({
          id: 'dark-mask',
          type: 'fill',
          source: {
            type: 'geojson',
            data: worldMinusFlorida
          },
          paint: {
            'fill-color': '#0a1132', // Dark blue background
            'fill-opacity': 0.85 // Semi-transparent to show map details underneath
          }
        });

        // Add subtle Florida highlight
        map.current.addLayer({
          id: 'florida-fill',
          type: 'fill',
          source: {
            type: 'geojson',
            data: floridaBoundary
          },
          paint: {
            'fill-color': '#2d5a7b', // Medium blue tint for Florida
            'fill-opacity': 0.3 // Semi-transparent to show map details
          }
        });

        // Add emboss effect with shadow (dark border)
        map.current.addLayer({
          id: 'florida-outline-shadow',
          type: 'line',
          source: {
            type: 'geojson',
            data: floridaBoundary
          },
          paint: {
            'line-color': '#0d1228', // Darker shade for shadow effect
            'line-width': 3,
            'line-opacity': 0.8,
            'line-offset': 1
          }
        });

        // Add emboss effect with highlight (light border)
        map.current.addLayer({
          id: 'florida-outline-highlight',
          type: 'line',
          source: {
            type: 'geojson',
            data: floridaBoundary
          },
          paint: {
            'line-color': '#2a3d6e', // Lighter shade for highlight effect
            'line-width': 2,
            'line-opacity': 0.6,
            'line-offset': -1
          }
        });

        // Add main border with background color
        map.current.addLayer({
          id: 'florida-outline',
          type: 'line',
          source: {
            type: 'geojson',
            data: floridaBoundary
          },
          paint: {
            'line-color': '#0a1132', // Same as background for subtle effect
            'line-width': 1,
            'line-opacity': 0.5
          }
        });

        // Add location markers for major Florida cities with property data
        const locations = [
          {
            name: 'Miami Beach, Florida',
            coordinates: [-80.1918, 25.7617],
            title: 'Undervalued Beachfront Duplex',
            price: '$4M - $5M',
            size: '3,200 sqft - 4000sqft',
            tags: ['Oceanfront', 'Gated Community', 'High-Rise Security'],
            image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop'
          },
          {
            name: 'Tampa, Florida',
            coordinates: [-82.4572, 27.9506],
            title: 'Modern Waterfront Villa',
            price: '$3M - $4M',
            size: '2,800 sqft - 3500sqft',
            tags: ['Waterfront', 'Pool', 'Smart Home'],
            image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&h=300&fit=crop'
          },
          {
            name: 'Orlando, Florida',
            coordinates: [-81.3792, 28.5383],
            title: 'Luxury Estate with Golf Course',
            price: '$2M - $3M',
            size: '4,000 sqft - 5000sqft',
            tags: ['Golf Course', 'Gated', 'Resort Style'],
            image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=300&fit=crop'
          },
          {
            name: 'Jacksonville, Florida',
            coordinates: [-81.6557, 30.3322],
            title: 'Riverfront Family Home',
            price: '$1.5M - $2M',
            size: '3,000 sqft - 3800sqft',
            tags: ['Riverfront', 'Large Yard', 'Family Friendly'],
            image: 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=400&h=300&fit=crop'
          },
          {
            name: 'Tallahassee, Florida',
            coordinates: [-84.2807, 30.4383],
            title: 'Historic Downtown Mansion',
            price: '$1M - $1.5M',
            size: '3,500 sqft - 4200sqft',
            tags: ['Historic', 'Downtown', 'Classic'],
            image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=300&fit=crop'
          },
          {
            name: 'Fort Lauderdale, Florida',
            coordinates: [-80.1373, 26.1224],
            title: 'Canal-Front Modern Home',
            price: '$3.5M - $4.5M',
            size: '3,300 sqft - 4100sqft',
            tags: ['Canal Access', 'Boat Dock', 'Modern'],
            image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=400&h=300&fit=crop'
          },
          {
            name: 'St. Petersburg, Florida',
            coordinates: [-82.6403, 27.7706],
            title: 'Beach Bungalow Paradise',
            price: '$2.5M - $3.5M',
            size: '2,500 sqft - 3200sqft',
            tags: ['Beach Access', 'Renovated', 'Tropical'],
            image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=400&h=300&fit=crop'
          },
          {
            name: 'Naples, Florida',
            coordinates: [-81.7948, 26.1420],
            title: 'Golf Community Estate',
            price: '$4.5M - $5.5M',
            size: '4,500 sqft - 5500sqft',
            tags: ['Golf Course', 'Luxury', 'Country Club'],
            image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400&h=300&fit=crop'
          },
          {
            name: 'Key West, Florida',
            coordinates: [-81.7800, 24.5551],
            title: 'Island Paradise Retreat',
            price: '$5M - $6M',
            size: '2,200 sqft - 3000sqft',
            tags: ['Island Living', 'Private Beach', 'Tropical'],
            image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&h=300&fit=crop'
          },
          {
            name: 'Pensacola, Florida',
            coordinates: [-87.2169, 30.4213],
            title: 'Coastal Contemporary Home',
            price: '$1.8M - $2.5M',
            size: '3,100 sqft - 3900sqft',
            tags: ['Beachfront', 'Contemporary', 'Open Concept'],
            image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&h=600&fit=crop&q=80'
          }
        ];

        // Create GeoJSON for location markers
        const locationsGeoJSON: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: locations.map(loc => ({
            type: 'Feature',
            properties: {
              name: loc.name,
              title: loc.title,
              price: loc.price,
              size: loc.size,
              tags: JSON.stringify(loc.tags),
              image: loc.image
            },
            geometry: {
              type: 'Point',
              coordinates: loc.coordinates
            }
          }))
        };

        // Create SVG for Google-style location pin
        const createPinSVG = () => {
          const svg = `
            <svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#00d4ff;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#00879f;stop-opacity:1" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.4"/>
                </filter>
              </defs>

              <!-- Outer glow circle -->
              <circle cx="20" cy="14" r="13" fill="url(#pinGradient)" opacity="0.2"/>

              <!-- Main pin shape with gradient -->
              <path d="M20 2C13.373 2 8 7.373 8 14c0 9.5 12 32 12 32s12-22.5 12-32c0-6.627-5.373-12-12-12z"
                    fill="url(#pinGradient)" filter="url(#shadow)"/>

              <!-- Inner white circle with border -->
              <circle cx="20" cy="14" r="7" fill="#FFFFFF" filter="url(#glow)"/>

              <!-- Property icon in center -->
              <g transform="translate(20, 14)">
                <path d="M-3,-4 L0,-6 L3,-4 L3,3 L-3,3 Z" fill="#00879f"/>
                <rect x="-2" y="-1" width="1.5" height="2" fill="#FFFFFF" opacity="0.7"/>
                <rect x="0.5" y="-1" width="1.5" height="2" fill="#FFFFFF" opacity="0.7"/>
                <rect x="-1" y="1.5" width="2" height="1.5" fill="#FFFFFF" opacity="0.7"/>
              </g>

              <!-- Pulse ring animation -->
              <circle cx="20" cy="14" r="11" fill="none" stroke="#00d4ff" stroke-width="2" opacity="0.6">
                <animate attributeName="r" from="8" to="15" dur="2s" repeatCount="indefinite"/>
                <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite"/>
              </circle>
            </svg>
          `;
          return `data:image/svg+xml;base64,${btoa(svg)}`;
        };

        // Load the pin icon
        const pinImage = new Image(40, 52);
        pinImage.onload = () => {
          if (!map.current) return;

          map.current.addImage('location-pin', pinImage);

          // Add source for location markers
          map.current.addSource('locations', {
            type: 'geojson',
            data: locationsGeoJSON
          });

          // Add location markers with custom pin icon
          map.current.addLayer({
            id: 'location-markers',
            type: 'symbol',
            source: 'locations',
            layout: {
              'icon-image': 'location-pin',
              'icon-size': 1,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
              'text-field': ['get', 'name'],
              'text-font': ['Open Sans Regular'],
              'text-offset': [0, -4.5],
              'text-anchor': 'top',
              'text-size': 12,
              'text-allow-overlap': false
            },
            paint: {
              'text-color': '#ffffff',
              'text-halo-color': '#0a1132',
              'text-halo-width': 2
            }
          });

          // Add click event to show popup
          map.current.on('click', 'location-markers', (e) => {
            if (!e.features || !e.features[0]) return;

            const feature = e.features[0];
            const coordinates = (feature.geometry as any).coordinates.slice();
            const props = feature.properties;

            // Parse tags from JSON string
            const tags = JSON.parse(props.tags || '[]');

            // Create popup HTML
            const popupHTML = `
              <div class="property-popup">
                <div class="popup-header">
                  <svg class="popup-logo-text" viewBox="0 0 200 70" xmlns="http://www.w3.org/2000/svg">
                    <text x="0" y="30" font-family="Poppins" font-weight="700" font-size="27" fill="white">PROPERTY 10</text>
                    <text x="0" y="55" font-family="Poppins" font-weight="400" font-size="19" fill="white" letter-spacing="4">F L O R I D A</text>
                  </svg>
                  <svg class="popup-logo-icon" viewBox="0 0 250 200" xmlns="http://www.w3.org/2000/svg">
                    <!-- Building icon matching the Property 10 logo -->
                    <g fill="white" transform="translate(0, -8)">
                      <!-- Left building -->
                      <rect x="45" y="85" width="25" height="50"/>
                      <rect x="47" y="88" width="4" height="4" fill="#0a1132"/>
                      <rect x="53" y="88" width="4" height="4" fill="#0a1132"/>
                      <rect x="59" y="88" width="4" height="4" fill="#0a1132"/>
                      <rect x="47" y="95" width="4" height="4" fill="#0a1132"/>
                      <rect x="53" y="95" width="4" height="4" fill="#0a1132"/>
                      <rect x="59" y="95" width="4" height="4" fill="#0a1132"/>
                      <rect x="47" y="102" width="4" height="4" fill="#0a1132"/>
                      <rect x="53" y="102" width="4" height="4" fill="#0a1132"/>
                      <rect x="59" y="102" width="4" height="4" fill="#0a1132"/>

                      <!-- Middle-left building -->
                      <rect x="75" y="70" width="25" height="65"/>
                      <rect x="77" y="73" width="4" height="4" fill="#0a1132"/>
                      <rect x="83" y="73" width="4" height="4" fill="#0a1132"/>
                      <rect x="89" y="73" width="4" height="4" fill="#0a1132"/>
                      <rect x="77" y="80" width="4" height="4" fill="#0a1132"/>
                      <rect x="83" y="80" width="4" height="4" fill="#0a1132"/>
                      <rect x="89" y="80" width="4" height="4" fill="#0a1132"/>
                      <rect x="77" y="87" width="4" height="4" fill="#0a1132"/>
                      <rect x="83" y="87" width="4" height="4" fill="#0a1132"/>
                      <rect x="89" y="87" width="4" height="4" fill="#0a1132"/>
                      <rect x="77" y="94" width="4" height="4" fill="#0a1132"/>
                      <rect x="83" y="94" width="4" height="4" fill="#0a1132"/>
                      <rect x="89" y="94" width="4" height="4" fill="#0a1132"/>

                      <!-- Center tall building -->
                      <rect x="105" y="35" width="30" height="100"/>
                      <rect x="108" y="40" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="40" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="40" width="5" height="5" fill="#0a1132"/>
                      <rect x="108" y="48" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="48" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="48" width="5" height="5" fill="#0a1132"/>
                      <rect x="108" y="56" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="56" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="56" width="5" height="5" fill="#0a1132"/>
                      <rect x="108" y="64" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="64" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="64" width="5" height="5" fill="#0a1132"/>
                      <rect x="108" y="72" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="72" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="72" width="5" height="5" fill="#0a1132"/>
                      <rect x="108" y="80" width="5" height="5" fill="#0a1132"/>
                      <rect x="115" y="80" width="5" height="5" fill="#0a1132"/>
                      <rect x="122" y="80" width="5" height="5" fill="#0a1132"/>

                      <!-- Peak/triangle on top of center building -->
                      <polygon points="120,15 105,35 135,35"/>

                      <!-- Middle-right building -->
                      <rect x="140" y="55" width="25" height="80"/>
                      <rect x="142" y="58" width="4" height="4" fill="#0a1132"/>
                      <rect x="148" y="58" width="4" height="4" fill="#0a1132"/>
                      <rect x="154" y="58" width="4" height="4" fill="#0a1132"/>
                      <rect x="142" y="65" width="4" height="4" fill="#0a1132"/>
                      <rect x="148" y="65" width="4" height="4" fill="#0a1132"/>
                      <rect x="154" y="65" width="4" height="4" fill="#0a1132"/>
                      <rect x="142" y="72" width="4" height="4" fill="#0a1132"/>
                      <rect x="148" y="72" width="4" height="4" fill="#0a1132"/>
                      <rect x="154" y="72" width="4" height="4" fill="#0a1132"/>
                      <rect x="142" y="79" width="4" height="4" fill="#0a1132"/>
                      <rect x="148" y="79" width="4" height="4" fill="#0a1132"/>
                      <rect x="154" y="79" width="4" height="4" fill="#0a1132"/>

                      <!-- Right building -->
                      <rect x="170" y="75" width="25" height="60"/>
                      <rect x="172" y="78" width="4" height="4" fill="#0a1132"/>
                      <rect x="178" y="78" width="4" height="4" fill="#0a1132"/>
                      <rect x="184" y="78" width="4" height="4" fill="#0a1132"/>
                      <rect x="172" y="85" width="4" height="4" fill="#0a1132"/>
                      <rect x="178" y="85" width="4" height="4" fill="#0a1132"/>
                      <rect x="184" y="85" width="4" height="4" fill="#0a1132"/>
                      <rect x="172" y="92" width="4" height="4" fill="#0a1132"/>
                      <rect x="178" y="92" width="4" height="4" fill="#0a1132"/>
                      <rect x="184" y="92" width="4" height="4" fill="#0a1132"/>
                    </g>
                    <!-- Ground line -->
                    <line x1="40" y1="127" x2="200" y2="127" stroke="white" stroke-width="3"/>
                    <!-- P10 text below the logo -->
                    <text x="120" y="168" font-family="Poppins" font-weight="700" font-size="43" fill="white" text-anchor="middle">P10</text>
                  </svg>
                </div>
                <div class="popup-image-container">
                  <img src="${props.image}" alt="${props.title}" class="popup-image" />
                  <button class="view-full-map">View full Map</button>
                </div>
                <div class="popup-content">
                  <h3 class="popup-title">${props.title}</h3>
                  <div class="popup-location">
                    <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="currentColor"/>
                    </svg>
                    <span>${props.name}</span>
                  </div>
                  <div class="popup-details">
                    <span class="popup-price">${props.price}</span>
                    <span class="popup-size">${props.size}</span>
                  </div>
                  <div class="popup-tags">
                    ${tags.map((tag: string) => `<span class="popup-tag">${tag}</span>`).join('')}
                  </div>
                  <button class="popup-preference">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="0.5" y="0.5" width="15" height="15" rx="1.5" stroke="currentColor"/>
                    </svg>
                    Add to Preferences
                  </button>
                </div>
              </div>
            `;

            // Only scroll the map on first click
            if (!isMapScrolled.current) {
              // Pan map so marker appears 150px from right edge (middle-right position)
              const mapWidth = map.current!.getContainer().clientWidth;
              const mapHeight = map.current!.getContainer().clientHeight;
              const currentCenter = map.current!.getCenter();
              const currentZoom = map.current!.getZoom();

              // Calculate how much to shift the map
              // We want the marker at 150px from right edge instead of center
              const point = map.current!.project(coordinates);
              const targetX = mapWidth - 150; // 150px from right edge

              // Calculate the shift needed in pixels
              const shiftX = point.x - targetX;

              // Limit the shift to prevent map from going too far
              // Maximum shift is 30% of map width to keep Florida in view
              const maxShift = mapWidth * 0.3;
              const limitedShiftX = Math.max(-maxShift, Math.min(maxShift, shiftX));

              // Project current center to pixels, shift it, and unproject back
              const centerPoint = map.current!.project(currentCenter);
              centerPoint.x += limitedShiftX;

              const newCenter = map.current!.unproject(centerPoint);

              // Smooth and elegant animation
              map.current!.flyTo({
                center: newCenter,
                zoom: currentZoom + 0.2,
                duration: 800,
                essential: true,
                curve: 1.2,
                speed: 1.2,
                easing: (t) => t * (2 - t) // Smooth ease-out
              });

              // After animation, zoom back out to fit the screen
              setTimeout(() => {
                if (map.current) {
                  map.current.easeTo({
                    zoom: currentZoom,
                    duration: 600,
                    easing: (t) => t * (2 - t)
                  });
                }
              }, 900);

              isMapScrolled.current = true;

              // Disable map dragging to freeze panning
              if (map.current) {
                map.current.dragPan.disable();
              }

              // Create and show popup after pan animation
              setTimeout(() => {
                // Remove existing popup if any
                if (currentPopup.current) {
                  currentPopup.current.remove();
                }

                // Create new popup
                currentPopup.current = new maplibregl.Popup({
                  closeButton: true,
                  closeOnClick: false,
                  offset: 25
                })
                  .setLngLat(coordinates)
                  .setHTML(popupHTML)
                  .addTo(map.current!);


                // Listen for popup close
                currentPopup.current.on('close', () => {
                  isMapScrolled.current = false;
                  currentPopup.current = null;
                  // Re-enable map dragging when popup is closed
                  if (map.current) {
                    map.current.dragPan.enable();
                  }
                });
              }, 100);
            } else {
              // Map already scrolled, just update popup content
              if (currentPopup.current) {
                currentPopup.current.setHTML(popupHTML);
              } else {
                // Create new popup if it was closed
                currentPopup.current = new maplibregl.Popup({
                  closeButton: true,
                  closeOnClick: false,
                  offset: 25
                })
                  .setLngLat(coordinates)
                  .setHTML(popupHTML)
                  .addTo(map.current!);


                // Listen for popup close
                currentPopup.current.on('close', () => {
                  isMapScrolled.current = false;
                  currentPopup.current = null;
                  // Re-enable map dragging when popup is closed
                  if (map.current) {
                    map.current.dragPan.enable();
                  }
                });
              }
            }
          });

          // Change cursor on hover
          map.current.on('mouseenter', 'location-markers', () => {
            if (map.current) {
              map.current.getCanvas().style.cursor = 'pointer';
            }
          });

          map.current.on('mouseleave', 'location-markers', () => {
            if (map.current) {
              map.current.getCanvas().style.cursor = '';
            }
          });
        };
        pinImage.src = createPinSVG();

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
  }, [isClient]);

  if (!isClient) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          position: 'relative',
          backgroundColor: '#0a1132',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#4a7ba7'
        }}
      >
        Loading map...
      </div>
    );
  }

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
