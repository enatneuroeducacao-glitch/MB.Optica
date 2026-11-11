process.env.MB_GESTAO_DEPLOYMENT_MODE = "local";
process.env.MB_GESTAO_TARGET_URL = "http://127.0.0.1:3000/";
await import("./build-customer-installer.mjs");
