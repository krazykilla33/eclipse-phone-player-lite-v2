#[cfg(windows)]
mod platform {
    use arboard::Clipboard;
    use std::{path::Path, thread, time::Duration};
    use windows::{
        core::PWSTR,
        Win32::{
            Foundation::{BOOL, HWND, LPARAM},
            System::Threading::{
                OpenProcess, QueryFullProcessImageNameW,
                PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
            },
            UI::{
                Input::KeyboardAndMouse::{
                    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD,
                    KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
                    VK_CONTROL, VK_RETURN,
                },
                WindowsAndMessaging::{
                    EnumWindows, GetWindowThreadProcessId,
                    IsWindowVisible, SetForegroundWindow,
                },
            },
        },
    };

    struct FindData {
        wanted: String,
        hwnd: HWND,
    }

    unsafe extern "system" fn enum_proc(
        hwnd: HWND,
        param: LPARAM,
    ) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let data = &mut *(param.0 as *mut FindData);
        let mut pid = 0;

        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        if pid == 0 {
            return BOOL(1);
        }

        if let Ok(process) = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            pid,
        ) {
            let mut buf = vec![0u16; 1024];
            let mut size = buf.len() as u32;

            if QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_FORMAT(0),
                PWSTR(buf.as_mut_ptr()),
                &mut size,
            )
            .is_ok()
            {
                let full_path = String::from_utf16_lossy(
                    &buf[..size as usize],
                );

                let exe = Path::new(&full_path)
                    .file_name()
                    .and_then(|x| x.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();

                if exe == data.wanted {
                    data.hwnd = hwnd;
                    return BOOL(0);
                }
            }
        }

        BOOL(1)
    }

    fn find_window(exe: &str) -> Result<HWND, String> {
        let mut data = FindData {
            wanted: exe.to_ascii_lowercase(),
            hwnd: HWND::default(),
        };

        unsafe {
            let _ = EnumWindows(
                Some(enum_proc),
                LPARAM(&mut data as *mut _ as isize),
            );
        }

        if data.hwnd.0.is_null() {
            Err(format!(
                "Could not find {exe}. Start GTA first or change the executable in Settings."
            ))
        } else {
            Ok(data.hwnd)
        }
    }

    fn key(vk: VIRTUAL_KEY, up: bool) {
        let flags = if up {
            KEYEVENTF_KEYUP
        } else {
            Default::default()
        };

        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            let _ = SendInput(
                &[input],
                std::mem::size_of::<INPUT>() as i32,
            );
        }
    }

    fn press(vk: VIRTUAL_KEY) {
        key(vk, false);
        key(vk, true);
    }

    // FiveM: hold the chat key before releasing it.
    fn press_with_hold(vk: VIRTUAL_KEY, hold_ms: u64) {
        key(vk, false);
        thread::sleep(Duration::from_millis(hold_ms));
        key(vk, true);
    }

    pub fn send(
        exe: &str,
        chat_key: &str,
        text: &str,
        open_chat: bool,
    ) -> Result<(), String> {
        let hwnd = find_window(exe)?;

        let mut clipboard =
            Clipboard::new().map_err(|e| e.to_string())?;

        let old = clipboard.get_text().ok();

        clipboard
            .set_text(text)
            .map_err(|e| e.to_string())?;

        unsafe {
            if !SetForegroundWindow(hwnd).as_bool() {
                if let Some(value) = old {
                    let _ = clipboard.set_text(value);
                }

                return Err(
                    "Windows could not activate GTA/FiveM.".into()
                );
            }
        }

        // Allow FiveM to receive window focus.
        thread::sleep(Duration::from_millis(150));

        if open_chat {
            let c = chat_key
                .chars()
                .next()
                .unwrap_or('t')
                .to_ascii_uppercase() as u16;

            // Hold T for 75 ms, as in the AHK script.
            press_with_hold(VIRTUAL_KEY(c), 75);

            // Allow FiveM chat to open.
            thread::sleep(Duration::from_millis(50));
        }

        // Paste the command or URL.
        key(VK_CONTROL, false);
        press(VIRTUAL_KEY('V' as u16));
        key(VK_CONTROL, true);

        thread::sleep(Duration::from_millis(90));

        // Submit the command.
        press(VK_RETURN);

        thread::sleep(Duration::from_millis(180));

        // Restore the previous clipboard content.
        if let Some(value) = old {
            let _ = clipboard.set_text(value);
        }

        Ok(())
    }
}

#[cfg(windows)]
pub use platform::send;

#[cfg(not(windows))]
pub fn send(
    _exe: &str,
    _chat_key: &str,
    _text: &str,
    _open_chat: bool,
) -> Result<(), String> {
    Err("GTA control is available in the Windows build.".into())
}

