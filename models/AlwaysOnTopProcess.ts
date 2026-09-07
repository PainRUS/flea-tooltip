import { spawn } from "child_process";
import { app } from "electron";
import fs from "fs";
import path from "path";
import { isDev } from "../utils";

export default class AlwaysOnTopProcess {
  initialize(): void {
    console.log("Initializing always on top process");

    const executablePath = isDev()
      ? path.join(app.getAppPath(), "lib", "ocr", "setalwaysontop.exe")
      : path.join(process.resourcesPath, "ocr", "setalwaysontop.exe");

    if (!fs.existsSync(executablePath)) {
      console.error(
        `Always-on-top helper is missing; skipping helper process: ${executablePath}`
      );
      return;
    }

    const alwaysOnTopProcess = spawn(executablePath);

    alwaysOnTopProcess.on("error", (error) => {
      // A missing/blocked helper must never crash Electron's main process.
      console.error("Failed to start always-on-top helper:", error);
    });

    alwaysOnTopProcess.on("close", (code) => {
      if (code === 0) {
        console.log("Successfully put as top most window");
      } else {
        console.log(`Failed to put as top most window (exit code ${code})`);
      }
    });
  }
}
