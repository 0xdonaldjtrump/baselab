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

## App fee
Every Base Lab action (Hub actions, faucet, NFT/item mint and burn, multicall) costs a minimum app fee paid in ETH (default 0.000011 ETH ≈ $0.02, hard cap 0.001 ETH). Paying more is allowed – everything above what the action itself needs goes to the fee recipient (the admin wallet). Standard ERC-20/721/1155 transfers, approvals and permit stay fee-free so wallets and marketplaces keep working.

## 🤖 Assistant
The 🤖 button opens a chat. Type what you want in Polish or English ("zmintuj NFT 'Hello' niebieski", "send 1 LAB to 0x…"). The assistant prepares the action, you confirm it in the chat and sign it in your wallet. Built-in commands work without any key; with your own Anthropic API key (kept only in your browser) it uses Claude.

## 🤖 Base Lab Bot (autonomous agent)
`.github/workflows/bot.yml` runs `bot/bot.mjs` every day: it reads the Base network and, in one multicall, writes a status post in the guestbook and pings the Hub – from its own small wallet. Setup: create a new wallet for the bot, send it ~0.002 ETH on Base, then add its private key as the repository secret `BOT_PRIVATE_KEY`. Limits: max app fee 0.0001 ETH, max gas 1 gwei, balance check.

## ✅ BaseScan verification
`verify/` holds the exact Standard-JSON compiler inputs of all contracts (KryptoCzat, BaseTip, Base Lab). After deploying, add an Etherscan API key as the secret `ETHERSCAN_API_KEY` and run the workflow "Verify contracts on BaseScan".

