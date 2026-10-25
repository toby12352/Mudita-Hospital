mod printer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            printer::list_printers,
            printer::print_html,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
