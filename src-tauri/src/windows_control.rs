#[cfg(windows)]
mod platform {
    use arboard::Clipboard;
    use std::{path::Path, thread, time::Duration};

    use windows::{
        core::PWSTR,
        Win32::{
            Foundation::{BOOL, HWND, LPARAM},
            System::Threading::{
                OpenProcess,
                QueryFullProcessImageNameW,
                PROCESS_NAME_FORMAT,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            UI::{
                Input::KeyboardAndMouse::{
                    MapVirtualKeyW,
                    SendInput,
                    INPUT,
                    INPUT_0,
                    INPUT_KEYBOARD,
                    KEYBDINPUT,
                    KEYEVENTF_KEYUP,
                    KEYEVENTF_SCANCODE,
                    MAPVK_VK_TO_VSC,
                    VIRTUAL_KEY,
                    VK_CONTROL,
                    VK_RETURN,
                },
                WindowsAndMessaging::{
                    EnumWindows,
                    GetForegroundWindow,
                    GetWindowThreadProcessId,
                    IsWindowVisible,
                    SetForegroundWindow,
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
                let full_path =
                    String::from_utf16_lossy(&buf[..size as usize]);

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
                "Could not find {exe}. Start FiveM/GTA first \
                 or change the executable in Settings."
            ))
        } else {
            Ok(data.hwnd)
        }
    }

    // Send a virtual-key event and check for failure.
    fn key(vk: VIRTUAL_KEY, up: bool) -> Result<(), String> {
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

        send_input_checked(input)
    }

    // Send a physical scan-code event.
    fn scan_key(scan: u16, up: bool) -> Result<(), String> {
        let flags = if up {
            KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP
        } else {
            KEYEVENTF_SCANCODE
        };

        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: scan,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        send_input_checked(input)
    }

    fn send_input_checked(input: INPUT) -> Result<(), String> {
        let sent = unsafe {
            SendInput(
                &[input],
                std::mem::size_of::<INPUT>() as i32,
            )
        };

        if sent != 1 {
            return Err(format!(
                "Windows failed to send keyboard input: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok(())
    }

    fn press(vk: VIRTUAL_KEY) -> Result<(), String> {
        key(vk, false)?;
        key(vk, true)
    }

    // Open chat using scan-code events with a held key.
    fn press_chat_key(
        chat_key: &str,
        hold_ms: u64,
    ) -> Result<(), String> {
        let character = chat_key
            .chars()
            .next()
            .unwrap_or('t')
            .to_ascii_uppercase();

        if !character.is_ascii_alphanumeric() {
            return Err(
                "The configured chat key must be a letter or number."
                    .into(),
            );
        }

        let vk = character as u32;

        let scan = unsafe {
            MapVirtualKeyW(vk, MAPVK_VK_TO_VSC)
        };

        if scan == 0 {
            return Err(format!(
                "Could not determine scan code for chat key: {character}"
            ));
        }

        scan_key(scan as u16, false)?;

        thread::sleep(Duration::from_millis(hold_ms));

        scan_key(scan as u16, true)?;

        Ok(())
    }

    // Verify the game owns the foreground window.
    fn activate_game(hwnd: HWND) -> Result<(), String> {
        unsafe {
            if GetForegroundWindow() != hwnd {
                let _ = SetForegroundWindow(hwnd);
            }
        }

        thread::sleep(Duration::from_millis(150));

        for _ in 0..10 {
            let foreground = unsafe { GetForegroundWindow() };

            if foreground == hwnd {
                return Ok(());
            }

            thread::sleep(Duration::from_millis(50));
        }

        Err(
            "FiveM/GTA was found, but Windows could not \
             bring the game window into focus."
                .into(),
        )
    }

    pub fn send(
        exe: &str,
        chat_key: &str,
        text: &str,
        open_chat: bool,
    ) -> Result<(), String> {
        // Find the game before changing clipboard contents.
        let hwnd = find_window(exe)?;

        // Activate the game and verify focus.
        activate_game(hwnd)?;

        let mut clipboard =
            Clipboard::new().map_err(|e| e.to_string())?;

        let old = clipboard.get_text().ok();

        clipboard
            .set_text(text)
            .map_err(|e| e.to_string())?;

        // Execute the input sequence.
        let result = (|| -> Result<(), String> {
            if open_chat {
                // Send scan-code key down, hold, release.
                press_chat_key(chat_key, 75)?;

                // Give FiveM time to open its chat.
                thread::sleep(Duration::from_millis(100));
            }

            // Ctrl+V: preserve our confirmed text entry.
            key(VK_CONTROL, false)?;

            let paste_result = press(VIRTUAL_KEY('V' as u16));

            // Always attempt to release Ctrl.
            let release_result = key(VK_CONTROL, true);

            paste_result?;
            release_result?;

            // Wait before pressing Enter.
            thread::sleep(Duration::from_millis(90));

            press(VK_RETURN)?;

            thread::sleep(Duration::from_millis(180));

            Ok(())
        })();

        // Restore the previous clipboard text.
        if let Some(value) = old {
            let _ = clipboard.set_text(value);
        }

        result
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
