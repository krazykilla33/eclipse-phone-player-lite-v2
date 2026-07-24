import type { Theme } from "./types";

export const themes: Theme[] = [
  { name: "Midnight Glass", background: "#050817", surface: "#10162c", surfaceStrong: "#171f3d", field: "#080d20", text: "#f6f8ff", muted: "#9aa7cc", accent: "#24d7ff", accent2: "#7456ff", selected: "#202f68", danger: "#ff5d86", success: "#42efb5", glow: 70, blur: 24 },
  { name: "Emerald Pulse", background: "#04110d", surface: "#0b2119", surfaceStrong: "#103126", field: "#061710", text: "#edfff7", muted: "#8fb9a7", accent: "#35f2a2", accent2: "#00a879", selected: "#174b39", danger: "#ff6685", success: "#63ffc1", glow: 64, blur: 22 },
  { name: "Crimson Noir", background: "#12060b", surface: "#261019", surfaceStrong: "#361523", field: "#16080e", text: "#fff3f6", muted: "#c49aa7", accent: "#ff4f82", accent2: "#a81748", selected: "#5a1c35", danger: "#ff365f", success: "#65e6a2", glow: 58, blur: 20 },
  { name: "Amber Terminal", background: "#120e04", surface: "#251d0c", surfaceStrong: "#352914", field: "#171005", text: "#fff8df", muted: "#cbb77d", accent: "#ffc83d", accent2: "#d17b00", selected: "#59430e", danger: "#ff647f", success: "#a6e94d", glow: 48, blur: 18 },
  { name: "Arctic", background: "#e8eef7", surface: "#ffffff", surfaceStrong: "#dce6f4", field: "#f7faff", text: "#142039", muted: "#60708c", accent: "#1977ff", accent2: "#6748e8", selected: "#cddcff", danger: "#d62955", success: "#159b67", glow: 35, blur: 18 },
  { name: "OLED Lime", background: "#000000", surface: "#080b09", surfaceStrong: "#101712", field: "#030504", text: "#f5fff7", muted: "#8ba392", accent: "#65ff7a", accent2: "#17b84a", selected: "#12361c", danger: "#ff4f72", success: "#65ff7a", glow: 42, blur: 12 },
  { name: "Cyber Neon", background: "#080312", surface: "#160a25", surfaceStrong: "#25103d", field: "#090411", text: "#fff5ff", muted: "#c49bd4", accent: "#00f6ff", accent2: "#ff24d7", selected: "#3c1554", danger: "#ff3b69", success: "#38ffad", glow: 88, blur: 26 },
  { name: "Vapor Sunset", background: "#160b2d", surface: "#291548", surfaceStrong: "#3a1c5d", field: "#110823", text: "#fff4fd", muted: "#d0a8d6", accent: "#ff7ac6", accent2: "#765dff", selected: "#56306f", danger: "#ff547d", success: "#67f4cf", glow: 76, blur: 28 },
  { name: "Ocean Drive", background: "#03131d", surface: "#092638", surfaceStrong: "#0d3850", field: "#041924", text: "#effcff", muted: "#8db6c4", accent: "#31e6d2", accent2: "#168dff", selected: "#124b62", danger: "#ff6882", success: "#46efb5", glow: 62, blur: 23 },
  { name: "Rose Gold", background: "#170e13", surface: "#2a1b23", surfaceStrong: "#3b2932", field: "#130b0f", text: "#fff7f9", muted: "#c9a9b3", accent: "#f6a7b8", accent2: "#c66b87", selected: "#5a3341", danger: "#ff5376", success: "#7ce4b2", glow: 44, blur: 24 },
  { name: "Warm Paper", background: "#eee7d8", surface: "#fffaf0", surfaceStrong: "#e4dac8", field: "#f8f1e5", text: "#2e2921", muted: "#746b5d", accent: "#d46b32", accent2: "#9c4b28", selected: "#efd0b7", danger: "#bd3651", success: "#33845d", glow: 18, blur: 10 },
  { name: "High Contrast", background: "#000000", surface: "#0b0b0b", surfaceStrong: "#191919", field: "#000000", text: "#ffffff", muted: "#d5d5d5", accent: "#00e5ff", accent2: "#006dff", selected: "#073a4b", danger: "#ff5274", success: "#3dff9c", glow: 20, blur: 0 }
];

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const map: Record<string, string | number> = {
    bg: theme.background, surface: theme.surface, "surface-strong": theme.surfaceStrong,
    field: theme.field, text: theme.text, muted: theme.muted, accent: theme.accent,
    "accent-2": theme.accent2, selected: theme.selected, danger: theme.danger,
    success: theme.success, glow: theme.glow, blur: theme.blur
  };
  for (const [key, value] of Object.entries(map)) root.style.setProperty(`--${key}`, typeof value === "number" ? String(value) : value);
}
