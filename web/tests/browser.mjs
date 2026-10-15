import { chromium, webkit } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  erc20Abi,
  zeroAddress,
  getAddress,
} from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist"),
  evidence = resolve(root, "docs/frontend"),
  scratch = resolve(root, "test/scratch/browser-tests");
await mkdir(scratch, { recursive: true });
const manifest = JSON.parse(
  await readFile(resolve(dist, "imd-deployment.json"), "utf8"),
);
const abi = JSON.parse(
  await readFile(resolve(dist, manifest.contracts[0].abiPath), "utf8"),
);
const contract = manifest.contracts[0].address.toLowerCase();
// Synthetic fixtures used only by the local intercepted browser tests; never a runtime configuration.
const visitor = "0x1234567890123456789012345678901234567890",
  token = "0x2345678901234567890123456789012345678901";
const owner = "0xb77161bbaf98470c6c5101899d30df413f9a019d";
const txHash = "0x" + "ab".repeat(32),
  blockHash = "0x" + "cd".repeat(32);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split("?")[0]);
    const rel = pathname.replace(/^\/preview\//, "") || "index.html";
    const file = resolve(dist, rel);
    if (!file.startsWith(dist + "/")) throw Error("bad path");
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".png": "image/png",
      }[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [],
  browserErrors = [],
  requests = [];
const hex = (n) => "0x" + BigInt(n).toString(16);
const latestBlock = (timestamp, block) => ({
  number: hex(block),
  hash: blockHash,
  parentHash: blockHash,
  nonce: "0x0000000000000000",
  sha3Uncles: blockHash,
  logsBloom: "0x" + "00".repeat(256),
  transactionsRoot: blockHash,
  stateRoot: blockHash,
  receiptsRoot: blockHash,
  miner: owner,
  difficulty: "0x0",
  totalDifficulty: "0x0",
  extraData: "0x",
  size: "0x100",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  timestamp: hex(timestamp),
  transactions: [],
  uncles: [],
  baseFeePerGas: "0x3b9aca00",
  mixHash: blockHash,
});
function state(overrides = {}) {
  return {
    block: 100n,
    paid: false,
    minimum: 1000n * 10n ** 18n,
    decimals: 18,
    balance: 100000n * 10n ** 18n,
    allowance: 0n,
    count: 0n,
    total: 0n,
    nextFree: 0n,
    timestamp: 2000000000n,
    history: [],
    current: { author: zeroAddress, text: "", burned: 0n, timestamp: 0n },
    writes: [],
    simulations: [],
    offline: false,
    failSimulation: false,
    receiptReady: true,
    receiptStatus: "0x1",
    ...overrides,
  };
}
async function fixture(browser, s, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(options.mobile
      ? {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
          isMobile: true,
          hasTouch: true,
        }
      : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      browserErrors.push(`${r.status()} ${r.url()}`);
  });
  if (!options.noWallet)
    await page.addInitScript(
      ({
        account,
        initialChain,
        unknownChain,
        rejectConnect,
        rejectSend,
        hash,
      }) => {
        const handlers = {};
        const w = {
          account,
          chain: initialChain,
          connected: false,
          unknownChain,
          rejectConnect,
          rejectSend,
          methods: [],
          sent: [],
        };
        window.__wallet = w;
        const provider = {
          on: (event, fn) => {
            (handlers[event] ??= []).push(fn);
          },
          removeListener: (event, fn) => {
            handlers[event] = (handlers[event] ?? []).filter((f) => f !== fn);
          },
          request: async ({ method, params }) => {
            w.methods.push({ method, params });
            if (method === "eth_requestAccounts") {
              if (w.rejectConnect)
                throw { code: 4001, message: "User rejected" };
              w.connected = true;
              return [w.account];
            }
            if (method === "eth_accounts")
              return w.connected ? [w.account] : [];
            if (method === "eth_chainId") return w.chain;
            if (method === "wallet_switchEthereumChain") {
              if (w.unknownChain)
                throw { code: 4902, message: "Unknown chain" };
              w.chain = params[0].chainId;
              (handlers.chainChanged ?? []).forEach((f) => f(w.chain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              w.unknownChain = false;
              return null;
            }
            if (method === "eth_sendTransaction") {
              if (w.rejectSend)
                throw { code: 4001, message: "User rejected transaction" };
              w.sent.push(params[0]);
              await window.__send(params[0]);
              return hash;
            }
            if (method === "wallet_getCapabilities") return {};
            if (method === "wallet_requestPermissions")
              return [{ parentCapability: "eth_accounts" }];
            throw new Error("Unexpected wallet method " + method);
          },
        };
        window.__provider = provider;
        const detail = {
          info: {
            uuid: "b43e91a2-60f1-4b4d-9bce-37080704c936",
            name: "Test Browser Wallet",
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="green"/></svg>',
            rdns: "test.lastword.wallet",
          },
          provider,
        };
        const announce = () =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", { detail }),
          );
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      {
        account: options.owner ? owner : visitor,
        initialChain: options.wrong ? "0x2" : "0x1",
        unknownChain: !!options.wrong,
        rejectConnect: !!options.rejectConnect,
        rejectSend: !!options.rejectSend,
        hash: txHash,
      },
    );
  await page.exposeFunction("__send", (tx) => {
    s.writes.push(tx);
    const call = decodeFunctionData({
      abi: tx.to.toLowerCase() === contract ? abi : erc20Abi,
      data: tx.data,
    });
    if (call.functionName === "approve") s.allowance = call.args[1];
    if (call.functionName === "setMessage") {
      s.count++;
      s.current = {
        author: getAddress(options.owner ? owner : visitor),
        text: call.args[0],
        burned: call.args[1],
        timestamp: s.timestamp,
      };
      s.history.push(s.current);
      s.total += call.args[1];
      if (s.paid) {
        s.balance -= call.args[1];
        s.allowance -= call.args[1];
        s.minimum = (call.args[1] * 11n + 9n) / 10n;
      } else s.nextFree = s.timestamp + 600n;
    }
    if (call.functionName === "setToken") s.paid = true;
  });
  await page.route("https://**", async (route) => {
    if (
      !manifest.network.rpcUrls.some((r) => route.request().url().startsWith(r))
    )
      return route.abort();
    if (s.offline) return route.fulfill({ status: 503, body: "offline" });
    const body = route.request().postDataJSON();
    async function answer(q) {
      requests.push(q.method);
      let result;
      switch (q.method) {
        case "eth_chainId":
          result = "0x1";
          break;
        case "eth_getCode":
          result = "0x60006000";
          break;
        case "eth_blockNumber":
          result = hex(s.block);
          break;
        case "eth_getBlockByNumber":
          result = latestBlock(s.timestamp, s.block);
          break;
        case "eth_estimateGas":
          result = "0x186a0";
          break;
        case "eth_gasPrice":
          result = "0x3b9aca00";
          break;
        case "eth_getBalance":
          result = "0xde0b6b3a7640000";
          break;
        case "eth_getTransactionReceipt":
          result = s.receiptReady
            ? {
                transactionHash: txHash,
                transactionIndex: "0x0",
                blockHash,
                blockNumber: "0x64",
                from: visitor,
                to: contract,
                cumulativeGasUsed: "0x186a0",
                gasUsed: "0x186a0",
                contractAddress: null,
                logs: [],
                logsBloom: "0x" + "00".repeat(256),
                status: s.receiptStatus,
                effectiveGasPrice: "0x3b9aca00",
                type: "0x2",
              }
            : null;
          break;
        case "eth_getTransactionByHash":
          result = {
            hash: txHash,
            blockHash,
            blockNumber: "0x64",
            from: visitor,
            to: contract,
            gas: "0x186a0",
            gasPrice: "0x3b9aca00",
            input: "0x",
            nonce: "0x1",
            r: txHash,
            s: txHash,
            v: "0x1",
            transactionIndex: "0x0",
            value: "0x0",
            type: "0x0",
          };
          break;
        case "eth_call": {
          const target = q.params[0].to.toLowerCase(),
            a = target === contract ? abi : erc20Abi;
          const call = decodeFunctionData({ abi: a, data: q.params[0].data });
          let value;
          const values = {
            owner,
            token: s.paid ? token : zeroAddress,
            tokenDecimals: s.paid ? s.decimals : 0,
            minimumBurn: s.paid ? s.minimum : 0n,
            currentMessage: s.current,
            getRecentMessages: s.history,
            messageCount: s.count,
            totalBurned: s.total,
            baseMinimumBurn: s.paid ? 1000n * 10n ** BigInt(s.decimals) : 0n,
            nextFreePostAt: s.nextFree,
            balanceOf: s.balance,
            allowance: s.allowance,
            symbol: "WORD",
            decimals: s.decimals,
          };
          if (
            ["setMessage", "setToken", "approve"].includes(call.functionName)
          ) {
            s.simulations.push(call.functionName);
            if (s.failSimulation && call.functionName === "setMessage")
              return {
                jsonrpc: "2.0",
                id: q.id,
                error: {
                  code: 3,
                  message: "execution reverted",
                  data: encodeErrorResult({
                    abi,
                    errorName: "BurnTooSmall",
                    args: [s.minimum + 1n, 0n],
                  }),
                },
              };
            value = call.functionName === "approve" ? true : undefined;
          } else {
            value = values[call.functionName];
            if (value === undefined)
              throw new Error("Unexpected read " + call.functionName);
          }
          result = encodeFunctionResult({
            abi: a,
            functionName: call.functionName,
            result: value,
          });
          break;
        }
        default:
          throw new Error("Unexpected RPC method " + q.method);
      }
      return { jsonrpc: "2.0", id: q.id, result };
    }
    try {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(body)
            ? await Promise.all(body.map(answer))
            : await answer(body),
        ),
      });
    } catch (e) {
      browserErrors.push(e.message);
      await route.abort();
    }
  });
  if (options.tamper)
    await page.route("**/abi/LastWord.json", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          ...abi,
          { type: "error", name: "Tampered", inputs: [] },
        ]),
      }),
    );
  await page.goto(url);
  if (options.tamper) return { page, context, s };
  await page.getByText("On the billboard", { exact: true }).waitFor();
  return { page, context, s };
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Test Browser Wallet", exact: true })
    .click();
  await page.getByRole("button", { name: /0x1234|0xB771/ }).waitFor();
}
async function test(name, fn) {
  if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER))
    return;
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
    console.error("FAIL " + name + ": " + e.message);
    for (const c of browser.contexts())
      for (const p of c.pages())
        console.error(
          "UI errors:",
          await p.locator(".error").allTextContents(),
        );
    throw e;
  }
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await test("Static subpath; live configuration and ABI; first-screen primary control; 320/390/1440 reflow", async () => {
    const { page, context } = await fixture(browser, state());
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) {
        const b = await page.locator("button[type=submit]").boundingBox();
        assert(b.y + b.height <= 844);
        await page.screenshot({
          path: resolve(evidence, "screenshots/mobile-390.png"),
          fullPage: true,
        });
      }
      if (width === 1440)
        await page.screenshot({
          path: resolve(evidence, "screenshots/desktop-1440.png"),
          fullPage: true,
        });
    }
    assert(
      await page
        .getByRole("button", { name: "Connect in the header to post" })
        .isDisabled(),
    );
    await context.close();
  });
  await test("EIP-6963 discovery; generic row hidden; keyboard dialog close and focus return", async () => {
    const { page, context } = await fixture(browser, state());
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Browser wallet", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Test Browser Wallet", exact: true })
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document.activeElement?.textContent?.includes("Connect wallet"),
    );
    assert(
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .evaluate((e) => e === document.activeElement),
    );
    await context.close();
  });
  await test("Free post: simulation, explicit review, exact zero burn, no ETH value, receipt, cooldown", async () => {
    const s = state();
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("A word for everyone.");
    await page
      .getByRole("button", { name: "Post a message", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Post this message?" }).waitFor();
    assert.equal(s.writes.length, 0);
    await page.getByRole("button", { name: "Confirm post in wallet" }).click();
    await page
      .getByText("Transaction confirmed. The billboard has been refreshed.")
      .waitFor();
    assert.equal(s.writes.length, 1);
    assert.equal(s.current.burned, 0n);
    assert(!s.writes[0].value || s.writes[0].value === "0x0");
    assert(s.simulations.filter((x) => x === "setMessage").length >= 2);
    assert(
      await page
        .getByRole("button", { name: "Post again in 10m 0s" })
        .isDisabled(),
    );
    await context.close();
  });
  await test("Unknown chain: switch, add exact handoff chain, switch again", async () => {
    const { page, context } = await fixture(browser, state(), { wrong: true });
    await connect(page);
    await page.waitForFunction(() => window.__wallet.chain === "0x1");
    const calls = await page.evaluate(() => window.__wallet.methods);
    assert.deepEqual(
      calls.filter((c) => c.method === "wallet_addEthereumChain")[0].params[0],
      manifest.walletAddChain,
    );
    assert.equal(
      calls.filter((c) => c.method === "wallet_switchEthereumChain").length,
      2,
    );
    await context.close();
  });
  await test("Paid flow: six decimals; explicit approval then post; pending stays locked", async () => {
    const s = state({
      paid: true,
      decimals: 6,
      minimum: 1000000000n,
      balance: 5000000000n,
      receiptReady: false,
    });
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Paid, deliberately.");
    await page.getByRole("button", { name: "Use minimum" }).click();
    await page
      .getByRole("button", { name: "Approve WORD", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm approval in wallet" })
      .click();
    await page.getByRole("button", { name: "Confirming…" }).waitFor();
    assert(
      await page.getByRole("button", { name: "Confirming…" }).isDisabled(),
    );
    assert.equal(s.writes.length, 1);
    s.receiptReady = true;
    s.block = 101n;
    await page
      .getByText(
        "Approval confirmed. Review the current minimum before posting.",
      )
      .waitFor();
    await page.getByRole("button", { name: "Review & post" }).click();
    await page.getByRole("button", { name: "Confirm post in wallet" }).click();
    await page
      .getByText("Transaction confirmed. The billboard has been refreshed.")
      .waitFor();
    assert.equal(s.total, 1000000000n);
    assert.equal(s.writes.length, 2);
    assert.equal(s.writes[0].to.toLowerCase(), token);
    const approval = decodeFunctionData({
      abi: erc20Abi,
      data: s.writes[0].data,
    });
    assert.equal(approval.args[0].toLowerCase(), contract);
    assert.equal(approval.args[1], 1000000000n);
    await context.close();
  });
  await test("Existing insufficient allowance: reset to zero before exact approval", async () => {
    const s = state({ paid: true, allowance: 1n });
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Reset then approve.");
    await page.getByRole("button", { name: "Use minimum" }).click();
    await page
      .getByRole("button", { name: "Reset approval", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm reset in wallet" }).click();
    await page
      .getByText(
        "Approval confirmed. Review the current minimum before posting.",
      )
      .waitFor();
    assert.equal(
      decodeFunctionData({ abi: erc20Abi, data: s.writes[0].data }).args[1],
      0n,
    );
    await page
      .getByRole("button", { name: "Approve WORD", exact: true })
      .waitFor();
    await context.close();
  });
  await test("Wallet rejection is recoverable and sends nothing", async () => {
    const s = state();
    const { page, context } = await fixture(browser, s, { rejectSend: true });
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Keep the draft.");
    await page
      .getByRole("button", { name: "Post a message", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm post in wallet" }).click();
    await page.getByText(/Request declined in your wallet/).waitFor();
    assert.equal(s.writes.length, 0);
    assert.equal(
      await page.getByLabel("Your message", { exact: true }).inputValue(),
      "Keep the draft.",
    );
    assert(
      await page
        .getByRole("button", { name: "Post a message", exact: true })
        .isEnabled(),
    );
    await context.close();
  });
  await test("Simulation revert exposes useful error and never requests a signature", async () => {
    const s = state({ failSimulation: true });
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("A rejected simulation.");
    await page
      .getByRole("button", { name: "Post a message", exact: true })
      .click();
    await page.getByText(/The minimum burn increased/).waitFor();
    assert.equal(s.writes.length, 0);
    assert.equal(await page.getByRole("dialog").count(), 0);
    await context.close();
  });
  await test("Minimum increases after review: no silent increase and no wallet write", async () => {
    const s = state({ paid: true, allowance: 10000n * 10n ** 18n });
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Keep my chosen price.");
    await page.getByRole("button", { name: "Use minimum" }).click();
    await page.getByRole("button", { name: "Review & post" }).click();
    await page.getByRole("dialog").waitFor();
    s.minimum *= 2n;
    await page.getByRole("button", { name: "Confirm post in wallet" }).click();
    await page.getByText(/The minimum burn increased/).waitFor();
    assert.equal(s.writes.length, 0);
    assert.equal(
      await page.getByLabel("Exact amount to burn").inputValue(),
      "1000",
    );
    await context.close();
  });
  await test("Owner setup validates address, requires acknowledgement, and sets token once", async () => {
    const s = state();
    const { page, context } = await fixture(browser, s, { owner: true });
    await connect(page);
    await page.getByLabel("Project token contract address").fill(token);
    assert(
      await page
        .getByRole("button", { name: "Review token connection" })
        .isDisabled(),
    );
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Review token connection" }).click();
    await page
      .getByRole("dialog", { name: "Connect this token permanently?" })
      .waitFor();
    await page
      .getByRole("button", { name: "Connect token permanently" })
      .click();
    await page
      .getByText("Token setting confirmed. Paid posting is now permanent.")
      .waitFor();
    assert(s.paid);
    assert.equal(
      decodeFunctionData({ abi, data: s.writes[0].data }).functionName,
      "setToken",
    );
    assert.equal(
      await page.getByLabel("Project token contract address").count(),
      0,
    );
    await context.close();
  });
  await test("Phone wallet links retain subpath; Coinbase Smart Wallet; no relay", async () => {
    const { page, context } = await fixture(browser, state(), {
      mobile: true,
      noWallet: true,
    });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      assert.equal(
        await page
          .getByRole("link", { name: "Open in " + name, exact: true })
          .count(),
        1,
      );
    assert.equal(
      await page
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page.getByText("WalletConnect", { exact: true }).count(),
      0,
    );
    await page.screenshot({
      path: resolve(evidence, "screenshots/mobile-wallets.png"),
    });
    await context.close();
  });
  await test("50 message history; long balances and Unicode; no HTML injection; no horizontal overflow", async () => {
    const s = state({
      paid: true,
      count: 70n,
      total: 10n ** 77n,
      balance: 10n ** 77n,
    });
    s.history = Array.from({ length: 50 }, (_, i) => ({
      author: visitor,
      text:
        i === 49
          ? "<img src=x onerror=alert(1)> " + "W".repeat(110)
          : `Historical message ${i}`,
      burned: 1000n * 10n ** 18n,
      timestamp: s.timestamp - BigInt(1000 - i),
    }));
    s.current = s.history[49];
    const { page, context } = await fixture(browser, s);
    await connect(page);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow at ${width}`,
      );
    }
    assert.equal(await page.locator(".history-list li").count(), 50);
    assert.equal(await page.locator(".message img").count(), 0);
    await context.close();
  });
  await test("Read failure retains state, disables posting, and recovers on refresh", async () => {
    const s = state();
    const { page, context } = await fixture(browser, s);
    await connect(page);
    await page
      .getByLabel("Your message", { exact: true })
      .fill("Hold until fresh.");
    s.offline = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText(/Live reads failed/).waitFor({ timeout: 35000 });
    assert(
      await page
        .getByRole("button", { name: "Post a message", exact: true })
        .isDisabled(),
    );
    s.offline = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("On the billboard", { exact: true }).waitFor();
    assert(
      await page
        .getByRole("button", { name: "Post a message", exact: true })
        .isEnabled(),
    );
    await context.close();
  });
  await test("No browser wallet gives an actionable error; connection rejection can retry", async () => {
    const absent = await fixture(browser, state(), { noWallet: true });
    await absent.page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await absent.page
      .getByRole("button", { name: "Browser wallet", exact: true })
      .click();
    await absent.page.getByText(/No browser wallet was found/).waitFor();
    await absent.context.close();
    const { page, context } = await fixture(browser, state(), {
      rejectConnect: true,
    });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Test Browser Wallet", exact: true })
      .click();
    await page.getByText(/Request declined in your wallet/).waitFor();
    await page.evaluate(() => (window.__wallet.rejectConnect = false));
    await page
      .getByRole("button", { name: "Test Browser Wallet", exact: true })
      .click();
    await page.getByRole("button", { name: /0x1234/ }).waitFor();
    await context.close();
  });
  await test("Pending transaction survives reload and blocks another submission until status check", async () => {
    const s = state();
    const { page, context } = await fixture(browser, s);
    await page.evaluate(
      ({ key, hash }) =>
        sessionStorage.setItem(key, JSON.stringify({ hash, kind: "post" })),
      { key: `lastword:pending:${manifest.launchId}`, hash: txHash },
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Check transaction status" })
      .waitFor();
    assert(await page.locator("button[type=submit]").isDisabled());
    await page
      .getByRole("button", { name: "Check transaction status" })
      .click();
    await page
      .getByText("Transaction confirmed. The billboard has been refreshed.")
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Check transaction status" })
        .count(),
      0,
    );
    await context.close();
  });
  await test("ABI tampering fails closed before wallet or transaction controls load", async () => {
    const { page, context } = await fixture(browser, state(), { tamper: true });
    await page
      .getByText(
        "Contract interface verification failed. Posting is unavailable.",
      )
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Connect wallet" }).count(),
      0,
    );
    await context.close();
  });
  await test("Text enlargement, RTL layout, reduced motion, and modal focus trap", async () => {
    const { page, context } = await fixture(browser, state());
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "32px"),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "16px";
      document.documentElement.dir = "rtl";
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      assert(
        await page.evaluate(() => !!document.activeElement.closest("dialog")),
      );
    }
    await context.close();
  });
  assert.deepEqual(browserErrors, []);
  await browser.close();
  browser = null;
  try {
    browser = await webkit.launch({ headless: true });
    await test("WebKit free-post interaction and 390px reflow", async () => {
      const s = state();
      const { page, context } = await fixture(browser, s);
      await connect(page);
      await page
        .getByLabel("Your message", { exact: true })
        .fill("A word from WebKit.");
      await page
        .getByRole("button", { name: "Post a message", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm post in wallet" })
        .click();
      await page
        .getByText("Transaction confirmed. The billboard has been refreshed.")
        .waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await context.close();
    });
  } catch (e) {
    if (
      results.at(-1)?.name ===
        "WebKit free-post interaction and 390px reflow" &&
      !results.at(-1).passed
    )
      throw e;
    results.push({
      name: "WebKit runtime",
      passed: null,
      limitation: e.message.slice(0, 1600),
    });
    console.log("WebKit unavailable: " + e.message.slice(0, 160));
  }
} catch (e) {
  process.exitCode = 1;
  console.error(e.stack);
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  const report = {
    scope:
      "Worker-run production-export tests using intercepted public RPC and synthetic EIP-6963 wallet. No real transactions.",
    date: new Date().toISOString(),
    results,
    browserErrors,
    rpcMethods: [...new Set(requests)].sort(),
  };
  await writeFile(
    resolve(evidence, "interaction-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
