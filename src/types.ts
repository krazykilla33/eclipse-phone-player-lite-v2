export type OutputMode = "Car" | "Speaker" | "TV";
export type Page = "library" | "player" | "youtube" | "settings";

export interface Song {
  id: string;
  artist: string;
  album: string;
  title: string;
  url: string;
  favorite: boolean;
  length: string;
  artwork?: string;
  addedAt?: number;
}

export interface SearchResult {
  title: string;
  channel: string;
  length: string;
  url: string;
  thumbnail?: string;
}

export interface Theme {
  name: string;
  background: string;
  surface: string;
  surfaceStrong: string;
  field: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  selected: string;
  danger: string;
  success: string;
  glow: number;
  blur: number;
}

export interface Settings {
  gameExe: string;
  openChatKey: string;
  mode: OutputMode;
  volume: number;
  alwaysOnTop: boolean;
  closeAfterPlay: boolean;
  startMinimized: boolean;
  theme: Theme;
  windowScale: number;
  headingScale: number;
  bodyScale: number;
  smallScale: number;
  navScale: number;
  orientation: "Portrait" | "Landscape";
  defaultPage: "Library" | "YouTube" | "Settings";
  librarySort: "Artist" | "Title" | "Album" | "Recently Added" | "Favorites First";
  windowOpacity: number;
  confirmBeforeExit: boolean;
  rememberWindowPosition: boolean;
  windowX: number | null;
  windowY: number | null;
  windowWidth: number | null;
  windowHeight: number | null;
  positionLocked: boolean;
  defaultPlaybackMode: OutputMode;
}

export interface AppState {
  songs: Song[];
  settings: Settings;
  dataDir: string;
}
