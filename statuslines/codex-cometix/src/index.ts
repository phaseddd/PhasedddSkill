import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigLoader, DEFAULT_CONFIG } from "./config/schema.js";
import { GitCollector } from "./collectors/git.js";
import { CostLedger } from "./collectors/ledger.js";
import { SessionTracker } from "./collectors/session-tracker.js";
import { renderStatusline } from "./design/renderer.js";
import { startMcpServer } from "./protocol/mcp-server.js";
import { runPreview } from "./cli/preview.js";
import { installStatusline, uninstallStatusline } from "./cli/installer.js";
import type { PaletteId, RenderVariant, SkinId } from "./protocol/types.js";

function parseFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

function printHelp(): void {
  console.log(`codex-cometix — Custom Codex CLI Statusline (Dual-Line Studio & DS Fat Fish Edition)

Usage:
  codex-cometix                           Start stdio MCP statusline server (for Codex CLI)
  codex-cometix preview [options]         Preview statusline directly in terminal
    --whale                               Preview DS Fat Fish edition
    --animate                             Play live 1 FPS idle -> 《落泪》 dance animation
    --frames                              Print all 8 《落泪》 dance beats statically
    --all-skins                           Compare editorial, pill, and plain skins
    --all-palettes                        Compare all 8 curated light/dark palettes
    --skin <editorial|pill|plain>         Override skin
    --palette <name>                      Override palette (default: gruvbox-light)
    --width <cols>                        Simulate terminal width
  codex-cometix install [--standard|--whale] [--clean-legacy]
                                          Configure ~/.codex/config.toml automatically
  codex-cometix uninstall                 Remove codex-cometix from ~/.codex/config.toml
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "mcp" || cmd === "serve") {
    const configLoader = new ConfigLoader();
    const git = new GitCollector();
    const ledger = new CostLedger();
    const tracker = new SessionTracker({ git, ledger });

    process.on("exit", () => {
      tracker.dispose();
      ledger.flushSync();
    });

    startMcpServer({
      render: (state, variant) => {
        const config = configLoader.get();
        const ctx = tracker.buildRenderContext(state, config, variant);
        return renderStatusline(ctx);
      },
    });
    return;
  }

  if (cmd === "-h" || cmd === "--help" || cmd === "help") {
    printHelp();
    return;
  }

  if (cmd === "preview") {
    const configLoader = new ConfigLoader();
    const loaded = configLoader.get();
    const skin = parseFlagValue(args, "--skin") as SkinId | undefined;
    const palette = parseFlagValue(args, "--palette") as PaletteId | undefined;
    const widthRaw = parseFlagValue(args, "--width");
    const width = widthRaw ? Number.parseInt(widthRaw, 10) : undefined;

    await runPreview(loaded ?? DEFAULT_CONFIG, {
      variant: args.includes("--whale") ? "whale" : "standard",
      skin,
      palette,
      allSkins: args.includes("--all-skins"),
      allPalettes: args.includes("--all-palettes"),
      animate: args.includes("--animate"),
      frames: args.includes("--frames"),
      width: width && !Number.isNaN(width) ? width : undefined,
    });
    return;
  }

  if (cmd === "install") {
    const currentFile = fileURLToPath(import.meta.url);
    const bundlePath = currentFile.endsWith(".mjs")
      ? currentFile
      : path.resolve(path.dirname(currentFile), "../dist/index.mjs");
    const defaultVariant: RenderVariant = args.includes("--standard") ? "standard" : "whale";
    const result = installStatusline({
      bundlePath,
      defaultVariant,
      removeLegacyPython: args.includes("--clean-legacy"),
    });
    console.log(`Installed codex-cometix (${defaultVariant}) -> ${result.configPath}`);
    if (result.removedLegacyFile) {
      console.log("Removed legacy ~/.codex/statuslines/session-status.py");
    }
    console.log("Restart Codex CLI or run /statusline to switch between Standard and DS Fat Fish editions.");
    return;
  }

  if (cmd === "uninstall") {
    const result = uninstallStatusline();
    console.log(
      result.changed
        ? `Removed codex-cometix from ${result.configPath}`
        : `codex-cometix was not present in ${result.configPath}`,
    );
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exitCode = 1;
}

void main();
