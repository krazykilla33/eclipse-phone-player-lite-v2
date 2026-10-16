use crate::models::{Settings, Song};
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let old_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
    { fs::create_dir_all(&old_dir).map_err(|e| e.to_string())?; return Ok(old_dir); }
    #[cfg(not(debug_assertions))]
    {
        let exe=std::env::current_exe().map_err(|e|format!("Could not locate the application folder: {e}"))?;
        let install_dir=exe.parent().ok_or("Could not locate the application folder")?.to_path_buf();
        if !writable_dir(&install_dir){return Err(format!("The installation folder is not writable: {}. Reinstall Eclipse Phone Player Lite in a folder your Windows account can write to.",install_dir.display()));}
        move_existing_data(&old_dir,&install_dir)?;
        Ok(install_dir)
    }
}

#[cfg(not(debug_assertions))]
fn writable_dir(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() { return false; }
    let probe=path.join(".write-test");
    fs::write(&probe,b"ok").and_then(|_|fs::remove_file(probe)).is_ok()
}

#[cfg(not(debug_assertions))]
fn move_existing_data(from: &Path, to: &Path) -> Result<(),String> {
    if from==to || !from.exists() { return Ok(()); }
    for name in ["settings-lite.json","library.json","settings-lite.bak","library.bak"] {
        let source=from.join(name);let target=to.join(name);
        if source.exists()&&!target.exists(){move_path(&source,&target)?;}
    }
    // Lite migrates only its library and settings. It never copies media tools or downloads.
    let _=fs::remove_dir(from);
    Ok(())
}

#[cfg(not(debug_assertions))]
fn move_path(from:&Path,to:&Path)->Result<(),String>{
    if fs::rename(from,to).is_ok(){return Ok(());}fs::copy(from,to).map_err(|e|e.to_string())?;fs::remove_file(from).map_err(|e|e.to_string())
}

pub fn load_songs(app: &AppHandle) -> Result<Vec<Song>, String> {
    let path = data_dir(app)?.join("library.json");
    if !path.exists() { return Ok(Vec::new()); }
    serde_json::from_str(&fs::read_to_string(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn save_songs(app: &AppHandle, songs: &[Song]) -> Result<(), String> {
    atomic_json(&data_dir(app)?.join("library.json"), songs)
}


pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = data_dir(app)?.join("settings.json");

    if !path.exists() {
        return Ok(Settings::default());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| e.to_string())?;

    let mut settings: Settings = serde_json::from_str(&contents)
        .map_err(|e| e.to_string())?;

    // Automatically migrate old GTA5 or FiveM build settings.
    let configured = settings.game_exe.trim().to_ascii_lowercase();

    let is_old_fivem = configured
        .strip_prefix("fivem_b")
        .and_then(|name| name.strip_suffix("_gtaprocess.exe"))
        .map(|build| {
            !build.is_empty()
                && build.chars().all(|c| c.is_ascii_digit())
        })
        .unwrap_or(false);

    if configured.is_empty()
        || configured == "gta5.exe"
        || is_old_fivem
    {
        settings.game_exe =
            "FiveM_b*_GTAProcess.exe".to_string();
    }

    Ok(settings)
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    atomic_json(&data_dir(app)?.join("settings-lite.json"), settings)
}

fn atomic_json<T: serde::Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if path.exists() { let _ = fs::copy(path, path.with_extension("bak")); }
    fs::rename(temp, path).map_err(|e| e.to_string())
}

pub fn find_legacy_file() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() { if let Some(parent) = exe.parent() { candidates.push(parent.join("MusicList.txt")); candidates.push(parent.parent().unwrap_or(parent).join("MusicList.txt")); } }
    if let Ok(cwd) = std::env::current_dir() { candidates.push(cwd.join("MusicList.txt")); }
    candidates.into_iter().find(|p| p.exists())
}

pub fn import_csv(path: &Path) -> Result<Vec<Song>, String> {
    let mut reader = csv::ReaderBuilder::new().has_headers(false).flexible(true).from_path(path).map_err(|e| e.to_string())?;
    let mut songs = Vec::new();
    for record in reader.records() {
        let r = record.map_err(|e| e.to_string())?; if r.len() < 4 { continue; }
        let artist = r.get(0).unwrap_or("").trim().to_string(); let album = r.get(1).unwrap_or("").trim().to_string(); let title = r.get(2).unwrap_or("").trim().to_string(); let url = r.get(3).unwrap_or("").trim().to_string();
        if artist.is_empty() || title.is_empty() || !(url.starts_with("http://") || url.starts_with("https://")) { continue; }
        songs.push(Song { id:uuid::Uuid::new_v4().to_string(), artist, album, title, url, favorite:r.get(4).unwrap_or("0").trim()=="1", length:r.get(5).unwrap_or("").trim().to_string(), artwork:None, added_at:None });
    }
    Ok(songs)
}

pub fn write_updated_csv(path:&Path,songs:&[Song])->Result<(),String>{
    let temp=PathBuf::from(format!("{}.tmp",path.display()));let backup=PathBuf::from(format!("{}.bak",path.display()));
    let mut writer=csv::WriterBuilder::new().has_headers(false).from_path(&temp).map_err(|e|e.to_string())?;
    for song in songs{writer.write_record([song.artist.as_str(),song.album.as_str(),song.title.as_str(),song.url.as_str(),if song.favorite{"1"}else{"0"},song.length.as_str()]).map_err(|e|e.to_string())?;}
    writer.flush().map_err(|e|e.to_string())?;
    fs::copy(path,&backup).map_err(|e|format!("Could not back up MusicList.txt: {e}"))?;
    fs::copy(&temp,path).map_err(|e|format!("Could not update MusicList.txt: {e}"))?;let _=fs::remove_file(temp);Ok(())
}
