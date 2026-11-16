// The DOM HUD: crosshair, hit marker, health, ammo, round timer, score, economy, killfeed,
// objective banner, plant/defuse hint, buy menu and the one overlay panel. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'GLASSHOUSE',
    copy: 'Night shift at the glassworks. Your crew plants the furnace charge; the guards defuse. First to 7 rounds.',
    action: 'Click to play',
  },
  paused: {
    title: 'GLASSHOUSE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundWon: { title: 'Round won', copy: 'The charge is set — or the guards are down.', action: 'Next round' },
  roundLost: { title: 'Round lost', copy: 'The shift ends here. Buy better next round.', action: 'Next round' },
  won: { title: 'GLASSHOUSE cleared', copy: 'Your crew takes the works, 7 rounds.', action: 'Play again' },
  lost: { title: 'Guards hold the works', copy: 'They reached 7 first. Another night, then.', action: 'Play again' },
};

let WEAPONS_REF = {};
export function setWeaponTable(table) {
  WEAPONS_REF = table;
}

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const stats = document.getElementById('overlay-stats');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const scoreTeam = document.getElementById('score-team');
  const scoreFoe = document.getElementById('score-foe');
  const roundTimer = document.getElementById('round-timer');
  const roundLabel = document.getElementById('round-label');
  const economyValue = document.getElementById('economy-value');
  const objective = document.getElementById('objective');
  const killfeed = document.getElementById('killfeed');
  const bombHint = document.getElementById('bomb-hint');
  const buy = document.getElementById('buy');
  const buyFunds = document.getElementById('buy-funds');
  const buyGrid = document.getElementById('buy-grid');

  let hitTimer = 0;
  let feed = [];

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      weaponName.textContent = name;
    },
    setHealth(hp) {
      healthValue.textContent = String(Math.max(0, Math.round(hp)));
      healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthFill.classList.toggle('low', hp <= 35);
    },
    setScore(team, foe, round) {
      scoreTeam.textContent = String(team);
      scoreFoe.textContent = String(foe);
      roundLabel.textContent = `round ${round}`;
    },
    setTimer(msLeft) {
      roundTimer.textContent = fmt(msLeft);
      roundTimer.classList.toggle('urgent', msLeft < 20000);
    },
    setFunds(usd) {
      economyValue.textContent = `$${usd}`;
      buyFunds.textContent = `$${usd}`;
    },
    setObjective(text) {
      if (!text) {
        objective.classList.remove('on');
      } else {
        objective.textContent = text;
        objective.classList.add('on');
      }
    },
    setBombHint(text) {
      if (!text) bombHint.classList.remove('on');
      else {
        bombHint.innerHTML = text;
        bombHint.classList.add('on');
      }
    },
    hitMarker(killed, holdMs = 90) {
      const marker = document.getElementById('hitmarker');
      marker.classList.add('on');
      marker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        marker.classList.remove('on');
        marker.style.transform = '';
      }, holdMs);
    },
    addKill(killer, victim, headshot) {
      feed.unshift(`<div><b>${killer}</b> ${headshot ? '⊙' : '×'} ${victim}</div>`);
      if (feed.length > 4) feed.pop();
      killfeed.innerHTML = feed.join('');
    },
    clearKillfeed() {
      feed = [];
      killfeed.innerHTML = '';
    },
    showOverlay(mode, extra) {
      const text = COPY[mode] ?? COPY.start;
      title.textContent = text.title;
      copy.textContent = text.copy;
      stats.innerHTML = extra ?? '';
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    // Buy menu: the three weapons + grenade; click a card to buy it.
    renderBuy(funds, owned, onBuy) {
      buyGrid.innerHTML = '';
      const items = [];
      for (const [id, w] of Object.entries(WEAPONS_REF)) {
        items.push({ id, n: w.name, d: w.desc, p: w.price });
      }
      items.push({ id: 'grenade', n: 'FLASHJAR ×2', d: 'thrown · area burst', p: 300 });
      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'buy-item';
        const ownedAlready = item.id === 'grenade' ? owned.grenades >= 2 : owned.gun === item.id;
        const tooPoor = funds < item.p;
        if (ownedAlready) el.classList.add('owned');
        else if (tooPoor) el.classList.add('poor');
        el.innerHTML = `<div><div class="n">${item.n}</div><div class="d">${item.d}</div></div><div class="p">${item.p === 0 ? 'FREE' : `$${item.p}`}</div>`;
        if (!ownedAlready && !tooPoor) {
          el.addEventListener('click', () => onBuy(item.id));
        }
        buyGrid.appendChild(el);
      }
      buyFunds.textContent = `$${funds}`;
    },
    showBuy(funds, owned, onBuy) {
      this.renderBuy(funds, owned, onBuy);
      buy.hidden = false;
    },
    hideBuy() {
      buy.hidden = true;
    },
    isBuyOpen() {
      return !buy.hidden;
    },
  };
}
