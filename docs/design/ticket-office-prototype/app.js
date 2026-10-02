// DrawSol ticket office — prototype behaviour: quantity, confirm, countdown, recompute.
(() => {
  const PRICE = 0.01, MAX_PER_BUY = 25, CAN_BUY = 34;
  const max = Math.min(MAX_PER_BUY, CAN_BUY);
  let qty = 10;
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  /* ---------- quantity ---------- */
  function render() {
    const total = (qty * PRICE).toFixed(2) + ' SOL';
    $$('[data-qty]').forEach(el => (el.textContent = qty));
    $$('[data-qty-word]').forEach(el => (el.textContent = qty === 1 ? 'ticket' : 'tickets'));
    $$('[data-total]').forEach(el => (el.textContent = total));
    $$('[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.pick === qty)));
    $$('[data-step="-1"]').forEach(b => (b.disabled = qty <= 1));
    $$('[data-step="1"]').forEach(b => (b.disabled = qty >= max));
  }
  $$('[data-step]').forEach(b => b.addEventListener('click', () => { qty = Math.max(1, Math.min(max, qty + +b.dataset.step)); render(); }));
  $$('[data-pick]').forEach(b => b.addEventListener('click', () => { qty = +b.dataset.pick; render(); }));

  /* ---------- confirm step ---------- */
  const stub = document.getElementById('stub');
  const confirm = document.getElementById('confirm');
  const sheet = document.querySelector('.sheet');
  const mobile = window.matchMedia('(max-width: 760px)');
  const pay = confirm.querySelector('[data-pay]');
  const msg = confirm.querySelector('.msg');
  const adult = confirm.querySelector('[name=adult]');
  if (store.get('drawsol.adult') === 'yes') confirm.classList.add('remembered');

  function check() {
    const pick = confirm.querySelector('[name=planet]:checked');
    const right = pick && pick.value === 'mars';
    msg.className = 'msg' + (pick ? (right ? ' ok' : ' no') : '');
    msg.textContent = pick ? (right ? 'Correct.' : 'Not quite. Have another go.') : '';
    const okAge = confirm.classList.contains('remembered') || adult.checked;
    pay.disabled = !(right && okAge);
  }
  confirm.addEventListener('change', check);

  function open() {
    if (mobile.matches) { sheet.appendChild(confirm); document.body.classList.add('sheet-open'); }
    else { stub.appendChild(confirm); stub.classList.add('is-confirm'); }
    check();
    const first = confirm.querySelector('[name=planet]');
    setTimeout(() => first && first.focus({ preventScroll: true }), 50);
  }
  function close() {
    stub.classList.remove('is-confirm');
    document.body.classList.remove('sheet-open');
    const buy = stub.querySelector('[data-buy]');
    if (!mobile.matches && buy) buy.focus({ preventScroll: true });
  }
  $$('[data-buy]').forEach(b => b.addEventListener('click', open));
  $$('[data-back]').forEach(b => b.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  confirm.addEventListener('submit', e => {
    e.preventDefault();
    if (pay.disabled) return;
    if (adult.checked) store.set('drawsol.adult', 'yes');
    location.href = 'reveal.html?n=' + qty;
  });

  /* ---------- countdown: fixed close, Sun 4 Oct 04:13 UTC ---------- */
  // Prototype clock: start exactly 2 d 5 h 31 min 40 s before close, then tick for real.
  const closeAt = Date.UTC(2026, 9, 4, 4, 13);
  const startLeft = (((2 * 24 + 5) * 60 + 31) * 60 + 40) * 1000;
  const t0 = Date.now();
  const cd = document.getElementById('countdown');
  function tick() {
    const left = Math.max(0, startLeft - (Date.now() - t0));
    const m = Math.floor(left / 60000);
    cd.querySelector('[data-d]').textContent = Math.floor(m / 1440);
    cd.querySelector('[data-h]').textContent = Math.floor((m % 1440) / 60);
    cd.querySelector('[data-m]').textContent = String(m % 60).padStart(2, '0');
  }
  tick(); setInterval(tick, 1000);
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== 'UTC' && tz !== 'Etc/UTC') {
      const local = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(closeAt);
      document.getElementById('localtime').textContent = 'That’s ' + local + ' your time.';
    }
  } catch {}

  /* ---------- recompute Draw Nº 2 in the browser ---------- */
  const R2 = 'c4f5d789e5c19c5944107af030accdf39216f9edd57e16552992c8fa7e9d12b1f0111f581a099764bf7175dfb47c3466cd015baf6648540d0706ae658aeadcfa';
  const btn = document.querySelector('[data-recompute]');
  if (btn) btn.addEventListener('click', async () => {
    const out = btn.parentElement.querySelector('.out');
    try {
      const rand = new Uint8Array(R2.match(/../g).map(h => parseInt(h, 16)));
      const tag = new TextEncoder().encode('draw');
      const buf = new Uint8Array(rand.length + tag.length); buf.set(rand); buf.set(tag, rand.length);
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      let r = 0n; for (let i = 7; i >= 0; i--) r = (r << 8n) | BigInt(h[i]);
      const w = Number((r * 102n) >> 64n);
      out.innerHTML = '= ticket <b>#' + String(w).padStart(4, '0') + '</b>. Matches the settled draw.';
    } catch (e) {
      out.textContent = 'Your browser blocked the hash function here. Try the page over https.';
    }
  });

  render();
})();
