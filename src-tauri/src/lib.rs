use std::fs;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::DragDropEvent;
#[cfg(debug_assertions)]
use tauri::Manager;

#[tauri::command]
fn read_file_cmd(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, false);
    let detected = detector.guess(None, true);
    let (cow, _, _) = detected.decode(&bytes);
    Ok(cow.into_owned())
}

#[tauri::command]
fn save_file_cmd(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content.as_bytes()).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
fn detect_encoding_cmd(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, false);
    let detected = detector.guess(None, true);
    Ok(detected.name().to_string())
}

/// 读取图片文件并返回 data URL（base64 编码）。
/// 用于 Markdown 预览中显示本地图片。
#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
    let mime = match Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    };
    let encoded = BASE64.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn emit_drag_event(window: &tauri::Window, event_name: &str, paths: &[std::path::PathBuf]) {
    let path_strs: Vec<String> = paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let js = format!(
        "window.{} && window.{}({});",
        event_name,
        event_name,
        serde_json::to_string(&path_strs).unwrap_or("[]".to_string())
    );
    let _ = window.webviews().first().map(|w| w.eval(&js));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_cmd,
            save_file_cmd,
            detect_encoding_cmd,
            read_image_data_url
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(dde) = event {
                match dde {
                    DragDropEvent::Enter { paths, .. } => {
                        emit_drag_event(window, "__handleFileHover", paths);
                    }
                    DragDropEvent::Drop { paths, .. } => {
                        emit_drag_event(window, "__handleFileDrop", paths);
                    }
                    DragDropEvent::Leave | DragDropEvent::Over { .. } => {}
                    _ => {} // non-exhaustive enum, future-proofing
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
