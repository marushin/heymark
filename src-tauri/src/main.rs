// Prevents additional console window on Windows in release, do not remove!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core;

use crate::core::vault::{scan_vault, FileNode};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Emitter, Manager};

/// Files handed to the app by the OS before the frontend asked for them.
/// macOS delivers file associations as `RunEvent::Opened`, not as command-line arguments.
#[derive(Default)]
struct OpenState {
    /// True once the frontend has called `get_initial_args`; from then on files are emitted live.
    frontend_ready: bool,
    pending: Vec<String>,
}

type SharedOpenState = Mutex<OpenState>;

/// Resolve a command-line argument against the directory the launching process was in.
fn resolve_arg(arg: &str, base: &Path) -> String {
    let p = Path::new(arg);
    if p.is_relative() {
        base.join(p).to_string_lossy().to_string()
    } else {
        arg.to_string()
    }
}

#[tauri::command]
fn is_directory(path: &str) -> bool {
    Path::new(path).is_dir()
}

// Commands that can take long (directory scans, large or networked files) run off the main
// thread via `async`. `write_file` is deliberately NOT async: synchronous commands run in
// order, so an auto-save can never overtake the save that follows it.
#[tauri::command(async)]
fn open_vault(path: &str) -> Result<Vec<FileNode>, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    if !p.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    Ok(scan_vault(p))
}

#[tauri::command(async)]
fn read_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Another process has the file open without delete sharing (viewer, antivirus, sync client).
/// Windows reports this as access denied (5) or a sharing violation (32).
fn is_file_busy(e: &std::io::Error) -> bool {
    e.kind() == std::io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(32)
}

fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut attempts = 0;
    loop {
        match std::fs::rename(from, to) {
            Err(e) if is_file_busy(&e) && attempts < 5 => {
                attempts += 1;
                std::thread::sleep(Duration::from_millis(20));
            }
            result => return result,
        }
    }
}

/// Write via a temporary file in the same folder and rename it over the target, so a crash,
/// full disk or sync conflict mid-write cannot leave the original empty or truncated.
/// If the target stays busy, fall back to writing in place: not atomic, but a failed save is worse.
#[tauri::command]
fn write_file(path: &str, content: &str) -> Result<(), String> {
    let target = std::fs::canonicalize(path).unwrap_or_else(|_| Path::new(path).to_path_buf());
    let dir = target.parent().ok_or("invalid path")?;
    let name = target.file_name().ok_or("invalid path")?.to_string_lossy();
    let tmp = dir.join(format!(".{name}.heymark-tmp"));

    let write = || -> std::io::Result<()> {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
        drop(f);
        if let Ok(meta) = std::fs::metadata(&target) {
            std::fs::set_permissions(&tmp, meta.permissions())?;
        }
        match rename_with_retry(&tmp, &target) {
            Err(e) if is_file_busy(&e) && target.exists() => {
                let mut f = std::fs::File::create(&target)?;
                f.write_all(content.as_bytes())?;
                f.sync_all()?;
                drop(f);
                let _ = std::fs::remove_file(&tmp);
                Ok(())
            }
            result => result,
        }
    };

    write().map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Copy an image next to the document. Never overwrites an existing, different file:
/// returns the final file name (`name.ext`, or `name-1.ext`, `name-2.ext`, ...).
#[tauri::command(async)]
fn save_image(src: &str, dest: &str) -> Result<String, String> {
    let src_path = Path::new(src);
    let dest_path = Path::new(dest);

    let parent = dest_path.parent().ok_or("invalid destination path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let file_name_of = |p: &Path| -> String {
        p.file_name().unwrap_or_default().to_string_lossy().to_string()
    };

    let src_canon = std::fs::canonicalize(src_path).map_err(|e| e.to_string())?;
    let stem = dest_path
        .file_stem()
        .ok_or("invalid destination path")?
        .to_string_lossy()
        .to_string();
    let ext = dest_path.extension().map(|e| e.to_string_lossy().to_string());

    let mut candidate: PathBuf = dest_path.to_path_buf();
    let mut n: u32 = 0;
    while candidate.exists() {
        // The picked image already is the destination file: nothing to copy.
        if std::fs::canonicalize(&candidate)
            .map(|c| c == src_canon)
            .unwrap_or(false)
        {
            return Ok(file_name_of(&candidate));
        }
        n += 1;
        if n > 10_000 {
            return Err("could not find a free file name".to_string());
        }
        candidate = parent.join(match &ext {
            Some(e) => format!("{stem}-{n}.{e}"),
            None => format!("{stem}-{n}"),
        });
    }

    std::fs::copy(src_path, &candidate).map_err(|e| e.to_string())?;
    Ok(file_name_of(&candidate))
}

#[tauri::command(async)]
fn write_binary_file(path: &str, data: Vec<u8>) -> Result<(), String> {
    let p = Path::new(path);

    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(p, data).map_err(|e| e.to_string())?;
    Ok(())
}

/// Files the app was started with, plus anything the OS delivered before the frontend was ready.
#[tauri::command]
fn get_initial_args(state: tauri::State<'_, SharedOpenState>) -> Vec<String> {
    let base = std::env::current_dir().unwrap_or_default();
    let mut args: Vec<String> = std::env::args()
        .skip(1)
        .map(|a| resolve_arg(&a, &base))
        .collect();

    if let Ok(mut s) = state.lock() {
        s.frontend_ready = true;
        for p in s.pending.drain(..) {
            if !args.contains(&p) {
                args.push(p);
            }
        }
    }
    args
}

fn main() {
    tauri::Builder::default()
        .manage(SharedOpenState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // When a second instance is opened, send its arguments to the first instance,
            // resolved against the second instance's working directory, and bring the window up.
            let base = PathBuf::from(cwd);
            let files: Vec<String> = argv.iter().skip(1).map(|a| resolve_arg(a, &base)).collect();
            let _ = app.emit("open-file", &files);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            is_directory,
            open_vault,
            read_file,
            write_file,
            save_image,
            write_binary_file,
            get_initial_args
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS delivers "open with" / double-click as RunEvent::Opened. NOT COMPILED on
            // the Windows development machine: the cfg below excludes it from this build.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                let files: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if files.is_empty() {
                    return;
                }
                let state = _app.state::<SharedOpenState>();
                let mut guard = match state.lock() {
                    Ok(g) => g,
                    Err(_) => return,
                };
                if guard.frontend_ready {
                    drop(guard);
                    let _ = _app.emit("open-file", &files);
                    if let Some(window) = _app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else {
                    guard.pending.extend(files);
                }
            }
        });
}
