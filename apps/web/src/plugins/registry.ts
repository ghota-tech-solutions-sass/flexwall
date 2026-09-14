import type { PluginDef } from "@flexwall/sdk";
import core from "@flexwall/plugin-core";
import github from "@flexwall/plugin-github";
import http from "@flexwall/plugin-http";
import stripe from "@flexwall/plugin-stripe";
import npm from "@flexwall/plugin-npm";
import pypi from "@flexwall/plugin-pypi";
import bluesky from "@flexwall/plugin-bluesky";
import hackernews from "@flexwall/plugin-hackernews";
import lemonSqueezy from "@flexwall/plugin-lemon-squeezy";
import polar from "@flexwall/plugin-polar";
import plausible from "@flexwall/plugin-plausible";
import youtube from "@flexwall/plugin-youtube";
import { DEFAULT_THEME_ID } from "@/domain/wall";
import { createCatalog } from "./catalog";

/**
 * The installed plugins. Shared by server and browser: plugins hold no
 * secrets and reach the network only through the host's `ctx.fetch`, so the
 * editor renders widgets and draws connector forms from the same objects.
 *
 * Adding a plugin: `bun run new-plugin <id>`, then list it here.
 */
export const PLUGINS: readonly PluginDef[] = [core, github, stripe, http, npm, pypi, bluesky, hackernews, lemonSqueezy, polar, plausible, youtube];

export const catalog = createCatalog(PLUGINS, DEFAULT_THEME_ID);
