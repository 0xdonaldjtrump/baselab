/* Base Lab – one-time deployment of the 4 contracts via the deterministic CREATE2 proxy */
(function () {
  'use strict';
  const E = window.ethers, L = window.LAB;
  const $ = (id) => document.getElementById(id);
  const chainId = (() => { const q = new URLSearchParams(location.search).get('net'); return q && L.networks[q] ? Number(q) : L.defaultChainId; })();
  const net = L.networks[chainId];
  const NAMES = [['LabToken', '🪙 LAB token (ERC-20)'], ['LabNFT', '🖼️ NFT (ERC-721)'], ['LabItems', '🎒 Items (ERC-1155)'], ['LabHub', '🧠 Hub (profiles, polls, vault…)']];
  const status = {};
  const q = chainId === L.defaultChainId ? '' : '?net=' + chainId;
  $('netPill').textContent = net.name; $('netName').textContent = net.name; $('adminAddr').textContent = L.admin;
  $('homeLink').href = 'index.html' + q; $('openApp').href = 'index.html' + q;
  if (q) { $('testLink').textContent = 'back to Base mainnet'; $('testLink').href = 'setup.html'; }

  function toast(text, kind) {
    const t = document.createElement('div'); t.className = 'toast' + (kind ? ' ' + kind : ''); t.textContent = text;
    $('toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4000);
  }
  function draw() {
    const box = $('list'); box.textContent = '';
    for (const [n, label] of NAMES) {
      const d = document.createElement('div'); d.className = 'kv'; d.style.margin = '8px 0';
      const s = status[n];
      d.innerHTML = '';
      d.append(document.createTextNode(label));
      const b = document.createElement('b'); b.className = 'mono'; b.style.fontSize = '13px'; b.style.wordBreak = 'break-all';
      b.textContent = (s === true ? '✅ ' : s === 'busy' ? '⏳ ' : '⚪ ') + L.contracts[n];
      d.appendChild(b); box.appendChild(d);
    }
    const all = NAMES.every(([n]) => status[n] === true);
    $('btnDeploy').classList.toggle('hidden', all);
    $('openApp').classList.toggle('hidden', !all);
  }
  async function check(provider) {
    for (const [n] of NAMES) {
      try { status[n] = (await provider.getCode(L.contracts[n])) !== '0x'; } catch (e) { status[n] = false; }
    }
    draw();
  }
  async function deploy() {
    if (!window.ethereum) { toast('Install MetaMask (or open this page in the MetaMask app).', 'err'); return; }
    const btn = $('btnDeploy'); btn.disabled = true;
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const hex = '0x' + chainId.toString(16);
      if ((await window.ethereum.request({ method: 'eth_chainId' })) !== hex) {
        try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
        catch (e) { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: net.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [net.rpc], blockExplorerUrls: net.explorer ? [net.explorer] : undefined }] }); }
      }
      const provider = new E.BrowserProvider(window.ethereum, 'any');
      const signer = await provider.getSigner();
      if ((await provider.getCode(L.deployProxy)) === '0x') throw new Error('The CREATE2 deployment proxy is missing on this network.');
      await check(provider);
      for (const [n, label] of NAMES) {
        if (status[n] === true) continue;
        status[n] = 'busy'; draw();
        toast('Confirm ' + label + ' in your wallet…');
        const tx = await signer.sendTransaction({ to: L.deployProxy, data: window.LAB_DEPLOY[n], gasLimit: 6000000n });
        const rc = await tx.wait();
        if (!rc || rc.status !== 1) throw new Error(label + ' deployment failed');
        let ok = false;
        for (let i = 0; i < 8 && !ok; i++) {
          ok = (await new E.BrowserProvider(window.ethereum, 'any').getCode(L.contracts[n])) !== '0x';
          if (!ok) await new Promise((r) => setTimeout(r, 1500));
        }
        status[n] = ok; draw();
        if (!ok) throw new Error(label + ' sent, but not visible yet – refresh in a moment.');
      }
      toast('🎉 Base Lab is live!', 'ok');
    } catch (e) {
      const c = e && (e.code || (e.info && e.info.error && e.info.error.code));
      toast(c === 'ACTION_REJECTED' || c === 4001 ? 'Cancelled in your wallet.' : (e.shortMessage || e.message), 'err');
      for (const [n] of NAMES) if (status[n] === 'busy') status[n] = false;
      draw();
    } finally { btn.disabled = false; }
  }
  $('btnDeploy').onclick = deploy;
  draw();
  check(new E.JsonRpcProvider(net.rpc, chainId, { staticNetwork: true })).catch(() => $('btnDeploy').classList.remove('hidden'));
})();
