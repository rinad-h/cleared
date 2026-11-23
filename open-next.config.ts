import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default config on purpose: no incremental cache, no R2, no KV.
// Every page is dynamic (it depends on who is signed in), and R2 needs a card.
export default defineCloudflareConfig();
