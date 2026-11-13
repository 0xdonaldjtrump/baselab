// Base Lab Bot – an autonomous on-chain agent that runs every day in GitHub Actions.
// It reads the Base network, writes a short status post in the Base Lab guestbook and pings the Hub
// – both in ONE multicall transaction, paid from the bot's own small wallet (secret BOT_PRIVATE_KEY).
// Safety limits: max app fee, max gas price, minimum balance – if a limit is hit the bot skips the day.
import fs from 'node:fs';
import { ethers } from 'ethers';

const RPC = process.env.BASE_RPC || 'https://mainnet.base.org';
const CHAIN_ID = Number(process.env.BASE_CHAIN_ID || 8453);
const HUB = '0xDBF23A2D51B015ab142794468B0c1A6D64751E2F';
const MAX_APP_FEE = ethers.parseEther('0.0001'); // never pay more than this app fee
const MAX_GAS_GWEI = Number(process.env.BOT_MAX_GAS_GWEI || 1); // skip the day if Base gas is unusually expensive
const HUB_ABI = [
  'function fee() view returns (uint256)',
  'function stats() view returns (uint256 counter_, uint256 pings_, uint256 profiles_, uint256 posts_, uint256 polls_, uint256 locks_, uint256 ethHeld)',
  'function post(string text) payable returns (uint256)',
  'function ping() payable',
  'function multicall(bytes[] data) payable returns (bytes[])',
];
const out = [];
const log = (s) => { console.log(s); out.push(s); };
const finish = (code) => {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## 🤖 Base Lab Bot\n\n' + out.map((s) => '- ' + s).join('\n') + '\n');
  process.exitCode = code;
};

async function main() {
  const key = process.env.BOT_PRIVATE_KEY;
  if (!key) { log('No BOT_PRIVATE_KEY secret yet – add it in Settings → Secrets and variables → Actions. Skipping.'); return finish(0); }
  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
  const wallet = new ethers.Wallet(key.trim(), provider);
  const hub = new ethers.Contract(HUB, HUB_ABI, wallet);
  log('Bot wallet: ' + wallet.address);

  if ((await provider.getCode(HUB)) === '0x') { log('Base Lab is not deployed on Base yet – nothing to do today.'); return finish(0); }

  const [block, feeData, appFee, st, balance] = await Promise.all([
    provider.getBlock('latest'), provider.getFeeData(), hub.fee(), hub.stats(), provider.getBalance(wallet.address),
  ]);
  const gwei = Number(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'));
  log(`Block #${block.number} · gas ${gwei.toFixed(4)} gwei · app fee ${ethers.formatEther(appFee)} ETH · balance ${ethers.formatEther(balance)} ETH`);

  if (appFee > MAX_APP_FEE) { log('App fee is above the bot limit – skipping.'); return finish(0); }
  if (gwei > MAX_GAS_GWEI) { log('Gas is unusually high today – skipping.'); return finish(0); }

  const day = new Date().toISOString().slice(0, 10);
  const text = `🤖 Base Lab Bot · ${day} · block #${block.number} · gas ${gwei.toFixed(4)} gwei · ${st.posts_} posts · ${st.pings_} pings · ${st.profiles_} profiles`;
  const calls = [hub.interface.encodeFunctionData('post', [text]), hub.interface.encodeFunctionData('ping')];

  const gas = await hub.multicall.estimateGas(calls, { value: appFee });
  const cost = gas * (feeData.maxFeePerGas || feeData.gasPrice || 0n) + appFee;
  if (balance < cost * 2n) { log(`Bot balance too low (needs ~${ethers.formatEther(cost)} ETH per day). Top up ${wallet.address} on Base.`); return finish(1); }

  const tx = await hub.multicall(calls, { value: appFee, gasLimit: (gas * 12n) / 10n });
  log('Sent: https://basescan.org/tx/' + tx.hash);
  const rc = await tx.wait();
  log(`✅ Posted in block #${rc.blockNumber} (gas ${rc.gasUsed}): “${text}”`);
  return finish(0);
}

main().catch((e) => { log('❌ ' + (e.shortMessage || e.message)); finish(1); });
