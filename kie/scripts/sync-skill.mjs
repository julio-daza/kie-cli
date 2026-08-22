// Copies the canonical skill (repo root: skills/kie-media) into the package (kie/skills/kie-media)
// so `npm pack` ships it and `kie skill install` works offline. In the published tarball the
// repo-level source does not exist and the bundled copy is already in place — then this is a no-op.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(pkg, "..", "skills", "kie-media");
const dest = resolve(pkg, "skills", "kie-media");
if (!existsSync(resolve(source, "SKILL.md"))) process.exit(0);
rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
console.log(`skill synced → ${dest}`);
