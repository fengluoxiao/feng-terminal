#[cfg(target_os = "windows")]
mod windows_pet;

#[cfg(target_os = "windows")]
fn main() -> anyhow::Result<()> {
    windows_pet::run()
}

#[cfg(not(target_os = "windows"))]
fn main() -> anyhow::Result<()> {
    eprintln!("pet-sidecar is implemented for Windows first; falling back to embedded pet.");
    Ok(())
}
