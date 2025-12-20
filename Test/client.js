const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const EventEmitter = require("events");

const SERVER = "ws://162.248.100.69:9000";

class Client extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.sessions = {};
    this.stateFile = `./state-${this.name}.json`;
    this.loadState();
    this.connect();
  }

  loadState() {
    if (fs.existsSync(this.stateFile)) {
      try {
        this.sessions = JSON.parse(fs.readFileSync(this.stateFile));
        console.log(
          `[${this.name}] State Loaded (${
            Object.keys(this.sessions).length
          } sessions)`
        );
      } catch (e) {
        this.sessions = {};
      }
    }
  }

  saveState() {
    fs.writeFileSync(this.stateFile, JSON.stringify(this.sessions, null, 2));
  }

  getValidSession() {
    return Object.keys(this.sessions).find((sid) => this.sessions[sid].key);
  }

  connect() {
    this.ws = new WebSocket(SERVER);
    this.ws.on("open", () => {
      console.log(`[${this.name}] Connected`);
      this.emit("connected");
    });
    this.ws.on("message", (m) => this.handle(JSON.parse(m.toString())));

    this.ws.on("close", () => {
      console.log(`[${this.name}] Connection lost. Reconnecting...`);
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      this.ws.terminate();
    });
  }

  send(frame) {
    if (this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(frame));
  }

  encrypt(key, text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      iv
    );
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("hex");
  }

  decrypt(key, hex) {
    const buf = Buffer.from(hex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      buf.slice(0, 12)
    );
    decipher.setAuthTag(buf.slice(12, 28));
    return decipher.update(buf.slice(28)) + decipher.final("utf8");
  }

  sendMessage(sid, text) {
    if (!this.sessions[sid] || !this.sessions[sid].key) {
      console.log(`[${this.name}] ⏳ Outbox: ${text}`);
      if (!this.sessions[sid]) this.sessions[sid] = { outbox: [] };
      if (!this.sessions[sid].outbox) this.sessions[sid].outbox = [];
      this.sessions[sid].outbox.push(text);
      return;
    }
    const payload = this.encrypt(this.sessions[sid].key, text);
    this.send({
      t: "MSG",
      sid,
      data: { payload, msgID: crypto.randomBytes(4).toString("hex") },
    });
  }

  flush(sid) {
    const s = this.sessions[sid];
    if (s && s.key && s.outbox && s.outbox.length > 0) {
      console.log(`[${this.name}] Flushing Encrypted Messages`);
      while (s.outbox.length > 0) this.sendMessage(sid, s.outbox.shift());
      this.saveState();
    }
  }

  handle(frame) {
    const { t, sid, data } = frame;
    if (sid && !this.sessions[sid]) this.sessions[sid] = { outbox: [] };

    switch (t) {
      case "SESSION_CREATED":
        console.log(`[${this.name}] ✨ Session Created: ${sid}`);
        this.emit("session_created", sid);
        break;
      case "INVITE_CODE":
        this.dh = crypto.getDiffieHellman("modp14");
        const params = {
          prime: this.dh.getPrime("hex"),
          generator: this.dh.getGenerator("hex"),
          publicKey: this.dh.generateKeys("hex"),
        };
        this.send({ t: "INVITE_CREATE", sid, data: params });
        this.emit("invite_ready", data.code);
        break;
      case "JOIN_REQUEST":
        const remotePubKey = data?.publicKey || data?.bobPubKey;
        if (!remotePubKey || this.sessions[sid].key) return;
        const sharedSecretHost = this.dh.computeSecret(remotePubKey, "hex");
        this.sessions[sid].key = sharedSecretHost.slice(0, 32).toString("hex");
        this.send({
          t: "JOIN_ACCEPT",
          sid,
          data: {
            clientID: data.clientID,
            publicKey: this.dh.getPublicKey("hex"),
          },
        });
        console.log(`[${this.name}] 🤝 Key Established (Host)`);
        this.saveState();
        this.flush(sid);
        break;
      case "JOINED":
        const finalKey = data?.publicKey || data?.alicePubKey;
        if (finalKey && !this.sessions[sid].key) {
          if (!this.dh) {
            this.dh = crypto.getDiffieHellman("modp14");
            this.dh.generateKeys();
          }
          const secret = this.dh.computeSecret(finalKey, "hex");
          this.sessions[sid].key = secret.slice(0, 32).toString("hex");
        }
        if (this.sessions[sid].key) {
          console.log(`[${this.name}] 🤝 Key Established (Joiner)`);
          this.saveState();
          this.flush(sid);
          this.emit("joined", sid);
        }
        break;
      case "MSG":
        const s = this.sessions[sid];
        if (s && s.key && data?.payload) {
          try {
            console.log(
              `[${this.name}] 💬 RECV: ${this.decrypt(s.key, data.payload)}`
            );
          } catch (e) {
            console.log(`[${this.name}] ⚠️ Decrypt error`);
          }
        }
        break;

      case "PING":
        this.send({ t: "PONG" });
        break;
    }
  }
}

/* --- Orchestrated Demo --- */
const alice = new Client("Alice");
const bob = new Client("Bob");

let ready = 0;
const start = () => {
  if (++ready === 2) {
    const existingSid = alice.getValidSession();
    if (existingSid) {
      console.log(`[Demo] ♻️ Reattaching to: ${existingSid}`);
      alice.send({ t: "REATTACH", sid: existingSid });
      bob.send({ t: "REATTACH", sid: existingSid });
      setTimeout(() => {
        alice.sendMessage(existingSid, "Session resumed successfully!");
        bob.sendMessage(existingSid, "Acknowledged!");
      }, 200);
    } else {
      console.log("[Demo] 🆕 Starting new flow...");
      alice.send({ t: "CREATE_SESSION" });
    }
  }
};

alice.on("connected", start);
bob.on("connected", start);

alice.once("session_created", (sid) => {
  alice.sendMessage(sid, "Hello from Alice!");
  alice.send({ t: "INVITE_CREATE", sid });
});

alice.once("invite_ready", (code) => {
  bob.dh = crypto.getDiffieHellman("modp14");
  bob.send({
    t: "JOIN",
    data: { code, publicKey: bob.dh.generateKeys("hex") },
  });
});
