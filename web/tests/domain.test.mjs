import { test } from "node:test";
import assert from "node:assert/strict";
import { textProblem, parseAmount, duration } from "../src/domain.ts";
import { abiHash } from "../scripts/integrity.mjs";
import { readFileSync } from "node:fs";
test("Unicode scalar values, not UTF-16 units; reject incomplete surrogates", () => {
  assert.equal(textProblem("😀".repeat(140)), undefined);
  assert.match(textProblem("😀".repeat(141)), /140/);
  assert.match(textProblem(""), /first/);
  assert.match(textProblem("\ud800"), /Unicode/);
  assert.equal(textProblem("<script>alert(1)</script>"), undefined);
});
test("Exact decimal input rejects rounding, negatives, scientific notation, and overflow", () => {
  assert.equal(parseAmount("1000.000001", 6), 1000000001n);
  assert.equal(parseAmount("1000.0000001", 6), undefined);
  assert.equal(parseAmount("1e3", 18), undefined);
  assert.equal(parseAmount("-1", 18), undefined);
  assert.equal(parseAmount("0", 18), undefined);
  assert.equal(parseAmount("1.0", 0), undefined);
  assert.equal(parseAmount("1000", 74), 1000n * 10n ** 74n);
  assert.equal(parseAmount("9".repeat(79), 0), undefined);
});
test("Countdown boundaries", () => {
  assert.equal(duration(-1n), "0s");
  assert.equal(duration(59n), "59s");
  assert.equal(duration(600n), "10m 0s");
  assert.equal(duration(86400n), "1d 0h");
});
test("Pinned implementation ABI canonical hash", () => {
  const template = JSON.parse(
    readFileSync(new URL("../deployment.template.json", import.meta.url)),
  );
  const abi = JSON.parse(
    readFileSync(new URL("../../docs/abi/LastWord.json", import.meta.url)),
  );
  assert.equal(abiHash(abi), template.contracts[0].abiHash);
});

test("Custom revert errors beat words in untrusted transaction arguments", async () => {
  const {
    ContractFunctionExecutionError,
    ContractFunctionRevertedError,
    encodeErrorResult,
  } = await import("viem");
  const { explainError } = await import("../src/domain.ts");
  const abi = JSON.parse(
    readFileSync(new URL("../../docs/abi/LastWord.json", import.meta.url)),
  );
  const revert = new ContractFunctionRevertedError({
    abi,
    data: encodeErrorResult({
      abi,
      errorName: "BurnTooSmall",
      args: [100n, 0n],
    }),
    functionName: "setMessage",
  });
  const error = new ContractFunctionExecutionError(revert, {
    abi,
    functionName: "setMessage",
    args: ["A rejected simulation.", 0n],
  });
  assert.match(explainError(error), /minimum burn increased/);
  assert.match(
    explainError({ code: 4001, message: "denied" }),
    /Request declined/,
  );
});
