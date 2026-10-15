import { useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  erc20Abi,
  formatEther,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hash,
  type Abi,
  type EIP1193Provider,
} from "viem";
import type { Runtime } from "./config";
import { readSnapshot, type Snapshot } from "./chain";
import {
  duration,
  explainError,
  parseAmount,
  short,
  textProblem,
  units,
} from "./domain";
import { Wallet, Modal } from "./Wallet";

type Kind = "post" | "approval" | "setup";
type Review = {
  kind: Kind;
  account: Address;
  amount: bigint;
  token: Address;
  text: string;
  fee: bigint;
  tokenLabel: string;
  reset: boolean;
};
function AddressLink({
  address,
  runtime,
  full = false,
}: {
  address: Address;
  runtime: Runtime;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const checksum = getAddress(address);
  return (
    <span className="address-group">
      <a
        className="address"
        href={`${runtime.deployment.network.explorer}/address/${checksum}`}
        target="_blank"
        rel="noreferrer"
        title={checksum}
      >
        {full ? checksum : short(checksum)}
      </a>
      <button
        type="button"
        className="copy-button"
        aria-label={`Copy ${checksum}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(checksum);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
export function App({ runtime }: { runtime: Runtime }) {
  const { address, chainId, isConnected, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [walletOpen, setWalletOpen] = useState(false);
  const [text, setText] = useState(""),
    [burn, setBurn] = useState(""),
    [newToken, setNewToken] = useState("");
  const [ack, setAck] = useState(false),
    [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null),
    [phase, setPhase] = useState("");
  const [errors, setErrors] = useState<Record<Kind, string>>({
    post: "",
    approval: "",
    setup: "",
  });
  const pendingKey = `lastword:pending:${runtime.deployment.launchId}`;
  const [savedPending] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
      return /^0x[0-9a-f]{64}$/i.test(value?.hash ?? "")
        ? (value as { hash: Hash; kind: Kind })
        : null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState(
      savedPending
        ? "A submitted transaction needs a status check before another action."
        : "",
    ),
    [hash, setHash] = useState<Hash | undefined>(savedPending?.hash),
    [unsettled, setUnsettled] = useState(!!savedPending);
  const rememberPending = (hash?: Hash, kind?: Kind) => {
    try {
      if (hash)
        sessionStorage.setItem(pendingKey, JSON.stringify({ hash, kind }));
      else sessionStorage.removeItem(pendingKey);
    } catch {
      /* Storage can be disabled; keep the in-memory transaction lock. */
    }
  };
  const [tick, setTick] = useState(0);
  const lock = useRef(false);
  const query = useQuery({
    queryKey: ["billboard", runtime.contract.address, address],
    queryFn: () => readSnapshot(runtime, address),
    refetchInterval: isConnected ? 5000 : 12000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const s = query.data;
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setReview(null);
    setErrors({ post: "", approval: "", setup: "" });
    setBurn("");
    setAck(false);
  }, [address, chainId, s?.token]);
  const wrong = isConnected && chainId !== runtime.chain.id;
  const healthy =
    !!s && !query.isError && Date.now() - query.dataUpdatedAt < 30000;
  const paid = !!s && s.token !== zeroAddress;
  const amount = paid && s ? parseAmount(burn, s.decimals) : 0n;
  const textError = textProblem(text);
  const cooldown =
    s && !paid && address && s.nextFree > s.timestamp
      ? s.nextFree - s.timestamp
      : 0n;
  const needsApproval =
    paid && s && amount !== undefined && s.allowance < amount;
  const reset = !!needsApproval && s.allowance > 0n;
  const amountError =
    paid && s
      ? amount === undefined
        ? "Enter an exact token amount."
        : s.minimum === null
          ? s.minimumError
          : amount < s.minimum
            ? "Your amount is below the current minimum."
            : address && amount > s.balance
              ? "Your token balance is too low."
              : ""
      : "";
  const disabled =
    !!busy ||
    unsettled ||
    !healthy ||
    !isConnected ||
    wrong ||
    !!textError ||
    !!amountError ||
    cooldown > 0n;
  const owner =
    !!address && !!s && address.toLowerCase() === s.owner.toLowerCase();
  const clearError = (kind: Kind) => setErrors((v) => ({ ...v, [kind]: "" }));
  const fail = (kind: Kind, e: unknown) =>
    setErrors((v) => ({ ...v, [kind]: explainError(e) }));
  const requestFor = (r: Review) =>
    r.kind === "approval"
      ? {
          address: r.token,
          abi: erc20Abi as Abi,
          functionName: "approve",
          args: [runtime.contract.address, r.amount],
        }
      : {
          address: runtime.contract.address,
          abi: runtime.abi,
          functionName: r.kind === "setup" ? "setToken" : "setMessage",
          args: r.kind === "setup" ? [r.token] : [r.text, r.amount],
        };
  async function activeAccount(expected: Address) {
    if (!connector) throw new Error("Connect your wallet to continue.");
    const provider = (await connector.getProvider()) as EIP1193Provider;
    const [accounts, currentChain] = await Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ]);
    if (Number(currentChain) !== runtime.chain.id)
      throw new Error(`Switch your wallet to ${runtime.chain.name}.`);
    if (!accounts[0] || accounts[0].toLowerCase() !== expected.toLowerCase())
      throw new Error("The wallet account changed. Review the action again.");
  }
  function validate(r: Review, fresh: Snapshot) {
    if (r.kind === "setup") {
      if (
        fresh.owner.toLowerCase() !== r.account.toLowerCase() ||
        fresh.token !== zeroAddress
      )
        throw new Error(
          "The token can only be connected once by the owner. Refresh the page.",
        );
    } else {
      if (fresh.token !== r.token)
        throw new Error("Posting mode changed. Review the form again.");
      if (r.kind === "post") {
        const issue = textProblem(r.text);
        if (issue) throw new Error(issue);
        if (fresh.token === zeroAddress) {
          if (fresh.nextFree > fresh.timestamp)
            throw new Error(
              "Your free-post cooldown is active. Wait for the countdown.",
            );
        } else {
          if (fresh.minimum === null) throw new Error(fresh.minimumError);
          if (r.amount < fresh.minimum)
            throw new Error(
              "The minimum burn increased. Choose an amount again.",
            );
          if (fresh.balance < r.amount)
            throw new Error(
              "Your token balance is too low. Choose an amount you can afford.",
            );
          if (fresh.allowance < r.amount)
            throw new Error("Approve the exact burn amount before posting.");
        }
      } else if (
        !r.reset &&
        (fresh.minimum === null || r.amount < fresh.minimum)
      )
        throw new Error("The minimum burn changed. Choose an amount again.");
    }
  }
  async function prepare(kind: Kind) {
    if (lock.current || !address || wrong || !healthy || unsettled) return;
    lock.current = true;
    setBusy(kind);
    setPhase("Checking…");
    clearError(kind);
    setStatus("");
    try {
      await activeAccount(address);
      const fresh = await readSnapshot(runtime, address);
      let chosenToken = fresh.token,
        chosenAmount = amount ?? 0n,
        tokenLabel = fresh.symbol;
      if (kind === "setup") {
        if (!ack)
          throw new Error("Confirm that this permanent setting is correct.");
        if (
          !isAddress(newToken.trim()) ||
          newToken.trim().toLowerCase() === zeroAddress
        )
          throw new Error(
            "Enter the verified project token address on this network.",
          );
        chosenToken = getAddress(newToken.trim());
        const code = await runtime.client.getCode({ address: chosenToken });
        if (!code || code === "0x")
          throw new Error("No token contract was found at this address.");
        const decimals = await runtime.client.readContract({
          address: chosenToken,
          abi: erc20Abi,
          functionName: "decimals",
        });
        if (decimals > 74)
          throw new Error("This token has unsupported decimals.");
        tokenLabel = await runtime.client
          .readContract({
            address: chosenToken,
            abi: erc20Abi,
            functionName: "symbol",
          })
          .catch(() => "tokens");
      }
      const clearing =
        kind === "approval" &&
        fresh.allowance > 0n &&
        fresh.allowance < chosenAmount;
      if (kind === "approval" && fresh.allowance >= chosenAmount) {
        await query.refetch();
        setStatus("Approval is already sufficient. Review your post.");
        return;
      }
      if (clearing) chosenAmount = 0n;
      const r: Review = {
        kind,
        account: address,
        amount: chosenAmount,
        token: chosenToken,
        text,
        fee: 0n,
        tokenLabel,
        reset: clearing,
      };
      validate(r, fresh);
      const request = { ...requestFor(r), account: address };
      await runtime.client.simulateContract(request);
      const [gas, gasPrice] = await Promise.all([
        runtime.client.estimateContractGas(request),
        runtime.client.getGasPrice(),
      ]);
      r.fee = gas * gasPrice;
      await activeAccount(address);
      setReview(r);
    } catch (e) {
      fail(kind, e);
      void query.refetch();
    } finally {
      lock.current = false;
      setBusy(null);
      setPhase("");
    }
  }
  async function confirmed(tx: Hash, kind: Kind) {
    let replaced = false;
    const receipt = await runtime.client.waitForTransactionReceipt({
      hash: tx,
      confirmations: 1,
      timeout: 120000,
      onReplaced: ({ transaction, reason }) => {
        setHash(transaction.hash);
        rememberPending(transaction.hash, kind);
        replaced = reason !== "repriced";
      },
    });
    setUnsettled(false);
    rememberPending();
    if (replaced) {
      await query.refetch();
      throw new Error(
        "The wallet cancelled or replaced this transaction. Check the explorer and review the current state before retrying.",
      );
    }
    if (receipt.status !== "success")
      throw new Error(
        "The transaction reverted. Refresh the state and review the action again. Network fees may still apply.",
      );
    await query.refetch();
    setStatus(
      kind === "post"
        ? "Transaction confirmed. The billboard has been refreshed."
        : kind === "approval"
          ? "Approval confirmed. Review the current minimum before posting."
          : "Token setting confirmed. Paid posting is now permanent.",
    );
    if (kind === "post") setText("");
    if (kind === "setup") {
      setNewToken("");
      setAck(false);
    }
  }
  async function send() {
    if (!review || !walletClient || lock.current) return;
    const r = review;
    lock.current = true;
    setBusy(r.kind);
    setPhase("Check your wallet…");
    clearError(r.kind);
    setReview(null);
    setHash(undefined);
    try {
      await activeAccount(r.account);
      const fresh = await readSnapshot(runtime, r.account);
      validate(r, fresh);
      const { request } = await runtime.client.simulateContract({
        ...requestFor(r),
        account: r.account,
      });
      await activeAccount(r.account);
      const tx = await walletClient.writeContract({
        ...request,
        chain: runtime.chain,
        account: r.account,
      });
      setHash(tx);
      rememberPending(tx, r.kind);
      setUnsettled(true);
      setPhase("Confirming…");
      await confirmed(tx, r.kind);
    } catch (e) {
      fail(r.kind, e);
    } finally {
      lock.current = false;
      setBusy(null);
      setPhase("");
    }
  }
  async function recheckReceipt() {
    if (!hash || lock.current) return;
    lock.current = true;
    setBusy("post");
    setPhase("Checking transaction…");
    try {
      const receipt = await runtime.client.getTransactionReceipt({ hash });
      setUnsettled(false);
      rememberPending();
      await query.refetch();
      setStatus(
        receipt.status === "success"
          ? "Transaction confirmed. The billboard has been refreshed."
          : "Transaction reverted. Review the current state before retrying.",
      );
      setErrors({ post: "", approval: "", setup: "" });
    } catch {
      setStatus(
        "This transaction is still pending or unavailable. Check the explorer before trying again.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
      setPhase("");
    }
  }
  // The observed chain timestamp drives eligibility. Only the display age interpolates locally.
  const displayNow = s
    ? s.timestamp +
      BigInt(
        Math.min(30, Math.floor((Date.now() - query.dataUpdatedAt) / 1000)),
      )
    : 0n;
  void tick;
  const authorDate = s?.current.timestamp
    ? new Date(Number(s.current.timestamp) * 1000).toLocaleString()
    : "";
  const primaryLabel = !isConnected
    ? "Connect in the header to post"
    : wrong
      ? `Switch to ${runtime.chain.name} above`
      : busy === "post" || busy === "approval"
        ? phase
        : cooldown > 0n
          ? `Post again in ${duration(cooldown)}`
          : needsApproval
            ? reset
              ? "Reset approval"
              : `Approve ${s?.symbol}`
            : paid
              ? "Review & post"
              : "Post a message";
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to billboard
      </a>
      <header className="site-header">
        <a className="brand" href="#main" aria-label="LastWord home">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M8 7v49h45V44H22V7Z" fill="currentColor" />
            <circle cx="48" cy="14" r="8" fill="currentColor" />
          </svg>
          LastWord<span className="brand-dot">.</span>
        </a>
        <Wallet
          runtime={runtime}
          open={walletOpen}
          onOpen={() => setWalletOpen(true)}
          onClose={() => setWalletOpen(false)}
        />
      </header>
      <main id="main" className="page">
        <div className="intro">
          <p>One public billboard on {runtime.chain.name}.</p>
          <a href="#history">
            Read the last 50 <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="main-grid">
          <section className="billboard" aria-label="Current billboard message">
            <div className="board-top">
              <span className="live-indicator">
                <span
                  aria-hidden="true"
                  className={`dot ${healthy ? "" : "paused"}`}
                />
                {healthy
                  ? "On the billboard"
                  : query.isError
                    ? "Connection interrupted"
                    : "Reading the billboard"}
              </span>
              <span className="number">
                {s ? `No. ${s.count.toLocaleString()}` : "…"}
              </span>
            </div>
            <div className="message-wrap">
              <h1
                dir="auto"
                className={`message ${s?.count ? "" : "empty-message"}`}
              >
                {s
                  ? s.count
                    ? s.current.text
                    : "The word is yours."
                  : query.isError
                    ? "The billboard is out of reach."
                    : "Every word has its moment."}
              </h1>
            </div>
            <div className="board-bottom">
              {s?.count ? (
                <>
                  <span>
                    By{" "}
                    <AddressLink address={s.current.author} runtime={runtime} />
                  </span>
                  <span title={authorDate}>
                    Standing for{" "}
                    <b className="number">
                      {duration(displayNow - s.current.timestamp)}
                    </b>
                  </span>
                </>
              ) : (
                <p>
                  {s
                    ? "Leave the first message."
                    : "Live messages will appear here."}
                </p>
              )}
            </div>
          </section>
          <section className="composer" aria-labelledby="post-heading">
            <div className="section-heading">
              <h2 id="post-heading">Have the last word</h2>
              <span aria-hidden="true">↗</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!disabled)
                  void prepare(needsApproval ? "approval" : "post");
              }}
            >
              <label htmlFor="message">Your message</label>
              <textarea
                id="message"
                name="message"
                rows={3}
                value={text}
                placeholder="What would you leave here?"
                aria-describedby="character-count message-help"
                aria-invalid={Array.from(text).length > 140 || undefined}
                onChange={(e) => setText(e.target.value)}
                disabled={!!busy}
              />
              <div className="field-foot">
                <span id="message-help">Public. Stored on Ethereum.</span>
                <span
                  id="character-count"
                  className={`number ${Array.from(text).length > 140 ? "error" : ""}`}
                >
                  {Array.from(text).length} / 140
                </span>
              </div>
              {paid && s ? (
                <div className="paid-fields">
                  <div className="minimum">
                    <span>Minimum burn</span>
                    <strong className="break-value">
                      {s.minimum === null
                        ? "Unavailable"
                        : `${units(s.minimum, s.decimals)} ${s.symbol}`}
                    </strong>
                  </div>
                  <label htmlFor="burn">Exact amount to burn</label>
                  <div className="amount-field">
                    <input
                      id="burn"
                      name="burn"
                      inputMode="decimal"
                      autoComplete="off"
                      value={burn}
                      placeholder={
                        s.minimum !== null ? units(s.minimum, s.decimals) : ""
                      }
                      aria-describedby="burn-help"
                      aria-invalid={!!burn && !!amountError}
                      onChange={(e) => setBurn(e.target.value)}
                      disabled={!!busy}
                    />
                    <button
                      type="button"
                      disabled={s.minimum === null || !!busy}
                      onClick={() => setBurn(units(s.minimum!, s.decimals))}
                    >
                      Use minimum
                    </button>
                  </div>
                  <p id="burn-help" className="small muted break-value">
                    Balance:{" "}
                    {address
                      ? `${units(s.balance, s.decimals)} ${s.symbol}`
                      : "Connect to read"}
                    . {burn && amountError}
                  </p>
                  <p className="small">
                    This exact amount is permanently sent to the burn address. A
                    newer post can raise the minimum; a 24-hour pause resets it
                    to {units(s.base, s.decimals)} {s.symbol}.
                  </p>
                  <p className="small muted">
                    USD value unavailable. Network fees are paid in ETH.
                  </p>
                  <div className="steps" aria-label="Posting steps">
                    <span className={needsApproval ? "current-step" : ""}>
                      1. Approve{!needsApproval && amount ? " ✓" : ""}
                    </span>
                    <span>→</span>
                    <span className={!needsApproval ? "current-step" : ""}>
                      2. Post
                    </span>
                  </div>
                  {reset && (
                    <p className="small">
                      Clear the existing allowance first, then approve this
                      exact amount.
                    </p>
                  )}
                </div>
              ) : (
                <div className="free-info">
                  <strong>
                    {s ? "Posting is free" : "Checking posting mode…"}
                  </strong>
                  <p className="small muted">
                    {s
                      ? "Once per wallet, every 10 minutes. Gas still applies."
                      : "Waiting for verified contract state."}
                  </p>
                </div>
              )}
              <button type="submit" className="primary" disabled={disabled}>
                {primaryLabel}
                <span aria-hidden="true">↗</span>
              </button>
              {text && textError && (
                <p className="error small" role="alert">
                  {textError}
                </p>
              )}
              {(errors.post || errors.approval) && (
                <p className="error small" role="alert">
                  {errors.post || errors.approval}
                </p>
              )}
            </form>
            <p role="status" className="status small">
              {status}
            </p>
            {hash && (
              <p className="small">
                <a
                  href={`${runtime.deployment.network.explorer}/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction {short(hash)} ↗
                </a>
              </p>
            )}
            {unsettled && !busy && (
              <button onClick={() => void recheckReceipt()}>
                Check transaction status
              </button>
            )}
          </section>
        </div>
        <div className="read-status">
          <span className="small muted">
            {query.isError
              ? "Live reads failed. Showing the last available state; posting is disabled."
              : s
                ? `Read at block ${s.block.toLocaleString()}${Date.now() - query.dataUpdatedAt > 30000 ? " · stale" : ""}`
                : "Connecting to the public network…"}
          </span>
          <button
            className="text-button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <section className="ledger" aria-label="Billboard statistics">
          <div>
            <span>Messages posted</span>
            <strong className="stat-value number">
              {s?.count.toLocaleString() ?? "…"}
            </strong>
          </div>
          <div>
            <span>Total burned</span>
            <strong className="stat-value break-value">
              {s
                ? paid
                  ? `${units(s.total, s.decimals)} ${s.symbol}`
                  : "0"
                : "…"}
            </strong>
            {s && !paid && (
              <span className="small muted">Token not connected</span>
            )}
          </div>
          <div>
            <span>One rule</span>
            <strong className="stat-value rule">Anyone can replace it.</strong>
          </div>
        </section>
        <section
          id="history"
          className="history"
          aria-labelledby="history-heading"
        >
          <div className="section-heading">
            <h2 id="history-heading">The last 50 messages</h2>
            <span className="small muted">
              {s?.history.length ?? 0} / 50 retained
            </span>
          </div>
          {!s ? (
            <p className="muted">
              {query.isError
                ? "Refresh to load message history."
                : "Reading message history…"}
            </p>
          ) : !s.history.length ? (
            <div className="history-empty">
              <span aria-hidden="true">“</span>
              <p>
                No messages yet.
                <br />
                The first word could be yours.
              </p>
            </div>
          ) : (
            <ol className="history-list">
              {[...s.history].reverse().map((m, i) => (
                <li key={`${s.count - BigInt(i)}`}>
                  <span className="history-number number">
                    {(s.count - BigInt(i)).toLocaleString()}
                  </span>
                  <article>
                    <p className="history-message" dir="auto">
                      {m.text}
                    </p>
                    <div className="history-meta">
                      <AddressLink address={m.author} runtime={runtime} />
                      <time
                        dateTime={new Date(
                          Number(m.timestamp) * 1000,
                        ).toISOString()}
                      >
                        {new Date(Number(m.timestamp) * 1000).toLocaleString()}
                      </time>
                      <span className="break-value">
                        {m.burned
                          ? `${units(m.burned, s.decimals)} ${s.symbol} burned`
                          : "Free post"}
                      </span>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="about" aria-labelledby="about-heading">
          <h2 id="about-heading">One message. Until the next.</h2>
          <div className="about-columns">
            <p>
              Every post replaces the billboard. The latest 50 stay here; older
              messages remain in Ethereum’s transaction history. Messages are
              public and unmoderated.
            </p>
            <p>
              {paid
                ? "Paid posts send tokens straight to the burn address. The next minimum is 10% higher, rounded up. After 24 hours without a post, it resets to 1,000 tokens."
                : "The owner can connect the project’s token once. That permanently ends free posting and starts token burns. Token features stay unavailable until then."}
            </p>
            <p>
              LastWord charges no fee and holds no funds. Ethereum network fees
              still apply. There is no promise that a message will stay on the
              billboard.
            </p>
          </div>
        </section>
        {owner && s && !paid && (
          <section className="owner-panel" aria-labelledby="owner-heading">
            <h2 id="owner-heading">Connect the project token</h2>
            <p>
              Owner setup: this setting is permanent and ends free posting. Use
              the project’s verified Ethereum token address. Exact transfers to
              the burn address must be supported; fee-on-transfer and rebasing
              tokens are unsuitable.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void prepare("setup");
              }}
            >
              <label htmlFor="token-address">
                Project token contract address
              </label>
              <input
                id="token-address"
                autoComplete="off"
                spellCheck={false}
                value={newToken}
                onChange={(e) => {
                  setNewToken(e.target.value);
                  setAck(false);
                }}
                placeholder="Paste the verified contract address"
                disabled={!!busy}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  I verified this token’s identity and transfer behavior. This
                  cannot be undone.
                </span>
              </label>
              <button
                type="submit"
                disabled={
                  !ack ||
                  !isAddress(newToken.trim()) ||
                  newToken.trim().toLowerCase() === zeroAddress ||
                  !!busy ||
                  wrong ||
                  !healthy ||
                  unsettled
                }
              >
                {busy === "setup" ? phase : "Review token connection"}
              </button>
              <p role="alert" className="error small">
                {errors.setup}
              </p>
            </form>
          </section>
        )}
        <footer>
          <div>
            <span className="footer-brand">LastWord.</span>
            <p className="small muted">
              A public space on {runtime.chain.name}.
            </p>
          </div>
          <div className="contract-details">
            <span className="small muted">LastWord contract</span>
            <AddressLink
              runtime={runtime}
              address={runtime.contract.address}
              full
            />
            <a
              className="small"
              href="./imd-deployment.json"
              target="_blank"
              rel="noreferrer"
            >
              Deployment record ↗
            </a>
            {paid && s && (
              <>
                <span className="small muted">Connected token</span>
                <AddressLink runtime={runtime} address={s.token} full />
              </>
            )}
          </div>
        </footer>
      </main>
      {review && (
        <Modal
          title={
            review.kind === "setup"
              ? "Connect this token permanently?"
              : review.kind === "approval"
                ? review.reset
                  ? "Reset token approval?"
                  : "Approve the exact amount?"
                : "Post this message?"
          }
          close={() => setReview(null)}
        >
          {review.kind === "post" && (
            <blockquote className="review-message" dir="auto">
              {review.text}
            </blockquote>
          )}
          {review.kind === "setup" ? (
            <>
              <p>
                This token will be the only posting token. Free posting ends
                immediately.
              </p>
              <AddressLink runtime={runtime} address={review.token} full />
              <p>
                Token symbol: <b>{review.tokenLabel}</b>. A symbol alone does
                not prove identity.
              </p>
            </>
          ) : review.kind === "approval" ? (
            <>
              <p>
                {review.reset
                  ? "Clear the existing allowance before setting a new exact approval."
                  : `Allow LastWord to spend exactly ${units(review.amount, s?.decimals ?? 0)} ${review.tokenLabel}. Approval does not post a message.`}
              </p>
              <span className="small muted">Spender</span>
              <AddressLink
                runtime={runtime}
                address={runtime.contract.address}
                full
              />
            </>
          ) : (
            <p>
              {review.token === zeroAddress
                ? "No tokens are spent. This starts your 10-minute free-post cooldown."
                : `Permanently burn exactly ${units(review.amount, s?.decimals ?? 0)} ${review.tokenLabel}, even if the minimum falls before confirmation.`}
            </p>
          )}
          <p className="small break-value">
            Estimated network fee: {formatEther(review.fee)} ETH. The wallet
            shows the final fee.
          </p>
          <p className="small muted">
            This action runs on {runtime.chain.name}. USD value unavailable.
          </p>
          <button
            className="primary"
            disabled={!walletClient || wrong}
            onClick={() => void send()}
          >
            {review.kind === "setup"
              ? "Connect token permanently"
              : review.kind === "approval"
                ? review.reset
                  ? "Confirm reset in wallet"
                  : "Confirm approval in wallet"
                : "Confirm post in wallet"}
            <span aria-hidden="true">↗</span>
          </button>
        </Modal>
      )}
    </>
  );
}
