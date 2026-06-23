use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{DragDropEvent, Manager};

/// 缓冲冷启动时（webview 未就绪）通过 Finder「打开方式」传入的文件路径，
/// 待前端挂载后通过 take_pending_files 取走。
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

/// 读文件结果：内容 + 检测到的原始编码名（用于保存时回写同一编码）。
#[derive(serde::Serialize)]
struct FileReadResult {
    content: String,
    encoding: String,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum TodoStatus {
    Pending,
    Completed,
}

#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TodoItem {
    id: String,
    content: String,
    status: TodoStatus,
    created_at: i64,
    completed_at: Option<i64>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct TodoDocument {
    version: u32,
    todos: Vec<TodoItem>,
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum StoredTodos {
    Document(TodoDocument),
    Legacy(Vec<TodoItem>),
}

fn todo_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("todos.json"))
        .map_err(|e| format!("无法定位 Todo 数据目录: {}", e))
}

fn todo_backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn read_todos_file(path: &Path) -> Result<Vec<TodoItem>, String> {
    let json =
        fs::read_to_string(path).map_err(|e| format!("无法读取 {}: {}", path.display(), e))?;
    let stored: StoredTodos =
        serde_json::from_str(&json).map_err(|e| format!("无法解析 {}: {}", path.display(), e))?;
    let todos = match stored {
        StoredTodos::Document(document) if document.version == 1 => Ok(document.todos),
        StoredTodos::Document(document) => {
            Err(format!("不支持的 Todo 数据版本: {}", document.version))
        }
        StoredTodos::Legacy(todos) => Ok(todos),
    }?;
    validate_todos(&todos)?;
    Ok(todos)
}

fn load_todos_from_path(path: &Path) -> Result<Vec<TodoItem>, String> {
    if !path.exists() {
        let backup = todo_backup_path(path);
        return if backup.exists() {
            read_todos_file(&backup)
        } else {
            Ok(Vec::new())
        };
    }

    match read_todos_file(path) {
        Ok(todos) => Ok(todos),
        Err(primary_error) => {
            let backup = todo_backup_path(path);
            if backup.exists() {
                read_todos_file(&backup).map_err(|backup_error| {
                    format!(
                        "Todo 主文件和备份均不可用: {}; {}",
                        primary_error, backup_error
                    )
                })
            } else {
                Err(primary_error)
            }
        }
    }
}

fn validate_todos(todos: &[TodoItem]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for todo in todos {
        if todo.id.trim().is_empty() {
            return Err("Todo ID 不能为空".to_string());
        }
        if todo.content.trim().is_empty() {
            return Err(format!("Todo {} 的内容不能为空", todo.id));
        }
        if todo.content.len() > 100_000 {
            return Err(format!("Todo {} 的内容过长", todo.id));
        }
        if !ids.insert(&todo.id) {
            return Err(format!("Todo ID 重复: {}", todo.id));
        }
    }
    Ok(())
}

fn save_todos_to_path(path: &Path, todos: &[TodoItem]) -> Result<(), String> {
    validate_todos(todos)?;
    let parent = path.parent().ok_or("无法解析 Todo 数据目录")?;
    fs::create_dir_all(parent).map_err(|e| format!("无法创建 Todo 数据目录: {}", e))?;

    let document = TodoDocument {
        version: 1,
        todos: todos.to_vec(),
    };
    let json =
        serde_json::to_vec_pretty(&document).map_err(|e| format!("无法序列化 Todo 数据: {}", e))?;
    // 临时文件名加入进程 ID + 原子自增序号，确保唯一：即便将来出现并发保存，
    // 各写入也不会争抢同一个临时文件、互相截断或在 rename 时报错。
    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);
    let unique = format!("{}.{}", std::process::id(), TEMP_SEQ.fetch_add(1, Ordering::Relaxed));
    let temp = path.with_extension(format!("json.{}.tmp", unique));
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp)
        .map_err(|e| format!("无法创建 Todo 临时文件: {}", e))?;
    file.write_all(&json)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("无法写入 Todo 临时文件: {}", e))?;

    if path.exists() {
        fs::copy(path, todo_backup_path(path)).map_err(|e| format!("无法备份 Todo 数据: {}", e))?;
    }
    fs::rename(&temp, path).map_err(|e| format!("无法替换 Todo 数据文件: {}", e))?;

    #[cfg(unix)]
    if let Ok(dir) = OpenOptions::new().read(true).open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}

#[tauri::command]
fn load_todos_cmd(app: tauri::AppHandle) -> Result<Vec<TodoItem>, String> {
    load_todos_from_path(&todo_file_path(&app)?)
}

#[tauri::command]
fn save_todos_cmd(app: tauri::AppHandle, todos: Vec<TodoItem>) -> Result<(), String> {
    save_todos_to_path(&todo_file_path(&app)?, &todos)
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
    let enc = encoding_rs::Encoding::for_label(label.as_bytes()).unwrap_or(encoding_rs::UTF_8);
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

/// 前端挂载后调用：取出并清空冷启动缓冲的文件路径。
#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap();
    std::mem::take(&mut *pending)
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

/// 通过 main 窗口的 webview 调用 window.__handleFileDrop(paths)。
/// 返回是否成功注入（webview 不存在时返回 false，调用方应改为缓冲）。
fn dispatch_open_files(app: &tauri::AppHandle, paths: &[String]) -> bool {
    if paths.is_empty() {
        return true;
    }
    if let Some(window) = app.get_webview_window("main") {
        let js = format!(
            "window.__handleFileDrop && window.__handleFileDrop({});",
            serde_json::to_string(paths).unwrap_or("[]".to_string())
        );
        let _ = window.eval(&js);
        true
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(PendingFiles::default())
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
            read_image_data_url,
            take_pending_files,
            load_todos_cmd,
            save_todos_cmd
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // RunEvent::Opened 仅在 macOS/iOS 存在（Finder「打开方式」/拖到 Dock 图标）。
            // 其他平台没有该变体，需用条件编译跳过，否则无法编译。
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if paths.is_empty() {
                    return;
                }
                // 尝试直接注入；webview 未就绪（冷启动）则缓冲，待前端拉取
                if !dispatch_open_files(app_handle, &paths) {
                    if let Some(state) = app_handle.try_state::<PendingFiles>() {
                        state.0.lock().unwrap().extend(paths);
                    }
                }
            }
            // 非 macOS：无需处理 Opened 事件，避免「未使用变量」告警
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app_handle, event);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mac-editor-{}-{}", name, nonce))
    }

    fn todo(id: &str, content: &str) -> TodoItem {
        TodoItem {
            id: id.to_string(),
            content: content.to_string(),
            status: TodoStatus::Pending,
            created_at: 1_750_000_000_000,
            completed_at: None,
        }
    }

    #[test]
    fn saves_and_loads_todos() {
        let dir = test_dir("todo-roundtrip");
        let path = dir.join("todos.json");
        let expected = vec![todo("1", "正式持久化")];

        save_todos_to_path(&path, &expected).unwrap();
        assert_eq!(load_todos_from_path(&path).unwrap(), expected);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn falls_back_to_backup_when_primary_is_corrupt() {
        let dir = test_dir("todo-backup");
        let path = dir.join("todos.json");
        let first = vec![todo("1", "备份内容")];

        save_todos_to_path(&path, &first).unwrap();
        save_todos_to_path(&path, &[todo("2", "新内容")]).unwrap();
        fs::write(&path, "not-json").unwrap();

        assert_eq!(load_todos_from_path(&path).unwrap(), first);

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_empty_content() {
        let dir = test_dir("todo-validation");
        let path = dir.join("todos.json");

        assert!(save_todos_to_path(&path, &[todo("1", "   ")]).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn reads_legacy_array_format() {
        let dir = test_dir("todo-legacy");
        let path = dir.join("todos.json");
        let expected = vec![todo("1", "旧格式")];
        fs::create_dir_all(&dir).unwrap();
        fs::write(&path, serde_json::to_vec(&expected).unwrap()).unwrap();

        assert_eq!(load_todos_from_path(&path).unwrap(), expected);

        let _ = fs::remove_dir_all(dir);
    }
}
