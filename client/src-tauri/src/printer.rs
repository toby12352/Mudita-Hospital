//! List Windows printers and silent-print HTML via WebView2 (no system print dialog).

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const NAV_TIMEOUT: Duration = Duration::from_secs(10);
const PRINT_TIMEOUT: Duration = Duration::from_secs(30);

/// Installed printer names on this PC (local + connections).
#[tauri::command]
pub fn list_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        list_printers_windows()
    }
    #[cfg(not(windows))]
    {
        Err("Printer listing is only available on Windows".into())
    }
}

/// Write `html` to a temp file, load it in a hidden WebView, print to `printer_name`, then clean up.
#[tauri::command]
pub async fn print_html(
    app: AppHandle,
    html: String,
    printer_name: String,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        print_html_windows(app, html, printer_name).await
    }
    #[cfg(not(windows))]
    {
        let _ = (app, html, printer_name);
        Err("Silent print is only available on Windows".into())
    }
}

#[cfg(windows)]
fn list_printers_windows() -> Result<Vec<String>, String> {
    use windows::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };

    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut needed: u32 = 0;
    let mut returned: u32 = 0;

    unsafe {
        let _ = EnumPrintersW(flags, None, 4, None, &mut needed, &mut returned);
    }
    if needed == 0 {
        return Ok(Vec::new());
    }

    let mut buffer = vec![0u8; needed as usize];
    unsafe {
        EnumPrintersW(
            flags,
            None,
            4,
            Some(&mut buffer[..]),
            &mut needed,
            &mut returned,
        )
        .map_err(|e| format!("EnumPrintersW failed: {e}"))?;
    }

    let mut names = Vec::with_capacity(returned as usize);
    unsafe {
        let base = buffer.as_ptr() as *const PRINTER_INFO_4W;
        for i in 0..returned as usize {
            let info = &*base.add(i);
            let name = pwstr_to_string(info.pPrinterName);
            if !name.is_empty() {
                names.push(name);
            }
        }
    }
    names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(names)
}

#[cfg(windows)]
unsafe fn pwstr_to_string(ptr: windows::core::PWSTR) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0usize;
    while *ptr.0.add(len) != 0 {
        len += 1;
    }
    String::from_utf16_lossy(std::slice::from_raw_parts(ptr.0, len))
}

#[cfg(windows)]
async fn print_html_windows(
    app: AppHandle,
    html: String,
    printer_name: String,
) -> Result<(), String> {
    let printer = printer_name.trim().to_string();
    if printer.is_empty() {
        return Err("No printer selected".into());
    }
    if html.trim().is_empty() {
        return Err("Nothing to print".into());
    }

    let temp_path = write_temp_html(&html)?;
    let file_url = url::Url::from_file_path(&temp_path)
        .map_err(|_| "Could not build file URL for print HTML".to_string())?
        .to_string();

    let label = unique_label();
    let result = print_via_hidden_webview(&app, &label, &file_url, &printer).await;

    let _ = app.get_webview_window(&label).map(|w| w.close());
    let _ = std::fs::remove_file(&temp_path);

    result
}

fn write_temp_html(html: &str) -> Result<PathBuf, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!(
        "mudita_print_{}_{}.html",
        std::process::id(),
        ts
    ));
    std::fs::write(&path, html).map_err(|e| format!("Failed to write print HTML: {e}"))?;
    Ok(path)
}

fn unique_label() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("__mudita_print_{}_{}", std::process::id(), ts)
}

#[cfg(windows)]
async fn print_via_hidden_webview(
    app: &AppHandle,
    label: &str,
    file_url: &str,
    printer_name: &str,
) -> Result<(), String> {
    let blank: url::Url = "about:blank"
        .parse()
        .map_err(|e| format!("about:blank parse: {e}"))?;
    let webview = WebviewWindowBuilder::new(app, label, WebviewUrl::External(blank))
        .visible(false)
        .skip_taskbar(true)
        .inner_size(1.0, 1.0)
        .title("")
        .decorations(false)
        .focused(false)
        .build()
        .map_err(|e| format!("Failed to create print window: {e}"))?;

    wait_for_navigation(&webview, file_url).await?;
    do_silent_print(&webview, printer_name).await?;
    Ok(())
}

#[cfg(windows)]
async fn wait_for_navigation(
    webview: &tauri::WebviewWindow,
    file_url: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
    use webview2_com::NavigationCompletedEventHandler;
    use windows::core::HSTRING;

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let url = file_url.to_string();
    let wv = webview.clone();

    wv.with_webview(move |pw| {
        unsafe {
            let core: ICoreWebView2 = match pw.controller().CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(format!("CoreWebView2 unavailable: {e}")));
                    return;
                }
            };

            let tx_done = tx.clone();
            let handler = NavigationCompletedEventHandler::create(Box::new(move |_sender, _args| {
                let _ = tx_done.send(Ok(()));
                Ok(())
            }));

            let mut token = 0i64;
            if let Err(e) = core.add_NavigationCompleted(&handler, &mut token) {
                let _ = tx.send(Err(format!("NavigationCompleted register failed: {e}")));
                return;
            }
            let _ = token;

            if let Err(e) = core.Navigate(&HSTRING::from(url.as_str())) {
                let _ = tx.send(Err(format!("Navigate failed: {e}")));
            }
        }
    })
    .map_err(|e| format!("with_webview failed: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(NAV_TIMEOUT).map_err(|e| match e {
            mpsc::RecvTimeoutError::Timeout => "Timed out loading print HTML".to_string(),
            mpsc::RecvTimeoutError::Disconnected => "Navigation channel closed".to_string(),
        })?
    })
    .await
    .map_err(|e| format!("Navigation wait failed: {e}"))?
}

#[cfg(windows)]
async fn do_silent_print(
    webview: &tauri::WebviewWindow,
    printer_name: &str,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2PrintSettings2, ICoreWebView2_16,
        COREWEBVIEW2_PRINT_STATUS, COREWEBVIEW2_PRINT_STATUS_OTHER_ERROR,
        COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE, COREWEBVIEW2_PRINT_STATUS_SUCCEEDED,
    };
    use webview2_com::PrintCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let printer = printer_name.to_string();
    let wv = webview.clone();

    wv.with_webview(move |pw| {
        unsafe {
            let controller = pw.controller();
            let env = pw.environment();

            let core = match controller.CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(format!("CoreWebView2 unavailable: {e}")));
                    return;
                }
            };

            let core16: ICoreWebView2_16 = match core.cast() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(format!(
                        "WebView2 Runtime too old for silent print (need >= 1.0.1518.46): {e}"
                    )));
                    return;
                }
            };

            let env6: ICoreWebView2Environment6 = match env.cast() {
                Ok(e) => e,
                Err(e) => {
                    let _ = tx.send(Err(format!("WebView2 Environment6 unavailable: {e}")));
                    return;
                }
            };

            let settings = match env6.CreatePrintSettings() {
                Ok(s) => s,
                Err(e) => {
                    let _ = tx.send(Err(format!("CreatePrintSettings failed: {e}")));
                    return;
                }
            };

            let settings2: ICoreWebView2PrintSettings2 = match settings.cast() {
                Ok(s) => s,
                Err(e) => {
                    let _ = tx.send(Err(format!("PrintSettings2 unavailable: {e}")));
                    return;
                }
            };

            if let Err(e) = settings2.SetPrinterName(&HSTRING::from(printer.as_str())) {
                let _ = tx.send(Err(format!("SetPrinterName failed: {e}")));
                return;
            }
            let _ = settings2.SetCopies(1);
            let _ = settings.SetShouldPrintBackgrounds(true);
            let _ = settings.SetShouldPrintHeaderAndFooter(false);
            let _ = settings.SetMarginTop(0.0);
            let _ = settings.SetMarginBottom(0.0);
            let _ = settings.SetMarginLeft(0.0);
            let _ = settings.SetMarginRight(0.0);

            let tx_done = tx.clone();
            let handler = PrintCompletedHandler::create(Box::new(
                move |error_code: windows::core::Result<()>,
                      print_status: COREWEBVIEW2_PRINT_STATUS|
                      -> windows::core::Result<()> {
                    let outcome = match (error_code, print_status) {
                        (Ok(()), COREWEBVIEW2_PRINT_STATUS_SUCCEEDED) => Ok(()),
                        (Ok(()), COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE) => Err(
                            "Printer not found, offline, or unavailable".to_string(),
                        ),
                        (Ok(()), COREWEBVIEW2_PRINT_STATUS_OTHER_ERROR) => {
                            Err("Print failed".to_string())
                        }
                        (Ok(()), other) => Err(format!("Unknown print status: {}", other.0)),
                        (Err(e), _) => Err(format!("Print error: {e}")),
                    };
                    let _ = tx_done.send(outcome);
                    Ok(())
                },
            ));

            if let Err(e) = core16.Print(&settings, &handler) {
                let _ = tx.send(Err(format!("Print() failed: {e}")));
            }
        }
    })
    .map_err(|e| format!("with_webview failed: {e}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(PRINT_TIMEOUT).map_err(|e| match e {
            mpsc::RecvTimeoutError::Timeout => "Timed out waiting for printer".to_string(),
            mpsc::RecvTimeoutError::Disconnected => "Print channel closed".to_string(),
        })?
    })
    .await
    .map_err(|e| format!("Print wait failed: {e}"))?
}
