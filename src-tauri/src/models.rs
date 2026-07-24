use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Song {
    pub id: String,
    pub artist: String,
    pub album: String,
    pub title: String,
    pub url: String,
    pub favorite: bool,
    pub length: String,
    pub artwork: Option<String>,
    pub added_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub name: String,
    pub background: String,
    pub surface: String,
    pub surface_strong: String,
    pub field: String,
    pub text: String,
    pub muted: String,
    pub accent: String,
    pub accent2: String,
    pub selected: String,
    pub danger: String,
    pub success: String,
    pub glow: u8,
    pub blur: u8,
}

impl Default for Theme {
    fn default() -> Self {
        Self { name:"Midnight Glass".into(), background:"#050817".into(), surface:"#10162c".into(), surface_strong:"#171f3d".into(), field:"#080d20".into(), text:"#f6f8ff".into(), muted:"#9aa7cc".into(), accent:"#24d7ff".into(), accent2:"#7456ff".into(), selected:"#202f68".into(), danger:"#ff5d86".into(), success:"#42efb5".into(), glow:70, blur:24 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub game_exe: String,
    pub open_chat_key: String,
    pub mode: String,
    pub volume: u8,
    pub always_on_top: bool,
    pub close_after_play: bool,
    pub start_minimized: bool,
    pub theme: Theme,
    pub window_scale: f32,
    pub heading_scale: f32,
    pub body_scale: f32,
    pub small_scale: f32,
    pub nav_scale: f32,
    pub orientation: String,
    pub default_page: String,
    pub library_sort: String,
    pub window_opacity: f32,
    pub confirm_before_exit: bool,
    pub remember_window_position: bool,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
    pub position_locked: bool,
    pub default_playback_mode: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self { game_exe:"GTA5.exe".into(), open_chat_key:"t".into(), mode:"Car".into(), volume:100, always_on_top:true, close_after_play:true, start_minimized:false, theme:Theme::default(), window_scale:1.0, heading_scale:1.0, body_scale:1.0, small_scale:1.0, nav_scale:1.0, orientation:"Portrait".into(), default_page:"Library".into(), library_sort:"Favorites First".into(), window_opacity:1.0, confirm_before_exit:false, remember_window_position:false, window_x:None, window_y:None, window_width:None, window_height:None, position_locked:false, default_playback_mode:"Car".into() }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState { pub songs: Vec<Song>, pub settings: Settings, pub data_dir: String }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult { pub title: String, pub channel: String, pub length: String, pub url: String, pub thumbnail: Option<String> }
