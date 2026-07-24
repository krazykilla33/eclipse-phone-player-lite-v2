import { invoke } from "@tauri-apps/api/core";
import type { AppState, SearchResult, Settings, Song } from "./types";

const isTauri = "__TAURI_INTERNALS__" in window;

const demoState: AppState = {
  songs: [
    { id: "demo-1", artist: "Redbone", album: "Wovoka", title: "Come and Get Your Love", url: "https://www.youtube.com/watch?v=bc0KhhjJP98", favorite: true, length: "3:45" },
    { id: "demo-2", artist: "Rick Astley", album: "Whenever You Need Somebody", title: "Never Gonna Give You Up", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", favorite: false, length: "3:33" }
  ],
  settings: { gameExe: "GTA5.exe", openChatKey: "t", mode: "Car", volume: 100, alwaysOnTop: true, closeAfterPlay: true, startMinimized: false, windowScale: 1, headingScale: 1, bodyScale: 1, smallScale: 1, navScale: 1, orientation: "Portrait", defaultPage: "Library", librarySort: "Favorites First", windowOpacity: 1, confirmBeforeExit: false, rememberWindowPosition: false, windowX: null, windowY: null, windowWidth: null, windowHeight: null, positionLocked: false, timeFormat: "12-hour", timeZone: "System", showHideHotkey: "F3", randomCarHotkey: "Ctrl+F3", randomSpeakerHotkey: "Alt+F3", randomTvHotkey: "Shift+F3", defaultPlaybackMode: "Car", hasSeenGuide: false, theme: { name: "Midnight Glass", background: "#050817", surface: "#10162c", surfaceStrong: "#171f3d", field: "#080d20", text: "#f6f8ff", muted: "#9aa7cc", accent: "#24d7ff", accent2: "#7456ff", selected: "#202f68", danger: "#ff5d86", success: "#42efb5", glow: 70, blur: 24 } }, dataDir: "Preview mode"
};

export async function command<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri) {
    if (name === "get_state") return structuredClone(demoState) as T;
    if (name === "search_youtube") return [] as T;
    return undefined as T;
  }
  return invoke<T>(name, args);
}

export const api = {
  state: () => command<AppState>("get_state"),
  saveSongs: (songs: Song[]) => command<void>("save_songs", { songs }),
  saveSettings: (settings: Settings) => command<void>("save_settings", { settings }),
  searchYouTube: (query: string) => command<SearchResult[]>("search_youtube", { query }),
  fetchMetadata: (url: string) => command<SearchResult>("fetch_metadata", { url }),
  openYouTubeSearch: (query: string) => command<void>("open_youtube_search", { query }),
  sendToGame: (text: string, openChat: boolean) => command<void>("send_to_game", { text, openChat }),
  copyUrl: (text: string) => command<void>("copy_url", { text }),
  importLegacy: () => command<number>("import_legacy"),
  openDataFolder: () => command<void>("open_data_folder")
};
