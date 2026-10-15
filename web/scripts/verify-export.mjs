import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { abiHash, canonical } from "./integrity.mjs";
const web = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  root = resolve(web, ".."),
  dist = resolve(root, "dist");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const m = await read(resolve(dist, "imd-deployment.json")),
  template = await read(resolve(web, "deployment.template.json"));
const { assets, ...config } = m;
assert.deepEqual(config, template);
assert(
  Object.keys(m).every((k) =>
    [
      "version",
      "launchId",
      "chainId",
      "sourceCommit",
      "attestationHash",
      "contracts",
      "assets",
      "network",
      "walletAddChain",
      "poolKey",
    ].includes(k),
  ),
);
assert(m.version === 1 && m.chainId === m.network.chainId);
assert(/^[a-f0-9]{64}$/.test(m.attestationHash));
const safe = (p) =>
  typeof p === "string" &&
  !p.startsWith("/") &&
  !p.includes("..") &&
  !p.includes(":") &&
  !p.includes("\\");
async function walk(dir, prefix = "") {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true }))
    out.push(
      ...(e.isDirectory()
        ? await walk(resolve(dir, e.name), prefix + e.name + "/")
        : [prefix + e.name]),
    );
  return out;
}
assert(assets.length <= 128);
assert.deepEqual(
  assets.map((a) => a.path).sort(),
  (await walk(dist)).filter((p) => p !== "imd-deployment.json").sort(),
);
let bytes = 0;
for (const a of assets) {
  assert(safe(a.path));
  assert(/^[a-f0-9]{64}$/.test(a.sha256));
  const b = await readFile(resolve(dist, a.path));
  bytes += b.length;
  assert(b.length <= 8388608);
  assert.equal(createHash("sha256").update(b).digest("hex"), a.sha256);
}
for (const c of m.contracts) {
  assert(safe(c.abiPath));
  assert.equal(abiHash(await read(resolve(dist, c.abiPath))), c.abiHash);
}
// The pinned inputs are checked when available; future builds use the committed template.
try {
  const h = await read(resolve(root, ".imd/reads/deployment.json"));
  for (const k of [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
  ])
    assert.equal(m[k], h[k]);
  assert.deepEqual(
    m.contracts.map(({ abiPath, ...c }) => c),
    h.contracts.map((c) => ({
      name: c.name,
      address: c.address,
      abiHash: c.abiHash,
    })),
  );
  assert.deepEqual(m.poolKey, h.poolKey);
  const n = await read(resolve(root, ".imd/reads/network.json"));
  assert.deepEqual(canonical(m.network), canonical(n.network));
  assert.deepEqual(m.walletAddChain, n.walletAddChain);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
assert(bytes < 30 * 1024 * 1024);
console.log(
  `Export verified: ${assets.length} assets, ${bytes} bytes. ABI, handoff, network and every SHA-256 match.`,
);
