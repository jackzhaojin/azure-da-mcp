import { createServer, type Server } from "node:http";

export interface ReceivedPost {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface Receiver {
  url: string;
  posts: ReceivedPost[];
  /** Resolves with the first post matching `predicate` (including already-received ones). */
  waitFor(predicate: (p: ReceivedPost) => boolean, timeoutMs?: number): Promise<ReceivedPost>;
  close(): Promise<void>;
}

/**
 * Minimal real HTTP webhook receiver for push-notification tests — plays the
 * role of Make.com's Custom Webhook trigger. Records every POST.
 */
export async function startReceiver(port: number): Promise<Receiver> {
  const posts: ReceivedPost[] = [];
  const waiters: Array<{ predicate: (p: ReceivedPost) => boolean; resolve: (p: ReceivedPost) => void }> = [];

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      const post: ReceivedPost = { path: req.url ?? "/", headers: req.headers, body };
      posts.push(post);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(post)) {
          waiters[i].resolve(post);
          waiters.splice(i, 1);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    url: `http://localhost:${port}`,
    posts,
    waitFor(predicate, timeoutMs = 15_000) {
      const existing = posts.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`receiver: no matching POST within ${timeoutMs}ms (got ${posts.length} posts)`)),
          timeoutMs
        );
        waiters.push({
          predicate,
          resolve: (p) => {
            clearTimeout(timer);
            resolve(p);
          },
        });
      });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
