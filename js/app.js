/* Base Lab – app */
(function () {
  'use strict';
  const E = window.ethers, L = window.LAB;
  const $ = (id) => document.getElementById(id);
  const chainId = (() => {
    const q = new URLSearchParams(location.search).get('net');
    return q && L.networks[q] ? Number(q) : L.defaultChainId;
  })();
  const net = L.networks[chainId];
  const NAMES = ['LabToken', 'LabNFT', 'LabItems', 'LabHub'];
  const S = { ro: null, provider: null, signer: null, account: null, c: {}, cro: {}, usdc: null, usdcRo: null, cards: {}, passed: new Set() };
  const lc = (a) => (a || '').toLowerCase();
  const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  const ex = (kind, v) => (net.explorer ? net.explorer + '/' + kind + '/' + v : null);
  const R = (n) => S.c[n] || S.cro[n];
  const usdcR = () => S.usdc || S.usdcRo;

  // ------------------------------------------------------------------ ui helpers
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function link(text, url) { if (!url) return document.createTextNode(text); const a = el('a', null, text); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; }
  function hue(s) { let h = 0; for (const ch of String(s).toLowerCase()) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
  function avatar(node, seed) { const h = hue(seed); node.style.background = `linear-gradient(135deg, hsl(${h} 90% 60%), hsl(${(h + 90) % 360} 85% 50%))`; }
  function toast(text, kind, ms) {
    const t = el('div', 'toast' + (kind && kind !== 'wait' ? ' ' + kind : ''));
    if (kind === 'wait') { t.innerHTML = '<span class="spinner"></span>'; t.append(text); } else t.textContent = text;
    $('toasts').appendChild(t);
    const close = () => t.remove();
    if (kind !== 'wait') setTimeout(close, ms || (kind === 'err' ? 7000 : 3500));
    return close;
  }
  function confetti(n) {
    const set = ['🎉', '✨', '💜', '💙', '🧪', '⭐', '🟣', '🔵'];
    for (let i = 0; i < n; i++) {
      const c = el('div', 'confetti', set[i % set.length]);
      c.style.left = Math.random() * 100 + 'vw';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3500);
    }
  }
  function svgImg(svg, alt) { const i = el('img'); i.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); i.alt = alt || ''; return i; }

  // combined error interface
  const errIface = (() => {
    const seen = new Set(), frags = [];
    for (const n of NAMES) for (const f of L.abi[n]) if (f.type === 'error') { const k = f.name + JSON.stringify(f.inputs); if (!seen.has(k)) { seen.add(k); frags.push(f); } }
    return new E.Interface(frags);
  })();
  const FRIENDLY = {
    FaucetCooldown: (a) => 'Faucet cooldown – next claim at ' + new Date(Number(a[0]) * 1000).toLocaleTimeString(),
    LabError: (a) => 'LabError(' + a[0] + '): ' + a[1],
    ERC20InsufficientBalance: () => 'Not enough tokens.',
    ERC20InsufficientAllowance: () => 'Allowance too low.',
    ERC721NonexistentToken: (a) => 'NFT #' + a[0] + ' does not exist.',
    ERC721InsufficientApproval: () => 'You are not the owner or approved for this NFT.',
    ERC721IncorrectOwner: () => 'You do not own this NFT.',
    ERC1155InsufficientBalance: () => 'Not enough of this item.',
    OwnableUnauthorizedAccount: () => 'Only the admin can do this.',
    StillLocked: (a) => 'Still locked until ' + new Date(Number(a[0]) * 1000).toLocaleString(),
    ProfileExists: () => 'You already have a profile – use Update.',
    NoProfile: () => 'No profile yet – Register first.',
    AlreadyLiked: () => 'You already liked this post.',
    AlreadyVoted: () => 'You already voted in this poll.',
    BadLabel: () => 'Label: 1–24 characters, letters, digits, space, - or _.',
    InsufficientVault: () => 'Not enough ETH in your vault.',
    MintPaused: () => 'NFT minting is paused by the admin.',
  };
  function decodeErr(e) {
    let name = e && e.revert && e.revert.name, args = e && e.revert && e.revert.args;
    const data = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
    if (!name && typeof data === 'string' && data.length >= 10) { try { const p = errIface.parseError(data); name = p.name; args = p.args; } catch (x) { /* ignore */ } }
    return name ? { name, args: args || [] } : null;
  }
  function errMsg(e) {
    const code = e && (e.code || (e.info && e.info.error && e.info.error.code));
    if (code === 'ACTION_REJECTED' || code === 4001) return 'Cancelled in your wallet.';
    if (code === 'INSUFFICIENT_FUNDS') return 'Not enough ETH for this transaction (amount + gas).';
    const d = decodeErr(e);
    if (d) return FRIENDLY[d.name] ? FRIENDLY[d.name](d.args) : d.name + '(' + [...d.args].map(String).join(', ') + ')';
    const m = (e && (e.shortMessage || e.reason || e.message)) || String(e);
    return m.length > 240 ? m.slice(0, 240) + '…' : m;
  }

  // ------------------------------------------------------------------ tx + log
  let logN = 0;
  function addLog(label, hash, gas) {
    const body = $('logBody');
    if (!logN) body.textContent = '';
    logN++;
    $('logCount').textContent = logN;
    const lh = $('logHead'); lh.classList.remove('flash'); void lh.offsetWidth; lh.classList.add('flash');
    const e = el('div', 'e');
    e.append(el('b', null, '✅ ' + label), el('br'), link(short(hash), ex('tx', hash)), document.createTextNode(gas != null ? ' · gas ' + gas : ''));
    body.prepend(e);
  }
  async function tx(label, p) {
    let close = toast('Confirm “' + label + '” in your wallet…', 'wait');
    try {
      const t = await p;
      close(); close = toast('Waiting for Base to include it…', 'wait');
      const rc = await t.wait();
      if (!rc || rc.status !== 1) throw new Error('Transaction failed');
      addLog(label, t.hash, rc.gasUsed.toString());
      scheduleBalances();
      return rc;
    } finally { close(); }
  }
  function txOut(label, rc, extra) {
    const parts = ['✅ ' + label + (extra ? '\n' + extra : ''), '\nGas used: ' + rc.gasUsed + ' · block #' + rc.blockNumber + ' · '];
    parts.push(link('view on explorer', ex('tx', rc.hash)));
    return parts;
  }
  function eventArg(rc, contract, evName, arg) {
    for (const log of rc.logs) {
      try { const p = contract.interface.parseLog(log); if (p && p.name === evName) return p.args[arg]; } catch (e) { /* other contract */ }
    }
    return null;
  }

  // ------------------------------------------------------------------ amounts + inputs
  const amt18 = (v) => { const x = E.parseEther(String(v).trim().replace(',', '.')); if (x <= 0n) throw new Error('Enter an amount greater than 0'); return x; };
  const amt6 = (v) => { const x = E.parseUnits(String(v).trim().replace(',', '.'), 6); if (x <= 0n) throw new Error('Enter an amount greater than 0'); return x; };
  const fmt18 = (v, d) => Number(E.formatEther(v)).toLocaleString('en-US', { maximumFractionDigits: d == null ? 4 : d });
  const fmt6 = (v) => Number(E.formatUnits(v, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  function addr(v) {
    const s = String(v || '').trim();
    if (!s || s.toLowerCase() === 'me') return S.account;
    if (!E.isAddress(s)) throw new Error('Invalid address: ' + s);
    return E.getAddress(s);
  }
  function addrList(v) {
    const parts = String(v || '').split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) throw new Error('Enter at least one address');
    if (parts.length > 50) throw new Error('Max 50 addresses');
    return parts.map(addr);
  }
  const int = (v) => { const n = String(v).trim(); if (!/^\d+$/.test(n)) throw new Error('Enter a whole number'); return BigInt(n); };
  async function ensureAllowance(token, spender, amount, label) {
    const cur = await token.allowance(S.account, spender);
    if (cur >= amount) return;
    await tx('Approve ' + label, token.approve(spender, amount));
  }

  // ------------------------------------------------------------------ test definitions
  const GROUPS = [
    { id: 'network', ico: '📡', title: 'Network & wallet', desc: 'Read Base, sign messages, add tokens, send ETH.', c1: '#2f6bff', c2: '#8ab4ff' },
    { id: 'basics', ico: '⚡', title: 'Basic transactions', desc: 'The simplest state changes – and a failing one.', c1: '#ff7a00', c2: '#ffc14d' },
    { id: 'profile', ico: '🪪', title: 'Profile', desc: 'Register, update and delete an on-chain profile.', c1: '#ff2e7e', c2: '#ff9cc6' },
    { id: 'guestbook', ico: '📖', title: 'Guestbook', desc: 'Public posts with likes.', c1: '#8b5cf6', c2: '#c9b2ff' },
    { id: 'polls', ico: '🗳️', title: 'Polls', desc: 'Create a poll and vote.', c1: '#0fb5a3', c2: '#6fe3d3' },
    { id: 'eth', ico: '🏦', title: 'ETH vault & locks', desc: 'Deposit, withdraw, time-lock and multisend ETH.', c1: '#4f46e5', c2: '#9a96ff' },
    { id: 'token', ico: '🪙', title: 'LAB token (ERC-20)', desc: 'Faucet, transfer, approve, transferFrom, burn, permit, multisend.', c1: '#16a34a', c2: '#7ee29d' },
    { id: 'nft', ico: '🖼️', title: 'NFT (ERC-721)', desc: 'Mint on-chain art, transfer, approve, burn.', c1: '#d61fb4', c2: '#ff8ae6' },
    { id: 'items', ico: '🎒', title: 'Items (ERC-1155)', desc: 'Mint game items, single and batch transfers, burn.', c1: '#f59e0b', c2: '#fcd56b' },
    { id: 'usdc', ico: '💵', title: 'USDC', desc: 'Real stablecoin transfers, approvals and multisend.', c1: '#0ea5e9', c2: '#86d8fd' },
    { id: 'advanced', ico: '🧠', title: 'Advanced', desc: 'Multicall, gasless meta-transactions, events, contracts.', c1: '#ef4444', c2: '#ffa3a3' },
    { id: 'admin', ico: '👑', title: 'Admin', desc: 'Only for the admin wallet.', c1: '#334155', c2: '#8aa0bd', adminOnly: true },
  ];
  const TESTS = [];
  const T = (group, id, title, desc, inputs, run, opts) => TESTS.push(Object.assign({ group, id, title, desc, inputs: inputs || [], run }, opts || {}));
  const ME = { def: '', me: true };

  // network
  T('network', 'net-info', '📡 Network info', 'Chain ID, latest block and gas price straight from Base.', [], async () => {
    const p = S.provider || S.ro;
    const [cid, b, fee] = await Promise.all([p.getNetwork(), p.getBlockNumber(), p.getFeeData()]);
    return `Chain ID ${cid.chainId} (${net.name})\nLatest block #${b}\nGas price ${Number(E.formatUnits(fee.gasPrice || 0n, 'gwei')).toFixed(4)} gwei`;
  }, { noWallet: true, btn: 'Read' });
  T('network', 'net-bal', '💰 My balances', 'ETH, USDC, LAB, NFTs, items and vault balance.', [], async () => { await refreshBalances(); return balancesText(); }, { btn: 'Read' });
  T('network', 'net-est', '⛽ Estimate gas', 'How much gas and ETH a simple ping() would cost right now.', [], async () => {
    const gas = await S.c.LabHub.ping.estimateGas();
    const fee = await S.provider.getFeeData();
    return `ping() ≈ ${gas} gas\n≈ ${E.formatEther(gas * (fee.gasPrice || 0n))} ETH at the current gas price`;
  }, { btn: 'Estimate' });
  T('network', 'net-sign', '✍️ Sign a message', 'personal_sign – then the contract recovers who signed it (free, no gas).', [{ k: 'msg', label: 'Message', def: 'Hello Base Lab!' }], async (v) => {
    const sig = await S.signer.signMessage(v.msg);
    const off = E.verifyMessage(v.msg, sig);
    const on = await R('LabHub').recoverPersonal(v.msg, sig);
    if (lc(on) !== lc(S.account)) throw new Error('Contract recovered ' + on);
    return `Signature ${sig.slice(0, 22)}…\nRecovered off-chain: ${short(off)}\nRecovered by contract: ${short(on)} ✔`;
  }, { btn: 'Sign' });
  T('network', 'net-712', '🧾 Sign typed data (EIP-712)', 'Structured signature verified by the Hub contract (free).', [{ k: 'note', label: 'Note', def: 'Typed data on Base' }], async (v) => {
    const { sig, nonce } = await signNote(v.note);
    const on = await R('LabHub').recoverNote(S.account, v.note, nonce, sig);
    if (lc(on) !== lc(S.account)) throw new Error('Contract recovered ' + on);
    return `EIP-712 signature ${sig.slice(0, 22)}…\nContract recovered ${short(on)} ✔`;
  }, { btn: 'Sign' });
  T('network', 'net-watch', '🦊 Add LAB to wallet', 'wallet_watchAsset – shows LAB in MetaMask.', [], async () => {
    const ok = await window.ethereum.request({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: L.contracts.LabToken, symbol: 'LAB', decimals: 18 } } });
    if (!ok) throw new Error('Wallet did not add the token');
    return 'LAB token added to your wallet 🦊';
  }, { btn: 'Add' });
  T('network', 'net-send', '💸 Send ETH', 'Plain ETH transfer from your wallet.', [{ k: 'to', label: 'To (empty = yourself)', ...ME }, { k: 'amt', label: 'Amount (ETH)', def: '0.00001' }], async (v) => {
    const to = addr(v.to), value = amt18(v.amt);
    const rc = await tx('Send ETH', S.signer.sendTransaction({ to, value }));
    return txOut('Sent ' + v.amt + ' ETH to ' + short(to), rc);
  });

  // basics
  T('basics', 'hub-ping', '🏓 Ping', 'The simplest transaction: emits an event and counts pings.', [], async () => {
    const rc = await tx('Ping', S.c.LabHub.ping());
    return txOut('Ping #' + eventArg(rc, S.c.LabHub, 'Pinged', 'total'), rc);
  });
  T('basics', 'hub-inc', '➕ Increment counter', 'Shared counter +1.', [], async () => {
    const rc = await tx('Increment', S.c.LabHub.increment());
    return txOut('Counter is now ' + eventArg(rc, S.c.LabHub, 'CounterChanged', 'value'), rc);
  });
  T('basics', 'hub-dec', '➖ Decrement counter', 'Shared counter −1 (fails at zero – run Increment first).', [], async () => {
    const rc = await tx('Decrement', S.c.LabHub.decrement());
    return txOut('Counter is now ' + eventArg(rc, S.c.LabHub, 'CounterChanged', 'value'), rc);
  });
  T('basics', 'hub-num', '🔢 Save a number', 'Store your own number in contract storage.', [{ k: 'n', label: 'Number', def: '42', type: 'number' }], async (v) => {
    const rc = await tx('Save number', S.c.LabHub.saveNumber(int(v.n)));
    const back = await S.c.LabHub.numberOf(S.account);
    return txOut('Stored and read back: ' + back, rc);
  });
  T('basics', 'hub-note', '📝 Save a note', 'Store a text note (max 280 bytes).', [{ k: 'note', label: 'Note', def: 'gm from Base Lab' }], async (v) => {
    const rc = await tx('Save note', S.c.LabHub.saveNote(v.note));
    return txOut('Your note: “' + (await S.c.LabHub.noteOf(S.account)) + '”', rc);
  });
  T('basics', 'hub-fail', '💥 Failing call', 'Calls a function that always reverts – the test passes when the error is decoded correctly (no gas spent).', [], async () => {
    try { await S.cro.LabHub.failOnPurpose.staticCall(); } catch (e) {
      const d = decodeErr(e);
      if (d && d.name === 'LabError') return 'Reverted as expected ✔\nLabError(' + d.args[0] + ', "' + d.args[1] + '")';
      throw e;
    }
    throw new Error('It did not revert?!');
  }, { btn: 'Try it' });

  // profile
  const profInputs = [{ k: 'name', label: 'Name', def: 'Base Tester' }, { k: 'bio', label: 'Bio', def: 'Testing everything on Base 🧪' }, { k: 'hue', label: 'Colour', type: 'range', def: '280', min: 0, max: 359 }];
  T('profile', 'prof-reg', '🆕 Register', 'Create your on-chain profile.', profInputs, async (v) => {
    const rc = await tx('Register profile', S.c.LabHub.register(v.name, v.bio, Number(v.hue)));
    return txOut('Profile created for ' + v.name, rc);
  });
  T('profile', 'prof-upd', '✏️ Update profile', 'Change name, bio or colour.', profInputs.map((i) => ({ ...i, def: i.k === 'name' ? 'Base Tester v2' : i.k === 'hue' ? '160' : 'Updated on-chain ✨' })), async (v) => {
    const rc = await tx('Update profile', S.c.LabHub.updateProfile(v.name, v.bio, Number(v.hue)));
    return txOut('Profile updated', rc);
  });
  T('profile', 'prof-view', '👀 View profile', 'Read any profile (empty = yours).', [{ k: 'who', label: 'Address', ...ME }], async (v, out) => {
    const who = addr(v.who);
    const p = await R('LabHub').getProfile(who);
    if (!p.exists) return 'No profile for ' + short(who);
    const box = el('div');
    const av = el('span', 'dotav'); av.style.cssText = `width:40px;height:40px;vertical-align:middle;margin-right:8px;background:hsl(${p.hue} 85% 55%)`;
    box.append(av, el('b', null, p.name), el('div', null, p.bio), el('div', 'muted', 'Created ' + new Date(Number(p.createdAt) * 1000).toLocaleString() + ' · updated ' + new Date(Number(p.updatedAt) * 1000).toLocaleString()));
    return [box];
  }, { btn: 'Read' });
  T('profile', 'prof-del', '🗑️ Delete profile', 'Remove your profile from the contract.', [], async () => {
    const rc = await tx('Delete profile', S.c.LabHub.deleteProfile());
    return txOut('Profile deleted', rc);
  });

  // guestbook
  T('guestbook', 'gb-post', '💬 Write a post', 'Public post on the Base Lab guestbook.', [{ k: 'text', label: 'Text', def: 'gm Base! Testing Base Lab 🧪' }], async (v) => {
    const rc = await tx('Post', S.c.LabHub.post(v.text));
    return txOut('Post #' + eventArg(rc, S.c.LabHub, 'Posted', 'id') + ' published', rc);
  });
  T('guestbook', 'gb-like', '❤️ Like a post', 'Like any post once (empty = newest).', [{ k: 'id', label: 'Post id', def: '' }], async (v) => {
    const id = v.id.trim() ? int(v.id) : (await S.c.LabHub.postsLength()) - 1n;
    if (id < 0n) throw new Error('No posts yet – write one first');
    const rc = await tx('Like post', S.c.LabHub.like(id));
    return txOut('Post #' + id + ' now has ' + eventArg(rc, S.c.LabHub, 'Liked', 'likes') + ' likes', rc);
  });
  T('guestbook', 'gb-del', '🧽 Delete my post', 'Delete one of your posts (empty = your newest).', [{ k: 'id', label: 'Post id', def: '' }], async (v) => {
    let id;
    if (v.id.trim()) id = int(v.id);
    else {
      const len = await S.c.LabHub.postsLength();
      const posts = await S.c.LabHub.getPosts(len > 100n ? len - 100n : 0n, 100);
      const base = len > 100n ? len - 100n : 0n;
      for (let i = posts.length - 1; i >= 0; i--) if (lc(posts[i].author) === lc(S.account) && !posts[i].deleted) { id = base + BigInt(i); break; }
      if (id == null) throw new Error('You have no posts to delete');
    }
    const rc = await tx('Delete post', S.c.LabHub.deletePost(id));
    return txOut('Post #' + id + ' deleted', rc);
  });
  T('guestbook', 'gb-list', '📜 Latest posts', 'Read the last 10 posts.', [], async () => {
    const len = await R('LabHub').postsLength();
    if (len === 0n) return 'No posts yet.';
    const off = len > 10n ? len - 10n : 0n;
    const posts = await R('LabHub').getPosts(off, 10);
    const box = el('div');
    posts.map((p, i) => ({ p, id: off + BigInt(i) })).reverse().forEach(({ p, id }) => {
      const d = el('div', 'post');
      d.append(el('b', null, '#' + id + ' ' + short(p.author)), document.createTextNode(' · ❤️ ' + p.likes), el('div', null, p.deleted ? '(deleted)' : p.text));
      box.appendChild(d);
    });
    return [box];
  }, { btn: 'Read', noWallet: true });

  // polls
  T('polls', 'poll-new', '📊 Create a poll', 'Options separated by |', [{ k: 'q', label: 'Question', def: 'Best L2?' }, { k: 'opts', label: 'Options', def: 'Base | Base | Also Base' }, { k: 'min', label: 'Duration (minutes)', def: '60', type: 'number' }], async (v) => {
    const opts = v.opts.split('|').map((s) => s.trim()).filter(Boolean);
    const rc = await tx('Create poll', S.c.LabHub.createPoll(v.q, opts, int(v.min) * 60n));
    const id = eventArg(rc, S.c.LabHub, 'PollCreated', 'id');
    const vote = S.cards['poll-vote'];
    if (vote) vote.inputs.id.value = String(id);
    const view = S.cards['poll-view'];
    if (view) view.inputs.id.value = String(id);
    return txOut('Poll #' + id + ' created', rc);
  });
  T('polls', 'poll-vote', '✅ Vote', 'Vote once per poll (option numbers start at 0).', [{ k: 'id', label: 'Poll id', def: '0' }, { k: 'opt', label: 'Option', def: '0' }], async (v) => {
    const rc = await tx('Vote', S.c.LabHub.vote(int(v.id), int(v.opt)));
    return txOut('Voted for option ' + v.opt + ' in poll #' + v.id, rc);
  });
  T('polls', 'poll-view', '📈 Poll results', 'Live results with bars.', [{ k: 'id', label: 'Poll id', def: '0' }], async (v) => {
    const p = await R('LabHub').getPoll(int(v.id));
    const total = p.votes.reduce((a, b) => a + Number(b), 0);
    const box = el('div', 'bars');
    box.append(el('b', null, p.question), el('div', 'muted', (Date.now() / 1000 > Number(p.endsAt) ? 'Closed' : 'Open until ' + new Date(Number(p.endsAt) * 1000).toLocaleString()) + ' · ' + total + ' votes'));
    p.options.forEach((o, i) => {
      const n = Number(p.votes[i]);
      const b = el('div', 'b'), t = el('div', 't'), tr = el('div', 'track'), f = el('div', 'fill');
      t.append(el('span', null, i + ': ' + o), el('span', null, String(n)));
      f.style.width = (total ? (n / total) * 100 : 0) + '%';
      tr.appendChild(f); b.append(t, tr); box.appendChild(b);
    });
    return [box];
  }, { btn: 'Read', noWallet: true });

  // eth
  T('eth', 'eth-dep', '📥 Deposit to vault', 'Send ETH into your personal vault in the Hub.', [{ k: 'amt', label: 'Amount (ETH)', def: '0.00002' }], async (v) => {
    const rc = await tx('Deposit ETH', S.c.LabHub.deposit({ value: amt18(v.amt) }));
    return txOut('Vault balance: ' + fmt18(await S.c.LabHub.vaultOf(S.account), 6) + ' ETH', rc);
  });
  T('eth', 'eth-wd', '📤 Withdraw from vault', 'Take ETH back (empty = everything).', [{ k: 'amt', label: 'Amount (ETH)', def: '' }], async (v) => {
    const bal = await S.c.LabHub.vaultOf(S.account);
    const a = v.amt.trim() ? amt18(v.amt) : bal;
    if (a === 0n) throw new Error('Your vault is empty – deposit first');
    const rc = await tx('Withdraw ETH', S.c.LabHub.withdraw(a));
    return txOut('Withdrew ' + fmt18(a, 6) + ' ETH', rc);
  });
  T('eth', 'eth-lock', '⏳ Time-lock ETH', 'Lock ETH until a time in the future.', [{ k: 'amt', label: 'Amount (ETH)', def: '0.00001' }, { k: 'sec', label: 'Lock for (seconds)', def: '30', type: 'number' }], async (v) => {
    const rc = await tx('Lock ETH', S.c.LabHub.lock(int(v.sec), { value: amt18(v.amt) }));
    const id = eventArg(rc, S.c.LabHub, 'Locked', 'id');
    const u = S.cards['eth-unlock'];
    if (u) u.inputs.id.value = String(id);
    return txOut('Lock #' + id + ' created – unlock in ' + v.sec + ' s', rc);
  });
  T('eth', 'eth-unlock', '🔓 Unlock ETH', 'Withdraw a time-lock after it expires (empty = your oldest ready lock).', [{ k: 'id', label: 'Lock id', def: '' }], async (v) => {
    let id;
    if (v.id.trim()) id = int(v.id);
    else {
      const [ids, items] = await S.c.LabHub.locksOf(S.account);
      const now = Math.floor(Date.now() / 1000);
      const open = items.map((l, i) => ({ l, id: ids[i] })).filter((x) => !x.l.withdrawn);
      if (!open.length) throw new Error('You have no active locks – create one first');
      const ready = open.find((x) => Number(x.l.unlockAt) <= now);
      if (!ready) throw new Error('Not yet – first lock opens at ' + new Date(Number(open[0].l.unlockAt) * 1000).toLocaleTimeString());
      id = ready.id;
    }
    const rc = await tx('Unlock ETH', S.c.LabHub.unlock(id));
    return txOut('Lock #' + id + ' withdrawn: ' + fmt18(eventArg(rc, S.c.LabHub, 'Unlocked', 'amount'), 6) + ' ETH', rc);
  });
  T('eth', 'eth-multi', '🎯 Multisend ETH', 'Send ETH to many addresses in one transaction.', [{ k: 'to', label: 'Addresses (comma separated, "me" = you)', def: 'me, me' }, { k: 'amt', label: 'Amount each (ETH)', def: '0.000005' }], async (v) => {
    const to = addrList(v.to), each = amt18(v.amt);
    const rc = await tx('Multisend ETH', S.c.LabHub.multisendEth(to, to.map(() => each), { value: each * BigInt(to.length) }));
    return txOut('Sent ' + v.amt + ' ETH to ' + to.length + ' addresses', rc);
  });

  // token
  T('token', 'lab-claim', '🚰 Claim from faucet', 'Get 100 free LAB (once per hour).', [], async () => {
    const rc = await tx('Claim LAB', S.c.LabToken.claim());
    return txOut('+100 LAB · balance ' + fmt18(await S.c.LabToken.balanceOf(S.account)) + ' LAB', rc);
  });
  T('token', 'lab-send', '📨 Transfer LAB', 'ERC-20 transfer.', [{ k: 'to', label: 'To (empty = yourself)', ...ME }, { k: 'amt', label: 'Amount (LAB)', def: '1' }], async (v) => {
    const rc = await tx('Transfer LAB', S.c.LabToken.transfer(addr(v.to), amt18(v.amt)));
    return txOut('Sent ' + v.amt + ' LAB', rc);
  });
  T('token', 'lab-approve', '🤝 Approve LAB', 'Allow a spender to use your LAB.', [{ k: 'sp', label: 'Spender (empty = yourself)', ...ME }, { k: 'amt', label: 'Amount (LAB)', def: '5' }], async (v) => {
    const sp = addr(v.sp);
    const rc = await tx('Approve LAB', S.c.LabToken.approve(sp, amt18(v.amt)));
    return txOut('Allowance for ' + short(sp) + ': ' + fmt18(await S.c.LabToken.allowance(S.account, sp)) + ' LAB', rc);
  });
  T('token', 'lab-from', '🔁 transferFrom', 'Move LAB using an allowance (approves itself first if needed).', [{ k: 'to', label: 'To (empty = yourself)', ...ME }, { k: 'amt', label: 'Amount (LAB)', def: '1' }], async (v) => {
    const a = amt18(v.amt);
    await ensureAllowance(S.c.LabToken, S.account, a, 'LAB (self)');
    const rc = await tx('transferFrom LAB', S.c.LabToken.transferFrom(S.account, addr(v.to), a));
    return txOut('transferFrom of ' + v.amt + ' LAB done', rc);
  });
  T('token', 'lab-burn', '🔥 Burn LAB', 'Destroy tokens forever.', [{ k: 'amt', label: 'Amount (LAB)', def: '1' }], async (v) => {
    const rc = await tx('Burn LAB', S.c.LabToken.burn(amt18(v.amt)));
    return txOut('Burned ' + v.amt + ' LAB · total supply ' + fmt18(await S.c.LabToken.totalSupply(), 0), rc);
  });
  T('token', 'lab-permit', '🖊️ Permit (EIP-2612)', 'Approve with a free signature, then submit it on-chain.', [{ k: 'sp', label: 'Spender (empty = Hub)', def: '' }, { k: 'amt', label: 'Amount (LAB)', def: '3' }], async (v) => {
    const sp = v.sp.trim() ? addr(v.sp) : L.contracts.LabHub;
    const value = amt18(v.amt);
    const nonce = await S.c.LabToken.nonces(S.account);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const sigHex = await S.signer.signTypedData(
      { name: 'Base Lab Token', version: '1', chainId, verifyingContract: L.contracts.LabToken },
      { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
      { owner: S.account, spender: sp, value, nonce, deadline });
    const sig = E.Signature.from(sigHex);
    const rc = await tx('Permit LAB', S.c.LabToken.permit(S.account, sp, value, deadline, sig.v, sig.r, sig.s));
    return txOut('Permit used ✔ allowance ' + fmt18(await S.c.LabToken.allowance(S.account, sp)) + ' LAB', rc);
  });
  T('token', 'lab-multi', '🎯 Multisend LAB', 'Send LAB to many addresses at once (via the Hub).', [{ k: 'to', label: 'Addresses ("me" = you)', def: 'me, me' }, { k: 'amt', label: 'Amount each (LAB)', def: '1' }], async (v) => {
    const to = addrList(v.to), each = amt18(v.amt);
    await ensureAllowance(S.c.LabToken, L.contracts.LabHub, each * BigInt(to.length), 'LAB for Hub');
    const rc = await tx('Multisend LAB', S.c.LabHub.multisendToken(L.contracts.LabToken, to, to.map(() => each)));
    return txOut('Sent ' + v.amt + ' LAB to ' + to.length + ' addresses', rc);
  });

  // nft
  T('nft', 'nft-mint', '🎨 Mint NFT', 'Free mint – the artwork is generated by the contract.', [{ k: 'label', label: 'Label (A–Z, 0–9, space, - _)', def: 'Hello Base' }, { k: 'hue', label: 'Colour', type: 'range', def: '300', min: 0, max: 359 }], async (v) => {
    const rc = await tx('Mint NFT', S.c.LabNFT.mint(v.label, Number(v.hue)));
    const id = eventArg(rc, S.c.LabNFT, 'Minted', 'tokenId');
    ['nft-send', 'nft-approve', 'nft-burn', 'nft-watch'].forEach((k) => { if (S.cards[k]) S.cards[k].inputs.id.value = String(id); });
    const img = svgImg(await S.c.LabNFT.svg(id), 'NFT #' + id);
    img.style.maxWidth = '180px';
    return [...txOut('Minted NFT #' + id, rc), el('br'), img];
  });
  T('nft', 'nft-send', '📦 Transfer NFT', 'Send an NFT (empty recipient = yourself).', [{ k: 'id', label: 'Token id', def: '' }, { k: 'to', label: 'To', ...ME }], async (v) => {
    const id = await nftId(v.id);
    const rc = await tx('Transfer NFT', S.c.LabNFT.transferFrom(S.account, addr(v.to), id));
    return txOut('NFT #' + id + ' sent to ' + short(addr(v.to)), rc);
  });
  T('nft', 'nft-approve', '🤝 Approve NFT', 'Let another address move one NFT.', [{ k: 'id', label: 'Token id', def: '' }, { k: 'sp', label: 'Approved address', def: '' }], async (v) => {
    const id = await nftId(v.id);
    const sp = v.sp.trim() ? addr(v.sp) : L.contracts.LabHub;
    const rc = await tx('Approve NFT', S.c.LabNFT.approve(sp, id));
    return txOut('NFT #' + id + ' approved for ' + short(await S.c.LabNFT.getApproved(id)), rc);
  });
  T('nft', 'nft-all', '🛂 Approval for all', 'Turn an operator on/off for all your NFTs.', [{ k: 'op', label: 'Operator (empty = Hub)', def: '' }, { k: 'on', label: 'Approved', type: 'select', options: ['true', 'false'], def: 'true' }], async (v) => {
    const op = v.op.trim() ? addr(v.op) : L.contracts.LabHub;
    const rc = await tx('setApprovalForAll', S.c.LabNFT.setApprovalForAll(op, v.on === 'true'));
    return txOut('Operator ' + short(op) + ' is now ' + ((await S.c.LabNFT.isApprovedForAll(S.account, op)) ? 'approved' : 'not approved'), rc);
  });
  T('nft', 'nft-gallery', '🖼️ My NFT gallery', 'All Base Lab NFTs in your wallet with their on-chain art.', [], async () => {
    const ids = await S.c.LabNFT.tokensOf(S.account);
    if (!ids.length) return 'No NFTs yet – mint one!';
    const g = el('div', 'gallery');
    for (const id of ids.slice(0, 24)) {
      const f = el('figure');
      f.append(svgImg(await S.c.LabNFT.svg(id), '#' + id), document.createTextNode('#' + id));
      g.appendChild(f);
    }
    return [document.createTextNode('You own ' + ids.length + ' NFT(s)'), g];
  }, { btn: 'Show' });
  T('nft', 'nft-watch', '🦊 Add NFT to wallet', 'wallet_watchAsset for an NFT (support varies by wallet).', [{ k: 'id', label: 'Token id', def: '' }], async (v) => {
    const id = await nftId(v.id);
    const ok = await window.ethereum.request({ method: 'wallet_watchAsset', params: { type: 'ERC721', options: { address: L.contracts.LabNFT, tokenId: id.toString() } } });
    if (!ok) throw new Error('Wallet did not add the NFT');
    return 'NFT #' + id + ' added to your wallet 🦊';
  }, { btn: 'Add' });

  T('nft', 'nft-burn', '🔥 Burn NFT', 'Destroy one of your NFTs.', [{ k: 'id', label: 'Token id', def: '' }], async (v) => {
    const id = await nftId(v.id);
    const rc = await tx('Burn NFT', S.c.LabNFT.burn(id));
    return txOut('NFT #' + id + ' burned', rc);
  });

  // items
  const ITEM_OPTS = ['1 Sword', '2 Shield', '3 Potion', '4 Gem', '5 Key'];
  const itemId = (v) => BigInt(parseInt(v, 10));
  T('items', 'item-mint', '⚒️ Mint items', 'Mint up to 10 of an item type.', [{ k: 'type', label: 'Item', type: 'select', options: ITEM_OPTS, def: '1 Sword' }, { k: 'n', label: 'Amount (1–10)', def: '3', type: 'number' }], async (v) => {
    const rc = await tx('Mint items', S.c.LabItems.mint(itemId(v.type), int(v.n)));
    return txOut('Minted ' + v.n + ' × ' + v.type.slice(2), rc);
  });
  T('items', 'item-send', '📦 Transfer items', 'safeTransferFrom (empty recipient = yourself).', [{ k: 'type', label: 'Item', type: 'select', options: ITEM_OPTS, def: '1 Sword' }, { k: 'n', label: 'Amount', def: '1', type: 'number' }, { k: 'to', label: 'To', ...ME }], async (v) => {
    const rc = await tx('Transfer items', S.c.LabItems.safeTransferFrom(S.account, addr(v.to), itemId(v.type), int(v.n), '0x'));
    return txOut('Sent ' + v.n + ' × ' + v.type.slice(2), rc);
  });
  T('items', 'item-batch', '🚚 Batch transfer', 'Send 1 of every item you own in ONE transaction.', [{ k: 'to', label: 'To', ...ME }], async (v) => {
    const bals = await S.c.LabItems.balancesOf(S.account);
    const ids = [], ns = [];
    bals.forEach((b, i) => { if (b > 0n) { ids.push(BigInt(i + 1)); ns.push(1n); } });
    if (!ids.length) throw new Error('You have no items – mint some first');
    const rc = await tx('Batch transfer', S.c.LabItems.safeBatchTransferFrom(S.account, addr(v.to), ids, ns, '0x'));
    return txOut('Batch-sent ' + ids.length + ' item types', rc);
  });
  T('items', 'item-burn', '🔥 Burn items', 'Destroy some items.', [{ k: 'type', label: 'Item', type: 'select', options: ITEM_OPTS, def: '1 Sword' }, { k: 'n', label: 'Amount', def: '1', type: 'number' }], async (v) => {
    const rc = await tx('Burn items', S.c.LabItems.burn(S.account, itemId(v.type), int(v.n)));
    return txOut('Burned ' + v.n + ' × ' + v.type.slice(2), rc);
  });
  T('items', 'item-inv', '🎒 My inventory', 'Your items with on-chain artwork.', [], async () => {
    const bals = await S.c.LabItems.balancesOf(S.account);
    const g = el('div', 'gallery');
    for (let i = 0; i < bals.length; i++) {
      const f = el('figure');
      f.append(svgImg(await S.c.LabItems.itemSvg(i + 1), ITEM_OPTS[i]), document.createTextNode(ITEM_OPTS[i].slice(2) + ' × ' + bals[i]));
      g.appendChild(f);
    }
    return [g];
  }, { btn: 'Show' });

  // usdc
  T('usdc', 'usdc-send', '💵 Transfer USDC', 'Real USDC on ' + net.name + ' (empty = yourself).', [{ k: 'to', label: 'To', ...ME }, { k: 'amt', label: 'Amount (USDC)', def: '0.01' }], async (v) => {
    const rc = await tx('Transfer USDC', S.usdc.transfer(addr(v.to), amt6(v.amt)));
    return txOut('Sent ' + v.amt + ' USDC', rc);
  });
  T('usdc', 'usdc-approve', '🤝 Approve USDC', 'Allow the Hub to spend your USDC (for multisend).', [{ k: 'amt', label: 'Amount (USDC)', def: '0.05' }], async (v) => {
    const rc = await tx('Approve USDC', S.usdc.approve(L.contracts.LabHub, amt6(v.amt)));
    return txOut('Hub allowance: ' + fmt6(await S.usdc.allowance(S.account, L.contracts.LabHub)) + ' USDC', rc);
  });
  T('usdc', 'usdc-multi', '🎯 Multisend USDC', 'Send USDC to many addresses at once.', [{ k: 'to', label: 'Addresses ("me" = you)', def: 'me, me' }, { k: 'amt', label: 'Amount each (USDC)', def: '0.01' }], async (v) => {
    const to = addrList(v.to), each = amt6(v.amt);
    await ensureAllowance(S.usdc, L.contracts.LabHub, each * BigInt(to.length), 'USDC for Hub');
    const rc = await tx('Multisend USDC', S.c.LabHub.multisendToken(net.usdc, to, to.map(() => each)));
    return txOut('Sent ' + v.amt + ' USDC to ' + to.length + ' addresses', rc);
  });

  // advanced
  T('advanced', 'adv-multi', '🧩 Multicall', 'Ping + increment + save note – three actions in ONE transaction.', [{ k: 'note', label: 'Note', def: 'set via multicall' }], async (v) => {
    const i = S.c.LabHub.interface;
    const rc = await tx('Multicall', S.c.LabHub.multicall([i.encodeFunctionData('ping'), i.encodeFunctionData('increment'), i.encodeFunctionData('saveNote', [v.note])]));
    return txOut('3 calls executed in 1 transaction', rc);
  });
  T('advanced', 'adv-gasless', '🪄 Gasless note (meta-tx)', 'You sign for free; the signature is submitted as a transaction (anyone could relay it).', [{ k: 'note', label: 'Note', def: 'signed, then relayed' }], async (v) => {
    const { sig } = await signNote(v.note);
    const rc = await tx('Submit signed note', S.c.LabHub.saveNoteWithSignature(S.account, v.note, sig));
    return txOut('Note saved from your signature: “' + (await S.c.LabHub.noteOf(S.account)) + '”', rc);
  });
  T('advanced', 'adv-events', '📡 Recent events', 'Read the latest Hub events from the chain logs.', [], async () => {
    const p = S.provider || S.ro;
    const latest = await p.getBlockNumber();
    const hub = R('LabHub');
    const evs = await hub.queryFilter('*', Math.max(0, latest - 2000), latest);
    if (!evs.length) return 'No Hub events in the last 2000 blocks.';
    const box = el('div');
    evs.slice(-15).reverse().forEach((e) => {
      const name = e.fragment ? e.fragment.name : 'event';
      const args = e.args ? [...e.args].map((a) => (typeof a === 'string' && a.startsWith('0x') && a.length === 42 ? short(a) : String(a))).join(', ') : '';
      const d = el('div', 'post');
      d.append(el('b', null, name), document.createTextNode(' (' + args.slice(0, 120) + ') · block ' + e.blockNumber));
      box.appendChild(d);
    });
    return [box];
  }, { btn: 'Read', noWallet: true });
  T('advanced', 'adv-contracts', '📚 Contracts', 'All Base Lab contracts, their owner and on-chain stats.', [], async () => {
    const box = el('div');
    for (const n of NAMES) {
      const d = el('div', 'post');
      d.append(el('b', null, n + ' '), link(short(L.contracts[n]), ex('address', L.contracts[n])));
      box.appendChild(d);
    }
    const st = await R('LabHub').stats();
    box.append(el('div', 'muted', 'Owner ' + short(await R('LabHub').owner()) + ' · counter ' + st[0] + ' · pings ' + st[1] + ' · profiles ' + st[2] + ' · posts ' + st[3] + ' · polls ' + st[4] + ' · locks ' + st[5]));
    box.append(el('div', 'muted', 'LAB supply ' + fmt18(await R('LabToken').totalSupply(), 0) + ' · NFTs ' + (await R('LabNFT').totalSupply())));
    return [box];
  }, { btn: 'Read', noWallet: true });

  // admin
  T('admin', 'adm-ann', '📣 Announcement', 'Shown at the top of Base Lab for everyone.', [{ k: 'text', label: 'Text (empty = remove)', def: 'Welcome to Base Lab! 🧪' }], async (v) => {
    const rc = await tx('Set announcement', S.c.LabHub.setAnnouncement(v.text));
    loadAnnouncement();
    return txOut('Announcement updated', rc);
  }, { admin: true });
  T('admin', 'adm-mint', '🏭 Mint LAB', 'Owner-only minting.', [{ k: 'to', label: 'To', ...ME }, { k: 'amt', label: 'Amount (LAB)', def: '1000' }], async (v) => {
    const rc = await tx('Mint LAB', S.c.LabToken.mint(addr(v.to), amt18(v.amt)));
    return txOut('Minted ' + v.amt + ' LAB', rc);
  }, { admin: true });
  T('admin', 'adm-pause', '⏸️ Pause NFT minting', 'Turn NFT minting on or off.', [{ k: 'p', label: 'Minting', type: 'select', options: ['paused', 'open'], def: 'paused' }], async (v) => {
    const rc = await tx('Set NFT mint pause', S.c.LabNFT.setMintPaused(v.p === 'paused'));
    return txOut('NFT minting is now ' + ((await S.c.LabNFT.mintPaused()) ? 'paused' : 'open'), rc);
  }, { admin: true });

  // shared helpers for tests
  async function signNote(note) {
    const nonce = await S.c.LabHub.nonces(S.account);
    const sig = await S.signer.signTypedData(
      { name: 'Base Lab', version: '1', chainId, verifyingContract: L.contracts.LabHub },
      { SignedNote: [{ name: 'wallet', type: 'address' }, { name: 'note', type: 'string' }, { name: 'nonce', type: 'uint256' }] },
      { wallet: S.account, note, nonce });
    return { sig, nonce };
  }
  async function nftId(v) {
    if (String(v).trim()) return int(v);
    const ids = await S.c.LabNFT.tokensOf(S.account);
    if (!ids.length) throw new Error('You have no NFTs – mint one first');
    return ids[ids.length - 1];
  }

  // ------------------------------------------------------------------ rendering
  const isAdmin = () => S.account && lc(S.account) === lc(L.admin);
  function storeKey() { return 'lab:passed:' + chainId + ':' + lc(S.account || 'anon'); }
  function loadPassed() { try { S.passed = new Set(JSON.parse(localStorage.getItem(storeKey()) || '[]')); } catch (e) { S.passed = new Set(); } }
  function savePassed() { try { localStorage.setItem(storeKey(), JSON.stringify([...S.passed])); } catch (e) { /* ignore */ } }

  function render() {
    const nav = $('nav'), box = $('groups');
    nav.textContent = '';
    box.textContent = '';
    for (const g of GROUPS) {
      if (g.adminOnly && !isAdmin()) continue;
      const tests = TESTS.filter((t) => t.group === g.id);
      const a = el('a');
      a.href = '#g-' + g.id;
      a.style.setProperty('--c1', g.c1); a.style.setProperty('--c2', g.c2);
      a.append(document.createTextNode(g.ico + ' ' + g.title.split(' (')[0]), el('span', 'cnt', tests.length));
      a.id = 'nav-' + g.id;
      nav.appendChild(a);
      const sec = el('section', 'group');
      sec.id = 'g-' + g.id;
      sec.style.setProperty('--c1', g.c1); sec.style.setProperty('--c2', g.c2);
      const head = el('div', 'group-head');
      const tx2 = el('div');
      tx2.append(el('h2', null, g.title), el('p', null, g.desc));
      head.append(el('div', 'ico', g.ico), tx2);
      const grid = el('div', 'grid');
      tests.forEach((t) => grid.appendChild(card(t)));
      sec.append(head, grid);
      box.appendChild(sec);
    }
    updateProgress();
  }

  function card(t) {
    const c = el('div', 'card' + (S.passed.has(t.id) ? ' passed' : ''));
    const body = el('div', 'body');
    const h = el('h3', null, t.title);
    const st = el('span', 'st', S.passed.has(t.id) ? '✓ passed' : 'not run');
    h.appendChild(st);
    body.append(h, el('p', 'desc', t.desc));
    const inputs = {};
    for (const i of t.inputs) {
      body.appendChild(el('label', null, i.label));
      let inp;
      if (i.type === 'select') {
        inp = el('select');
        i.options.forEach((o) => { const op = el('option', null, o); op.value = o; inp.appendChild(op); });
        inp.value = i.def;
      } else {
        inp = el('input');
        inp.type = i.type === 'number' ? 'number' : i.type === 'range' ? 'range' : 'text';
        if (i.type === 'range') { inp.min = i.min; inp.max = i.max; inp.style.background = 'none'; }
        inp.value = i.me && S.account ? S.account : i.def;
        if (i.me) { inp.placeholder = 'your address'; inp.className = 'mono'; inp.dataset.me = '1'; }
        inp.spellcheck = false;
      }
      inputs[i.k] = inp;
      body.appendChild(inp);
    }
    const out = el('div', 'out hidden');
    const actions = el('div', 'actions');
    const btn = el('button', null, (t.btn || 'Run') + ' ▶');
    actions.appendChild(btn);
    body.append(actions, out);
    c.append(el('div', 'bar'), body);
    S.cards[t.id] = { el: c, inputs, out, st };
    btn.onclick = async () => {
      if (!t.noWallet && !S.account) {
        try { if (!(await connect(true))) return; } catch (e) { toast(errMsg(e), 'err'); return; }
      }
      const vals = {};
      for (const k in inputs) vals[k] = inputs[k].value;
      btn.disabled = true;
      c.classList.remove('passed', 'failed'); c.classList.add('running');
      st.textContent = 'running…';
      out.className = 'out';
      out.textContent = '';
      out.innerHTML = '<span class="spinner"></span>Working…';
      try {
        const res = await t.run(vals, out);
        out.textContent = '';
        (Array.isArray(res) ? res : [res]).forEach((p) => out.append(typeof p === 'string' ? document.createTextNode(p) : p));
        out.className = 'out good';
        c.classList.remove('running'); c.classList.add('passed');
        st.textContent = '✓ passed';
        const first = !S.passed.has(t.id);
        S.passed.add(t.id); savePassed(); updateProgress(first);
        if (first) confetti(10);
      } catch (e) {
        console.warn(t.id, e);
        out.textContent = '✗ ' + errMsg(e);
        out.className = 'out err';
        c.classList.remove('running'); c.classList.add('failed');
        st.textContent = '✗ failed';
      } finally { btn.disabled = false; }
    };
    return c;
  }

  function updateProgress(celebrate) {
    const visible = TESTS.filter((t) => !t.admin || isAdmin());
    const n = visible.filter((t) => S.passed.has(t.id)).length;
    $('progNum').textContent = n + '/' + visible.length;
    $('ring').style.setProperty('--p', Math.round((n / visible.length) * 100));
    if (celebrate && n === visible.length && visible.length) { toast('🏆 All tests passed – Base does it all!', 'ok', 6000); confetti(60); }
  }

  // ------------------------------------------------------------------ balances + network
  let balTimer = null;
  function scheduleBalances() { clearTimeout(balTimer); balTimer = setTimeout(() => refreshBalances().catch(() => {}), 800); }
  let lastBal = null;
  async function refreshBalances() {
    if (!S.account) return;
    const a = S.account;
    const [eth, usdc, lab, nfts, items, vault] = await Promise.all([
      S.provider.getBalance(a), usdcR().balanceOf(a).catch(() => 0n), S.c.LabToken.balanceOf(a), S.c.LabNFT.balanceOf(a), S.c.LabItems.balancesOf(a), S.c.LabHub.vaultOf(a),
    ]);
    lastBal = { eth, usdc, lab, nfts, items: items.reduce((x, y) => x + y, 0n), vault };
    const box = $('balChips');
    box.textContent = '';
    const kv = (k, v) => { const d = el('div', 'kv', k); d.appendChild(el('b', null, v)); return d; };
    box.append(kv('ETH', fmt18(eth, 6)), kv('USDC', fmt6(usdc)), kv('LAB', fmt18(lab, 2)), kv('NFTs', String(nfts)), kv('Items', String(lastBal.items)), kv('Vault', fmt18(vault, 6) + ' ETH'));
  }
  function balancesText() {
    if (!lastBal) return 'No data';
    const b = lastBal;
    return `ETH ${fmt18(b.eth, 6)}\nUSDC ${fmt6(b.usdc)}\nLAB ${fmt18(b.lab, 2)}\nNFTs ${b.nfts} · items ${b.items}\nVault ${fmt18(b.vault, 6)} ETH`;
  }
  async function refreshNetwork() {
    const p = S.provider || S.ro;
    try {
      const [b, fee] = await Promise.all([p.getBlockNumber(), p.getFeeData()]);
      const box = $('netChips');
      box.textContent = '';
      const kv = (k, v) => { const d = el('div', 'kv', k); d.appendChild(el('b', null, v)); return d; };
      box.append(kv('Network', net.name), kv('Chain ID', String(chainId)), kv('Block', '#' + b), kv('Gas', Number(E.formatUnits(fee.gasPrice || 0n, 'gwei')).toFixed(4) + ' gwei'));
    } catch (e) { console.warn(e); }
  }
  async function loadAnnouncement() {
    try {
      const a = await R('LabHub').announcement();
      $('announce').textContent = a ? '📣 ' + a : '';
      $('announce').classList.toggle('hidden', !a);
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ wallet
  async function ensureChain() {
    const hex = '0x' + chainId.toString(16);
    const cur = await window.ethereum.request({ method: 'eth_chainId' });
    if (cur === hex) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (e) {
      const c = e && (e.code || (e.data && e.data.originalError && e.data.originalError.code));
      if (c === 4902 || /unrecognized|not added|unknown chain/i.test(String(e && e.message))) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: net.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [net.rpc], blockExplorerUrls: net.explorer ? [net.explorer] : undefined }] });
      } else throw e;
    }
  }
  async function connect(interactive) {
    if (!window.ethereum) {
      toast('Install MetaMask (or open this page in the MetaMask app) to run on-chain tests.', 'err', 8000);
      return false;
    }
    if (interactive) await window.ethereum.request({ method: 'eth_requestAccounts' });
    await ensureChain();
    S.provider = new E.BrowserProvider(window.ethereum, 'any');
    S.signer = await S.provider.getSigner();
    S.account = await S.signer.getAddress();
    for (const n of NAMES) S.c[n] = new E.Contract(L.contracts[n], L.abi[n], S.signer);
    S.usdc = new E.Contract(net.usdc, L.erc20Abi, S.signer);
    $('btnConnect').classList.add('hidden');
    $('meChip').classList.remove('hidden');
    $('meAddr').textContent = short(S.account);
    avatar($('meAv'), S.account);
    loadPassed();
    render();
    refreshBalances().catch((e) => console.warn(e));
    refreshNetwork();
    return true;
  }

  // ------------------------------------------------------------------ start
  async function init() {
    $('netPill').textContent = net.name;
    document.querySelectorAll('.netName').forEach((e) => { e.textContent = net.name; });
    const setup = chainId === L.defaultChainId ? 'setup.html' : 'setup.html?net=' + chainId;
    $('setupLink').href = setup; $('setupLink2').href = setup;
    S.ro = new E.JsonRpcProvider(net.rpc, chainId, { staticNetwork: true });
    for (const n of NAMES) S.cro[n] = new E.Contract(L.contracts[n], L.abi[n], S.ro);
    S.usdcRo = new E.Contract(net.usdc, L.erc20Abi, S.ro);
    try {
      const codes = await Promise.race([Promise.all(NAMES.map((n) => S.ro.getCode(L.contracts[n]))), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 9000))]);
      if (codes.some((c) => c === '0x')) { $('appRoot').classList.add('hidden'); $('notDeployed').classList.remove('hidden'); return; }
    } catch (e) { toast('Could not reach the Base network – check your connection.', 'err', 8000); }
    loadPassed();
    render();
    refreshNetwork();
    loadAnnouncement();
    $('btnConnect').onclick = async () => { try { await connect(true); } catch (e) { toast(errMsg(e), 'err'); } };
    $('meChip').onclick = () => navigator.clipboard && navigator.clipboard.writeText(S.account).then(() => toast('Address copied', 'ok'));
    $('btnRefresh').onclick = () => { refreshNetwork(); refreshBalances().catch(() => {}); loadAnnouncement(); };
    $('btnReset').onclick = () => { S.passed = new Set(); savePassed(); render(); toast('Checklist reset', 'ok'); };
    $('logHead').onclick = () => $('log').classList.toggle('collapsed');
    if (window.ethereum) {
      if (window.ethereum.on) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
      }
      try {
        const accs = await window.ethereum.request({ method: 'eth_accounts' });
        if (accs && accs.length) await connect(false);
      } catch (e) { console.warn(e); }
    }
    setInterval(() => { if (!document.hidden) refreshNetwork(); }, 15000);
  }
  init().catch((e) => { console.error(e); toast(errMsg(e), 'err'); });
})();
