import { contextBridge, ipcRenderer } from "electron";
import IpcConstants from "../../models/IpcConstants";
import { UserConfig } from "../../models/UserConfig";

type TooltipPosition = {
  x: number;
  y: number;
};

declare global {
  interface Window {
    electron: {
      receive: (channel: string, listener: any) => void;
      getUserConfig: () => Promise<UserConfig>;
      onConfigChanged: (callback: (config: UserConfig) => void) => void;
      onTooltipPositionChanged: (
        callback: (position: TooltipPosition) => void
      ) => void;
    };
  }
}

contextBridge.exposeInMainWorld("electron", {
  receive: (channel: string, listener: any) => {
    ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  getUserConfig: () => {
    return ipcRenderer.invoke(IpcConstants.GetUserConfig);
  },
  onConfigChanged: (callback: (config: UserConfig) => void) => {
    ipcRenderer.on(
      IpcConstants.TooltipConfigChanged,
      (_event, config: UserConfig) => {
        callback(config);
      }
    );
  },
  onTooltipPositionChanged: (callback: (position: TooltipPosition) => void) => {
    ipcRenderer.on(
      IpcConstants.TooltipPositionChanged,
      (_event, position: TooltipPosition) => {
        callback(position);
      }
    );
  },
});
