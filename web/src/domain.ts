import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  parseUnits,
  maxUint256,
} from "viem";
export function textProblem(text: string): string | undefined {
  const count = Array.from(text).length;
  if (count === 0) return "Write a message first.";
  if (count > 140) return "Keep your message to 140 characters.";
  for (const point of text) {
    const n = point.codePointAt(0)!;
    if (n >= 0xd800 && n <= 0xdfff)
      return "Remove the incomplete Unicode character.";
  }
}
export function parseAmount(
  value: string,
  decimals: number,
): bigint | undefined {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) return;
  if ((value.split(".")[1]?.length ?? 0) > decimals) return;
  try {
    const n = parseUnits(value, decimals);
    return n > 0n && n <= maxUint256 ? n : undefined;
  } catch {
    return;
  }
}
export const units = (value: bigint, decimals: number) =>
  formatUnits(value, decimals);
export const short = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export function duration(seconds: bigint) {
  if (seconds < 0n) return "0s";
  if (seconds < 60n) return `${seconds}s`;
  if (seconds < 3600n) return `${seconds / 60n}m ${seconds % 60n}s`;
  if (seconds < 86400n)
    return `${seconds / 3600n}h ${(seconds % 3600n) / 60n}m`;
  return `${seconds / 86400n}d ${(seconds % 86400n) / 3600n}h`;
}
const errors: Record<string, string> = {
  InvalidMessageLength: "Write between 1 and 140 Unicode characters.",
  InvalidUtf8: "Remove the invalid Unicode character and try again.",
  FreePostRequiresZeroBurn:
    "Posting mode changed. Refresh the billboard and review your post.",
  CooldownActive:
    "Your free-post cooldown is still active. Wait for the countdown to finish.",
  BurnTooSmall:
    "The minimum burn increased. Refresh and choose an amount again.",
  BurnAmountMismatch:
    "This token did not transfer the exact amount. The post was reverted.",
  MinimumBurnOverflow:
    "The next burn exceeds the token limit. Posting resumes after the 24-hour reset.",
  Unauthorized: "Only the connected owner can set the token.",
  TokenAlreadySet:
    "The token has already been connected. Refresh the billboard.",
  InvalidToken: "Use a nonzero, deployed token contract address.",
  InvalidTokenDecimals: "This token has missing or unsupported decimals.",
  SafeERC20FailedOperation:
    "The token refused the transfer. Check its restrictions and your allowance.",
};
export function explainError(error: unknown): string {
  const err = error as { code?: number; message?: string; cause?: unknown };
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 8; depth++) {
    const detail = cause as { name?: string; code?: number; cause?: unknown };
    if (detail.name === "ProviderNotFoundError")
      return "No browser wallet was found. Install a wallet extension or choose Coinbase Wallet.";
    if (detail.code === 4001)
      return "Request declined in your wallet. Nothing was submitted; you can try again.";
    cause = detail.cause;
  }
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (reverted?.data?.errorName && errors[reverted.data.errorName])
      return errors[reverted.data.errorName];
  }
  const message =
    error instanceof BaseError ? error.shortMessage : (err?.message ?? "");
  if (/insufficient funds/i.test(message))
    return "Not enough ETH for the network fee. Add ETH and try again.";
  if (/timeout|timed out/i.test(message))
    return "The network did not respond in time. Check any submitted transaction in the explorer before retrying.";
  if (
    error instanceof Error &&
    !(error instanceof BaseError) &&
    error.message.length < 240
  )
    return error.message;
  return "The request could not complete. Check your network, refresh the state, and try again.";
}
