/**
 * Semantic design tokens for the Black Universe mobile app.
 *
 * These mirror the sibling web artifact (artifacts/asset-verify/src/index.css):
 * near-black surfaces, neon cyan accent, dim cyan-tinted borders.
 *
 * The app is intentionally dark-only, so the same palette is used for both the
 * `light` and `dark` keys — useColors() resolves to it regardless of the
 * device appearance setting.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility with the scaffold)
  text: "#fafafa",
  tint: "#00ffff",

  // Core surfaces
  background: "#0a0a0a",
  foreground: "#fafafa",

  // Cards / elevated surfaces
  card: "#121212",
  cardElevated: "#171717",
  cardForeground: "#fafafa",

  // Primary action color (buttons, links, active states)
  primary: "#00ffff",
  primaryForeground: "#0a0a0a",

  // Secondary / less-emphasis interactive surfaces
  secondary: "#171717",
  secondaryForeground: "#fafafa",

  // Muted / subdued elements (dividers, timestamps, placeholders)
  muted: "#171717",
  mutedForeground: "#7c8a8a",

  // Accent highlights (badges, selected items, focus rings)
  accent: "#0e2a2a",
  accentForeground: "#00ffff",

  // Status colors
  destructive: "#ff5c5c",
  destructiveForeground: "#0a0a0a",
  positive: "#22d3a6",
  warning: "#f4b740",

  // Borders and input outlines
  border: "#1d2727",
  borderStrong: "#27393a",
  input: "#141414",
};

const colors = {
  light: palette,
  dark: palette,

  // Border radius (in px). Synced from the web artifact's --radius (0.375rem).
  radius: 6,
};

export default colors;
