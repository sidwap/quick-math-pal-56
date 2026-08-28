const fs = require("node:fs");
const path = require("node:path");

const appDir = "/home/dotplushq/domains/drive.dotplushq.online/tgdrive";
const persistentDataDir = "/home/dotplushq/domains/drive.dotplushq.online/tgdrive-data";
fs.mkdirSync(persistentDataDir, { recursive: true });

// Prefer the virtualenv interpreter created by INSTALL.md, fall back to system python3.
const venvPython = path.join(appDir, "pyservice", ".venv", "bin", "python");
const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";

// Shared secret between the Node app and the Telethon upload service.
const uploadToken = process.env.UPLOAD_SERVICE_TOKEN || "";

module.exports = {
  apps: [
    {
      name: "tgdrive",
      cwd: appDir,
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        DATA_DIR: persistentDataDir,
        UPLOAD_SERVICE_ENABLED: "1",
        UPLOAD_SERVICE_URL: "http://127.0.0.1:8765",
        UPLOAD_SERVICE_TOKEN: uploadToken,
      },
      error_file: `${persistentDataDir}/tgdrive-err.log`,
      out_file: `${persistentDataDir}/tgdrive-out.log`,
      merge_logs: true,
      time: true,
    },
    {
      name: "tgdrive-upload",
      cwd: path.join(appDir, "pyservice"),
      script: "-m",
      args: "uvicorn main:app --host 127.0.0.1 --port 8765 --workers 1",
      interpreter: pythonBin,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        UPLOAD_SERVICE_TOKEN: uploadToken,
        PYTHONUNBUFFERED: "1",
      },
      error_file: `${persistentDataDir}/tgdrive-upload-err.log`,
      out_file: `${persistentDataDir}/tgdrive-upload-out.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
