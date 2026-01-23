import { EventEmitter } from "events";
import { Platform } from "./SafeStorage";

class SocketManager extends EventEmitter {
  private static instance: SocketManager;
  private ws: WebSocket | null = null;
  private url: string = "";

  static getInstance() {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  async connect(url: string) {
    try {
      this.url = url;


      console.log("Proceeding with WebSocket connection...");

      // 2. Standard WebSocket connection logic
      if (
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      // Check and Log WebSocket State on Connection Attempt
      await new Promise((resolve, reject) => {
        console.log(`Connecting to: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log("WebSocket opened successfully!");
          this.emit("WS_CONNECTED");
          resolve(true);
        };

        this.ws.onmessage = (e) => {
          const frame = JSON.parse(e.data);
          this.emit("message", frame);
        };

        this.ws.onclose = (event) => {
          console.log(
            `Socket closed. Code: ${event.code}, Reason: ${event.reason}`
          );
          this.emit("WS_DISCONNECTED");
          setTimeout(() => this.connect(this.url), 3000);
        };

        this.ws.onerror = (err) => {
          console.error("WebSocket Error:", err);
          this.emit("error", err);
          reject(err);
        };
      });
    } catch (err) {
      console.error("Failed to connect to WebSocket:", err);
      this.emit("error", "WebSocket Connection Failed");
      return;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("WebSocket not connected. Retrying...");
      if (this.url && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.connect(this.url).catch(console.error);
      }
      setTimeout(() => this.send(data), 500);
    }
  }
}

export default SocketManager.getInstance();
