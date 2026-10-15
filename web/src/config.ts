import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import {
  createPublicClient,
  defineChain,
  fallback,
  getAddress,
  isAddress,
  keccak256,
  toBytes,
  type Abi,
  type Address,
} from "viem";

export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
  };
  walletAddChain?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export async function loadDeployment() {
  const base = new URL("./", location.href);
  const response = await fetch(new URL("imd-deployment.json", base), {
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error(
      "The deployment configuration could not be loaded. Reload to try again.",
    );
  const deployment: Deployment = await response.json();
  if (
    deployment.version !== 1 ||
    !deployment.network ||
    deployment.chainId !== deployment.network.chainId ||
    deployment.contracts.length !== 1
  )
    throw new Error(
      "The deployment configuration is invalid. Posting is unavailable.",
    );
  const contract = deployment.contracts.find((c) => c.name === "LastWord");
  if (
    !contract ||
    !isAddress(contract.address) ||
    !/^abi\/[A-Za-z0-9_-]+\.json$/.test(contract.abiPath)
  )
    throw new Error("The LastWord deployment is invalid.");
  const abiResponse = await fetch(new URL(contract.abiPath, base));
  if (!abiResponse.ok)
    throw new Error(
      "The contract interface could not be loaded. Reload to try again.",
    );
  const abi: Abi = await abiResponse.json();
  if (
    !Array.isArray(abi) ||
    keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2) !==
      contract.abiHash
  )
    throw new Error(
      "Contract interface verification failed. Posting is unavailable.",
    );
  const n = deployment.network;
  if (!n.rpcUrls.length || n.rpcUrls.some((url) => !url.startsWith("https://")))
    throw new Error("Public RPC configuration is invalid.");
  const chain = defineChain({
    id: deployment.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: n.explorer } },
    testnet: n.testnet,
  });
  const transport = fallback(
    n.rpcUrls.map((url) => http(url, { timeout: 10000, retryCount: 1 })),
    { rank: false },
  );
  const client = createPublicClient({
    chain,
    transport,
    batch: { multicall: false },
  });
  const walletConfig = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "LastWord",
        appLogoUrl: new URL("favicon.svg", base).href,
        preference: { options: "all" },
      }),
    ],
    transports: { [chain.id]: transport },
  });
  return {
    deployment,
    contract: { ...contract, address: getAddress(contract.address) },
    abi,
    chain,
    client,
    walletConfig,
  };
}
export type Runtime = Awaited<ReturnType<typeof loadDeployment>>;
