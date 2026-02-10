import CryptoWorker from "../workers/crypto.worker?worker";

export class WorkerManager {
  private static instance: WorkerManager;
  private worker: WorkerPool;

  private constructor() {
    this.worker = new WorkerPool(new CryptoWorker());
  }

  public static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  public async initSession(sid: string, keyJWK: JsonWebKey) {
    const msg = { type: "INIT_SESSION", sid, keyJWK };
    await this.worker.postMessage(msg);
  }

  public async encrypt(
    sid: string,
    data: string | ArrayBuffer,
    priority: number,
  ): Promise<string> {
    const id = crypto.randomUUID();
    const msg = { type: "ENCRYPT", sid, data, id, priority };
    return this.worker.postMessage(msg);
  }

  public async decrypt(
    sid: string,
    data: string,
    priority: number,
  ): Promise<ArrayBuffer> {
    const id = crypto.randomUUID();
    const msg = { type: "DECRYPT", sid, data, id, priority };
    return this.worker.postMessage(msg);
  }
}

class WorkerPool {
  private worker: Worker;
  private callbacks: Map<
    string,
    { resolve: (data: any) => void; reject: (err: any) => void }
  > = new Map();

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e) => this.handleMessage(e.data);
  }

  private handleMessage(msg: any) {
    const callback = this.callbacks.get(msg.id);
    if (callback) {
      if (msg.error) {
        callback.reject(new Error(msg.error));
      } else {
        if (msg.type === "ENCRYPT_RESULT" || msg.type === "DECRYPT_RESULT") {
          callback.resolve(msg.data);
        }
      }
      this.callbacks.delete(msg.id);
    }
  }

  public postMessage(msg: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (msg.type === "ENCRYPT" || msg.type === "DECRYPT") {
        this.callbacks.set(msg.id, { resolve, reject });
      }
      this.worker.postMessage(msg);
      if (msg.type === "INIT_SESSION") {
        resolve(true);
      }
    });
  }
}
