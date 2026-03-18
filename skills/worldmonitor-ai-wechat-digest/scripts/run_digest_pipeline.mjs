import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function runStep(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Step failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  const scriptDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : "";

  runStep("node", [path.join(scriptDir, "fetch_worldmonitor_ai_news.mjs"), ...(runDir ? [runDir] : [])], scriptDir);
  console.log("Fetch complete. Write article.md in the reported run directory, then run render_wechat_digest.mjs and publish_wechat_draft.mjs.");
}

main();
