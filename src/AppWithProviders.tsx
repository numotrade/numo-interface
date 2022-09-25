import { ThemeProvider } from "@emotion/react";
import type { Chain } from "@rainbow-me/rainbowkit";
import { getDefaultWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import { chain, configureChains, createClient, WagmiConfig } from "wagmi";
import { jsonRpcProvider } from "wagmi/providers/jsonRpc";
import { publicProvider } from "wagmi/providers/public";

import { App } from "./App";
import aurora from "./components/common/images/14803.png";
import { BlockProvider } from "./contexts/block";
import { EnvironmentProvider } from "./contexts/environment";
import { SettingsProvider } from "./contexts/settings";
import { theme } from "./theme";

const celoChain: Chain = {
  id: 42_220,
  name: "Celo",
  network: "celo",
  iconUrl:
    "https://raw.githubusercontent.com/Numoen/numoen-common/master/packages/celo-tokens/src/svgs/celo.svg",
  iconBackground: "#fff",
  nativeCurrency: {
    decimals: 18,
    name: "Celo",
    symbol: "CELO",
  },
  rpcUrls: {
    default: "https://forno.celo.org",
  },
  blockExplorers: {
    default: { name: "SnowTrace", url: "https://celoscan.io" },
  },
  testnet: false,
};

const auroraTestnet: Chain = {
  id: 1313161555,
  name: "Aurora Testnet",
  network: "aurora",
  iconUrl: aurora,
  iconBackground: "#fff",
  nativeCurrency: {
    decimals: 18,
    name: "Aurora Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: "https://testnet.aurora.dev",
  },
  testnet: true,
};

const { provider, chains } = configureChains(
  [celoChain, chain.goerli, auroraTestnet],
  [
    jsonRpcProvider({ rpc: (chain) => ({ http: chain.rpcUrls.default }) }),
    publicProvider(),
    jsonRpcProvider({ rpc: (chain) => ({ http: chain.rpcUrls.default }) }),
  ]
);

const { connectors } = getDefaultWallets({
  appName: "My RainbowKit App",
  chains,
});

const wagmiClient = createClient({
  autoConnect: true,
  connectors,
  provider,
});

const queryClient = new QueryClient();

export const AppWithProviders: React.FC = () => {
  return (
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <WagmiConfig client={wagmiClient}>
          <RainbowKitProvider coolMode chains={chains} initialChain={42220}>
            <BlockProvider>
              <QueryClientProvider client={queryClient}>
                <ReactQueryDevtools initialIsOpen={false} />
                <EnvironmentProvider>
                  <SettingsProvider>
                    <App />
                  </SettingsProvider>
                </EnvironmentProvider>
              </QueryClientProvider>
            </BlockProvider>
          </RainbowKitProvider>
        </WagmiConfig>
      </ThemeProvider>
    </React.StrictMode>
  );
};
