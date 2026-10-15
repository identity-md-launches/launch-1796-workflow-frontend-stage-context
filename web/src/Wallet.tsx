import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { getAddress, type EIP1193Provider } from "viem";
import type { Runtime } from "./config";
import { explainError, short } from "./domain";

export function Modal({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    const trigger = document.activeElement;
    d.showModal();
    return () => {
      d.close();
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onCancel={close}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const targets = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = targets[0],
          last = targets[targets.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={close}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export const openIn = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export async function switchNetwork(
  provider: EIP1193Provider,
  runtime: Runtime,
) {
  const chainId = `0x${runtime.chain.id.toString(16)}` as `0x${string}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      cause?: { code?: number };
    };
    if (
      e.code !== 4902 &&
      e.cause?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added/i.test(e.message ?? "")
    )
      throw error;
    if (!runtime.deployment.walletAddChain)
      throw new Error(
        "Add this network in your wallet, then try switching again.",
      );
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [runtime.deployment.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}
export function Wallet({
  runtime,
  open,
  onOpen,
  onClose,
}: {
  runtime: Runtime;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState(""),
    [switching, setSwitching] = useState(false);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !named &&
    !("ethereum" in window);
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  const changeChain = async (c = connector) => {
    if (!c) return;
    setSwitching(true);
    setError("");
    try {
      await switchNetwork((await c.getProvider()) as EIP1193Provider, runtime);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setSwitching(false);
    }
  };
  const connect = async (c: Connector) => {
    setError("");
    try {
      const result = await connectAsync({ connector: c });
      onClose();
      if (result.chainId !== runtime.chain.id) await changeChain(c);
    } catch (e) {
      setError(explainError(e));
    }
  };
  const wrong = isConnected && chainId !== runtime.chain.id;
  return (
    <div className="wallet-control">
      <button
        className="wallet-button"
        disabled={switching}
        onClick={() => {
          setError("");
          wrong ? void changeChain() : onOpen();
        }}
      >
        {switching
          ? "Switching…"
          : wrong
            ? `Switch to ${runtime.chain.name}`
            : address
              ? short(getAddress(address))
              : "Connect wallet"}
        <span aria-hidden="true"> ↗</span>
      </button>
      {!open && error && (
        <p className="wallet-error error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <Modal
          title={isConnected ? "Connected wallet" : "Connect a wallet"}
          close={onClose}
          className="wallet-dialog"
        >
          {isConnected && address ? (
            <>
              <p className="break-value">{getAddress(address)}</p>
              <a
                className="row-link"
                href={`${runtime.deployment.network.explorer}/address/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                View wallet on explorer ↗
              </a>
              <button
                className="row-link"
                onClick={() => {
                  disconnect();
                  onClose();
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              {mobile &&
                openIn.map((w) => (
                  <a
                    key={w.id}
                    className="row-link"
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    Open in {w.name}
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="row-link"
                  key={c.uid}
                  disabled={isPending}
                  onClick={() => void connect(c)}
                >
                  <img
                    alt=""
                    width="28"
                    height="28"
                    src={
                      c.icon ??
                      (c.id === "coinbaseWalletSDK"
                        ? "./wallets/coinbase.svg"
                        : "./wallets/browser.svg")
                    }
                  />
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK"
                        ? mobile
                          ? "Coinbase Smart Wallet"
                          : "Coinbase Wallet"
                        : c.name}
                    {isPending && variables?.connector === c
                      ? " · opening…"
                      : ""}
                  </span>
                </button>
              ))}
              {!named && !mobile && (
                <p className="muted small">
                  Use a browser wallet extension, or create a passkey wallet
                  with Coinbase.
                </p>
              )}
            </>
          )}
          <p className="error" role="alert">
            {error}
          </p>
        </Modal>
      )}
    </div>
  );
}
