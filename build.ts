import plugin from "bun-plugin-tailwind";
import { copyFileSync, mkdtempSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outdir = mkdtempSync(join(tmpdir(), "paxis-build-"));

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir,
  compile: true,
  target: "bun",
  plugins: [plugin],
});

for (const msg of result.logs) {
  console.error(msg);
}

if (!result.success) {
  process.exit(1);
}

// Bun names the binary after the entrypoint dir ("src") in compile mode
const binary = result.outputs[0].path;
copyFileSync(binary, "./paxis");
unlinkSync(binary);
Bun.spawnSync(["chmod", "+x", "./paxis"]);
