import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadDeployment } from "./config";
import { App } from "./App";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
const query = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="startup">
        <h1>LastWord</h1>
        <p>The page could not continue. Reload to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
loadDeployment()
  .then((runtime) =>
    root.render(
      <ErrorBoundary>
        <WagmiProvider config={runtime.walletConfig}>
          <QueryClientProvider client={query}>
            <App runtime={runtime} />
          </QueryClientProvider>
        </WagmiProvider>
      </ErrorBoundary>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="startup">
        <h1>LastWord</h1>
        <p role="alert">{error.message}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>,
    ),
  );
