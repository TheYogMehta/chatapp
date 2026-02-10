import { executeDB, queryDB } from "../services/sqliteService";
import { ChatClient } from "../services/ChatClient";

interface QueueItem {
  id: number;
  type: string;
  payload: any;
  priority: number;
}

export class MessageQueue {
  private isProcessing = false;
  private handler: (item: {
    type: string;
    payload: any;
    priority: number;
  }) => Promise<void>;

  constructor(
    handler: (item: {
      type: string;
      payload: any;
      priority: number;
    }) => Promise<void>,
  ) {
    this.handler = handler;
  }

  async init() {
    this.process();
  }

  async enqueue(type: string, payload: any, priority: number = 1) {
    try {
      await executeDB(
        "INSERT INTO queue (type, payload, priority, timestamp) VALUES (?, ?, ?, ?)",
        [type, JSON.stringify(payload), priority, Date.now()],
      );
      this.process();
    } catch (e) {
      console.error("Failed to enqueue task", e);
    }
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const rows = await queryDB(
          "SELECT * FROM queue ORDER BY priority ASC, timestamp ASC LIMIT 1",
        );

        if (!rows || rows.length === 0) {
          break;
        }

        const task = rows[0];
        try {
          const payload = JSON.parse(task.payload);
          await this.handler({
            type: task.type,
            payload,
            priority: task.priority,
          });

         await executeDB("DELETE FROM queue WHERE id = ?", [task.id]);
        } catch (e) {
          console.error(`Failed to process task ${task.id}`, e);
          await executeDB("DELETE FROM queue WHERE id = ?", [task.id]);
        }
      }
    } catch (e) {
      console.error("Queue processing error", e);
    } finally {
      this.isProcessing = false;
    }
  }
}
