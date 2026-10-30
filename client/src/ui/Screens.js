// ============================================================================
// client/src/ui/Screens.js
// ----------------------------------------------------------------------------
// The full-screen panels drawn over the 3D view: main menu, lobby, pause.
// This class only deals with the page (HTML); it calls back into main.js
// (through the `handlers` object) when the player clicks something.
// ============================================================================

const $ = (id) => document.getElementById(id);

export class Screens {
  /**
   * @param {object} handlers - { onCreate(name), onJoin(code, name), onStart(), onLeave(), onResume() }
   */
  constructor(handlers) {
    this.overlay = $('overlay');
    this.screens = {
      menu: $('screen-menu'),
      lobby: $('screen-lobby'),
      pause: $('screen-pause'),
      scoreboard: $('screen-scoreboard'),
      planning: $('screen-planning'),
    };

    // Remember the name between visits (browser storage; may be unavailable).
    try { $('menu-name').value = localStorage.getItem('heist-name') || ''; } catch { /* private mode */ }
    const name = () => {
      const value = $('menu-name').value.trim();
      try { localStorage.setItem('heist-name', value); } catch { /* ignore */ }
      return value;
    };

    $('menu-create').addEventListener('click', () => handlers.onCreate(name()));
    $('menu-join').addEventListener('click', () => handlers.onJoin($('menu-code').value, name()));
    $('menu-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('menu-join').click(); });
    $('lobby-start').addEventListener('click', () => handlers.onStart());
    $('lobby-leave').addEventListener('click', () => handlers.onLeave());
    $('lobby-copy').addEventListener('click', () => this.copyLink());
    $('pause-resume').addEventListener('click', () => handlers.onResume());
    $('score-lobby').addEventListener('click', () => handlers.onBackToLobby());

    // Opened from a shared link (?room=ABCD): pre-fill the code.
    const code = new URLSearchParams(window.location.search).get('room');
    if (code) {
      $('menu-code').value = code.toUpperCase();
      $('menu-join').textContent = `Join ${code.toUpperCase()}`;
    }
    this.setBusy(true);
  }

  /** Show one screen (or none, with null). */
  show(name) {
    this.current = name;
    for (const [key, el] of Object.entries(this.screens)) el.classList.toggle('hidden', key !== name);
    this.overlay.classList.toggle('hidden', name === null);
  }

  /** Disable menu buttons while loading or waiting for the server. */
  setBusy(busy) {
    $('menu-create').disabled = busy;
    $('menu-join').disabled = busy;
    if (!busy) $('loading-text').textContent = '';
  }

  showError(message) {
    $('menu-error').textContent = message || '';
  }

  /** Fill the lobby with the latest room info from the server. */
  updateLobby(state, yourId) {
    $('lobby-code').textContent = state.code;
    const link = `${window.location.origin}${window.location.pathname}?room=${state.code}`;
    $('lobby-link').value = link;

    const list = $('lobby-players');
    list.innerHTML = '';
    for (const p of state.players) {
      const li = document.createElement('li');
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
      const label = document.createElement('span');
      label.textContent = p.name + (p.id === yourId ? ' (you)' : ''); // textContent = safe from HTML injection
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.id === state.hostId ? 'HOST' : '';
      li.append(swatch, label, tag);
      list.appendChild(li);
    }

    const isHost = state.hostId === yourId;
    $('lobby-start').classList.toggle('hidden', !isHost);
    $('lobby-wait').classList.toggle('hidden', isHost);
  }

  /** Fill and show the end-of-match scoreboard. */
  showScoreboard(results, isHost, reason) {
    const money = (v) => `$${v.toLocaleString('en-US')}`;
    const winner = results.find((r) => r.escaped && r.score > 0);
    const why = { police: 'The police stormed the building. ', time: 'Time ran out. ', allOut: '' }[reason] ?? '';
    $('score-winner').textContent = why + (winner
      ? `${winner.name} wins with ${money(winner.score)}!`
      : 'Nobody made it out with any loot.');

    const table = $('score-table');
    table.innerHTML = '';
    results.forEach((r, i) => {
      const row = table.insertRow();
      if (r === winner) row.className = 'winner';
      row.insertCell().textContent = `${i + 1}.`;
      const nameCell = row.insertCell();
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = `#${r.color.toString(16).padStart(6, '0')}`;
      nameCell.append(swatch, document.createTextNode(r.name));
      row.insertCell().textContent = r.escaped ? 'Escaped' : `Caught inside (lost ${money(r.lost)})`;
      const scoreCell = row.insertCell();
      scoreCell.className = 'money';
      scoreCell.textContent = money(r.score);
    });
    this.setScoreboardHost(isHost);
    this.show('scoreboard');
  }

  setScoreboardHost(isHost) {
    $('score-lobby').classList.toggle('hidden', !isHost);
    $('score-wait').classList.toggle('hidden', isHost);
  }

  copyLink() {
    const input = $('lobby-link');
    navigator.clipboard?.writeText(input.value).catch(() => {});
    input.select();
    $('lobby-copy').textContent = 'Copied!';
    setTimeout(() => { $('lobby-copy').textContent = 'Copy link'; }, 1500);
  }
}
