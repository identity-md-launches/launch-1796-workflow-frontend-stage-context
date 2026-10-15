import {
  erc20Abi,
  zeroAddress,
  type Address,
  type Abi,
  type PublicClient,
} from "viem";
import type { Runtime } from "./config";
export interface Message {
  author: Address;
  text: string;
  burned: bigint;
  timestamp: bigint;
}
export interface Snapshot {
  block: bigint;
  timestamp: bigint;
  owner: Address;
  token: Address;
  decimals: number;
  minimum: bigint | null;
  minimumError?: string;
  current: Message;
  history: Message[];
  count: bigint;
  total: bigint;
  nextFree: bigint;
  balance: bigint;
  allowance: bigint;
  symbol: string;
  base: bigint;
}
export async function verifyChain(
  runtime: Runtime,
  client: PublicClient = runtime.client,
) {
  const [chainId, code] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: runtime.contract.address }),
  ]);
  if (chainId !== runtime.deployment.chainId)
    throw new Error("The RPC is on the wrong network. Posting is unavailable.");
  if (!code || code === "0x")
    throw new Error(
      "The deployed contract could not be verified. Posting is unavailable.",
    );
}
export async function readSnapshot(
  runtime: Runtime,
  account?: Address,
  client: PublicClient = runtime.client,
): Promise<Snapshot> {
  await verifyChain(runtime, client);
  const block = await client.getBlock();
  const read = (functionName: string, args?: readonly unknown[]) =>
    client.readContract({
      address: runtime.contract.address,
      abi: runtime.abi,
      functionName,
      args,
      blockNumber: block.number,
    });
  const [
    owner,
    token,
    decimals,
    current,
    history,
    count,
    total,
    base,
    nextFree,
  ] = await Promise.all([
    read("owner"),
    read("token"),
    read("tokenDecimals"),
    read("currentMessage"),
    read("getRecentMessages"),
    read("messageCount"),
    read("totalBurned"),
    read("baseMinimumBurn"),
    account ? read("nextFreePostAt", [account]) : 0n,
  ]);
  let minimum: bigint | null = null,
    minimumError: string | undefined;
  try {
    minimum = (await read("minimumBurn")) as bigint;
  } catch {
    minimumError =
      "Minimum burn is unavailable. Wait for the reset or refresh to retry.";
  }
  let balance = 0n,
    allowance = 0n,
    symbol = "tokens";
  if (token !== zeroAddress) {
    const tokenRead = (functionName: string, args?: readonly unknown[]) =>
      client.readContract({
        address: token as Address,
        abi: erc20Abi as Abi,
        functionName,
        args,
        blockNumber: block.number,
      });
    const [b, a, s] = await Promise.all([
      account ? tokenRead("balanceOf", [account]) : 0n,
      account
        ? tokenRead("allowance", [account, runtime.contract.address])
        : 0n,
      tokenRead("symbol").catch(() => "tokens"),
    ]);
    balance = b as bigint;
    allowance = a as bigint;
    symbol = typeof s === "string" && s.length ? s : "tokens";
  }
  return {
    block: block.number,
    timestamp: block.timestamp,
    owner: owner as Address,
    token: token as Address,
    decimals: Number(decimals),
    current: current as Message,
    history: history as Message[],
    count: count as bigint,
    total: total as bigint,
    base: base as bigint,
    nextFree: nextFree as bigint,
    minimum,
    minimumError,
    balance,
    allowance,
    symbol,
  };
}
