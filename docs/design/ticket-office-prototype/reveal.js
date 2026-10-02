// Reveal: randomness lands (1.8 s), then each cover is torn off in turn.
// Losers stay put and say so quietly; winners tear out of the strip and get stamped.
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const instant = reduce || params.get('at') === 'final';
  const tickets = [...document.querySelectorAll('.rt')];
  const vrfStep = document.querySelector('[data-step="vrf"]');
  const paidStep = document.querySelector('[data-step="paid"]');
  const vrfText = document.querySelector('[data-vrf]');
  const status = document.querySelector('[data-status]');
  const tally = document.querySelector('[data-tally]');
  const total = document.querySelector('[data-total]');
  let timers = [];
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  function fill(t) {
    const w = +t.dataset.win;
    const res = t.querySelector('.res');
    if (w > 0) {
      t.classList.add('win');
      if (w >= 0.05) t.classList.add('big');
      res.innerHTML = '<span class="amt">' + w.toFixed(2) + '<small>SOL<span class="w"> won</span></small></span>';
      t.insertAdjacentHTML('beforeend', '<svg class="wstamp" viewBox="0 0 80 80" aria-hidden="true"><use href="#won"/></svg>');
      t.setAttribute('aria-label', t.querySelector('.serial').textContent + ': won ' + w.toFixed(2) + ' SOL');
    } else {
      res.innerHTML = '<span class="none">no win</span>';
      t.setAttribute('aria-label', t.querySelector('.serial').textContent + ': no win');
    }
  }

  function reset() {
    timers.forEach(clearTimeout); timers = [];
    tickets.forEach(t => { t.classList.remove('shown', 'win', 'big'); t.querySelector('.res').innerHTML = ''; const s = t.querySelector('.wstamp'); if (s) s.remove(); });
    vrfStep.className = 'busy'; paidStep.className = '';
    vrfText.textContent = 'waiting…';
    status.textContent = 'Waiting for the randomness to land…';
    tally.textContent = '0.00 SOL';
    tally.previousSibling.textContent = 'Won so far';
    total.classList.remove('on');
  }

  function landed() {
    vrfStep.className = 'done';
    vrfText.innerHTML = 'landed in 1.8 s <a class="proof" href="#">request</a>';
    status.textContent = 'Tearing off the covers, one at a time';
  }
  function finish() {
    paidStep.className = 'done';
    status.textContent = 'All 10 revealed';
    tally.previousSibling.textContent = 'Total ';
    total.classList.add('on');
  }

  function run() {
    reset();
    tickets.forEach(fill);
    let won = 0;
    if (instant) {
      landed();
      tickets.forEach(t => t.classList.add('shown'));
      tally.textContent = '0.08 SOL';
      finish();
      return;
    }
    let at = 1800;
    later(at, landed);
    at += 450;
    tickets.forEach(t => {
      const w = +t.dataset.win;
      later(at, () => {
        t.classList.add('shown');
        if (w > 0) { won += w; later(280, () => (tally.textContent = won.toFixed(2) + ' SOL')); }
      });
      at += w > 0 ? 760 : 330; // winners get a beat to land
    });
    later(at + 250, finish);
  }

  document.querySelector('[data-replay]').addEventListener('click', run);
  run();
})();
