// Saves a Supabase personal access token for the Sanchari account into
// .supabase-token.local (git-ignored). Each character shows as * so you can see the paste arrived.
import fs from "node:fs";

const stdin = process.stdin;
let token = "";

function finish() {
  stdin.setRawMode?.(false);
  stdin.pause();
  process.stdout.write("\n");
  const value = token.trim();
  if (!/^sbp_[A-Za-z0-9_-]{20,}$/.test(value)) {
    console.log(
      `That does not look like a Supabase access token (it should start with sbp_; got ${value.length} characters). Nothing saved. Run the command again to retry.`
    );
    process.exit(1);
  }
  fs.writeFileSync(".supabase-token.local", value + "\n", { mode: 0o600 });
  console.log(`Saved (${value.length} characters). Tell Claude "token saved".`);
  process.exit(0);
}

process.stdout.write(
  "Paste the Supabase access token (starts with sbp_). In this panel paste with Ctrl+Shift+V or right-click, then press Enter:\n> "
);
stdin.setRawMode?.(true);
stdin.resume();
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  for (const ch of chunk) {
    if (ch === "\r" || ch === "\n") return finish();
    if (ch === "\u0003") {
      process.stdout.write("\nCancelled.\n");
      process.exit(1);
    }
    if (ch === "\u007f" || ch === "\b") {
      if (token.length > 0) {
        token = token.slice(0, -1);
        process.stdout.write("\b \b");
      }
      continue;
    }
    if (ch >= " ") {
      token += ch;
      process.stdout.write("*");
    }
  }
});
