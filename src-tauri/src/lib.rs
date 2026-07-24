mod media;
mod models;
mod storage;
mod windows_control;

use models::{AppState, SearchResult, Settings, Song};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn get_state(app: tauri::AppHandle) -> Result<AppState,String> {
    let songs=storage::load_songs(&app)?;let settings=storage::load_settings(&app)?;
    Ok(AppState{songs,settings,data_dir:storage::data_dir(&app)?.to_string_lossy().to_string()})
}

#[tauri::command] fn save_songs(app:tauri::AppHandle,songs:Vec<Song>)->Result<(),String>{storage::save_songs(&app,&songs)}
#[tauri::command] fn save_settings(app:tauri::AppHandle,settings:Settings)->Result<(),String>{storage::save_settings(&app,&settings)}
#[tauri::command] fn search_youtube(query:String)->Result<Vec<SearchResult>,String>{if query.trim().is_empty(){return Err("Enter a search phrase.".into());}media::search(query.trim())}
#[tauri::command] fn fetch_metadata(url:String)->Result<SearchResult,String>{media::metadata(url.trim())}
#[tauri::command]
fn open_youtube_search(query:String)->Result<(),String>{
    let query=query.trim();
    let url=if query.is_empty(){
        "https://www.youtube.com/".to_string()
    }else{
        format!("https://www.youtube.com/results?search_query={}",urlencoding::encode(query))
    };
    // Use Tauri's supported opener instead of launching a Windows process.
    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e|format!("Could not open the default browser: {e}"))?;
    Ok(())
}
#[tauri::command] fn send_to_game(app:tauri::AppHandle,text:String,open_chat:bool)->Result<(),String>{let s=storage::load_settings(&app)?;windows_control::send(&s.game_exe,&s.open_chat_key,&text,open_chat)}
#[tauri::command] fn copy_url(text:String)->Result<(),String>{let mut clipboard=arboard::Clipboard::new().map_err(|e|e.to_string())?;clipboard.set_text(text).map_err(|e|e.to_string())}
#[tauri::command] fn import_legacy(app:tauri::AppHandle)->Result<usize,String>{let path=storage::find_legacy_file().ok_or("MusicList.txt was not found beside the app. Place it beside the executable and try again.")?;let mut imported=storage::import_csv(&path)?;media::enrich_legacy_songs(&mut imported);let count=imported.len();storage::save_songs(&app,&imported)?;storage::write_updated_csv(&path,&imported)?;Ok(count)}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
            if event.state()!=ShortcutState::Pressed{return;}
            let f3=Shortcut::new(None,Code::F3);let ctrl=Shortcut::new(Some(Modifiers::CONTROL),Code::F3);let alt=Shortcut::new(Some(Modifiers::ALT),Code::F3);let shift=Shortcut::new(Some(Modifiers::SHIFT),Code::F3);
            if shortcut==&f3{if let Some(w)=app.get_webview_window("main"){if w.is_visible().unwrap_or(false){let _=w.hide();}else{let _=w.show();let _=w.set_focus();}}}
            else if shortcut==&ctrl{let _=app.emit("hotkey","random-car");}else if shortcut==&alt{let _=app.emit("hotkey","random-speaker");}else if shortcut==&shift{let _=app.emit("hotkey","random-tv");}
        }).build())
        .setup(|app| {
            let show=MenuItem::with_id(app,"show","Show phone",true,None::<&str>)?;
            let hide=MenuItem::with_id(app,"hide","Hide phone",true,None::<&str>)?;
            let quit=MenuItem::with_id(app,"quit","Exit Eclipse Phone Player Lite",true,None::<&str>)?;
            let menu=Menu::with_items(app,&[&show,&hide,&quit])?;
            let mut tray=TrayIconBuilder::new().tooltip("Eclipse Phone Player Lite").menu(&menu).on_menu_event(|app,event| {
                match event.id().as_ref() {
                    "show"=>if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();},
                    "hide"=>if let Some(w)=app.get_webview_window("main"){let _=w.hide();},
                    "quit"=>app.exit(0),
                    _=>{}
                }
            });
            if let Some(icon)=app.default_window_icon(){tray=tray.icon(icon.clone());}
            tray.build(app)?;
            let gs=app.global_shortcut();
            let _=gs.register(Shortcut::new(None,Code::F3));
            let _=gs.register(Shortcut::new(Some(Modifiers::CONTROL),Code::F3));
            let _=gs.register(Shortcut::new(Some(Modifiers::ALT),Code::F3));
            let _=gs.register(Shortcut::new(Some(Modifiers::SHIFT),Code::F3));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_state,save_songs,save_settings,search_youtube,fetch_metadata,open_youtube_search,send_to_game,copy_url,import_legacy])
        .run(tauri::generate_context!())
        .expect("error while running Eclipse Phone Player Lite");
}
