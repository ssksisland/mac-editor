use std::fs;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::DragDropEvent;
#[cfg(debug_assertions)]
use tauri::Manager;

/// 读文件结果：内容 + 检测到的原始编码名（用于保存时回写同一编码）。
#[derive(serde::Serialize)]
struct FileReadResult {
    content: String,
    encoding: String,
}

#[tauri::command]
fn read_file_cmd(path: String) -> Result<FileReadResult, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, true);
    let detected = detector.guess(None, true);
    let (cow, _, _) = detected.decode(&bytes);
    Ok(FileReadResult {
        content: cow.into_owned(),
        encoding: detected.name().to_string(),
    })
}

#[tauri::command]
fn save_file_cmd(path: String, content: String, encoding: Option<String>) -> Result<(), String> {
    // 按原始编码回写，避免把 GBK/Shift-JIS 等文件静默转成 UTF-8。
    let label = encoding.as_deref().unwrap_or("UTF-8");
    let enc = encoding_rs::Encoding::for_label(label.as_bytes())
        .unwrap_or(encoding_rs::UTF_8);
    let (bytes, _, _) = enc.encode(&content);
    fs::write(&path, &bytes).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
fn detect_encoding_cmd(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(&bytes, true);
    let detected = detector.guess(None, true);
    Ok(detected.name().to_string())
}

/// 在原文件所在目录内，将文件重命名为 new_name（仅改文件名，不跨目录）。
/// 返回新的完整路径。目标已存在时拒绝，避免覆盖其他文件。
#[tauri::command]
fn rename_file_cmd(path: String, new_name: String) -> Result<String, String> {
    // 防止 new_name 包含路径分隔符导致跨目录移动
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("文件名不能包含路径分隔符".to_string());
    }
    if new_name.trim().is_empty() {
        return Err("文件名不能为空".to_string());
    }

    let old = Path::new(&path);
    let parent = old.parent().ok_or("无法解析文件所在目录")?;
    let new_path = parent.join(&new_name);

    if new_path == old {
        return Ok(path); // 名字未变
    }
    if new_path.exists() {
        return Err(format!("目标文件已存在: {}", new_name));
    }

    fs::rename(old, &new_path).map_err(|e| format!("重命名失败: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// 读取图片文件并返回 data URL（base64 编码）。
/// 用于 Markdown 预览中显示本地图片。
#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    // 仅允许已知图片扩展名，避免被构造的 Markdown 诱导读取任意本地文件
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
        _ => return Err("Unsupported image type".to_string()),
    };
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
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
            rename_file_cmd,
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
