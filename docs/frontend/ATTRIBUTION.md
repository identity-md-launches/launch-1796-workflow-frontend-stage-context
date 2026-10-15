# Sources and attribution

Design principles: Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Design documentation method: Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Both texts were supplied in the pinned assignment; the combined license is preserved in `Better-Interface-LICENSE.txt`. These references informed this implementation; no upstream fetch was needed.

Ethereum interface guidance: Austin Griffith, ethskills, MIT, pinned commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`, supplied by the assignment. License retained in `Eth-Frontend-UX-LICENSE.txt`.

MetaMask, Rabby and Phantom SVG wallet marks are copied from the MIT-licensed `@rainbow-me/rainbowkit` 2.2.11 package. License retained in `RainbowKit-LICENSE.txt`. The Coinbase mark is the supplied wallet-connectors reference SVG. Wallet trademarks belong to their respective owners. LastWord's logo, browser-wallet icon and typography-only share card were drawn for this frontend with code; no external stock images or remote fonts are used.

Implementation references consulted:

- [Wagmi configuration and EIP-6963 discovery](https://wagmi.sh/react/api/createConfig)
- [Coinbase Wallet connector and SDK installation](https://wagmi.sh/react/api/connectors/coinbaseWallet)
- [Viem transaction simulation](https://viem.sh/docs/contract/simulateContract)
- [Rabby Mobile universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts): the current source accepts `_cmd=open-dapp` and the `dapp` parameter. The implemented link preserves the current page and gateway subpath. Physical-device handoff was not tested.
