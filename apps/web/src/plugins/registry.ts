import type { PluginDef } from "@flexwall/sdk";
import core from "@flexwall/plugin-core";
import github from "@flexwall/plugin-github";
import http from "@flexwall/plugin-http";
import stripe from "@flexwall/plugin-stripe";
import { createCatalog } from "./catalog";

/**
 * The installed plugins. Shared by server and browser: plugins hold no
 * secrets and reach the network only through the host's `ctx.fetch`, so the
 * editor renders widgets and draws connector forms from the same objects.
 *
 * Adding a plugin: `bun run new-plugin <id>`, then list it here.
 */
export const PLUGINS: readonly PluginDef[] = [core, github, stripe, http];

export const catalog = createCatalog(PLUGINS, "night");
