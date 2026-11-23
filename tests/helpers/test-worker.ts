// Minimal Worker entry for Vitest. The real entry (.open-next/worker.js) only
// exists after an OpenNext build; tests call services directly instead.
export default {
  async fetch(): Promise<Response> {
    return new Response("test worker");
  },
} satisfies ExportedHandler;
