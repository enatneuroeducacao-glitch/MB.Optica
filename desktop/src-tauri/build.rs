fn main() {
    println!("cargo:rerun-if-env-changed=MB_GESTAO_NATIVE_MODE");
    println!("cargo:rustc-check-cfg=cfg(mb_gestao_native_mode)");

    if std::env::var("MB_GESTAO_NATIVE_MODE").as_deref() == Ok("true") {
        println!("cargo:rustc-cfg=mb_gestao_native_mode");
    }

    tauri_build::build()
}
