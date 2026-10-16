#[cfg(windows)]
mod platform {
    use arboard::Clipboard;
    use std::{path::Path, thread, time::Duration};

    use windows::{
        core::PWSTR,
        Win32::{
            Foundation::{BOOL, HWND, LPARAM, CloseHandle},
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
                    GetWindowTextW,
                    GetWindowThreadProcessId,
                    IsWindowVisible,
                    SetForegroundWindow,
                },
            },
        },
    };

    // Identify a numeric FiveM GTA game process.
    fn is_fivem_game(name: &str) -> bool {
        let name = name.trim().to_ascii_lowercase();

        name.strip_prefix("fivem_b")
            .and_then(|value| {
                value.strip_suffix("_gtaprocess.exe")
            })
            .map(|build| {
                !build.is_empty()
                    && build.chars().all(|c| c.is_ascii_digit())
            })
            .unwrap_or(false)
    }

    // Support exact executable names and automatic
    // FiveM build detection.
    fn matches_executable(
        actual: &str,
        configured: &str,
    ) -> bool {
        let actual = actual.trim().to_ascii_lowercase();
        let configured = configured.trim().to_ascii_lowercase();

        if actual == configured {
            return true;
        }

        let auto_fivem =
            configured == "fivem_b*_gtaprocess.exe"
                || is_fivem_game(&configured);

        auto_fivem && is_fivem_game(&actual)
    }

    fn wants_fivem(exe: &str) -> bool {
        let name = exe.trim().to_ascii_lowercase();

        name == "fivem_b*_gtaprocess.exe"
            || is_fivem_game(&name)
    }

    // Read a window title for diagnostic/fallback use.
    fn window_title(hwnd: HWND) -> String {
        let mut buffer = vec![0u16; 512];

        let length = unsafe {
            GetWindowTextW(hwnd, &mut buffer)
        };

        if length <= 0 {
            return String::new();
        }

        String::from_utf16_lossy(
            &buffer[..length as usize],
        )
    }

    // Recognize the distinctive FiveM game title.
    fn is_fivem_window(title: &str) -> bool {
        let title = title.to_ascii_lowercase();

        title.contains("fivem")
            && title.contains("cfx.re")
    }

    struct FindData {
        wanted: String,
        hwnd: HWND,
        fallback_hwnd: HWND,
        visible_windows: usize,
        access_failures: usize,
        query_failures: usize,
        matched_titles: usize,
    }

    unsafe extern "system" fn enum_proc(
        hwnd: HWND,
        param: LPARAM,
    ) -> BOOL {
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let data = &mut *(param.0 as *mut FindData);
        data.visible_windows += 1;

        let title = window_title(hwnd);

        let candidate_fivem_title =
            wants_fivem(&data.wanted)
                && is_fivem_window(&title);

        if candidate_fivem_title {
            data.matched_titles += 1;
        }

        let mut pid = 0u32;

        GetWindowThreadProcessId(hwnd, Some(&mut pid));

        if pid == 0 {
            return BOOL(1);
        }

        match OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            pid,
        ) {
            Ok(process) => {
                let mut buffer = vec![0u16; 1024];
                let mut size = buffer.len() as u32;

                let result = QueryFullProcessImageNameW(
                    process,
                    PROCESS_NAME_FORMAT(0),
                    PWSTR(buffer.as_mut_ptr()),
                    &mut size,
                );

                // Release the process handle.
                let _ = CloseHandle(process);

                match result {
                    Ok(()) => {
                        let full_path =
                            String::from_utf16_lossy(
                                &buffer[..size as usize],
                            );

                        let exe = Path::new(&full_path)
                            .file_name()
                            .and_then(|name| name.to_str())
                            .unwrap_or("");

                        if matches_executable(
                            exe,
                            &data.wanted,
                        ) {
                            data.hwnd = hwnd;

                            // Found a verified game process.
                            return BOOL(0);
                        }
                    }

                    Err(_) => {
                        data.query_failures += 1;

                        // Only consider fallback when
                        // querying this candidate fails.
                        if candidate_fivem_title
                            && data.fallback_hwnd.0.is_null()
                        {
                            data.fallback_hwnd = hwnd;
                        }
                    }
                }
            }

            Err(_) => {
                data.access_failures += 1;

                // A game window with a distinctive
                // FiveM title can be a fallback.
                if candidate_fivem_title
                    && data.fallback_hwnd.0.is_null()
                {
                    data.fallback_hwnd = hwnd;
                }
            }
        }

        BOOL(1)
    }

    // Find the FiveM/GTA game window.
    fn find_window(exe: &str) -> Result<HWND, String> {
        let mut data = FindData {
            wanted: exe.trim().to_ascii_lowercase(),
            hwnd: HWND::default(),
            fallback_hwnd: HWND::default(),
            visible_windows: 0,
            access_failures: 0,
            query_failures: 0,
            matched_titles: 0,
        };

        unsafe {
            let _ = EnumWindows(
                Some(enum_proc),
                LPARAM(
                    &mut data as *mut _ as isize
                ),
            );
        }

        // First preference: verified executable match.
        if !data.hwnd.0.is_null() {
            return Ok(data.hwnd);
        }

        // Fallback: distinctive FiveM game-window title
        // when process-path inspection failed.
        if wants_fivem(exe)
            && !data.fallback_hwnd.0.is_null()
        {
            return Ok(data.fallback_hwnd);
        }

        Err(format!(
            "Could not find the game window for {exe}.\n\
             Visible windows checked: {}\n\
             FiveM window titles found: {}\n\
             Process access failures: {}\n\
             Executable query failures: {}\n\
             \n\
             Verify FiveM is running and you are \
             connected to Eclipse RP.",
            data.visible_windows,
            data.matched_titles,
            data.access_failures,
            data.query_failures,
        ))
    }

    // Check that Windows accepted each input event.
    fn send_input_checked(
        input: INPUT,
    ) -> Result<(), String> {
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

    // Virtual-key input for Ctrl+V and Enter.
    fn key(
        vk: VIRTUAL_KEY,
        up: bool,
    ) -> Result<(), String> {
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

    fn press(vk: VIRTUAL_KEY) -> Result<(), String> {
        key(vk, false)?;
        key(vk, true)
    }

    // Physical scan-code input for FiveM chat.
    fn scan_key(
        scan: u16,
        up: bool,
    ) -> Result<(), String> {
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

    // Preserve the previously working FiveM
    // 75-millisecond scan-code chat key.
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

        let scan = unsafe {
            MapVirtualKeyW(
                character as u32,
                MAPVK_VK_TO_VSC,
            )
        };

        if scan == 0 {
            return Err(format!(
                "Could not determine scan code for chat key: {character}"
            ));
        }

        scan_key(scan as u16, false)?;

        thread::sleep(
            Duration::from_millis(hold_ms)
        );

        scan_key(scan as u16, true)
    }

    // Verify that FiveM/GTA receives window focus.
    fn activate_game(hwnd: HWND) -> Result<(), String> {
        unsafe {
            if GetForegroundWindow() != hwnd {
                let _ = SetForegroundWindow(hwnd);
            }
        }

        thread::sleep(Duration::from_millis(150));

        for _ in 0..10 {
            let foreground = unsafe {
                GetForegroundWindow()
            };

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

    // Public send interface remains unchanged.
    pub fn send(
        exe: &str,
        chat_key: &str,
        text: &str,
        open_chat: bool,
    ) -> Result<(), String> {
        // Find and activate the game.
        let hwnd = find_window(exe)?;

        activate_game(hwnd)?;

        // Preserve clipboard text.
        let mut clipboard =
            Clipboard::new().map_err(|e| e.to_string())?;

        let old = clipboard.get_text().ok();

        clipboard
            .set_text(text)
            .map_err(|e| e.to_string())?;

        // Run our existing working keyboard sequence.
        let result = (|| -> Result<(), String> {
            if open_chat {
                // Press and hold the chat key.
                press_chat_key(chat_key, 75)?;

                // Allow FiveM chat to open.
                thread::sleep(
                    Duration::from_millis(100)
                );
            }

            // Ctrl+V: paste the music command.
            key(VK_CONTROL, false)?;

            let paste_result =
                press(VIRTUAL_KEY('V' as u16));

            // Release Ctrl even if paste fails.
            let release_result =
                key(VK_CONTROL, true);

            paste_result?;
            release_result?;

            thread::sleep(
                Duration::from_millis(90)
            );

            // Submit the music command.
            press(VK_RETURN)?;

            thread::sleep(
                Duration::from_millis(180)
            );

            Ok(())
        })();

        // Restore previous clipboard text.
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
    Err(
        "GTA control is available in the Windows build."
            .into(),
    )
}
