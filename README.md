# 🧪 Base Lab

A colourful on-chain playground with **55+ tests** for the **Base** network – every successful test lights up green.

**Contracts** (Solidity 0.8.24 + OpenZeppelin 5, deployed via the deterministic CREATE2 proxy):

| Contract | What it does |
|---|---|
| `LabToken` (LAB, ERC-20) | faucet (100 LAB/h), transfer, approve, transferFrom, burn, **EIP-2612 permit**, owner mint |
| `LabNFT` (ERC-721) | free mint with **fully on-chain SVG art**, transfer, approve, setApprovalForAll, burn, enumeration |
| `LabItems` (ERC-1155) | 5 game items, mint, safeTransfer, **batch transfer**, burn, on-chain metadata |
| `LabHub` | profiles (register / update / delete), guestbook with likes, polls, counter, personal storage, ETH vault, **time-locks**, **multisend** (ETH / any ERC-20), **personal_sign + EIP-712 verification**, **gasless meta-transactions**, **multicall**, intentional revert, admin announcement |

App: `index.html` · One-time launch: `setup.html` · Testnet: add `?net=84532`
