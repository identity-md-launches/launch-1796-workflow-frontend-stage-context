import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { abiHash } from "./integrity.mjs";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, ".."),
  dist = resolve(root, "dist");
const manifest = JSON.parse(
  await readFile(resolve(web, "deployment.template.json"), "utf8"),
);
for (const contract of manifest.contracts) {
  const source = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync(
    "git",
    ["show", `${manifest.sourceCommit}:${source}`],
    { cwd: root, encoding: "utf8" },
  );
  const abi = JSON.parse(pinned);
  if (!Array.isArray(abi) || abiHash(abi) !== contract.abiHash)
    throw new Error(`Pinned ABI hash mismatch: ${contract.name}`);
  const current = JSON.parse(await readFile(resolve(root, source), "utf8"));
  if (abiHash(current) !== contract.abiHash)
    throw new Error(`Current ABI differs from pinned source: ${contract.name}`);
  await mkdir(dirname(resolve(dist, contract.abiPath)), { recursive: true });
  await copyFile(resolve(root, source), resolve(dist, contract.abiPath));
}
async function walk(dir, prefix = "") {
  const paths = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory())
      paths.push(...(await walk(resolve(dir, item.name), name + "/")));
    else if (name !== "imd-deployment.json") paths.push(name);
  }
  return paths.sort();
}
manifest.assets = await Promise.all(
  (await walk(dist)).map(async (path) => ({
    path,
    sha256: createHash("sha256")
      .update(await readFile(resolve(dist, path)))
      .digest("hex"),
  })),
);
await writeFile(
  resolve(dist, "imd-deployment.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await import("./verify-export.mjs");
