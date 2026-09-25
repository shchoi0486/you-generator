//! YouGenerator desktop shell.
//! Spawns the Python backend (`you-backend` sidecar) on startup and
//! terminates it when the app closes. No frontend changes needed:
//! the UI talks to the sidecar over loopback HTTP.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct SidecarState(Mutex<Option<CommandChild>>);

fn kill_sidecar(state: &State<SidecarState>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let shell = app.shell();
            // binaries/you-backend-<target-triple>[.exe] (see bundle.externalBin)
            match shell.sidecar("you-backend").and_then(|cmd| cmd.spawn()) {
                Ok((mut rx, child)) => {
                    // Drain sidecar output so its stdout buffer never blocks it.
                    tauri::async_runtime::spawn(async move {
                        use tauri_plugin_shell::process::CommandEvent;
                        while let Some(event) = rx.recv().await {
                            if let CommandEvent::Stdout(line) = event {
                                println!("[backend] {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                    *app.state::<SidecarState>().0.lock().unwrap() = Some(child);
                    println!("[shell] backend sidecar started");
                }
                Err(e) => {
                    eprintln!("[shell] failed to start backend sidecar: {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                kill_sidecar(&window.state::<SidecarState>());
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run YouGenerator");
}
