// Verifies the KryptoCzat, BaseTip and Base Lab contracts on BaseScan (Etherscan API V2).
// Runs in GitHub Actions ("Verify contracts on BaseScan"). Needs the ETHERSCAN_API_KEY secret.
// Contracts that are not deployed yet or already verified are skipped.
import fs from 'node:fs';

const KEY = process.env.ETHERSCAN_API_KEY;
const CHAIN = 8453;
const RPC = 'https://mainnet.base.org';
const API = `https://api.etherscan.io/v2/api?chainid=${CHAIN}`;
const meta = JSON.parse(fs.readFileSync(new URL('./meta.json', import.meta.url)));
const TARGETS = [
  { name: 'KryptoCzat', address: '0x60887F44Bb835F34c7A2b5F195F65D20C599132b', contract: 'PaidMessenger.sol:PaidMessenger', input: 'kryptoczat.json', len: 'PaidMessenger' },
  { name: 'BaseTip', address: '0xcd7dEBBc85b0AFb2F0b81232A658f056D4228AE7', contract: 'BaseTip.sol:BaseTip', input: 'basetip.json', len: 'BaseTip' },
  { name: 'Base Lab Hub', address: '0xDBF23A2D51B015ab142794468B0c1A6D64751E2F', contract: 'LabHub.sol:LabHub', input: 'baselab.json', len: 'LabHub' },
  { name: 'Base Lab Token', address: '0x0615b3bB4bd672f5235D8534281998Ce6103B00f', contract: 'LabToken.sol:LabToken', input: 'baselab.json', len: 'LabToken' },
  { name: 'Base Lab NFT', address: '0x10F1Efc29b54f576Fd62B716Ec8f378494dfD327', contract: 'LabNFT.sol:LabNFT', input: 'baselab.json', len: 'LabNFT' },
  { name: 'Base Lab Items', address: '0xC687eF196E1A9d1a74EcC162ADE721c69A5b7cD8', contract: 'LabItems.sol:LabItems', input: 'baselab.json', len: 'LabItems' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = [];
const log = (s) => { console.log(s); summary.push(s); };

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
async function api(params, post) {
  const url = `${API}&apikey=${KEY}&` + new URLSearchParams(post ? { module: params.module, action: params.action } : params);
  const r = post
    ? await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
    : await fetch(url);
  return r.json();
}

async function verify(t) {
  const code = await rpc('eth_getCode', [t.address, 'latest']);
  if (!code || code === '0x') return log(`⚪ ${t.name}: not deployed yet – skipped`);
  const src = await api({ module: 'contract', action: 'getsourcecode', address: t.address });
  if (src.status === '1' && src.result && src.result[0] && src.result[0].SourceCode) return log(`✅ ${t.name}: already verified – https://basescan.org/address/${t.address}#code`);
  // constructor arguments = tail of the creation transaction (salt + bytecode + args sent to the CREATE2 proxy)
  const cr = await api({ module: 'contract', action: 'getcontractcreation', contractaddresses: t.address });
  const txHash = cr.result && cr.result[0] && cr.result[0].txHash;
  if (!txHash) throw new Error('creation transaction not found: ' + JSON.stringify(cr).slice(0, 200));
  const tx = await rpc('eth_getTransactionByHash', [txHash]);
  const inputHex = tx.input.slice(2);
  const len = meta.bytecodeHexLength[t.len];
  const viaProxy = (tx.to || '').toLowerCase() === '0x4e59b44847b379578588920ca78fbf26c0b4956c';
  const args = inputHex.slice((viaProxy ? 64 : 0) + len); // after [32-byte salt] + creation bytecode
  const source = fs.readFileSync(new URL('./' + t.input, import.meta.url), 'utf8');
  const sub = await api({
    module: 'contract', action: 'verifysourcecode', codeformat: 'solidity-standard-json-input', sourceCode: source,
    contractaddress: t.address, contractname: t.contract, compilerversion: meta.compilerversion,
    constructorArguements: args, constructorArguments: args, licenseType: '3',
  }, true);
  if (sub.status !== '1') {
    if (/already verified/i.test(sub.result || '')) return log(`✅ ${t.name}: already verified`);
    throw new Error('submit failed: ' + (sub.result || sub.message));
  }
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const s = await api({ module: 'contract', action: 'checkverifystatus', guid: sub.result });
    if (/pass|verified/i.test(s.result || '')) return log(`✅ ${t.name}: verified – https://basescan.org/address/${t.address}#code`);
    if (!/pending|queue/i.test(s.result || '')) throw new Error('verification failed: ' + s.result);
  }
  throw new Error('verification timed out');
}

if (!KEY) {
  log('❌ Missing ETHERSCAN_API_KEY secret. Add it in Settings → Secrets and variables → Actions.');
  process.exitCode = 1;
} else {
  let failed = 0;
  for (const t of TARGETS) {
    try { await verify(t); } catch (e) { failed++; log(`❌ ${t.name}: ${e.message}`); }
    await sleep(1500);
  }
  if (failed) process.exitCode = 1;
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## BaseScan verification\n\n' + summary.map((s) => '- ' + s).join('\n') + '\n');
