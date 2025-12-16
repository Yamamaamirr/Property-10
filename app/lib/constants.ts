/**
 * Map Configuration Constants
 */
export const MAP_CONFIG = {
  // Initial map position
  INITIAL_CENTER: [-81.5158, 27.6648] as [number, number], // Florida center
  INITIAL_ZOOM: 4.5,
  ANIMATED_ZOOM: 5.8,

  // Zoom limits
  MIN_ZOOM: 5, // Allow zooming out to see full AOI
  MAX_ZOOM: 18, // Allow zooming in for property details

  // Animation timings (in milliseconds)
  INITIAL_ANIMATION_DELAY: 800, // Start zoom after fade-in completes (700ms)
  INITIAL_ANIMATION_DURATION: 2000,
  PAN_ANIMATION_DURATION: 800,
  ZOOM_BACK_DELAY: 900,
  ZOOM_BACK_DURATION: 600,
  POPUP_SHOW_DELAY: 100,

  // Map positioning
  MARKER_OFFSET_FROM_RIGHT: 150, // pixels from right edge
  MAX_PAN_SHIFT_PERCENT: 0.3, // 30% of map width

  // Marker zoom adjustment
  MARKER_ZOOM_INCREASE: 0.2,

  // Animation curves
  EASE_OUT_QUAD: (t: number) => t * (2 - t),
  FLY_CURVE: 1.2,
  FLY_SPEED: 1.2,
} as const;

/**
 * Map Style Colors
 * Using Tailwind custom colors for consistency
 * See tailwind.config.ts for color definitions
 */
export const MAP_COLORS = {
  // Background and overlays
  DARK_BACKGROUND: '#0a1132',      // p10-dark
  FLORIDA_FILL: '#163552',         // deeper blue tone

  // Border effects
  OUTLINE_SHADOW: '#0a1f35',       // deepened shadow for contrast
  OUTLINE_HIGHLIGHT: '#76c8fe',    // p10-maya
  OUTLINE_CORE: '#005a71',         // deeper blue-munsell tone

  // Text and UI
  TEXT_COLOR: '#ffffff',           // white
  TEXT_HALO: '#0a1132',           // p10-dark
  LOADING_TEXT: '#8b9dc3',        // p10-text-muted

  // Pin colors
  PIN_GRADIENT_START: '#00d4ff',   // p10-cyan
  PIN_GRADIENT_END: '#00879f',     // p10-blue-munsell
  PIN_PULSE: '#00d4ff',           // p10-cyan
} as const;

/**
 * Map Layer Opacities
 */
export const MAP_OPACITY = {
  DARK_MASK: 0.85,
  FLORIDA_FILL: 0.3,
  OUTLINE_SHADOW: 0.8,
  OUTLINE_HIGHLIGHT: 0.45,
  OUTLINE_MAIN: 0.9,
  PIN_GLOW: 0.2,
  PIN_PULSE_START: 0.8,
  PIN_PULSE_END: 0,
} as const;

/**
 * Map Layer Line Widths
 */
export const MAP_LINE_WIDTH = {
  OUTLINE_SHADOW: 3,
  OUTLINE_HIGHLIGHT: 1.2,
  OUTLINE_MAIN: 0.65,
  TEXT_HALO: 2,
  PIN_PULSE: 2,
} as const;

/**
 * Map Layer Offsets
 */
export const MAP_OFFSETS = {
  SHADOW: 1,
  HIGHLIGHT: -1,
} as const;

/**
 * Pin Icon Configuration
 */
export const PIN_CONFIG = {
  WIDTH: 40,
  HEIGHT: 52,
  SIZE: 1, // MapLibre size multiplier
  ANCHOR: 'bottom' as const,

  // Pulse animation
  PULSE_DURATION: 2, // seconds
  PULSE_FROM_RADIUS: 8,
  PULSE_TO_RADIUS: 15,

  // SVG dimensions
  CENTER_X: 20,
  CENTER_Y: 14,
  GLOW_RADIUS: 13,
  INNER_CIRCLE_RADIUS: 7,
  PULSE_RADIUS: 11,
} as const;

/**
 * Circular Marker Configuration
 */
export const MARKER_CONFIG = {
  // Base marker size (in pixels at zoom level)
  RADIUS: 7.5,
  RADIUS_SELECTED: 10,

  // Stroke widths (alice blue outer ring)
  STROKE_WIDTH: 3.5,
  STROKE_WIDTH_SELECTED: 4,

  // Outer glow ring
  OUTER_RING_RADIUS: 16,
  OUTER_RING_RADIUS_SELECTED: 20,

  // Animation
  FLY_TO_ZOOM: 9,
  FLY_TO_DURATION: 1500,
  FLY_TO_CURVE: 1.4,
} as const;

/**
 * Marker Colors (using p10 palette)
 */
export const MARKER_COLORS = {
  // Default state - darker blue munsell fill with grayish blue border
  FILL: '#006d80',              // darker blue munsell
  FILL_OPACITY: 1,
  STROKE: '#9aadd0',            // slightly lighter grayish blue
  STROKE_OPACITY: 1,

  // Outer glow
  GLOW: '#006d80',              // darker blue munsell
  GLOW_OPACITY: 0.3,

  // Selected state - same colors, just bigger
  SELECTED_FILL: '#006d80',      // darker blue munsell
  SELECTED_FILL_OPACITY: 1,
  SELECTED_STROKE: '#9aadd0',    // slightly lighter grayish blue
  SELECTED_STROKE_OPACITY: 1,
  SELECTED_GLOW: '#006d80',      // darker blue munsell
  SELECTED_GLOW_OPACITY: 0.5,

  // Hover state
  HOVER_FILL: '#00a0bf',         // lighter blue munsell
} as const;

/**
 * Text Configuration
 */
export const TEXT_CONFIG = {
  FONT: ['Open Sans Regular'] as string[],
  SIZE: 12,
  OFFSET: [0, -4.5] as [number, number],
  ANCHOR: 'top' as const,
  ALLOW_OVERLAP: false,
};

/**
 * Popup Configuration
 */
export const POPUP_CONFIG = {
  CLOSE_BUTTON: true,
  CLOSE_ON_CLICK: false,
  OFFSET: 25,
} as const;

/**
 * World Bounding Box for Cookie-Cutter Effect
 */
export const WORLD_BOUNDING_BOX: [number, number][] = [
  [-180, -90],  // Bottom-left
  [180, -90],   // Bottom-right
  [180, 90],    // Top-right
  [-180, 90],   // Top-left
  [-180, -90],  // Close the ring
] as const;

/**
 * SVG Templates
 */
export const SVG_TEMPLATES = {
  PIN_GRADIENT_ID: 'pinGradient',
  GLOW_FILTER_ID: 'glow',
  SHADOW_FILTER_ID: 'shadow',
} as const;
