mod media;
mod models;
mod storage;
mod windows_control;

use models::{AppState, SearchResult, Settings, Song};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn configured_shortcuts(settings:&Settings)->Result<Vec<Shortcut>,String>{
    let values=[
        ("Show / hide",&settings.show_hide_hotkey),
        ("Random Car",&settings.random_car_hotkey),
        ("Random Speaker",&settings.random_speaker_hotkey),
        ("Random TV",&settings.random_tv_hotkey),
    ];
    let mut shortcuts=Vec::new();
    for(label,value)in values{
        let shortcut=value.parse::<Shortcut>().map_err(|_|format!("{label} hotkey is not valid: {value}"))?;
        if shortcuts.contains(&shortcut){return Err(format!("Each action needs a different hotkey. {value} is used more than once."));}
        shortcuts.push(shortcut);
    }
    Ok(shortcuts)
}

fn apply_shortcuts(app:&tauri::AppHandle,settings:&Settings)->Result<(),String>{
    let shortcuts=configured_shortcuts(settings)?;
    let manager=app.global_shortcut();
    manager.unregister_all().map_err(|e|format!("Could not update hotkeys: {e}"))?;
    manager.register_multiple(shortcuts).map_err(|e|format!("Could not register the selected hotkeys: {e}"))
}

fn update_shortcuts(app:&tauri::AppHandle,previous:&Settings,next:&Settings)->Result<(),String>{
    let old_shortcuts=configured_shortcuts(previous)?;
    let new_shortcuts=configured_shortcuts(next)?;
    let changed:Vec<(Shortcut,Shortcut)>=old_shortcuts.into_iter().zip(new_shortcuts).filter(|(old,new)|old!=new).collect();
    if changed.is_empty(){return Ok(());}

    let manager=app.global_shortcut();
    let old_changed:Vec<Shortcut>=changed.iter().map(|(old,_)|old.clone()).collect();
    let new_changed:Vec<Shortcut>=changed.iter().map(|(_,new)|new.clone()).collect();
    manager.unregister_multiple(old_changed.clone()).map_err(|e|format!("Could not update hotkeys: {e}"))?;
    if let Err(error)=manager.register_multiple(new_changed.clone()){
        // A failed multi-register can leave some of the new shortcuts active.
        // Remove them before restoring the known-good previous bindings.
        let _=manager.unregister_multiple(new_changed);
        let _=manager.register_multiple(old_changed);
        return Err(format!("Could not register the selected hotkeys: {error}"));
    }
    Ok(())
}

fn shortcut_action(settings:&Settings,pressed:&Shortcut)->Option<&'static str>{
    [
        (&settings.show_hide_hotkey,"toggle"),
        (&settings.random_car_hotkey,"random-car"),
        (&settings.random_speaker_hotkey,"random-speaker"),
        (&settings.random_tv_hotkey,"random-tv"),
    ].into_iter().find_map(|(value,action)|value.parse::<Shortcut>().ok().filter(|shortcut|shortcut==pressed).map(|_|action))
}

#[tauri::command]
fn get_state(app: tauri::AppHandle) -> Result<AppState,String> {
    let songs=storage::load_songs(&app)?;let settings=storage::load_settings(&app)?;
    Ok(AppState{songs,settings,data_dir:storage::data_dir(&app)?.to_string_lossy().to_string()})
}

#[tauri::command] fn save_songs(app:tauri::AppHandle,songs:Vec<Song>)->Result<(),String>{storage::save_songs(&app,&songs)}
#[tauri::command]
fn save_settings(app:tauri::AppHandle,settings:Settings)->Result<(),String>{
    let previous=storage::load_settings(&app)?;
    let hotkeys_changed=previous.show_hide_hotkey!=settings.show_hide_hotkey
        ||previous.random_car_hotkey!=settings.random_car_hotkey
        ||previous.random_speaker_hotkey!=settings.random_speaker_hotkey
        ||previous.random_tv_hotkey!=settings.random_tv_hotkey;
    if hotkeys_changed{
        update_shortcuts(&app,&previous,&settings)?;
    }
    storage::save_settings(&app,&settings)
}
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
#[tauri::command]
fn open_data_folder(app:tauri::AppHandle)->Result<(),String>{
    let path=storage::data_dir(&app)?;
    tauri_plugin_opener::open_path(path,None::<&str>).map_err(|e|format!("Could not open the data folder: {e}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app,shortcut,event| {
            if event.state()!=ShortcutState::Pressed{return;}
            let action=storage::load_settings(app).ok().and_then(|settings|shortcut_action(&settings,shortcut));
            if action==Some("toggle"){if let Some(w)=app.get_webview_window("main"){if w.is_visible().unwrap_or(false){let _=w.hide();}else{let _=w.show();let _=w.set_focus();}}}
            else if let Some(action)=action{let _=app.emit("hotkey",action);}
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
            let settings=storage::load_settings(app.handle()).unwrap_or_default();
            let _=apply_shortcuts(app.handle(),&settings);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_state,save_songs,save_settings,search_youtube,fetch_metadata,open_youtube_search,send_to_game,copy_url,import_legacy,open_data_folder])
        .run(tauri::generate_context!())
        .expect("error while running Eclipse Phone Player Lite");
}
