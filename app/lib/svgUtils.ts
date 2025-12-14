import { PIN_CONFIG, MAP_COLORS, MAP_OPACITY, SVG_TEMPLATES, MAP_LINE_WIDTH } from './constants';

/**
 * Creates the SVG for the location pin marker
 * This function is memoized to avoid recreation on every render
 */
export function createPinSVG(): string {
  const svg = `
    <svg width="${PIN_CONFIG.WIDTH}" height="${PIN_CONFIG.HEIGHT}" viewBox="0 0 ${PIN_CONFIG.WIDTH} ${PIN_CONFIG.HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${SVG_TEMPLATES.PIN_GRADIENT_ID}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${MAP_COLORS.PIN_GRADIENT_START};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${MAP_COLORS.PIN_GRADIENT_END};stop-opacity:1" />
        </linearGradient>
        <filter id="${SVG_TEMPLATES.GLOW_FILTER_ID}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="${SVG_TEMPLATES.SHADOW_FILTER_ID}" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.4"/>
        </filter>
      </defs>

      <!-- Outer glow circle -->
      <circle cx="${PIN_CONFIG.CENTER_X}" cy="${PIN_CONFIG.CENTER_Y}" r="${PIN_CONFIG.GLOW_RADIUS}" fill="url(#${SVG_TEMPLATES.PIN_GRADIENT_ID})" opacity="${MAP_OPACITY.PIN_GLOW}"/>

      <!-- Main pin shape with gradient -->
      <path d="M${PIN_CONFIG.CENTER_X} 2C13.373 2 8 7.373 8 ${PIN_CONFIG.CENTER_Y}c0 9.5 12 32 12 32s12-22.5 12-32c0-6.627-5.373-12-12-12z"
            fill="url(#${SVG_TEMPLATES.PIN_GRADIENT_ID})" filter="url(#${SVG_TEMPLATES.SHADOW_FILTER_ID})"/>

      <!-- Inner white circle with border -->
      <circle cx="${PIN_CONFIG.CENTER_X}" cy="${PIN_CONFIG.CENTER_Y}" r="${PIN_CONFIG.INNER_CIRCLE_RADIUS}" fill="#FFFFFF" filter="url(#${SVG_TEMPLATES.GLOW_FILTER_ID})"/>

      <!-- Property icon in center -->
      <g transform="translate(${PIN_CONFIG.CENTER_X}, ${PIN_CONFIG.CENTER_Y})">
        <path d="M-3,-4 L0,-6 L3,-4 L3,3 L-3,3 Z" fill="${MAP_COLORS.PIN_GRADIENT_END}"/>
        <rect x="-2" y="-1" width="1.5" height="2" fill="#FFFFFF" opacity="0.7"/>
        <rect x="0.5" y="-1" width="1.5" height="2" fill="#FFFFFF" opacity="0.7"/>
        <rect x="-1" y="1.5" width="2" height="1.5" fill="#FFFFFF" opacity="0.7"/>
      </g>

      <!-- Pulse ring animation -->
      <circle cx="${PIN_CONFIG.CENTER_X}" cy="${PIN_CONFIG.CENTER_Y}" r="${PIN_CONFIG.PULSE_RADIUS}" fill="none" stroke="${MAP_COLORS.PIN_PULSE}" stroke-width="${MAP_LINE_WIDTH.PIN_PULSE}" opacity="0.6">
        <animate attributeName="r" from="${PIN_CONFIG.PULSE_FROM_RADIUS}" to="${PIN_CONFIG.PULSE_TO_RADIUS}" dur="${PIN_CONFIG.PULSE_DURATION}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="${MAP_OPACITY.PIN_PULSE_START}" to="${MAP_OPACITY.PIN_PULSE_END}" dur="${PIN_CONFIG.PULSE_DURATION}s" repeatCount="indefinite"/>
      </circle>
    </svg>
  `;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Creates the Property 10 logo SVG for popups
 */
export function createLogoSVG(): string {
  return `
    <svg class="popup-logo-icon" viewBox="0 0 250 200" xmlns="http://www.w3.org/2000/svg">
      <!-- Building icon matching the Property 10 logo -->
      <g fill="white" transform="translate(0, -8)">
        <!-- Left building -->
        <rect x="45" y="85" width="25" height="50"/>
        <rect x="47" y="88" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="53" y="88" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="59" y="88" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="47" y="95" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="53" y="95" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="59" y="95" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="47" y="102" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="53" y="102" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="59" y="102" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>

        <!-- Middle-left building -->
        <rect x="75" y="70" width="25" height="65"/>
        <rect x="77" y="73" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="83" y="73" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="89" y="73" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="77" y="80" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="83" y="80" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="89" y="80" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="77" y="87" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="83" y="87" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="89" y="87" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="77" y="94" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="83" y="94" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="89" y="94" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>

        <!-- Center tall building -->
        <rect x="105" y="35" width="30" height="100"/>
        <rect x="108" y="40" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="40" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="40" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="108" y="48" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="48" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="48" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="108" y="56" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="56" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="56" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="108" y="64" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="64" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="64" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="108" y="72" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="72" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="72" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="108" y="80" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="115" y="80" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="122" y="80" width="5" height="5" fill="${MAP_COLORS.DARK_BACKGROUND}"/>

        <!-- Peak/triangle on top of center building -->
        <polygon points="120,15 105,35 135,35"/>

        <!-- Middle-right building -->
        <rect x="140" y="55" width="25" height="80"/>
        <rect x="142" y="58" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="148" y="58" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="154" y="58" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="142" y="65" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="148" y="65" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="154" y="65" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="142" y="72" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="148" y="72" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="154" y="72" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="142" y="79" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="148" y="79" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="154" y="79" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>

        <!-- Right building -->
        <rect x="170" y="75" width="25" height="60"/>
        <rect x="172" y="78" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="178" y="78" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="184" y="78" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="172" y="85" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="178" y="85" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="184" y="85" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="172" y="92" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="178" y="92" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
        <rect x="184" y="92" width="4" height="4" fill="${MAP_COLORS.DARK_BACKGROUND}"/>
      </g>
      <!-- Ground line -->
      <line x1="40" y1="127" x2="200" y2="127" stroke="white" stroke-width="3"/>
      <!-- P10 text below the logo -->
      <text x="120" y="168" font-family="Poppins" font-weight="700" font-size="43" fill="white" text-anchor="middle">P10</text>
    </svg>
  `;
}
