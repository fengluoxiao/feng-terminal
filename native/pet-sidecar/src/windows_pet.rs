use anyhow::{Context, Result};
use image::{DynamicImage, RgbaImage};
use serde::Deserialize;
use std::{
    env,
    fs,
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
    ptr::{copy_nonoverlapping, null, null_mut},
    thread,
};
use windows_sys::Win32::{
    Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM},
    Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, AC_SRC_ALPHA,
        AC_SRC_OVER, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BLENDFUNCTION, DIB_RGB_COLORS, GetDC,
        ReleaseDC, RGBQUAD,
    },
    System::LibraryLoader::GetModuleHandleW,
    UI::{
        Controls::WM_MOUSELEAVE,
        Input::KeyboardAndMouse::{
            ReleaseCapture, SetCapture, TrackMouseEvent, TRACKMOUSEEVENT, TME_LEAVE,
        },
        WindowsAndMessaging::{
            AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyMenu,
            DispatchMessageW, GetCursorPos, GetMessageW, GetWindowLongPtrW, GetWindowRect,
            KillTimer, LoadCursorW, PostQuitMessage, RegisterClassW, SetCursor, SetCursorPos,
            SetForegroundWindow, SetTimer, SetWindowLongPtrW, SetWindowPos, ShowWindow,
            TrackPopupMenu, TranslateMessage, UpdateLayeredWindow, CREATESTRUCTW, CS_DBLCLKS,
            CW_USEDEFAULT, GWLP_USERDATA, IDC_ARROW, IDC_SIZENWSE, MF_STRING, MSG, SW_SHOW,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, TPM_RETURNCMD,
            TPM_RIGHTBUTTON, ULW_ALPHA, WM_APP, WM_DESTROY, WM_LBUTTONDOWN, WM_LBUTTONUP,
            WM_MOUSEMOVE, WM_NCCREATE, WM_RBUTTONUP, WM_TIMER, WNDCLASSW, WS_EX_LAYERED,
            WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
        },
    },
};

const TIMER_ID: usize = 1;
const WM_PET_RESIZE: u32 = WM_APP + 1;
const WM_PET_ACTION: u32 = WM_APP + 2;
const RESIZE_HOT_ZONE: i32 = 28;
const BASE_RENDER_WIDTH: f32 = 112.0;
const BASE_RENDER_HEIGHT: f32 = 121.0;
const ACTION_MENU_ITEMS: [(&str, &str); 9] = [
    ("待机 idle", "idle"),
    ("向右跑 running-right", "running-right"),
    ("向左跑 running-left", "running-left"),
    ("挥手 waving", "waving"),
    ("跳跃 jumping", "jumping"),
    ("失败 failed", "failed"),
    ("等待 waiting", "waiting"),
    ("运行 running", "running"),
    ("审查 review", "review"),
];

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Atlas {
    columns: u32,
    rows: u32,
    cell_width: u32,
    cell_height: u32,
}

#[derive(Clone, Copy, Deserialize)]
struct Action {
    row: u32,
    frames: u32,
    fps: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    spritesheet_path: String,
    atlas: Option<Atlas>,
    actions: Option<std::collections::HashMap<String, Action>>,
}

struct PetState {
    manifest_path: PathBuf,
    action_name: String,
    base_action_name: String,
    transient_action: bool,
    frames: Vec<Vec<u8>>,
    width: i32,
    height: i32,
    bounds: PixelBounds,
    scale: f32,
    frame_index: usize,
    fps: u32,
    interaction: Interaction,
    resize_handle_visible: bool,
    tracking_mouse_leave: bool,
    drag_cursor: POINT,
    drag_last_cursor: POINT,
    drag_window: POINT,
    drag_lock_cursor: POINT,
    drag_scale: f32,
    drag_running_action: Option<&'static str>,
    drag_moved: bool,
}

#[derive(Clone, Copy)]
struct PixelBounds {
    right: i32,
    bottom: i32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Interaction {
    None,
    Moving,
    Resizing,
}

pub fn run() -> Result<()> {
    let manifest_path = env::var("TUI_PET_MANIFEST").context("TUI_PET_MANIFEST is not set")?;
    let scale = env::var("TUI_PET_SCALE")
        .ok()
        .and_then(|value| value.parse::<f32>().ok())
        .unwrap_or(1.0)
        .clamp(0.5, 2.0);
    let manifest_path = PathBuf::from(manifest_path);
    let action_name = String::from("idle");
    let (frames, width, height, bounds, fps) = load_frames(&manifest_path, scale, &action_name)?;
    let mut state = Box::new(PetState {
        manifest_path,
        action_name,
        base_action_name: String::from("idle"),
        transient_action: false,
        frames,
        width,
        height,
        bounds,
        scale,
        frame_index: 0,
        fps,
        interaction: Interaction::None,
        resize_handle_visible: false,
        tracking_mouse_leave: false,
        drag_cursor: POINT::default(),
        drag_last_cursor: POINT::default(),
        drag_window: POINT { x: 40, y: 40 },
        drag_lock_cursor: POINT::default(),
        drag_scale: scale,
        drag_running_action: None,
        drag_moved: false,
    });

    unsafe {
        let instance = GetModuleHandleW(null());
        if instance.is_null() {
            anyhow::bail!("GetModuleHandleW failed");
        }
        let class_name = wide_null("TuiNativePetWindow");
        let window_title = wide_null("TUI Native Pet");
        let cursor = LoadCursorW(null_mut(), IDC_ARROW);
        let class = WNDCLASSW {
            style: CS_DBLCLKS,
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            hCursor: cursor,
            lpszClassName: class_name.as_ptr(),
            ..Default::default()
        };
        RegisterClassW(&class);

        let state_ptr = state.as_mut() as *mut PetState;
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class_name.as_ptr(),
            window_title.as_ptr(),
            WS_POPUP,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            width,
            height,
            null_mut(),
            null_mut(),
            instance,
            state_ptr.cast(),
        );
        if hwnd.is_null() {
            anyhow::bail!("CreateWindowExW failed");
        }

        SetWindowPos(
            hwnd,
            -1isize as HWND,
            40,
            40,
            width,
            height,
            SWP_NOACTIVATE,
        );
        render_frame(hwnd, &state)?;
        ShowWindow(hwnd, SW_SHOW);
        reset_animation_timer(hwnd, &state);
        start_stdin_listener(hwnd);

        let mut message = MSG::default();
        while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        drop(state);
    }

    Ok(())
}

fn start_stdin_listener(hwnd: HWND) {
    let hwnd_value = hwnd as isize;
    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            let mut parts = line.split_whitespace();
            match parts.next() {
                Some("resize") => {
                    let Some(scale) = parts.next().and_then(|value| value.parse::<f32>().ok()) else {
                        continue;
                    };
                    let scale_units = (scale.clamp(0.5, 2.0) * 1000.0).round() as usize;
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                            hwnd_value as HWND,
                            WM_PET_RESIZE,
                            scale_units,
                            0,
                        );
                    }
                }
                Some("action") => {
                    let Some(action) = parts.next().and_then(action_to_id) else {
                        continue;
                    };
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                            hwnd_value as HWND,
                            WM_PET_ACTION,
                            action,
                            0,
                        );
                    }
                }
                Some("transient") => {
                    let Some(action) = parts.next().and_then(action_to_id) else {
                        continue;
                    };
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::PostMessageW(
                            hwnd_value as HWND,
                            WM_PET_ACTION,
                            action,
                            1,
                        );
                    }
                }
                _ => {}
            }
        }
    });
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn load_frames(manifest_path: &Path, scale: f32, action_name: &str) -> Result<(Vec<Vec<u8>>, i32, i32, PixelBounds, u32)> {
    let manifest_text = fs::read_to_string(manifest_path)
        .with_context(|| format!("failed to read {}", manifest_path.display()))?;
    let manifest: Manifest = serde_json::from_str(&manifest_text).context("failed to parse pet.json")?;
    let atlas = manifest.atlas.unwrap_or(Atlas {
        columns: 8,
        rows: 9,
        cell_width: 192,
        cell_height: 208,
    });
    let action = manifest
        .actions
        .as_ref()
        .and_then(|actions| actions.get(action_name).copied())
        .or_else(|| default_action(action_name))
        .or_else(|| {
            manifest
                .actions
                .as_ref()
                .and_then(|actions| actions.get("idle").copied())
        })
        .unwrap_or_else(|| default_action("idle").expect("idle action must exist"));
    let spritesheet_path = resolve_spritesheet_path(manifest_path, &manifest.spritesheet_path);
    let image = image::open(&spritesheet_path)
        .with_context(|| format!("failed to decode {}", spritesheet_path.display()))?;
    let source = image.to_rgba8();
    let target_width = (BASE_RENDER_WIDTH * scale).round().max(1.0) as u32;
    let target_height = (BASE_RENDER_HEIGHT * scale).round().max(1.0) as u32;
    let mut frames = Vec::new();
    let frame_count = action.frames.min(atlas.columns).max(1);
    let row = action.row.min(atlas.rows.saturating_sub(1));

    for frame in 0..frame_count {
        let cropped = crop_frame(&source, atlas, frame, row);
        let resized = DynamicImage::ImageRgba8(cropped).resize_exact(
            target_width,
            target_height,
            image::imageops::FilterType::Nearest,
        );
        frames.push(to_premultiplied_bgra(resized.to_rgba8()));
    }

    let bounds = calculate_pixel_bounds(&frames, target_width as i32, target_height as i32);
    Ok((frames, target_width as i32, target_height as i32, bounds, action.fps.unwrap_or(2)))
}

fn default_action(action_name: &str) -> Option<Action> {
    Some(match action_name {
        "idle" => Action { row: 0, frames: 6, fps: Some(2) },
        "running-right" => Action { row: 1, frames: 8, fps: Some(10) },
        "running-left" => Action { row: 2, frames: 8, fps: Some(10) },
        "waving" => Action { row: 3, frames: 4, fps: Some(6) },
        "jumping" => Action { row: 4, frames: 5, fps: Some(7) },
        "failed" => Action { row: 5, frames: 8, fps: Some(6) },
        "waiting" => Action { row: 6, frames: 6, fps: Some(5) },
        "running" => Action { row: 7, frames: 6, fps: Some(8) },
        "review" => Action { row: 8, frames: 6, fps: Some(5) },
        _ => return None,
    })
}

fn action_to_id(action_name: &str) -> Option<usize> {
    Some(match action_name {
        "idle" => 0,
        "running-right" => 1,
        "running-left" => 2,
        "waving" => 3,
        "jumping" => 4,
        "failed" => 5,
        "waiting" => 6,
        "running" => 7,
        "review" => 8,
        _ => return None,
    })
}

fn action_from_id(action_id: usize) -> &'static str {
    match action_id {
        1 => "running-right",
        2 => "running-left",
        3 => "waving",
        4 => "jumping",
        5 => "failed",
        6 => "waiting",
        7 => "running",
        8 => "review",
        _ => "idle",
    }
}

fn resolve_spritesheet_path(manifest_path: &Path, spritesheet_path: &str) -> PathBuf {
    let path = Path::new(spritesheet_path);
    if path.is_absolute() {
        return path.to_path_buf();
    }
    manifest_path.parent().unwrap_or_else(|| Path::new(".")).join(path)
}

fn crop_frame(source: &RgbaImage, atlas: Atlas, frame: u32, row: u32) -> RgbaImage {
    let x = frame.saturating_mul(atlas.cell_width);
    let y = row.saturating_mul(atlas.cell_height);
    let width = atlas.cell_width.min(source.width().saturating_sub(x));
    let height = atlas.cell_height.min(source.height().saturating_sub(y));
    image::imageops::crop_imm(source, x, y, width, height).to_image()
}

fn to_premultiplied_bgra(image: RgbaImage) -> Vec<u8> {
    let mut bytes = Vec::with_capacity((image.width() * image.height() * 4) as usize);
    for pixel in image.pixels() {
        let [r, g, b, a] = pixel.0;
        let alpha = u16::from(a);
        bytes.push(((u16::from(b) * alpha) / 255) as u8);
        bytes.push(((u16::from(g) * alpha) / 255) as u8);
        bytes.push(((u16::from(r) * alpha) / 255) as u8);
        bytes.push(a);
    }
    bytes
}

fn calculate_pixel_bounds(frames: &[Vec<u8>], width: i32, height: i32) -> PixelBounds {
    let mut left = width;
    let mut top = height;
    let mut right = 0;
    let mut bottom = 0;

    for frame in frames {
        for y in 0..height {
            for x in 0..width {
                let index = ((y * width + x) * 4 + 3) as usize;
                if frame.get(index).copied().unwrap_or(0) <= 16 {
                    continue;
                }
                left = left.min(x);
                top = top.min(y);
                right = right.max(x);
                bottom = bottom.max(y);
            }
        }
    }

    if left > right || top > bottom {
        return PixelBounds {
            right: width.saturating_sub(1),
            bottom: height.saturating_sub(1),
        };
    }

    PixelBounds { right, bottom }
}

unsafe fn state_from_hwnd(hwnd: HWND) -> Option<&'static mut PetState> {
    let ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PetState;
    if ptr.is_null() {
        None
    } else {
        Some(&mut *ptr)
    }
}

unsafe fn render_frame(hwnd: HWND, state: &PetState) -> Result<()> {
    let screen_dc = GetDC(null_mut());
    if screen_dc.is_null() {
        anyhow::bail!("GetDC failed");
    }
    let mem_dc = CreateCompatibleDC(screen_dc);
    let mut bits: *mut core::ffi::c_void = null_mut();
    let bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: state.width,
            biHeight: -state.height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..Default::default()
        },
        bmiColors: [RGBQUAD::default(); 1],
    };
    let bitmap = CreateDIBSection(
        mem_dc,
        &bitmap_info,
        DIB_RGB_COLORS,
        &mut bits,
        null_mut(),
        0,
    );
    if bitmap.is_null() || bits.is_null() {
        ReleaseDC(null_mut(), screen_dc);
        DeleteDC(mem_dc);
        anyhow::bail!("CreateDIBSection failed");
    }

    let frame = &state.frames[state.frame_index % state.frames.len()];
    let mut frame_with_handle = frame.clone();
    draw_resize_handle(
        &mut frame_with_handle,
        state.width as usize,
        state.height as usize,
        state.bounds,
        state.resize_handle_visible,
    );
    copy_nonoverlapping(frame_with_handle.as_ptr(), bits.cast::<u8>(), frame_with_handle.len());
    let old = SelectObject(mem_dc, bitmap);
    let size = SIZE {
        cx: state.width,
        cy: state.height,
    };
    let source = POINT { x: 0, y: 0 };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let ok = UpdateLayeredWindow(
        hwnd,
        screen_dc,
        null(),
        &size,
        mem_dc,
        &source,
        0 as COLORREF,
        &blend,
        ULW_ALPHA,
    );
    SelectObject(mem_dc, old);
    DeleteObject(bitmap);
    DeleteDC(mem_dc);
    ReleaseDC(null_mut(), screen_dc);
    if ok == 0 {
        anyhow::bail!("UpdateLayeredWindow failed");
    }
    Ok(())
}

fn draw_resize_handle(frame: &mut [u8], width: usize, height: usize, bounds: PixelBounds, highlighted: bool) {
    let anchor_right = (bounds.right + 8).clamp(0, width.saturating_sub(1) as i32) as usize;
    let anchor_bottom = (bounds.bottom + 8).clamp(0, height.saturating_sub(1) as i32) as usize;
    let handle_width = 30usize;
    let handle_height = 24usize;
    let radius = 7usize;
    let left = anchor_right.saturating_add(1).saturating_sub(handle_width);
    let top = anchor_bottom.saturating_add(1).saturating_sub(handle_height);
    let right = anchor_right.min(width.saturating_sub(1));
    let bottom = anchor_bottom.min(height.saturating_sub(1));
    let background_alpha = if highlighted { 245 } else { 1 };

    draw_rounded_rect(frame, width, left, top, right, bottom, radius, 255, 255, 255, background_alpha);

    if !highlighted {
        return;
    }

    let shadow_left = (left + 2).min(width.saturating_sub(1));
    let shadow_top = (top + 2).min(height.saturating_sub(1));
    let shadow_right = (right + 2).min(width.saturating_sub(1));
    let shadow_bottom = (bottom + 2).min(height.saturating_sub(1));
    draw_rounded_rect(frame, width, shadow_left, shadow_top, shadow_right, shadow_bottom, radius, 0, 0, 0, 42);
    draw_rounded_rect(frame, width, left, top, right, bottom, radius, 255, 255, 255, 245);

    for inset in [6usize, 12, 18] {
        let start_x = right.saturating_sub(inset + 5);
        let start_y = bottom.saturating_sub(6);
        for step in 0..7usize {
            let x = start_x.saturating_add(step);
            let y = start_y.saturating_sub(step);
            if x > right || y < top || y > bottom {
                continue;
            }
            set_premultiplied_bgra(frame, width, x, y, 12, 12, 12, 255);
            if y > top {
                set_premultiplied_bgra(frame, width, x, y - 1, 12, 12, 12, 210);
            }
        }
    }

    let corner_left = right.saturating_sub(9);
    let corner_top = bottom.saturating_sub(12);
    for x in corner_left..=right.saturating_sub(6) {
        set_premultiplied_bgra(frame, width, x, bottom.saturating_sub(6), 12, 12, 12, 255);
    }
    for y in corner_top..=bottom.saturating_sub(6) {
        set_premultiplied_bgra(frame, width, right.saturating_sub(6), y, 12, 12, 12, 255);
    }
    for offset in 0..4usize {
        let x = right.saturating_sub(6 + offset);
        let y = corner_top.saturating_add(offset);
        if y <= bottom {
            set_premultiplied_bgra(frame, width, x, y, 12, 12, 12, 255);
        }
    }
}

fn draw_rounded_rect(
    frame: &mut [u8],
    width: usize,
    left: usize,
    top: usize,
    right: usize,
    bottom: usize,
    radius: usize,
    red: u8,
    green: u8,
    blue: u8,
    alpha: u8,
) {
    for y in top..=bottom {
        for x in left..=right {
            let dx = if x < left + radius {
                left + radius - x
            } else if x > right.saturating_sub(radius) {
                x - right.saturating_sub(radius)
            } else {
                0
            };
            let dy = if y < top + radius {
                top + radius - y
            } else if y > bottom.saturating_sub(radius) {
                y - bottom.saturating_sub(radius)
            } else {
                0
            };
            if dx * dx + dy * dy <= radius * radius {
                set_premultiplied_bgra(frame, width, x, y, red, green, blue, alpha);
            }
        }
    }
}

fn set_premultiplied_bgra(
    frame: &mut [u8],
    width: usize,
    x: usize,
    y: usize,
    red: u8,
    green: u8,
    blue: u8,
    alpha: u8,
) {
    let index = (y * width + x) * 4;
    let alpha_u16 = u16::from(alpha);
    frame[index] = ((u16::from(blue) * alpha_u16) / 255) as u8;
    frame[index + 1] = ((u16::from(green) * alpha_u16) / 255) as u8;
    frame[index + 2] = ((u16::from(red) * alpha_u16) / 255) as u8;
    frame[index + 3] = alpha;
}

unsafe fn apply_scale(hwnd: HWND, state: &mut PetState, scale: f32) {
    let next_scale = scale.clamp(0.5, 2.0);
    let action_name = state.action_name.clone();
    if let Ok((frames, width, height, bounds, fps)) = load_frames(&state.manifest_path, next_scale, &action_name) {
        state.frames = frames;
        state.width = width;
        state.height = height;
        state.bounds = bounds;
        state.fps = fps;
        state.scale = next_scale;
        state.frame_index %= state.frames.len();
        SetWindowPos(
            hwnd,
            null_mut(),
            0,
            0,
            width,
            height,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
        let _ = render_frame(hwnd, state);
    }
}

unsafe fn apply_action(hwnd: HWND, state: &mut PetState, action_name: &str) {
    state.base_action_name = action_name.to_string();
    state.transient_action = false;
    switch_action(hwnd, state, action_name);
}

unsafe fn apply_transient_action(hwnd: HWND, state: &mut PetState, action_name: &str) {
    state.transient_action = true;
    switch_action(hwnd, state, action_name);
}

unsafe fn switch_action(hwnd: HWND, state: &mut PetState, action_name: &str) {
    if state.action_name == action_name && !state.transient_action {
        return;
    }
    if let Ok((frames, width, height, bounds, fps)) = load_frames(&state.manifest_path, state.scale, action_name) {
        KillTimer(hwnd, TIMER_ID);
        state.action_name = action_name.to_string();
        state.frames = frames;
        state.width = width;
        state.height = height;
        state.bounds = bounds;
        state.fps = fps;
        state.frame_index = 0;
        SetWindowPos(
            hwnd,
            null_mut(),
            0,
            0,
            width,
            height,
            SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
        reset_animation_timer(hwnd, state);
        let _ = render_frame(hwnd, state);
    }
}

unsafe fn reset_animation_timer(hwnd: HWND, state: &PetState) {
    KillTimer(hwnd, TIMER_ID);
    if state.frames.len() <= 1 {
        return;
    }
    SetTimer(hwnd, TIMER_ID, 1000 / state.fps.max(1), None);
}

fn lparam_point(lparam: LPARAM) -> POINT {
    POINT {
        x: (lparam as u16 as i16) as i32,
        y: ((lparam >> 16) as u16 as i16) as i32,
    }
}

fn is_resize_hot_zone(state: &PetState, point: POINT) -> bool {
    let right = (state.bounds.right + 10).min(state.width - 1);
    let bottom = (state.bounds.bottom + 10).min(state.height - 1);
    point.x >= right - RESIZE_HOT_ZONE
        && point.x <= right
        && point.y >= bottom - RESIZE_HOT_ZONE
        && point.y <= bottom
}

fn is_pet_body_zone(state: &PetState, point: POINT) -> bool {
    let right = (state.bounds.right + 10).min(state.width - 1);
    let bottom = (state.bounds.bottom + 10).min(state.height - 1);
    point.x >= 0 && point.x <= right && point.y >= 0 && point.y <= bottom
}

fn emit_scale(scale: f32) {
    println!("resize {:.2}", scale);
    let _ = io::stdout().flush();
}

unsafe fn show_action_menu(hwnd: HWND, state: &mut PetState) {
    let menu = CreatePopupMenu();
    if menu.is_null() {
        return;
    }

    let mut labels = Vec::with_capacity(ACTION_MENU_ITEMS.len());
    for (index, (label, _action)) in ACTION_MENU_ITEMS.iter().enumerate() {
        let label = wide_null(label);
        AppendMenuW(menu, MF_STRING, index + 1, label.as_ptr());
        labels.push(label);
    }

    let mut cursor = POINT::default();
    GetCursorPos(&mut cursor);
    SetForegroundWindow(hwnd);
    let command = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_RIGHTBUTTON,
        cursor.x,
        cursor.y,
        0,
        hwnd,
        null(),
    );
    DestroyMenu(menu);

    if command > 0 {
        apply_transient_action(hwnd, state, action_from_id((command - 1) as usize));
    }
}

unsafe fn track_mouse_leave(hwnd: HWND, state: &mut PetState) {
    if state.tracking_mouse_leave {
        return;
    }
    let mut event = TRACKMOUSEEVENT {
        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
        dwFlags: TME_LEAVE,
        hwndTrack: hwnd,
        dwHoverTime: 0,
    };
    if TrackMouseEvent(&mut event) != 0 {
        state.tracking_mouse_leave = true;
    }
}

unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match message {
        WM_NCCREATE => {
            let create = &*(lparam as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, create.lpCreateParams as isize);
            1
        }
        WM_TIMER => {
            if let Some(state) = state_from_hwnd(hwnd) {
                state.frame_index = (state.frame_index + 1) % state.frames.len();
                if state.transient_action && state.frame_index == 0 {
                    let base_action = state.base_action_name.clone();
                    state.transient_action = false;
                    switch_action(hwnd, state, &base_action);
                    return 0;
                }
                let _ = render_frame(hwnd, state);
            }
            0
        }
        WM_PET_RESIZE => {
            if let Some(state) = state_from_hwnd(hwnd) {
                let scale = ((wparam as f32) / 1000.0).clamp(0.5, 2.0);
                apply_scale(hwnd, state, scale);
            }
            0
        }
        WM_PET_ACTION => {
            if let Some(state) = state_from_hwnd(hwnd) {
                if lparam == 1 {
                    apply_transient_action(hwnd, state, action_from_id(wparam));
                } else {
                    apply_action(hwnd, state, action_from_id(wparam));
                }
            }
            0
        }
        WM_LBUTTONDOWN => {
            if let Some(state) = state_from_hwnd(hwnd) {
                let point = lparam_point(lparam);
                state.interaction = if is_resize_hot_zone(state, point) {
                    Interaction::Resizing
                } else {
                    Interaction::Moving
                };
                state.resize_handle_visible = state.interaction == Interaction::Resizing;
                GetCursorPos(&mut state.drag_cursor);
                let mut rect = RECT::default();
                GetWindowRect(hwnd, &mut rect);
                state.drag_window = POINT {
                    x: rect.left,
                    y: rect.top,
                };
                state.drag_lock_cursor = POINT {
                    x: rect.left + state.width / 2,
                    y: rect.top + state.height / 2,
                };
                state.drag_scale = state.scale;
                state.drag_running_action = None;
                state.drag_last_cursor = state.drag_cursor;
                state.drag_moved = false;
                if state.interaction == Interaction::Moving {
                    SetCursorPos(state.drag_lock_cursor.x, state.drag_lock_cursor.y);
                }
                SetCapture(hwnd);
            }
            0
        }
        WM_MOUSEMOVE => {
            if let Some(state) = state_from_hwnd(hwnd) {
                track_mouse_leave(hwnd, state);
                let mut cursor = POINT::default();
                GetCursorPos(&mut cursor);
                let dx = cursor.x - state.drag_cursor.x;
                let dy = cursor.y - state.drag_cursor.y;
                match state.interaction {
                    Interaction::Moving => {
                        let movement_dx = cursor.x - state.drag_lock_cursor.x;
                        let movement_dy = cursor.y - state.drag_lock_cursor.y;
                        if movement_dx == 0 && movement_dy == 0 {
                            return 0;
                        }
                        state.drag_moved = true;
                        let running_action = if movement_dx < -1 {
                            Some("running-left")
                        } else if movement_dx > 1 {
                            Some("running-right")
                        } else {
                            state.drag_running_action
                        };
                        if let Some(action) = running_action {
                            if state.drag_running_action != Some(action) {
                                state.drag_running_action = Some(action);
                                state.transient_action = false;
                                switch_action(hwnd, state, action);
                            }
                        }
                        state.drag_window.x += movement_dx;
                        state.drag_window.y += movement_dy;
                        state.drag_lock_cursor = POINT {
                            x: state.drag_window.x + state.width / 2,
                            y: state.drag_window.y + state.height / 2,
                        };
                        state.drag_last_cursor = state.drag_lock_cursor;
                        SetWindowPos(
                            hwnd,
                            null_mut(),
                            state.drag_window.x,
                            state.drag_window.y,
                            0,
                            0,
                            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                        );
                        SetCursorPos(state.drag_lock_cursor.x, state.drag_lock_cursor.y);
                    }
                    Interaction::Resizing => {
                        let delta = dx.max(dy) as f32;
                        state.resize_handle_visible = true;
                        apply_scale(hwnd, state, state.drag_scale + delta / BASE_RENDER_HEIGHT);
                    }
                    Interaction::None => {
                        let point = lparam_point(lparam);
                        let resize_hot = is_resize_hot_zone(state, point);
                        let show_handle = resize_hot || is_pet_body_zone(state, point);
                        if resize_hot {
                            SetCursor(LoadCursorW(null_mut(), IDC_SIZENWSE));
                        }
                        if state.resize_handle_visible != show_handle {
                            state.resize_handle_visible = show_handle;
                            let _ = render_frame(hwnd, state);
                        }
                    }
                }
            }
            0
        }
        WM_MOUSELEAVE => {
            if let Some(state) = state_from_hwnd(hwnd) {
                state.tracking_mouse_leave = false;
                if state.interaction == Interaction::None && state.resize_handle_visible {
                    state.resize_handle_visible = false;
                    let _ = render_frame(hwnd, state);
                }
            }
            0
        }
        WM_LBUTTONUP => {
            if let Some(state) = state_from_hwnd(hwnd) {
                if state.interaction == Interaction::Resizing {
                    emit_scale(state.scale);
                } else if state.interaction == Interaction::Moving {
                    if !state.drag_moved {
                        apply_transient_action(hwnd, state, "waving");
                    } else {
                        let base_action = state.base_action_name.clone();
                        state.transient_action = false;
                        state.drag_running_action = None;
                        switch_action(hwnd, state, &base_action);
                    }
                }
                state.interaction = Interaction::None;
                ReleaseCapture();
            }
            0
        }
        WM_RBUTTONUP => {
            if let Some(state) = state_from_hwnd(hwnd) {
                state.interaction = Interaction::None;
                state.drag_running_action = None;
                ReleaseCapture();
                show_action_menu(hwnd, state);
            }
            0
        }
        WM_DESTROY => {
            KillTimer(hwnd, TIMER_ID);
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, message, wparam, lparam),
    }
}
