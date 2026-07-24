import "./style.css";
import { availableMonitors, getCurrentWindow, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api } from "./bridge";
import { applyTheme, themes } from "./themes";
import type { AppState, Page, SearchResult, Song, Theme } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState;
let page: Page = (["library","youtube","settings"].includes(localStorage.getItem("eclipse-lite-page") ?? "") ? localStorage.getItem("eclipse-lite-page") : "library") as Page;
let landscape = false;
let positionLocked = false;
let selectedId = "";
let libraryQuery = "";
let youtubeResults: SearchResult[] = [];
let youtubeQuery = "";
let busy = false;
let toastTimer = 0;
let positionSaveTimer = 0;
let sizeSaveTimer = 0;
let settingsSaveTimer = 0;
let modalEscapeHandler: ((event: KeyboardEvent) => void) | null = null;

const icon = (name: string) => {
  const icons: Record<string, string> = {
    library: '<path d="M4 4h5v16H4zM11 4h4v16h-4zM17 4h3v16h-3z"/>',
    player: '<path d="M4 18V8m5 10V4m5 14v-7m5 7V6"/>',
    youtube: '<path d="M9 8l7 4-7 4z"/><rect x="3" y="5" width="18" height="14" rx="5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6l-.04.08H10l-.04-.08a1.7 1.7 0 00-1-.6 1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1L3.92 14v-4L4 9.96a1.7 1.7 0 00.6-1 1.7 1.7 0 00-.34-1.88L4.2 7.02l2.83-2.83.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6l.04-.08h4L14.08 4a1.7 1.7 0 001 .6 1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 9c.08.38.3.73.6 1l.08.04v4L20 14.08c-.3.27-.52.62-.6.92z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 00-.1-7.8z"/>',
    play: '<path d="M8 5v14l11-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    prev: '<path d="M19 20L9 12l10-8zM5 19V5"/>', next: '<path d="M5 4l10 8-10 8zM19 5v14"/>',
    shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    download: '<path d="M12 3v12m-5-5l5 5 5-5M5 21h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m3 0l-1 15H6L5 6m5 4v7m4-7v7"/>',
    pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? ""}</svg>`;
};

const esc = (value: string) => value.replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]!));
const currentSong = () => state.songs.find(s => s.id === selectedId) ?? state.songs[0];
const thumbnailFor = (urlValue: string, explicit?: string): string => {
  if (explicit) return explicit;
  try {
    const url = new URL(urlValue);
    const id = url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v");
    return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "";
  } catch { return ""; }
};
const youtubeThumbnail = (song: Song): string => thumbnailFor(song.url, song.artwork);

function shell(): void {
  app.innerHTML = `
    <main class="phone-wrap">
      <section class="phone" aria-label="Eclipse Phone Player Lite">
        <div class="metal-edge"></div><div class="side-key key-a"></div><div class="side-key key-b"></div><div class="side-key key-c"></div>
        <div class="screen">
          <header class="topbar" data-tauri-drag-region>
            <span class="clock" id="clock">00:00</span>
            <div class="island" data-tauri-drag-region><i></i></div>
            <div class="system-icons"><span class="signal">▮▮▮</span><b>5G</b><span class="battery"><i></i></span></div>
          </header>
          <div class="appbar" data-tauri-drag-region>
            <div><p class="eyebrow">ECLIPSE</p><h1 id="page-title">Player</h1></div>
            <div class="app-actions">
              <button class="icon-btn" id="always-on-top" title="Pin phone above other windows">${icon("pin")}</button>
              <button class="icon-btn" id="hide-app" title="Hide phone">−</button>
              <button class="icon-btn danger-hover" id="close-app" title="Exit Eclipse Phone Player Lite">×</button>
            </div>
          </div>
          <section id="view" class="view"></section>
          <nav class="tabbar">
            ${tab("library", "library", "Library")}${tab("youtube", "youtube", "YouTube")}${tab("settings", "settings", "Settings")}
          </nav>
          <button class="home-indicator" id="rotate-phone" title="Rotate phone" aria-label="Rotate phone 90 degrees"></button>
        </div>
      </section>
    </main>
    <div id="modal-root"></div><div id="toast" class="toast"></div>`;
  bindShell();
  render();
  startClock();
}

function tab(id: Page, glyph: string, label: string): string {
  return `<button class="tab ${page === id ? "active" : ""}" data-page="${id}">${icon(glyph)}<span>${label}</span></button>`;
}

function bindShell(): void {
  document.querySelectorAll<HTMLElement>("[data-page]").forEach(el => el.onclick = () => { page = el.dataset.page as Page; localStorage.setItem("eclipse-lite-page", page); renderTabs(); render(); });
  document.querySelector<HTMLButtonElement>("#hide-app")!.onclick = async () => { try { await getCurrentWindow().hide(); } catch { /* browser preview */ } };
  document.querySelector<HTMLButtonElement>("#close-app")!.onclick = async () => {
    if (state.settings.confirmBeforeExit && !await askConfirmation("Exit Eclipse Phone Player Lite?", "The phone player will close completely.", "Exit")) return;
    try { await getCurrentWindow().close(); } catch { /* browser preview */ }
  };
  document.querySelector<HTMLButtonElement>("#rotate-phone")!.onclick = rotatePhone;
  document.querySelector<HTMLElement>(".island")!.ondblclick = async () => { try { await getCurrentWindow().hide(); } catch { } };
  document.querySelector<HTMLElement>(".phone")!.oncontextmenu = e => { e.preventDefault(); phoneMenu(); };
  applyPositionLock();
  document.querySelector<HTMLButtonElement>("#always-on-top")!.onclick = async () => {
    state.settings.alwaysOnTop = !state.settings.alwaysOnTop;
    await api.saveSettings(state.settings); try { await getCurrentWindow().setAlwaysOnTop(state.settings.alwaysOnTop); } catch { }
    toast(state.settings.alwaysOnTop ? "Always on top enabled" : "Always on top disabled");
  };
}

function renderTabs(): void {
  document.querySelectorAll<HTMLElement>(".tab").forEach(el => el.classList.toggle("active", el.dataset.page === page));
}

function render(): void {
  const view = document.querySelector<HTMLElement>("#view")!;
  const title = document.querySelector<HTMLElement>("#page-title")!;
  title.textContent = ({ library: "Library", player: "Now Playing", youtube: "YouTube Search", settings: "Settings" })[page];
  view.className = `view page-${page}`;
  if (page === "library") renderLibrary(view);
  else if (page === "player") renderPlayer(view);
  else if (page === "youtube") renderYouTube(view);
  else renderSettings(view);
}

function renderLibrary(view: HTMLElement): void {
  const q = libraryQuery.toLowerCase();
  const songs = sortLibrarySongs(state.songs.filter(s => !q || `${s.artist} ${s.album} ${s.title}`.toLowerCase().includes(q)));
  view.innerHTML = `
    <div class="searchbox">${icon("search")}<input id="library-search" value="${esc(libraryQuery)}" placeholder="Search your library"/><button id="add-song">${icon("plus")}</button></div>
    <div class="library-toolbar"><label class="output-select"><span>PLAY USING</span><select id="library-mode"><option ${state.settings.mode === "Car" ? "selected" : ""}>Car</option><option ${state.settings.mode === "Speaker" ? "selected" : ""}>Speaker</option><option ${state.settings.mode === "TV" ? "selected" : ""}>TV</option></select></label><label class="sort-select"><span>SORT BY</span><select id="library-sort">${(["Artist","Title","Album","Recently Added","Favorites First"] as const).map(value=>`<option ${state.settings.librarySort===value?"selected":""}>${value}</option>`).join("")}</select></label></div>
    <div class="library-count"><span id="library-count">${songs.length}</span> songs <small>• Double-click a song to play it in GTA</small></div>
    <div id="song-list" class="song-list">${songs.length ? songs.map(songRow).join("") : empty("No matching songs", "Add a song or change your search.")}</div>
    <button class="floating-play" id="random-play" title="Play a random song">${icon("shuffle")}<span>Random play</span></button>`;
  const input = document.querySelector<HTMLInputElement>("#library-search")!;
  input.oninput = () => { libraryQuery = input.value; filterLibraryRows(); };
  document.querySelector<HTMLSelectElement>("#library-mode")!.onchange = async e => { state.settings.mode = (e.target as HTMLSelectElement).value as typeof state.settings.mode; await api.saveSettings(state.settings); toast(`${state.settings.mode} playback selected`); };
  document.querySelector<HTMLSelectElement>("#library-sort")!.onchange = async e => { state.settings.librarySort=(e.target as HTMLSelectElement).value as typeof state.settings.librarySort;await api.saveSettings(state.settings);renderLibrary(view); };
  document.querySelector<HTMLButtonElement>("#add-song")!.onclick = quickAddSong;
  document.querySelector<HTMLButtonElement>("#random-play")!.onclick = () => { if (songs.length) { selectSong(songs[Math.floor(Math.random() * songs.length)].id); playSelected(); } };
  bindSongRows();
  filterLibraryRows();
}

function sortLibrarySongs(songs:Song[]):Song[] {
  const sorted=[...songs], text=(value:string)=>value.toLocaleLowerCase();
  sorted.sort((a,b)=>{
    if(state.settings.librarySort==="Recently Added")return (b.addedAt||0)-(a.addedAt||0);
    if(state.settings.librarySort==="Favorites First"&&a.favorite!==b.favorite)return a.favorite?-1:1;
    const av=state.settings.librarySort==="Title"?a.title:state.settings.librarySort==="Album"?(a.album||a.title):a.artist;
    const bv=state.settings.librarySort==="Title"?b.title:state.settings.librarySort==="Album"?(b.album||b.title):b.artist;
    return text(av).localeCompare(text(bv))||text(a.title).localeCompare(text(b.title));
  });return sorted;
}

function songRow(song: Song): string {
  const initials = `${song.artist[0] ?? "?"}${song.title[0] ?? ""}`.toUpperCase();
  const thumbnail = youtubeThumbnail(song);
  return `<article class="song-row ${song.id === selectedId ? "selected" : ""}" data-id="${esc(song.id)}" data-favorite="${song.favorite}">
    <div class="cover" style="--h:${hashHue(song.id)}">${thumbnail ? `<img src="${esc(thumbnail)}" alt="" loading="lazy" onerror="this.remove()"/>` : ""}<span>${initials}</span></div><div class="song-copy"><strong>${esc(song.title)}</strong><span>${esc(song.artist)}${song.album ? ` • ${esc(song.album)}` : ""}</span></div>
    <span class="duration">${esc(song.length || "—")}</span><button class="heart ${song.favorite ? "on" : ""}" data-heart="${esc(song.id)}">${icon("heart")}</button><button class="more" data-more="${esc(song.id)}">•••</button>
  </article>`;
}

function bindSongRows(): void {
  document.querySelectorAll<HTMLElement>(".song-row").forEach(row => {
    row.onclick = e => { if ((e.target as Element).closest("button")) return; selectSong(row.dataset.id!); document.querySelectorAll(".song-row.selected").forEach(x => x.classList.remove("selected")); row.classList.add("selected"); };
    row.ondblclick = e => { if ((e.target as Element).closest("button")) return; selectSong(row.dataset.id!); playSelected(); };
  });
  document.querySelectorAll<HTMLButtonElement>("[data-heart]").forEach(btn => btn.onclick = async () => { const song = state.songs.find(s => s.id === btn.dataset.heart); if (song) { song.favorite = !song.favorite; await api.saveSongs(state.songs); render(); } });
  document.querySelectorAll<HTMLButtonElement>("[data-more]").forEach(btn => btn.onclick = () => songActions(btn.dataset.more!));
}

function filterLibraryRows(): void {
  const q = libraryQuery.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll<HTMLElement>(".song-row").forEach(row => {
    const matchesSearch = !q || (row.textContent ?? "").toLowerCase().includes(q);
    const show = matchesSearch;
    row.classList.toggle("filtered-out", !show); if (show) visible++;
  });
  const count = document.querySelector("#library-count"); if (count) count.textContent = String(visible);
}

function renderPlayer(view: HTMLElement): void {
  const song = currentSong();
  if (!song) { view.innerHTML = empty("Your player is ready", "Add a song from Library or YouTube Search."); return; }
  view.innerHTML = `
    <div class="art-card" style="--h:${hashHue(song.id)}"><canvas id="visualizer"></canvas><div class="art-glow"></div><div class="art-monogram">${esc((song.title[0] ?? "E").toUpperCase())}</div><span class="visualizer-label">LIVE VISUALIZER</span></div>
    <div class="now-row"><div><h2>${esc(song.title)}</h2><p>${esc(song.artist)}${song.album ? ` • ${esc(song.album)}` : ""}</p></div><button id="player-favorite" class="favorite-large ${song.favorite ? "on" : ""}">${icon("heart")}</button></div>
    <div class="progress"><i style="width:34%"></i><b style="left:34%"></b></div><div class="time-row"><span>Ready</span><span>${esc(song.length || "Live URL")}</span></div>
    <div class="transport"><button id="shuffle">${icon("shuffle")}</button><button id="previous">${icon("prev")}</button><button id="play" class="primary">${icon("play")}</button><button id="stop">${icon("stop")}</button><button id="next">${icon("next")}</button></div>
    <div class="volume-row"><span>VOL</span><input id="volume" type="range" min="0" max="100" value="${state.settings.volume}"/><output>${state.settings.volume}%</output></div>
    <div class="mode-card"><span>GTA output</span><div class="mode-pills">${(["Car","Speaker","TV"] as const).map(m => `<button data-mode="${m}" class="${state.settings.mode === m ? "active" : ""}">${m}</button>`).join("")}</div></div>
    <div class="up-next"><div class="section-row"><strong>Up next</strong><button data-page="library">View all</button></div>${queue(song.id)}</div>`;
  document.querySelector<HTMLButtonElement>("#play")!.onclick = playSelected;
  document.querySelector<HTMLButtonElement>("#stop")!.onclick = stopPlayback;
  document.querySelector<HTMLButtonElement>("#previous")!.onclick = () => step(-1);
  document.querySelector<HTMLButtonElement>("#next")!.onclick = () => step(1);
  document.querySelector<HTMLButtonElement>("#shuffle")!.onclick = () => { if (state.songs.length) { selectSong(state.songs[Math.floor(Math.random() * state.songs.length)].id); render(); } };
  document.querySelector<HTMLButtonElement>("#player-favorite")!.onclick = async () => { song.favorite = !song.favorite; await api.saveSongs(state.songs); render(); };
  const volume = document.querySelector<HTMLInputElement>("#volume")!;
  volume.oninput = () => { state.settings.volume = +volume.value; document.querySelector<HTMLOutputElement>(".volume-row output")!.value = `${volume.value}%`; };
  volume.onchange = async () => { await api.saveSettings(state.settings); if (state.settings.mode === "Speaker") await api.sendToGame(`/vol speaker ${volume.value}`, true).catch(errorToast); };
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(btn => btn.onclick = async () => { state.settings.mode = btn.dataset.mode as typeof state.settings.mode; await api.saveSettings(state.settings); render(); });
  document.querySelectorAll<HTMLElement>(".queue-row").forEach(row => row.onclick = () => { selectSong(row.dataset.id!); render(); });
  document.querySelector<HTMLElement>("[data-page='library']")!.onclick = () => { page = "library"; renderTabs(); render(); };
  startVisualizer();
}

function queue(current: string): string {
  const index = Math.max(0, state.songs.findIndex(s => s.id === current));
  const items = [...state.songs.slice(index + 1), ...state.songs.slice(0, index)].slice(0, 3);
  return items.map(s => `<div class="queue-row" data-id="${esc(s.id)}"><span class="mini-cover" style="--h:${hashHue(s.id)}"></span><div><strong>${esc(s.title)}</strong><small>${esc(s.artist)}</small></div><span>${esc(s.length || "—")}</span>${icon("chevron")}</div>`).join("") || `<p class="muted">No other songs in the queue.</p>`;
}

function renderYouTube(view: HTMLElement): void {
  view.innerHTML = `
    <form id="youtube-form" class="searchbox youtube-box">${icon("search")}<input id="youtube-query" value="${esc(youtubeQuery)}" placeholder="Songs, artists or videos"/><button class="search-submit" ${busy ? "disabled" : ""}>${busy ? "…" : "Search"}</button></form>
    <div class="dependency-strip ready"><span><i></i>Classic key-free search ready</span><button id="open-youtube">Open on YouTube</button></div>
    <div class="results">${busy ? loading("Searching YouTube") : youtubeResults.length ? youtubeResults.map(resultRow).join("") : empty("Minimal YouTube search", "Search directly without API keys or helper programs. Browser fallback is always available.")}</div>`;
  document.querySelector<HTMLFormElement>("#youtube-form")!.onsubmit = async e => { e.preventDefault(); youtubeQuery = document.querySelector<HTMLInputElement>("#youtube-query")!.value.trim(); if (!youtubeQuery) return; await searchYouTube(); };
  document.querySelector<HTMLButtonElement>("#open-youtube")!.onclick=()=>api.openYouTubeSearch(youtubeQuery||document.querySelector<HTMLInputElement>("#youtube-query")!.value).catch(errorToast);
  document.querySelectorAll<HTMLButtonElement>("[data-result-add]").forEach(btn => btn.onclick = () => addSearchResult(+btn.dataset.resultAdd!));
  document.querySelectorAll<HTMLButtonElement>("[data-result-copy]").forEach(btn => btn.onclick = async () => { await navigator.clipboard.writeText(youtubeResults[+btn.dataset.resultCopy!].url); toast("URL copied"); });
}

function resultRow(r: SearchResult, i: number): string {
  const thumbnail=thumbnailFor(r.url,r.thumbnail),added=state.songs.some(song=>song.url===r.url);
  return `<article class="result-row"><div class="video-thumb" style="--h:${hashHue(r.url)}">${thumbnail?`<img src="${esc(thumbnail)}" alt="" loading="lazy" onerror="this.remove()"/>`:""}${icon("youtube")}</div><div class="result-copy"><strong>${esc(r.title)}</strong><span>${esc(r.channel)} • ${esc(r.length || "—")}</span></div><div class="result-actions"><button data-result-add="${i}" title="${added?"Already in Library":"Add to Library"}" ${added?"disabled":""}>${added?"✓":icon("plus")}</button><button data-result-copy="${i}" title="Copy URL">${icon("copy")}</button></div></article>`;
}

async function searchYouTube(): Promise<void> {
  busy = true; render();
  try { youtubeResults = await api.searchYouTube(youtubeQuery); if (!youtubeResults.length) toast("No results found"); }
  catch (e) { errorToast(e); } finally { busy = false; render(); }
}

function renderSettings(view: HTMLElement): void {
  const t = state.settings.theme;
  view.innerHTML = `<div class="settings-scroll">
    <section class="settings-section"><p class="section-label">APPEARANCE</p><label class="theme-select-row"><span class="theme-preview" style="--a:${t.accent};--b:${t.accent2}"></span><span><strong>Preset theme</strong><small>Choose a complete color preset</small></span><select id="theme-select">${themes.map(x => `<option value="${esc(x.name)}" ${t.name === x.name ? "selected" : ""}>${esc(x.name)}</option>`).join("")}<option value="Custom" ${!themes.some(x => x.name === t.name) ? "selected" : ""}>Custom</option></select></label>
    <button id="edit-theme" class="settings-row"><span class="settings-icon color-wheel"></span><span><strong>Customize theme</strong><small>Colors, glow and glass blur</small></span>${icon("chevron")}</button></section>
    <section class="settings-section typography-settings"><p class="section-label">TYPOGRAPHY</p>
    ${textSizeRow("headingScale","Headings","Page titles and prominent names",state.settings.headingScale)}
    ${textSizeRow("bodyScale","Normal text","Song names, buttons and form text",state.settings.bodyScale)}
    ${textSizeRow("smallScale","Small text","Metadata, hints and secondary labels",state.settings.smallScale)}
    ${textSizeRow("navScale","Navigation","Bottom navigation labels",state.settings.navScale)}
    <button id="reset-text-sizes" class="text-reset">Reset text sizes</button></section>
    <section class="settings-section"><p class="section-label">PLAYBACK</p><label class="form-row"><span>Default playback mode</span><select id="default-playback-mode"><option ${state.settings.defaultPlaybackMode==="Car"?"selected":""}>Car</option><option ${state.settings.defaultPlaybackMode==="Speaker"?"selected":""}>Speaker</option><option ${state.settings.defaultPlaybackMode==="TV"?"selected":""}>TV</option></select></label><label class="form-row"><span>Game executable</span><input id="game-exe" value="${esc(state.settings.gameExe)}"/></label><label class="form-row"><span>Chat key</span><input id="chat-key" maxlength="1" value="${esc(state.settings.openChatKey)}"/></label></section>
    <section class="settings-section"><p class="section-label">WINDOW</p>${toggleRow("always-top", "Always on top", "Keep the phone above GTA", state.settings.alwaysOnTop)}${toggleRow("close-after", "Hide after play", "Return focus to GTA", state.settings.closeAfterPlay)}
    ${toggleRow("confirm-exit", "Confirm before exit", "Ask before the × button closes the app", state.settings.confirmBeforeExit)}${toggleRow("remember-position", "Remember window and size", "Restore the phone's last position, size and orientation", state.settings.rememberWindowPosition)}
    ${toggleRow("lock-position", "Lock phone position", "Prevent the phone from being dragged accidentally", positionLocked)}
    <label class="form-row"><span>Startup orientation</span><select id="startup-orientation"><option ${state.settings.orientation==="Portrait"?"selected":""}>Portrait</option><option ${state.settings.orientation==="Landscape"?"selected":""}>Landscape</option></select></label>
    <label class="form-row"><span>Default page</span><select id="default-page"><option ${state.settings.defaultPage==="Library"?"selected":""}>Library</option><option ${state.settings.defaultPage==="YouTube"?"selected":""}>YouTube</option><option ${state.settings.defaultPage==="Settings"?"selected":""}>Settings</option></select></label>
    <label class="form-row"><span>Default library sorting</span><select id="default-library-sort">${(["Artist","Title","Album","Recently Added","Favorites First"] as const).map(value=>`<option ${state.settings.librarySort===value?"selected":""}>${value}</option>`).join("")}</select></label>
    <label class="form-row range-setting opacity-setting"><span>Phone opacity <output>${Math.round(state.settings.windowOpacity*100)}%</output></span><input id="window-opacity" type="range" min="0.55" max="1" step="0.05" value="${state.settings.windowOpacity}"/><small>Changes the transparency of the complete phone.</small></label>
    <label class="form-row range-setting"><span>Phone size <output>${Math.round(state.settings.windowScale * 100)}%</output></span><input id="window-scale" type="range" min="0.75" max="1.15" step="0.05" value="${state.settings.windowScale}"/><small>The layout condenses below 90% while text stays readable.</small></label></section>
    <section class="settings-section"><p class="section-label">CLOCK</p>
    <label class="form-row"><span>Time format</span><select id="time-format"><option value="12-hour" ${state.settings.timeFormat==="12-hour"?"selected":""}>12-hour</option><option value="24-hour" ${state.settings.timeFormat==="24-hour"?"selected":""}>24-hour</option></select><small>Choose how the status-bar clock is displayed.</small></label>
    <label class="form-row"><span>Time zone</span><select id="time-zone"><option value="System" ${state.settings.timeZone==="System"?"selected":""}>System time</option><option value="UTC" ${state.settings.timeZone==="UTC"?"selected":""}>UTC time</option></select><small>Use your computer's time zone or Coordinated Universal Time.</small></label></section>
    <section class="settings-section"><p class="section-label">DATA</p><button id="open-data-folder" class="settings-row"><span class="settings-icon">📁</span><span><strong>Open data folder</strong><small>Find library.json, settings-lite.json and backups</small></span>${icon("chevron")}</button></section>
    <section class="settings-section"><p class="section-label">MIGRATION</p><button id="import-legacy" class="settings-row"><span class="settings-icon">AHK</span><span><strong>Import MusicList.txt</strong><small>Bring your existing AHK library into this app</small></span>${icon("chevron")}</button></section>
    </div>`;
  document.querySelector<HTMLSelectElement>("#theme-select")!.onchange = async e => { const theme = themes.find(x => x.name === (e.target as HTMLSelectElement).value); if (theme) { state.settings.theme = structuredClone(theme); applyTheme(theme); await api.saveSettings(state.settings); render(); toast("Settings saved"); } else { themeEditor(); } };
  document.querySelector<HTMLButtonElement>("#edit-theme")!.onclick = themeEditor;
  document.querySelectorAll<HTMLInputElement>("[data-text-scale]").forEach(input => input.oninput = () => {
    const key=input.dataset.textScale as "headingScale"|"bodyScale"|"smallScale"|"navScale";
    state.settings[key]=+input.value; input.parentElement!.querySelector("output")!.textContent=`${Math.round(+input.value*100)}%`; applyTextScales(); scheduleSettingsSave();
  });
  document.querySelector<HTMLButtonElement>("#reset-text-sizes")!.onclick = async () => { state.settings.headingScale=state.settings.bodyScale=state.settings.smallScale=state.settings.navScale=1;applyTextScales();await api.saveSettings(state.settings);renderSettings(view);toast("Settings saved"); };
  document.querySelector<HTMLInputElement>("#window-scale")!.oninput = e => { const input=e.target as HTMLInputElement,value=+input.value; state.settings.windowScale = value; input.parentElement!.querySelector("output")!.textContent = `${Math.round(value * 100)}%`; resizePhone(); scheduleSettingsSave(); };
  document.querySelector<HTMLInputElement>("#window-opacity")!.oninput = e => { const input=e.target as HTMLInputElement,value=+input.value;state.settings.windowOpacity=value;input.parentElement!.querySelector("output")!.textContent=`${Math.round(value*100)}%`;applyWindowOpacity();scheduleSettingsSave(); };
  document.querySelector<HTMLButtonElement>("#import-legacy")!.onclick = async e => { const button=e.currentTarget as HTMLButtonElement;button.disabled=true;button.querySelector("strong")!.textContent="Importing…";try { const count = await api.importLegacy(); state = await api.state(); selectedId = state.songs[0]?.id ?? ""; render();toast(`Imported ${count} songs`); } catch (error) { errorToast(error);button.disabled=false;button.querySelector("strong")!.textContent="Import MusicList.txt"; } };
  document.querySelector<HTMLButtonElement>("#open-data-folder")!.onclick = () => api.openDataFolder().catch(errorToast);
  ["always-top","close-after","confirm-exit","remember-position","lock-position"].forEach(id => document.querySelector<HTMLInputElement>(`#${id}`)!.onchange = saveSettingsForm);
  ["startup-orientation","default-page","default-library-sort","default-playback-mode","time-format","time-zone"].forEach(id => document.querySelector<HTMLSelectElement>(`#${id}`)!.onchange = saveSettingsForm);
  ["game-exe","chat-key"].forEach(id => document.querySelector<HTMLInputElement>(`#${id}`)!.onchange = saveSettingsForm);
}

function toggleRow(id: string, title: string, copy: string, checked: boolean): string {
  return `<label class="toggle-row"><span><strong>${title}</strong><small>${copy}</small></span><input id="${id}" type="checkbox" ${checked ? "checked" : ""}/><i></i></label>`;
}

function textSizeRow(key:string,title:string,copy:string,value:number):string {
  return `<label class="text-size-row"><span><strong>${title}</strong><small>${copy}</small></span><output>${Math.round(value*100)}%</output><input data-text-scale="${key}" type="range" min="0.8" max="1.5" step="0.05" value="${value}"/></label>`;
}

function quickAddSong():void {
  modal(`<form id="quick-add-form" class="modal-card quick-add-card"><div class="modal-head"><div><p class="eyebrow">LIBRARY</p><h2>Add song</h2></div><button type="button" data-close>×</button></div><label class="quick-url-field"><span>YouTube / media URL</span><input id="quick-song-url" type="url" required autofocus placeholder="https://www.youtube.com/watch?v=…"/></label><p class="quick-add-note">Title, artist, length and thumbnail will be filled automatically.</p><button id="quick-add-submit" class="primary-wide">Add to Library</button></form>`);
  const input=document.querySelector<HTMLInputElement>("#quick-song-url")!;window.setTimeout(()=>input.focus(),50);
  document.querySelector<HTMLFormElement>("#quick-add-form")!.onsubmit=async e=>{
    e.preventDefault();const url=input.value.trim();if(!/^https?:\/\//i.test(url)){toast("Enter a complete media URL",true);return;}
    if(state.songs.some(song=>song.url===url)){toast("That URL is already in your Library",true);return;}
    const button=document.querySelector<HTMLButtonElement>("#quick-add-submit")!;button.disabled=true;button.textContent="Reading song information…";
    try{
      const info=await api.fetchMetadata(url);
      if(state.songs.some(song=>song.url===info.url)){toast("That song is already in your Library",true);button.disabled=false;button.textContent="Add to Library";return;}
      const song:Song={id:"",artist:info.channel||"Unknown artist",album:/youtu(?:\.be|be\.com)/i.test(info.url)?"YouTube":"Media",title:info.title||"Untitled",url:info.url||url,length:info.length||"—",favorite:false,artwork:info.thumbnail,addedAt:Date.now()};
      closeModal();
      editSong(song, true);
    }catch(error){errorToast(error);button.disabled=false;button.textContent="Add to Library";}
  };
}

async function saveSettingsForm(): Promise<void> {
  state.settings.gameExe = document.querySelector<HTMLInputElement>("#game-exe")!.value.trim() || "GTA5.exe";
  state.settings.openChatKey = document.querySelector<HTMLInputElement>("#chat-key")!.value.trim() || "t";
  state.settings.alwaysOnTop = document.querySelector<HTMLInputElement>("#always-top")!.checked;
  state.settings.closeAfterPlay = document.querySelector<HTMLInputElement>("#close-after")!.checked;
  state.settings.confirmBeforeExit = document.querySelector<HTMLInputElement>("#confirm-exit")!.checked;
  state.settings.rememberWindowPosition = document.querySelector<HTMLInputElement>("#remember-position")!.checked;
  positionLocked = document.querySelector<HTMLInputElement>("#lock-position")!.checked;
  state.settings.positionLocked = positionLocked;
  state.settings.orientation = document.querySelector<HTMLSelectElement>("#startup-orientation")!.value as typeof state.settings.orientation;
  state.settings.defaultPage = document.querySelector<HTMLSelectElement>("#default-page")!.value as typeof state.settings.defaultPage;
  state.settings.librarySort = document.querySelector<HTMLSelectElement>("#default-library-sort")!.value as typeof state.settings.librarySort;
  state.settings.defaultPlaybackMode = document.querySelector<HTMLSelectElement>("#default-playback-mode")!.value as typeof state.settings.defaultPlaybackMode;
  state.settings.timeFormat = document.querySelector<HTMLSelectElement>("#time-format")!.value as typeof state.settings.timeFormat;
  state.settings.timeZone = document.querySelector<HTMLSelectElement>("#time-zone")!.value as typeof state.settings.timeZone;
  await api.saveSettings(state.settings); try { await getCurrentWindow().setAlwaysOnTop(state.settings.alwaysOnTop); } catch { }
  applyPositionLock();
  updateClock();
  toast("Settings saved");
}

function editSong(song?: Song, addAsNew = false): void {
  const editing = !!song && !addAsNew;
  const preview= song ? youtubeThumbnail(song) : "";
  modal(`<form id="song-form" class="modal-card"><div class="modal-head"><div><p class="eyebrow">LIBRARY</p><h2>${editing ? "Edit song" : "Add song"}</h2></div><button type="button" data-close>×</button></div>
    <div class="artwork-editor"><div id="artwork-preview" class="edit-artwork" style="--h:${hashHue(song?.url||"new")}">${preview?`<img src="${esc(preview)}" alt="Song thumbnail" onerror="this.remove()"/>`:""}<span>♫</span></div><label><span>Thumbnail URL</span><input id="artwork" value="${esc(song?.artwork||preview)}" placeholder="Generated automatically for YouTube"/></label><button type="button" id="reset-artwork">Reset</button></div>
    ${field("Artist", "artist", song?.artist ?? "")}${field("Album", "album", song?.album ?? "")}${field("Song title", "title", song?.title ?? "")}${field("YouTube / media URL", "url", song?.url ?? "", "url")}${field("Length", "length", song?.length ?? "")}
    <label class="check-line"><input id="favorite" type="checkbox" ${song?.favorite ? "checked" : ""}/> Favorite</label><button class="primary-wide">${editing ? "Save changes" : "Add to library"}</button></form>`);
  document.querySelector<HTMLFormElement>("#song-form")!.onsubmit = async e => {
    e.preventDefault(); const value = (id: string) => (document.querySelector<HTMLInputElement>(`#${id}`)!.value.trim());
    if (!value("artist") || !value("title") || !/^https?:\/\//i.test(value("url"))) { toast("Artist, title and a complete URL are required", true); return; }
    const next: Song = { id: editing ? song!.id : crypto.randomUUID(), artist: value("artist"), album: value("album"), title: value("title"), url: value("url"), length: value("length"), favorite: document.querySelector<HTMLInputElement>("#favorite")!.checked, artwork: value("artwork")||undefined, addedAt: editing ? song!.addedAt : Date.now() };
    if (editing) state.songs[state.songs.findIndex(s => s.id === song!.id)] = next; else state.songs.push(next);
    selectedId = next.id; await api.saveSongs(state.songs); closeModal(); toast(editing ? "Song updated" : "Song added to Library"); render();
  };
  const artwork=document.querySelector<HTMLInputElement>("#artwork")!;artwork.oninput=()=>updateArtworkPreview(artwork.value);
  document.querySelector<HTMLButtonElement>("#reset-artwork")!.onclick=()=>{artwork.value="";updateArtworkPreview(thumbnailFor(document.querySelector<HTMLInputElement>("#url")!.value));};
}

function updateArtworkPreview(url:string):void { const preview=document.querySelector<HTMLElement>("#artwork-preview");if(!preview)return;preview.querySelector("img")?.remove();if(url){const img=document.createElement("img");img.src=url;img.alt="Song thumbnail";img.onerror=()=>img.remove();preview.prepend(img);} }

function field(label: string, id: string, value: string, type = "text"): string { return `<label class="modal-field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}"/></label>`; }

function songActions(id: string): void {
  const song = state.songs.find(s => s.id === id); if (!song) return;
  const thumbnail=youtubeThumbnail(song);
  modal(`<div class="modal-card action-sheet"><div class="sheet-grab"></div><div class="sheet-song"><div class="cover" style="--h:${hashHue(song.id)}">${thumbnail?`<img src="${esc(thumbnail)}" alt="" onerror="this.remove()"/>`:""}<span>${esc(song.title[0] ?? "E")}</span></div><div><strong>${esc(song.title)}</strong><span>${esc(song.artist)}</span></div></div>
    <button id="action-play">${icon("play")} Play now</button><button id="action-copy">${icon("copy")} Copy URL</button><button id="action-edit">${icon("edit")} Edit song</button><button id="action-delete" class="danger">${icon("trash")} Delete song</button><button data-close>Cancel</button></div>`);
  document.querySelector<HTMLButtonElement>("#action-play")!.onclick = () => { selectedId = id; closeModal(); render(); playSelected(); };
  document.querySelector<HTMLButtonElement>("#action-copy")!.onclick = async () => { await api.copyUrl(song.url); closeModal(); toast("Song URL copied"); };
  document.querySelector<HTMLButtonElement>("#action-edit")!.onclick = () => { closeModal(); editSong(song); };
  document.querySelector<HTMLButtonElement>("#action-delete")!.onclick = async () => {
    if (!await askConfirmation(`Delete ${song.title}?`, "This song will be removed from your Library.", "Delete")) return;
    state.songs = state.songs.filter(s => s.id !== id);
    selectedId = state.songs[0]?.id ?? "";
    await api.saveSongs(state.songs);
    closeModal();
    render();
    toast(`${song.title} deleted`);
  };
}

function themeEditor(): void {
  const t = state.settings.theme;
  const colors: [keyof Theme, string][] = [["background","Background"],["surface","Panel"],["surfaceStrong","Raised panel"],["field","Fields"],["text","Main text"],["muted","Muted text"],["accent","Primary accent"],["accent2","Second accent"],["selected","Selected row"],["danger","Danger"],["success","Success"]];
  modal(`<form id="theme-form" class="modal-card theme-modal"><div class="modal-head"><div><p class="eyebrow">LIVE PREVIEW</p><h2>Custom theme</h2></div><button type="button" data-close>×</button></div><div class="color-grid">${colors.map(([key,label]) => `<label><span>${label}</span><input type="color" data-color="${key}" value="${t[key] as string}"/></label>`).join("")}</div>
    <label class="modal-field"><span>Glow <output>${t.glow}%</output></span><input type="range" min="0" max="100" data-number="glow" value="${t.glow}"/></label><label class="modal-field"><span>Glass blur <output>${t.blur}px</output></span><input type="range" min="0" max="40" data-number="blur" value="${t.blur}"/></label><button class="primary-wide">Save custom theme</button></form>`);
  document.querySelectorAll<HTMLInputElement>("[data-color]").forEach(input => input.oninput = () => { (t as unknown as Record<string,string>)[input.dataset.color!] = input.value; t.name = "Custom"; applyTheme(t); });
  document.querySelectorAll<HTMLInputElement>("[data-number]").forEach(input => input.oninput = () => { (t as unknown as Record<string,number>)[input.dataset.number!] = +input.value; input.parentElement!.querySelector("output")!.textContent = input.dataset.number === "blur" ? `${input.value}px` : `${input.value}%`; applyTheme(t); });
  document.querySelector<HTMLFormElement>("#theme-form")!.onsubmit = async e => { e.preventDefault(); t.name = "Custom"; await api.saveSettings(state.settings); closeModal(); toast("Custom theme saved"); render(); };
}

async function addSearchResult(index: number): Promise<void> {
  const r = youtubeResults[index];
  if (state.songs.some(song => song.url === r.url)) { toast("That video is already in your library"); return; }
  editSong({ id: "", artist: r.channel, album: "YouTube", title: r.title, url: r.url, length: r.length, favorite: false, artwork: r.thumbnail }, true);
}
function selectSong(id: string): void { selectedId = id; }

async function playSelected(): Promise<void> {
  const song = currentSong(); if (!song) return;
  const text = state.settings.mode === "Car" ? `/carurl ${song.url}` : song.url;
  try {
    if (state.settings.mode !== "Car") await api.copyUrl(song.url);
    await api.sendToGame(text, state.settings.mode === "Car");
    toast(state.settings.mode === "Car" ? `${song.title} sent to Car` : `${song.title} pasted to ${state.settings.mode} • URL kept in clipboard`);
    if (state.settings.closeAfterPlay) { try { await getCurrentWindow().hide(); } catch { } }
  } catch (e) { errorToast(e); }
}

async function stopPlayback(): Promise<void> {
  const value = state.settings.mode === "Car" ? "/carurl" : state.settings.mode === "TV" ? "/CinemaStopQueue" : "https://www.youtube.com/watch?v=Vbks4abvLEw";
  try { await api.sendToGame(value, state.settings.mode !== "Speaker"); toast("Stop command sent"); } catch (e) { errorToast(e); }
}

function step(delta: number): void { if (!state.songs.length) return; let i = state.songs.findIndex(s => s.id === selectedId); i = (Math.max(i, 0) + delta + state.songs.length) % state.songs.length; selectedId = state.songs[i].id; render(); }

function modal(html: string): void {
  const root = document.querySelector<HTMLElement>("#modal-root")!;
  root.innerHTML = `<div class="modal-backdrop">${html}</div>`;
  root.querySelectorAll<HTMLElement>("[data-close]").forEach(x => x.onclick = closeModal);
  root.querySelector(".modal-backdrop")!.addEventListener("mousedown", e => { if (e.target === e.currentTarget) closeModal(); });
  if (modalEscapeHandler) document.removeEventListener("keydown", modalEscapeHandler);
  modalEscapeHandler = event => { if (event.key === "Escape") closeModal(); };
  document.addEventListener("keydown", modalEscapeHandler);
}
function closeModal(): void {
  document.querySelector<HTMLElement>("#modal-root")!.innerHTML = "";
  if (modalEscapeHandler) document.removeEventListener("keydown", modalEscapeHandler);
  modalEscapeHandler = null;
}
function askConfirmation(title: string, message: string, actionLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    modal(`<section class="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><div class="confirm-icon">!</div><div><p class="eyebrow">PLEASE CONFIRM</p><h2 id="confirm-title">${esc(title)}</h2><p>${esc(message)}</p></div><div class="confirm-actions"><button id="confirm-cancel" class="confirm-cancel">Cancel</button><button id="confirm-action" class="confirm-danger">${esc(actionLabel)}</button></div></section>`);
    const finish = (answer: boolean) => { closeModal(); resolve(answer); };
    document.querySelector<HTMLButtonElement>("#confirm-cancel")!.onclick = () => finish(false);
    document.querySelector<HTMLButtonElement>("#confirm-action")!.onclick = () => finish(true);
    document.querySelector<HTMLElement>(".modal-backdrop")!.addEventListener("mousedown", event => {
      if (event.target === event.currentTarget) finish(false);
    });
    if (modalEscapeHandler) document.removeEventListener("keydown", modalEscapeHandler);
    modalEscapeHandler = event => { if (event.key === "Escape") finish(false); };
    document.addEventListener("keydown", modalEscapeHandler);
    document.querySelector<HTMLButtonElement>("#confirm-cancel")!.focus();
  });
}
function empty(title: string, copy: string): string { return `<div class="empty"><div class="empty-orb">♫</div><h3>${title}</h3><p>${copy}</p></div>`; }
function loading(label: string): string { return `<div class="empty"><div class="loader"></div><h3>${label}</h3></div>`; }
function hashHue(value: string): number { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) % 360; return n; }
function toast(message: string, danger = false): void { const el = document.querySelector<HTMLElement>("#toast")!; el.textContent = message; el.className = `toast show ${danger ? "danger" : ""}`; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove("show"), 3200); }
function errorToast(error: unknown): void { toast(error instanceof Error ? error.message : String(error), true); }

function applyTextScales():void {
  const root=document.documentElement;
  root.style.setProperty("--heading-scale",String(state.settings.headingScale||1));
  root.style.setProperty("--body-scale",String(state.settings.bodyScale||1));
  root.style.setProperty("--small-scale",String(state.settings.smallScale||1));
  root.style.setProperty("--nav-scale",String(state.settings.navScale||1));
}

function applyWindowOpacity():void { document.documentElement.style.setProperty("--window-opacity",String(state.settings.windowOpacity||1)); }

async function resizePhone(preserveStoredSize = false): Promise<void> {
  const scale = Math.min(1.15, Math.max(.75, state.settings.windowScale || 1));
  const width = (landscape ? 960 : 530) * scale;
  const height = (landscape ? 530 : 960) * scale;
  document.querySelector(".phone-wrap")?.classList.toggle("landscape", landscape);
  if (!preserveStoredSize) {
    state.settings.windowWidth = Math.round(width);
    state.settings.windowHeight = Math.round(height);
  }
  try { await getCurrentWindow().setSize(new LogicalSize(width, height)); } catch { /* browser preview */ }
}

async function rotatePhone(): Promise<void> {
  landscape = !landscape;
  state.settings.orientation = landscape ? "Landscape" : "Portrait";
  await resizePhone();
  await api.saveSettings(state.settings);
  toast(landscape ? "Landscape view" : "Portrait view");
}

function applyPositionLock(): void {
  document.querySelector(".phone-wrap")?.classList.toggle("position-locked", positionLocked);
  document.querySelectorAll<HTMLElement>(".topbar,.appbar,.island").forEach(el => {
    if (positionLocked) el.removeAttribute("data-tauri-drag-region"); else el.setAttribute("data-tauri-drag-region", "");
  });
}

function phoneMenu(): void {
  modal(`<div class="modal-card action-sheet"><div class="sheet-grab"></div><p class="eyebrow">PHONE CONTROLS</p><button id="quick-hide">− Hide phone</button><button id="quick-rotate">↻ ${landscape ? "Portrait" : "Landscape"} view</button><button id="quick-pin">${state.settings.alwaysOnTop ? "✓" : ""} Pin above other windows</button><button id="quick-lock">${positionLocked ? "✓" : ""} Lock phone position</button><button id="quick-settings">⚙ Settings</button><button id="quick-exit" class="danger">× Exit completely</button><button data-close>Cancel</button></div>`);
  document.querySelector<HTMLButtonElement>("#quick-hide")!.onclick = async () => { await getCurrentWindow().hide(); };
  document.querySelector<HTMLButtonElement>("#quick-rotate")!.onclick = async () => { closeModal(); await rotatePhone(); };
  document.querySelector<HTMLButtonElement>("#quick-pin")!.onclick = async () => { state.settings.alwaysOnTop = !state.settings.alwaysOnTop; await api.saveSettings(state.settings); await getCurrentWindow().setAlwaysOnTop(state.settings.alwaysOnTop); closeModal(); };
  document.querySelector<HTMLButtonElement>("#quick-lock")!.onclick = async () => { positionLocked = !positionLocked; state.settings.positionLocked = positionLocked; await api.saveSettings(state.settings); closeModal(); applyPositionLock(); toast(positionLocked ? "Phone position locked" : "Phone position unlocked"); };
  document.querySelector<HTMLButtonElement>("#quick-settings")!.onclick = () => { closeModal(); page = "settings"; localStorage.setItem("eclipse-page", page); renderTabs(); render(); };
  document.querySelector<HTMLButtonElement>("#quick-exit")!.onclick = async () => { if(state.settings.confirmBeforeExit&&!await askConfirmation("Exit Eclipse Phone Player Lite?","The phone player will close completely.","Exit"))return;await getCurrentWindow().close(); };
}

async function restoreWindowPosition():Promise<void>{
  if(!state.settings.rememberWindowPosition)return;
  try{
    const width=state.settings.windowWidth||Math.round((landscape?960:530)*state.settings.windowScale);
    const height=state.settings.windowHeight||Math.round((landscape?530:960)*state.settings.windowScale);
    await getCurrentWindow().setSize(new LogicalSize(width,height));
    if(state.settings.windowX==null||state.settings.windowY==null)return;

    const x=state.settings.windowX,y=state.settings.windowY;
    const monitors=await availableMonitors();
    const visible=monitors.some(monitor=>{
      const area=monitor.workArea;
      const physicalWidth=width*monitor.scaleFactor;
      const physicalHeight=height*monitor.scaleFactor;
      const intersectionWidth=Math.max(0,Math.min(x+physicalWidth,area.position.x+area.size.width)-Math.max(x,area.position.x));
      const intersectionHeight=Math.max(0,Math.min(y+physicalHeight,area.position.y+area.size.height)-Math.max(y,area.position.y));
      return intersectionWidth>=80&&intersectionHeight>=80;
    });

    if(visible){
      await getCurrentWindow().setPosition(new PhysicalPosition(x,y));
    }else{
      state.settings.windowX=null;
      state.settings.windowY=null;
      await getCurrentWindow().center();
      await api.saveSettings(state.settings);
    }
  }catch{}
}

async function watchWindowGeometry():Promise<void>{
  try{await getCurrentWindow().onMoved(({payload})=>{if(!state.settings.rememberWindowPosition)return;state.settings.windowX=payload.x;state.settings.windowY=payload.y;window.clearTimeout(positionSaveTimer);positionSaveTimer=window.setTimeout(()=>api.saveSettings(state.settings).catch(()=>undefined),500);});}catch{}
  try{await getCurrentWindow().onResized(async ({payload})=>{if(!state.settings.rememberWindowPosition)return;const factor=await getCurrentWindow().scaleFactor();state.settings.windowWidth=Math.round(payload.width/factor);state.settings.windowHeight=Math.round(payload.height/factor);window.clearTimeout(sizeSaveTimer);sizeSaveTimer=window.setTimeout(()=>api.saveSettings(state.settings).catch(()=>undefined),500);});}catch{}
}

function scheduleSettingsSave():void {
  window.clearTimeout(settingsSaveTimer);
  settingsSaveTimer=window.setTimeout(()=>api.saveSettings(state.settings).then(()=>toast("Settings saved")).catch(errorToast),450);
}

function updateClock():void {
  const el=document.querySelector("#clock");
  if(!el)return;
  el.textContent=new Intl.DateTimeFormat([],{
    hour:"2-digit",
    minute:"2-digit",
    hour12:state.settings.timeFormat!=="24-hour",
    ...(state.settings.timeZone==="UTC"?{timeZone:"UTC"}:{})
  }).format(new Date());
}

function startClock(): void { updateClock(); window.setInterval(updateClock, 30_000); }

function startVisualizer(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#visualizer"); if (!canvas) return; const ctx = canvas.getContext("2d")!; let frame = 0;
  const draw = () => { if (!canvas.isConnected) return; const rect = canvas.getBoundingClientRect(); canvas.width = Math.max(1, rect.width * devicePixelRatio); canvas.height = Math.max(1, rect.height * devicePixelRatio); ctx.scale(devicePixelRatio, devicePixelRatio); ctx.clearRect(0,0,rect.width,rect.height); const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(); const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim();
    for (let band=0; band<3; band++) { ctx.beginPath(); for(let x=0;x<=rect.width;x+=4){ const y=rect.height*(.45+band*.08)+Math.sin(x*.022+frame*.025+band)*22+Math.sin(x*.008-frame*.015)*18; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.strokeStyle=band===1?accent:accent2; ctx.globalAlpha=.65-band*.12; ctx.lineWidth=2.2-band*.35; ctx.shadowBlur=18; ctx.shadowColor=ctx.strokeStyle; ctx.stroke(); } ctx.globalAlpha=1; frame++; requestAnimationFrame(draw); };
  requestAnimationFrame(draw);
}

async function init(): Promise<void> {
  try {
    state = await api.state(); state.settings.windowScale = Math.min(1.15, Math.max(.75, state.settings.windowScale || 1)); state.settings.headingScale ||= 1; state.settings.bodyScale ||= 1; state.settings.smallScale ||= 1; state.settings.navScale ||= 1; state.settings.orientation ||= "Portrait";state.settings.defaultPage||="Library";state.settings.librarySort||="Favorites First";state.settings.windowOpacity=Math.min(1,Math.max(.55,state.settings.windowOpacity||1));state.settings.defaultPlaybackMode||=state.settings.mode||"Car";state.settings.timeFormat||="12-hour";state.settings.timeZone||="System";landscape=state.settings.orientation==="Landscape";positionLocked=state.settings.positionLocked||false;page=({Library:"library",YouTube:"youtube",Settings:"settings"} as const)[state.settings.defaultPage]||"library";state.settings.mode=state.settings.defaultPlaybackMode; selectedId = state.songs[0]?.id ?? ""; applyTheme(state.settings.theme); applyTextScales();applyWindowOpacity(); shell(); await resizePhone(true);await restoreWindowPosition();await watchWindowGeometry();
    await listen<string>("hotkey", async ({ payload }) => {
      if (!state.songs.length) return;
      const previousMode = state.settings.mode;
      state.settings.mode = payload === "random-speaker" ? "Speaker" : payload === "random-tv" ? "TV" : "Car";
      selectedId = state.songs[Math.floor(Math.random() * state.songs.length)].id;
      await playSelected(); state.settings.mode = previousMode;
    }).catch(() => undefined);
  }
  catch (e) { app.innerHTML = `<div class="fatal"><h1>Could not start Eclipse Phone Player Lite</h1><pre>${esc(String(e))}</pre></div>`; }
}

init();
