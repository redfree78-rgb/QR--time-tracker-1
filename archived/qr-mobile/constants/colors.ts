/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens are synced from the sibling web artifact `qr-tracker`
 * (artifacts/qr-tracker/src/index.css) so both artifacts share one
 * cohesive visual identity. HSL values from the web theme are converted
 * to hex here.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: "#0F172A",
    tint: "#2563EB",

    // Core surfaces
    background: "#F5F6F8",
    foreground: "#0F172A",

    // Cards / elevated surfaces
    card: "#FFFFFF",
    cardForeground: "#0F172A",

    // Primary action color (buttons, links, active states)
    primary: "#2563EB",
    primaryForeground: "#FFFFFF",

    // Secondary / less-emphasis interactive surfaces
    secondary: "#EBECF0",
    secondaryForeground: "#1B294B",

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: "#EBECF0",
    mutedForeground: "#6B7280",

    // Accent highlights (badges, selected items, focus rings)
    accent: "#E8EEFD",
    accentForeground: "#0D358C",

    // Destructive actions (delete, error states)
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",

    // Success (check-in/out confirmations, active badges)
    success: "#16A34A",
    successForeground: "#FFFFFF",
    successBg: "#DCFCE7",
    successText: "#15803D",

    // Borders and input outlines
    border: "#DCDFE4",
    input: "#C5CAD3",

    // Brand navy (login backdrop, header) — mirrors web --sidebar
    sidebar: "#0F172A",
    sidebarForeground: "#C7CDD8",
    sidebarPrimary: "#447AEE",
  },

  // Border radius (in px). Synced from the web artifact's --radius (.5rem).
  radius: 8,
};

export default colors;
