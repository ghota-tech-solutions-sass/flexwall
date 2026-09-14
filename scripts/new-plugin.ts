#!/usr/bin/env bun
/**
 * bun run new-plugin <id> ["Display Name"]
 *
 * Copies templates/plugin to plugins/<id>, fills in the names, registers the
 * plugin in the app and adds it to the app's dependencies. Then: bun install.
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const [id, name] = process.argv.slice(2);

if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error("Usage: bun run new-plugin <id> [\"Display Name\"]\n  <id>: lowercase letters, digits and dashes, e.g. lemon-squeezy");
  process.exit(1);
}
const target = join(root, "plugins", id);
if (existsSync(target)) {
  console.error(`plugins/${id} already exists.`);
  process.exit(1);
}

const display = name ?? id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const camel = id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

cpSync(join(root, "templates/plugin"), target, { recursive: true });
const fill = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) fill(path);
    else writeFileSync(path, readFileSync(path, "utf8").replaceAll("__ID__", id).replaceAll("__NAME__", display).replaceAll("__CAMEL__", camel));
  }
};
fill(target);

// Register in the app: import and list.
const registryPath = join(root, "apps/web/src/plugins/registry.ts");
let registry = readFileSync(registryPath, "utf8");
registry = registry.replace(/(import \{ createCatalog \} from "\.\/catalog";)/, `import ${camel} from "@flexwall/plugin-${id}";\n$1`);
registry = registry.replace(/export const PLUGINS: readonly PluginDef\[\] = \[([^\]]*)\];/, (_, list: string) => `export const PLUGINS: readonly PluginDef[] = [${list.trim()}, ${camel}];`);
writeFileSync(registryPath, registry);

const appPackagePath = join(root, "apps/web/package.json");
const appPackage = JSON.parse(readFileSync(appPackagePath, "utf8"));
appPackage.dependencies[`@flexwall/plugin-${id}`] = "workspace:*";
appPackage.dependencies = Object.fromEntries(Object.entries(appPackage.dependencies).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(appPackagePath, JSON.stringify(appPackage, null, 2) + "\n");

console.log(`Created plugins/${id} and registered it.\n\nNext:\n  bun install\n  bun test plugins/${id}\n  bun run dev\n\nGuides: docs/plugins/connectors.md, docs/plugins/widgets.md`);
