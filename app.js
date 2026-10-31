/* Popote & Mijote — application */
(function () {
  'use strict';
  const PM = window.PM;
  const KEY = 'popote-mijote-v1';
  const COLORS = { peche: '#FFDCCB', menthe: '#CFF0E2', lavande: '#E5DEFF', beurre: '#FFEFB3', ciel: '#D5E9FF', rose: '#FFD8E3' };
  const COLOR_KEYS = Object.keys(COLORS);
  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const MEALS = [['midi', 'Midi'], ['soir', 'Soir']];
  const DEFAULT_TAGS = ['Rapide', 'Végé', 'Viande', 'Poisson', 'Soupe', 'Salade', 'Plat complet', 'Léger', 'Gourmand', 'Batch cooking', 'Hiver', 'Été', 'Dessert', 'Apéro'];
  const DEFAULT_PANTRY = ['Sel', 'Poivre', "Huile d'olive", 'Huile', 'Vinaigre', 'Sucre', 'Farine', 'Moutarde', 'Herbes de Provence', 'Thym', 'Laurier'];
  const EMOJIS = ['🍽️', '🍲', '🥗', '🍝', '🍕', '🍛', '🍜', '🍚', '🥘', '🌮', '🥙', '🍔', '🥪', '🥧', '🍳', '🥞', '🧀', '🐟', '🦐', '🍗', '🥩', '🥕', '🥦', '🍆', '🍄', '🥔', '🌽', '🍅', '🥑', '🫘', '🍰', '🍫', '🍮', '🍎', '🍓', '🍋', '🥐', '🍪', '🧁', '🍹'];
  const AI_LINKS = [['ChatGPT', 'https://chatgpt.com'], ['Gemini', 'https://gemini.google.com'], ['Le Chat', 'https://chat.mistral.ai'], ['Claude', 'https://claude.ai']];

  // ---------- utilitaires ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  function hashIdx(s, n) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % n; }
  const colOf = r => COLORS[r && r.color] || COLORS[COLOR_KEYS[hashIdx(r ? r.id || r.title : 'x', COLOR_KEYS.length)]];
  const plural = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  function editNum(n) { if (n == null || isNaN(n)) return ''; return String(Math.round(n * 100) / 100).replace('.', ','); }

  // ---------- données ----------
  function defaultDb() { return { v: 1, recipes: {}, weeks: {}, pantry: DEFAULT_PANTRY.slice(), tags: DEFAULT_TAGS.slice(), settings: { people: 2 } }; }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.recipes) {
        const base = defaultDb();
        return Object.assign(base, d, { settings: Object.assign(base.settings, d.settings || {}) });
      }
    } catch (e) { /* stockage indisponible */ }
    return defaultDb();
  }
  let db = load();
  let persistAsked = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast("Impossible d'enregistrer sur ce téléphone"); }
    if (!persistAsked) { persistAsked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { } }
  }
  const recipeList = () => Object.values(db.recipes).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  function getWeek(k, create) {
    if (!db.weeks[k] && create) db.weeks[k] = { slots: {}, checked: {}, extras: [] };
    const w = db.weeks[k];
    if (w) { w.slots = w.slots || {}; w.checked = w.checked || {}; w.extras = w.extras || []; }
    return w;
  }
  function weekEntries(k) {
    const w = db.weeks[k]; const out = [];
    if (!w) return out;
    for (const items of Object.values(w.slots)) for (const it of items) if (db.recipes[it.rid]) out.push({ recipe: db.recipes[it.rid], people: it.people });
    return out;
  }

  // ---------- dates ----------
  function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function dateOf(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function defaultWeek() { const t = new Date(); return keyOf(mondayOf((t.getDay() + 6) % 7 >= 4 ? addDays(t, 7) : t)); }
  const fmtShort = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  function weekLabel(k) {
    const a = dateOf(k), b = addDays(a, 6);
    const sameMonth = a.getMonth() === b.getMonth();
    return (sameMonth ? a.getDate() : fmtShort(a)) + ' – ' + fmtShort(b);
  }
  function weekRel(k) {
    const cur = keyOf(mondayOf(new Date()));
    const diff = Math.round((dateOf(k) - dateOf(cur)) / 864e5 / 7);
    return diff === 0 ? 'Cette semaine' : diff === 1 ? 'Semaine prochaine' : diff === -1 ? 'Semaine dernière' : diff > 0 ? 'Dans ' + diff + ' semaines' : 'Il y a ' + (-diff) + ' semaines';
  }

  // ---------- état d'interface ----------
  const ui = { week: defaultWeek(), q: '', tags: [], people: {}, draft: null, picker: null, cook: null, imp: null, nav: 0, route: '', installEvt: null };

  // ---------- toast ----------
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------- feuilles (bottom sheets) ----------
  let sheetOpen = false, sheetFn = null, afterClose = null;
  function openSheet(fn) {
    sheetFn = fn;
    if (!sheetOpen) { sheetOpen = true; history.pushState({ sheet: 1 }, ''); }
    drawSheet(true);
  }
  function drawSheet(anim) {
    const root = $('#sheet-root');
    root.innerHTML = '<div class="backdrop" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + sheetFn() + '</div>';
    if (anim) { root.classList.remove('open'); requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open'))); }
    else root.classList.add('open');
  }
  function closeSheet(then) { if (!sheetOpen) { if (then) then(); return; } afterClose = then || null; history.back(); }
  window.addEventListener('popstate', () => {
    if (sheetOpen) {
      sheetOpen = false;
      const root = $('#sheet-root'); root.classList.remove('open');
      setTimeout(() => { if (!sheetOpen) root.innerHTML = ''; }, 250);
      const f = afterClose; afterClose = null; if (f) setTimeout(f, 10);
    }
  });
  function confirmSheet(title, text, okLabel, onOk, danger) {
    openSheet(() => '<h3 class="sheet-title">' + esc(title) + '</h3>' + (text ? '<p class="muted">' + esc(text) + '</p>' : '') +
      '<div class="btn-row"><button class="btn ghost" data-act="closeSheet">Annuler</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="confirmOk">' + esc(okLabel) + '</button></div>');
    A.confirmOk = () => closeSheet(onOk);
  }

  // ---------- composants ----------
  function stepper(v, act, attrs) {
    attrs = attrs || '';
    return '<div class="stepper"><button data-act="' + act + '" data-d="-1" ' + attrs + ' aria-label="Moins">−</button><b>' + v + '</b><button data-act="' + act + '" data-d="1" ' + attrs + ' aria-label="Plus">+</button></div>';
  }
  function chips(selected, act, all) {
    return '<div class="chips">' + (all || db.tags).map(t => '<button class="chip' + (selected.includes(t) ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>';
  }
  function filterRecipes(q, tags) {
    const f = PM.fold(q).trim();
    return recipeList().filter(r => (!tags.length || tags.every(t => (r.tags || []).includes(t))) &&
      (!f || PM.fold(r.title).includes(f) || (r.ingredients || []).some(i => PM.fold(i.name).includes(f))));
  }
  function metaLine(r) {
    const bits = [];
    if (r.time) bits.push('⏱ ' + fmtTime(r.time));
    if (r.tags && r.tags.length) bits.push(r.tags.slice(0, 2).join(' · '));
    return bits.join('  ·  ');
  }
  function fmtTime(m) { if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + pad(r) : ''); }
  function weekNav(compact) {
    return '<div class="weeknav' + (compact ? ' compact' : '') + '"><button class="round" data-act="weekMove" data-d="-1" aria-label="Semaine précédente">‹</button>' +
      '<div class="wk"><small>' + weekRel(ui.week) + '</small><b>' + weekLabel(ui.week) + '</b></div>' +
      '<button class="round" data-act="weekMove" data-d="1" aria-label="Semaine suivante">›</button></div>';
  }
  function emptyState(emoji, title, text, btn) {
    return '<div class="empty"><div class="empty-emo">' + emoji + '</div><h2>' + title + '</h2><p>' + text + '</p>' + (btn || '') + '</div>';
  }
  const LOGO = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M24 14c0-4 4-4 4-8M33 14c0-4 4-4 4-8" fill="none" stroke="#F2785C" stroke-width="3" stroke-linecap="round"/><rect x="8" y="24" width="48" height="8" rx="4" fill="#2F2A35"/><path d="M12 32h40v12a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12z" fill="#FFB89C"/><path d="M4 36h8M52 36h8" stroke="#2F2A35" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="20" r="3.5" fill="#2F2A35"/></svg>';

  // ================= VUES =================
  // ---------- Semaine ----------
  function viewWeek() {
    const w = db.weeks[ui.week];
    const mon = dateOf(ui.week);
    const today = keyOf(new Date());
    const entries = weekEntries(ui.week);
    const nRec = Object.keys(db.recipes).length;
    let h = '<header class="top brandbar">' + LOGO + '<div class="brand">Popote <i>&amp;</i> Mijote</div><button class="round ghost" data-act="weekMenu" aria-label="Options">⋯</button></header>';
    if (ui.installEvt && !isStandalone() && !db.settings.hideInstall) h += '<div class="banner"><span>📲 Installe l\'app sur ton téléphone</span><button class="btn small primary" data-act="install">Installer</button><button class="x small" data-act="hideInstall" aria-label="Fermer">×</button></div>';
    h += weekNav();
    if (!nRec) {
      h += emptyState('🥄', 'Ta popote est vide', 'Ajoute tes premières recettes, puis reviens ici composer ton menu de la semaine.', '<button class="btn primary" data-act="addRecipe">+ Ajouter une recette</button>');
      return h;
    }
    const portions = entries.reduce((s, e) => s + e.people, 0);
    h += '<div class="summary"><span>' + (entries.length ? plural(entries.length, 'repas', 'repas') + ' · ' + plural(portions, 'portion') : 'Aucun repas prévu') + '</span>' +
      (entries.length ? '<a class="btn small soft" href="#courses">🛒 Liste de courses</a>' : '') + '</div>';
    for (let d = 0; d < 7; d++) {
      const day = addDays(mon, d); const dk = keyOf(day);
      h += '<section class="day' + (dk === today ? ' today' : '') + (dk < today ? ' past' : '') + '"><h2>' + DAYS[d] + ' <span>' + fmtShort(day) + '</span>' + (dk === today ? '<em>aujourd\'hui</em>' : '') + '</h2>';
      for (const [m, label] of MEALS) {
        const sk = d + '-' + m;
        const items = (w && w.slots[sk]) || [];
        h += '<div class="slot"><span class="slot-label">' + label + '</span><div class="slot-items">';
        items.forEach((it, i) => {
          const r = db.recipes[it.rid]; if (!r) return;
          h += '<button class="pill" style="--c:' + colOf(r) + '" data-act="mealMenu" data-slot="' + sk + '" data-i="' + i + '"><span class="e">' + r.emoji + '</span><b>' + esc(r.title) + '</b><em>' + it.people + ' 👤</em></button>';
        });
        h += '<button class="add' + (items.length ? ' mini' : '') + '" data-act="addMeal" data-slot="' + sk + '" aria-label="Ajouter un plat">' + (items.length ? '+' : '+ Choisir') + '</button></div></div>';
      }
      h += '</section>';
    }
    return h;
  }

  // ---------- Recettes ----------
  function viewRecipes() {
    const all = recipeList();
    let h = '<header class="top"><h1>Mes recettes</h1>' + (all.length ? '<span class="count">' + all.length + '</span>' : '') + '</header>';
    if (!all.length) {
      h += emptyState('📖', 'Aucune recette pour l\'instant', 'Saisis-en une, colle un texte, ou laisse une IA la mettre en forme pour toi.', '<button class="btn primary" data-act="addRecipe">+ Ajouter une recette</button>');
      return h;
    }
    h += '<div class="search"><input type="search" data-in="q" placeholder="Chercher (titre, ingrédient…)" value="' + esc(ui.q) + '"></div>';
    h += chips(ui.tags, 'filterTag');
    h += '<div id="rec-list" class="rlist">' + recipeCards() + '</div>';
    h += '<button class="fab" data-act="addRecipe">+ Ajouter</button>';
    return h;
  }
  function recipeCards() {
    const list = filterRecipes(ui.q, ui.tags);
    if (!list.length) return '<p class="muted center pad">Aucune recette ne correspond.</p>';
    return list.map(r => '<a class="rcard" href="#recette-' + r.id + '" style="--c:' + colOf(r) + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + esc(r.title) + '</b><small>' + esc(metaLine(r) || plural((r.ingredients || []).length, 'ingrédient')) + '</small></span><span class="chev">›</span></a>').join('');
  }

  // ---------- Détail recette ----------
  function ingList(r, n, mode) {
    return '<ul class="ings">' + (r.ingredients || []).map((i, k) => {
      const a = i.qty != null ? PM.fmtAmount(i.qty * n, i.unit, 'recipe') : '';
      const done = mode === 'cook' && ui.cook && ui.cook.ing[k];
      return '<li' + (mode === 'cook' ? ' data-act="cookIng" data-i="' + k + '" class="tick' + (done ? ' done' : '') + '"' : '') + '>' + (mode === 'cook' ? '<span class="box"></span>' : '') +
        '<span class="amt">' + esc(a) + '</span><span class="iname">' + esc(i.name) + (i.note ? ' <small>' + esc(i.note) + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function hero(r, back) {
    return '<div class="hero" style="--c:' + colOf(r) + '"><button class="round back" data-act="back" data-to="' + back + '" aria-label="Retour">‹</button>' +
      '<div class="hero-emo">' + r.emoji + '</div><h1>' + esc(r.title) + '</h1>' +
      '<div class="meta">' + (r.time ? '<span>⏱ ' + fmtTime(r.time) + '</span>' : '') + (r.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></div>';
  }
  function viewDetail(id) {
    const r = db.recipes[id];
    if (!r) return emptyState('🤔', 'Recette introuvable', 'Elle a peut-être été supprimée.', '<a class="btn primary" href="#recettes">Mes recettes</a>');
    const n = ui.people[id] || db.settings.people;
    let h = hero(r, 'recettes');
    h += '<div class="card"><div class="row-between"><h2>Ingrédients</h2><div class="pp">' + stepper(n, 'detPeople', 'data-id="' + id + '"') + '<small>pers.</small></div></div>' + ingList(r, n) + '</div>';
    if (r.steps && r.steps.length) h += '<div class="card"><h2>Préparation</h2><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>';
    if (r.notes) h += '<div class="card note"><h2>Notes</h2><p>' + esc(r.notes).replace(/\n/g, '<br>') + '</p></div>';
    h += '<div class="actions"><button class="btn primary big" data-act="cook" data-id="' + id + '">👩‍🍳 Mode cuisine</button>' +
      '<div class="act-row"><button class="btn soft" data-act="toMenu" data-id="' + id + '">📅 Au menu</button><button class="btn soft" data-act="share" data-id="' + id + '">↗ Partager</button><a class="btn soft" href="#edition-' + id + '">✏️ Modifier</a></div></div>';
    return h;
  }

  // ---------- Éditeur ----------
  function newDraft() { return { id: null, title: '', emoji: '🍽️', emojiManual: false, color: COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)], servings: db.settings.people, time: '', tags: [], ings: [blankIng(), blankIng(), blankIng()], steps: '', notes: '' }; }
  function blankIng() { return { qty: '', unit: '', name: '', note: '', cat: '', catManual: false }; }
  function draftFromRecipe(r) {
    const n = r.servings || db.settings.people;
    return { id: r.id, title: r.title, emoji: r.emoji, emojiManual: true, color: r.color, servings: n, time: r.time || '', tags: (r.tags || []).slice(),
      ings: (r.ingredients || []).map(i => ({ qty: i.qty != null ? editNum(i.qty * n) : '', unit: i.unit || '', name: i.name, note: i.note || '', cat: i.cat, catManual: true })).concat([blankIng()]),
      steps: (r.steps || []).join('\n'), notes: r.notes || '' };
  }
  function draftFromParsed(p) {
    const d = newDraft();
    d.title = p.title || ''; d.emoji = PM.guessEmoji(d.title); d.servings = p.servings || db.settings.people; d.servingsUnknown = !p.servings;
    d.time = p.time || ''; d.tags = (p.tags || []).map(t => db.tags.find(x => PM.fold(x) === PM.fold(t))).filter(Boolean);
    d.ings = p.ingredients.map(i => ({ qty: i.qty != null ? editNum(i.qty) : '', unit: i.unit, name: i.name, note: i.note || '', cat: i.cat, catManual: false })).concat([blankIng()]);
    d.steps = p.steps.join('\n'); d.notes = p.notes || ''; d.imported = true;
    return d;
  }
  function unitOptions(sel) {
    return PM.UNITS.map(u => '<option value="' + esc(u) + '"' + (u === sel ? ' selected' : '') + '>' + (u || 'pièce') + '</option>').join('');
  }
  function catOptions(sel) { return PM.CATEGORIES.map(c => '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + c.emoji + ' ' + c.name + '</option>').join(''); }
  function ingRow(i, k) {
    return '<div class="ing-row" data-i="' + k + '"><input class="q" inputmode="decimal" placeholder="Qté" data-in="ingQty" data-i="' + k + '" value="' + esc(i.qty) + '">' +
      '<select class="u" data-in="ingUnit" data-i="' + k + '">' + unitOptions(i.unit) + '</select>' +
      '<input class="n" placeholder="Ingrédient" data-in="ingName" data-i="' + k + '" value="' + esc(i.name) + '">' +
      '<button class="x" data-act="ingDel" data-i="' + k + '" aria-label="Retirer">×</button>' +
      '<select class="c" data-in="ingCat" data-i="' + k + '" aria-label="Rayon">' + catOptions(i.cat || (i.name ? PM.categorize(i.name) : 'au')) + '</select></div>';
  }
  function viewEditor() {
    const d = ui.draft;
    let h = '<header class="top"><button class="round ghost" data-act="back" data-to="' + (d.id ? 'recette-' + d.id : 'recettes') + '" aria-label="Retour">‹</button><h1>' + (d.id ? 'Modifier' : 'Nouvelle recette') + '</h1></header>';
    if (d.imported) h += '<div class="banner soft">✨ Recette importée : vérifie les quantités et le nombre de personnes, puis enregistre.</div>';
    h += '<div class="card form">' +
      '<div class="title-row"><button class="emo-btn" data-act="pickEmoji" style="--c:' + COLORS[d.color] + '" aria-label="Changer l\'emoji">' + d.emoji + '</button>' +
      '<input class="title-in" data-in="dTitle" placeholder="Nom de la recette" value="' + esc(d.title) + '"></div>' +
      '<div class="colors">' + COLOR_KEYS.map(c => '<button class="dot' + (c === d.color ? ' on' : '') + '" style="--c:' + COLORS[c] + '" data-act="dColor" data-v="' + c + '" aria-label="' + c + '"></button>').join('') + '</div>' +
      '<div class="row-between' + (d.servingsUnknown ? ' warn' : '') + '"><label>Recette pour</label><div class="pp">' + stepper(d.servings, 'dServ') + '<small>pers.</small></div></div>' +
      '<div class="row-between"><label for="dtime">Temps total</label><div class="pp"><input id="dtime" class="time-in" inputmode="numeric" data-in="dTime" value="' + esc(d.time) + '" placeholder="—"><small>min</small></div></div>' +
      '</div>';
    h += '<div class="card form"><h2>Ingrédients</h2><p class="hint">Saisis les quantités pour ' + plural(d.servings, 'personne') + ', comme dans la recette.</p><div id="ings">' + d.ings.map(ingRow).join('') + '</div>' +
      '<button class="btn soft wide" data-act="ingAdd">+ Ingrédient</button></div>';
    h += '<div class="card form"><h2>Étapes</h2><p class="hint">Une étape par ligne.</p><textarea rows="7" data-in="dSteps" placeholder="Émincer les oignons…">' + esc(d.steps) + '</textarea></div>';
    h += '<div class="card form"><h2>Tags</h2>' + chips(d.tags, 'dTag') + '</div>';
    h += '<div class="card form"><h2>Notes</h2><textarea rows="3" data-in="dNotes" placeholder="Astuce, variante, accompagnement…">' + esc(d.notes) + '</textarea></div>';
    if (d.id) h += '<button class="btn danger-ghost wide" data-act="delRecipe">Supprimer cette recette</button>';
    h += '<div class="savebar"><button class="btn primary big" data-act="saveDraft">Enregistrer</button></div>';
    return h;
  }

  // ---------- Mode cuisine ----------
  function viewCook(id) {
    const r = db.recipes[id];
    if (!r) return emptyState('🤔', 'Recette introuvable', '', '<a class="btn primary" href="#recettes">Mes recettes</a>');
    if (!ui.cook || ui.cook.id !== id) ui.cook = { id, people: ui.people[id] || db.settings.people, ing: {}, step: {} };
    const c = ui.cook;
    const current = (r.steps || []).findIndex((s, k) => !c.step[k]);
    let h = '<div class="cook" style="--c:' + colOf(r) + '"><header class="cook-top"><button class="round" data-act="cookExit" aria-label="Quitter">×</button><div><small>Mode cuisine</small><h1>' + r.emoji + ' ' + esc(r.title) + '</h1></div></header>';
    h += '<p class="wake">' + ('wakeLock' in navigator ? '💡 L\'écran reste allumé' : '💡 Pense à garder l\'écran allumé') + '</p>';
    h += '<details class="card" open><summary><span>Ingrédients</span><span class="pp" onclick="event.preventDefault()">' + stepper(c.people, 'cookPeople') + '<small>pers.</small></span></summary>' + ingList(r, c.people, 'cook') + '</details>';
    h += '<ol class="cook-steps">' + (r.steps || []).map((s, k) => '<li data-act="cookStep" data-i="' + k + '" class="' + (c.step[k] ? 'done' : k === current ? 'current' : '') + '"><span class="num">' + (c.step[k] ? '✓' : k + 1) + '</span><p>' + esc(s) + '</p></li>').join('') + '</ol>';
    if (current === -1 && r.steps && r.steps.length) h += '<div class="bravo">Bon appétit ! 🍽️</div>';
    h += '<button class="btn primary big wide" data-act="cookExit">Terminer</button></div>';
    return h;
  }

  // ---------- Courses ----------
  function viewShopping() {
    const w = getWeek(ui.week);
    const entries = weekEntries(ui.week);
    let h = '<header class="top"><h1>Courses</h1></header>' + weekNav(true);
    const extras = (w && w.extras) || [];
    if (!entries.length && !extras.length) {
      return h + emptyState('🧺', 'Rien à acheter pour l\'instant', 'Choisis tes repas de la semaine : la liste se remplit toute seule.', '<a class="btn primary" href="#semaine">Planifier la semaine</a>');
    }
    const list = PM.buildShoppingList(entries, db.pantry);
    const checked = (w && w.checked) || {};
    const all = list.groups.reduce((s, g) => s + g.items.length, 0) + extras.length;
    const done = list.groups.reduce((s, g) => s + g.items.filter(i => checked[i.key]).length, 0) + extras.filter(e => e.done).length;
    h += '<div class="progress"><div style="width:' + (all ? Math.round(done / all * 100) : 0) + '%"></div></div><p class="muted small center">' + done + ' / ' + all + ' dans le panier</p>';
    for (const g of list.groups) {
      h += '<section class="group"><h3>' + g.cat.emoji + ' ' + g.cat.name + '</h3>';
      for (const it of g.items) h += '<div class="item' + (checked[it.key] ? ' done' : '') + '" data-act="check" data-key="' + esc(it.key) + '"><span class="box"></span><span class="iname"><b>' + esc(it.name) + '</b><small>' + esc(it.recipes.join(', ')) + '</small></span><span class="iamt">' + esc(it.amount) + '</span></div>';
      h += '</section>';
    }
    h += '<section class="group"><h3>✏️ En plus</h3>';
    extras.forEach((e, k) => { h += '<div class="item' + (e.done ? ' done' : '') + '" data-act="checkExtra" data-i="' + k + '"><span class="box"></span><span class="iname"><b>' + esc(e.text) + '</b></span><button class="x small" data-act="delExtra" data-i="' + k + '" aria-label="Retirer">×</button></div>'; });
    h += '<form class="add-extra" data-act-submit="addExtra"><input name="t" placeholder="Ajouter un article (papier toilette…)" autocomplete="off"><button class="btn soft" type="submit">Ajouter</button></form></section>';
    if (list.pantryItems.length) {
      h += '<section class="group pantry"><h3>🏠 Dans ton placard</h3><p class="muted small">Exclus de la liste. Vérifie qu\'il t\'en reste — touche pour l\'ajouter aux courses.</p><div class="chips">' +
        list.pantryItems.map(p => '<button class="chip" data-act="pantryToList" data-v="' + esc(p.name) + '">' + esc(p.name) + (p.amount ? ' · ' + esc(p.amount) : '') + '</button>').join('') + '</div></section>';
    }
    h += '<p class="muted small center">Astuce : appui long sur un article pour le ranger dans ton placard.</p>';
    h += '<div class="share-bar"><button class="btn primary" data-act="shareList">↗ Partager</button><a class="btn wa" href="https://wa.me/?text=' + encodeURIComponent(listText(list, w)) + '" target="_blank" rel="noopener">WhatsApp</a>' + (done ? '<button class="btn ghost" data-act="uncheckAll">Tout décocher</button>' : '') + '</div>';
    return h;
  }
  function listText(list, w) {
    const checked = (w && w.checked) || {};
    const L = ['🛒 Courses — semaine du ' + fmtShort(dateOf(ui.week)), ''];
    for (const g of list.groups) {
      const items = g.items.filter(i => !checked[i.key]); if (!items.length) continue;
      L.push(g.cat.emoji + ' ' + g.cat.name);
      for (const i of items) L.push('• ' + i.name + (i.amount ? ' — ' + i.amount : ''));
      L.push('');
    }
    const ex = ((w && w.extras) || []).filter(e => !e.done);
    if (ex.length) { L.push('✏️ En plus'); for (const e of ex) L.push('• ' + e.text); }
    return L.join('\n').trim();
  }

  // ---------- Plus ----------
  function viewMore() {
    let h = '<header class="top"><h1>Plus</h1></header><div class="menu">';
    h += '<a href="#historique"><span class="mi">🗓</span><span class="mt"><b>Historique des menus</b><small>Revoir et réutiliser une semaine</small></span><span class="chev">›</span></a>';
    h += '<a href="#placard"><span class="mi">🏠</span><span class="mt"><b>Mon placard</b><small>' + plural(db.pantry.length, 'ingrédient') + ' toujours à la maison</small></span><span class="chev">›</span></a>';
    h += '<a href="#tags"><span class="mi">🏷</span><span class="mt"><b>Mes tags</b><small>' + db.tags.length + ' tags</small></span><span class="chev">›</span></a>';
    h += '<div class="mrow"><span class="mi">👥</span><span class="mt"><b>Personnes par défaut</b><small>Pour les nouveaux repas</small></span>' + stepper(db.settings.people, 'defPeople') + '</div>';
    const old = !db.settings.lastExport || (Date.now() - db.settings.lastExport > 30 * 864e5);
    h += '<a href="#sauvegarde"><span class="mi">💾</span><span class="mt"><b>Sauvegarde</b><small>' + (db.settings.lastExport ? 'Dernière : ' + new Date(db.settings.lastExport).toLocaleDateString('fr-FR') : 'Jamais faite') + '</small></span>' + (old && Object.keys(db.recipes).length ? '<span class="badge">!</span>' : '<span class="chev">›</span>') + '</a>';
    if (ui.installEvt && !isStandalone()) h += '<button class="mrow" data-act="install"><span class="mi">📲</span><span class="mt"><b>Installer l\'app</b><small>Sur l\'écran d\'accueil</small></span><span class="chev">›</span></button>';
    h += '</div><p class="foot">' + LOGO + '<br>Popote &amp; Mijote<br><small>Tes recettes restent sur ce téléphone.</small></p>';
    return h;
  }
  function viewHistory() {
    let h = '<header class="top"><button class="round ghost" data-act="back" data-to="plus" aria-label="Retour">‹</button><h1>Historique</h1></header>';
    const keys = Object.keys(db.weeks).filter(k => weekEntries(k).length).sort().reverse();
    if (!keys.length) return h + emptyState('🗓', 'Pas encore d\'historique', 'Tes menus de la semaine apparaîtront ici.', '');
    for (const k of keys) {
      const counts = {};
      for (const e of weekEntries(k)) counts[e.recipe.id] = (counts[e.recipe.id] || 0) + 1;
      h += '<div class="card hist"><div class="row-between"><div><small class="muted">' + weekRel(k) + '</small><h2>' + weekLabel(k) + '</h2></div></div><ul class="hist-list">' +
        Object.entries(counts).map(([id, c]) => '<li>' + db.recipes[id].emoji + ' ' + esc(db.recipes[id].title) + (c > 1 ? ' <small>×' + c + '</small>' : '') + '</li>').join('') + '</ul>' +
        '<div class="btn-row"><button class="btn soft" data-act="histView" data-k="' + k + '">Voir</button><button class="btn soft" data-act="histReuse" data-k="' + k + '">Réutiliser</button></div></div>';
    }
    return h;
  }
  function listEditor(title, back, items, delAct, addAct, intro, placeholder) {
    return '<header class="top"><button class="round ghost" data-act="back" data-to="' + back + '" aria-label="Retour">‹</button><h1>' + title + '</h1></header>' +
      '<div class="card"><p class="muted">' + intro + '</p><div class="chips edit">' + items.map((t, k) => '<span class="chip on">' + esc(t) + '<button data-act="' + delAct + '" data-i="' + k + '" aria-label="Retirer">×</button></span>').join('') + '</div>' +
      '<form class="add-extra" data-act-submit="' + addAct + '"><input name="t" placeholder="' + placeholder + '" autocomplete="off"><button class="btn soft" type="submit">Ajouter</button></form></div>';
  }
  function viewBackup() {
    return '<header class="top"><button class="round ghost" data-act="back" data-to="plus" aria-label="Retour">‹</button><h1>Sauvegarde</h1></header>' +
      '<div class="card"><h2>Pourquoi ?</h2><p class="muted">Tes recettes sont stockées uniquement sur ce téléphone. Un fichier de sauvegarde te permet de les retrouver si tu changes de téléphone ou si les données du navigateur sont effacées. Garde-le dans ton Drive ou envoie-le-toi par mail.</p>' +
      '<button class="btn primary wide" data-act="exportData">💾 Exporter mes données</button></div>' +
      '<div class="card"><h2>Restaurer</h2><p class="muted">Importe un fichier de sauvegarde. Les recettes sont ajoutées à celles déjà présentes, rien n\'est effacé.</p>' +
      '<label class="btn soft wide file">📂 Importer une sauvegarde<input type="file" accept=".json,application/json" data-in="importFile" hidden></label></div>';
  }
  function viewImport(code) {
    if (!ui.imp || ui.imp.code !== code) {
      ui.imp = { code, recipe: null, error: false };
      decodeRecipe(code).then(r => { ui.imp.recipe = r; render(true); }).catch(() => { ui.imp.error = true; render(true); });
      return '<p class="muted center pad">Ouverture de la recette…</p>';
    }
    if (ui.imp.error) return emptyState('😕', 'Lien illisible', 'Ce lien de recette semble incomplet. Demande à ton ami de le renvoyer.', '<a class="btn primary" href="#recettes">Mes recettes</a>');
    if (!ui.imp.recipe) return '<p class="muted center pad">Ouverture de la recette…</p>';
    const r = ui.imp.recipe;
    const exists = recipeList().some(x => PM.fold(x.title) === PM.fold(r.title));
    let h = hero(r, 'recettes');
    h += '<div class="banner soft">🎁 On t\'a partagé cette recette.' + (exists ? ' Tu as déjà une recette avec ce nom.' : '') + '</div>';
    h += '<div class="actions"><button class="btn primary big" data-act="importAdd">+ Ajouter à mes recettes</button></div>';
    h += '<div class="card"><h2>Ingrédients <small class="muted">pour ' + plural(r.servings, 'personne') + '</small></h2>' + ingList(r, r.servings) + '</div>';
    if (r.steps.length) h += '<div class="card"><h2>Préparation</h2><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>';
    return h;
  }

  // ---------- partage de recette ----------
  function b64u(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  async function encodeRecipe(r) {
    const o = { t: r.title, e: r.emoji, c: r.color, s: r.servings, m: r.time, g: r.tags, i: r.ingredients.map(i => [i.qty == null ? null : +i.qty.toFixed(4), i.unit, i.name, i.cat, i.note || '']), p: r.steps, n: r.notes };
    const bytes = new TextEncoder().encode(JSON.stringify(o));
    if (window.CompressionStream) {
      try { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'z' + b64u(new Uint8Array(await new Response(st).arrayBuffer())); } catch (e) { }
    }
    return 'j' + b64u(bytes);
  }
  async function decodeRecipe(code) {
    let bytes = unb64u(code.slice(1));
    if (code[0] === 'z') { const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(st).arrayBuffer()); }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return { id: null, title: String(o.t || 'Recette'), emoji: o.e || '🍽️', color: COLORS[o.c] ? o.c : COLOR_KEYS[0], servings: +o.s || 2, time: +o.m || null, tags: (o.g || []).map(String),
      ingredients: (o.i || []).map(a => ({ qty: a[0] == null ? null : +a[0], unit: PM.UNITS.includes(a[1]) ? a[1] : '', name: String(a[2] || ''), cat: a[3] || PM.categorize(String(a[2] || '')), note: String(a[4] || '') })).filter(i => i.name),
      steps: (o.p || []).map(String), notes: String(o.n || '') };
  }
  const appUrl = () => location.origin + location.pathname;
  async function shareOrCopy(data, okMsg) {
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const txt = [data.text, data.url].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(txt); toast(okMsg || 'Copié ✓'); } catch (e) { toast('Partage indisponible'); }
  }

  // ---------- prompt IA ----------
  function aiPrompt() {
    return 'Tu vas m\'aider à ajouter une recette dans mon appli de cuisine « Popote & Mijote ».\n\n' +
      'Je te donne ci-dessous une recette (texte copié, capture d\'écran ou lien), ou je te décris un plat : dans ce cas, propose une bonne recette.\n\n' +
      'Réponds UNIQUEMENT avec le bloc suivant, sans phrase avant ni après :\n\n' +
      'TITRE: nom de la recette\nPERSONNES: nombre de personnes prévu par la recette\nTEMPS: temps total en minutes (nombre seul)\n' +
      'TAGS: 1 à 4 tags choisis parmi : ' + db.tags.join(', ') + '\n' +
      'INGREDIENTS:\n- quantité unité | ingrédient | rayon\nETAPES:\n1. première étape\n2. deuxième étape\nNOTES: astuce éventuelle (facultatif)\n\n' +
      'Règles pour les ingrédients :\n- une ligne par ingrédient : « quantité unité | ingrédient | rayon »\n' +
      '- unités possibles : g, kg, ml, cl, l, c. à s., c. à c., pincée, gousse, tranche, botte, sachet, boîte, pot. Pour un ingrédient à l\'unité, mets seulement le nombre (ex. « - 3 | œufs | Crèmerie & frais »)\n' +
      '- sans quantité précise (sel, poivre…), laisse vide avant le premier | (ex. « - | sel | Épices & condiments »)\n' +
      '- rayon parmi : ' + PM.CATEGORIES.map(c => c.name).join(', ') + '\n' +
      '- convertis les mesures américaines (cups, oz…) en unités françaises\n\nMa recette ou ma demande :\n';
  }

  // ---------- installation ----------
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvt = e; if (['semaine', 'plus'].includes(ui.route)) render(true); });
  window.addEventListener('appinstalled', () => { ui.installEvt = null; toast('App installée 🎉'); render(true); });

  // ---------- écran allumé ----------
  let wake = null;
  async function wakeOn() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { } }
  function wakeOff() { try { if (wake) wake.release(); } catch (e) { } wake = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ui.route.startsWith('cuisine-')) wakeOn(); });

  // ================= ROUTEUR =================
  function render(keepScroll) {
    const h = decodeURIComponent(location.hash.slice(1)) || 'semaine';
    const y = window.scrollY;
    const changed = h !== ui.route; ui.route = h;
    let html, tab = '', full = false;
    if (h.startsWith('r=')) { html = viewImport(h.slice(2)); tab = 'recettes'; }
    else if (h === 'semaine') { html = viewWeek(); tab = 'semaine'; }
    else if (h === 'recettes') { html = viewRecipes(); tab = 'recettes'; }
    else if (h.startsWith('recette-')) { html = viewDetail(h.slice(8)); tab = 'recettes'; }
    else if (h === 'nouvelle' || h.startsWith('edition-')) {
      const id = h === 'nouvelle' ? null : h.slice(8);
      if (id && (!ui.draft || ui.draft.id !== id)) { if (db.recipes[id]) ui.draft = draftFromRecipe(db.recipes[id]); else { location.hash = '#recettes'; return; } }
      if (!id && (!ui.draft || ui.draft.id)) ui.draft = newDraft();
      html = viewEditor(); full = true;
    }
    else if (h.startsWith('cuisine-')) { html = viewCook(h.slice(8)); full = true; }
    else if (h === 'courses') { html = viewShopping(); tab = 'courses'; }
    else if (h === 'plus') { html = viewMore(); tab = 'plus'; }
    else if (h === 'historique') { html = viewHistory(); tab = 'plus'; }
    else if (h === 'placard') { html = listEditor('Mon placard', 'plus', db.pantry, 'pantryDel', 'pantryAdd', 'Ces ingrédients sont toujours chez toi : ils n\'apparaissent pas dans la liste de courses (mais restent visibles en bas, pour vérifier).', 'Ex. : sauce soja'); tab = 'plus'; }
    else if (h === 'tags') { html = listEditor('Mes tags', 'plus', db.tags, 'tagDel', 'tagAdd', 'Les tags servent à filtrer tes recettes et à guider le « Surprends-moi ».', 'Nouveau tag'); tab = 'plus'; }
    else if (h === 'sauvegarde') { html = viewBackup(); tab = 'plus'; }
    else { location.hash = '#semaine'; return; }
    const app = $('#app');
    app.innerHTML = html;
    app.className = 'view-' + (h.split(/[-=]/)[0]);
    document.body.classList.toggle('full', full);
    document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    if (changed && !keepScroll) window.scrollTo(0, 0); else window.scrollTo(0, y);
    if (h.startsWith('cuisine-')) wakeOn(); else wakeOff();
  }
  window.addEventListener('hashchange', () => { ui.nav++; if (sheetOpen) { sheetOpen = false; $('#sheet-root').innerHTML = ''; $('#sheet-root').classList.remove('open'); } render(); });
  const go = hash => { location.hash = hash; };
  const rerender = () => render(true);

  // ================= ACTIONS =================
  const A = {};
  A.closeSheet = () => closeSheet();
  A.back = el => { if (ui.nav > 0) history.back(); else go('#' + (el.dataset.to || 'semaine')); };
  A.weekMove = el => { ui.week = keyOf(addDays(dateOf(ui.week), 7 * +el.dataset.d)); rerender(); };
  A.weekMenu = () => openSheet(() => '<h3 class="sheet-title">Semaine du ' + weekLabel(ui.week) + '</h3><div class="sheet-menu">' +
    '<button data-act="weekToday">📍 Revenir à la semaine à planifier</button>' +
    '<button data-act="weekHistory">🗓 Reprendre un menu passé</button>' +
    '<button data-act="weekClear" class="danger-text">🧹 Vider cette semaine</button></div>');
  A.weekToday = () => closeSheet(() => { ui.week = defaultWeek(); rerender(); });
  A.weekHistory = () => closeSheet(() => go('#historique'));
  A.weekClear = () => closeSheet(() => setTimeout(() => confirmSheet('Vider la semaine ?', 'Tous les repas prévus du ' + weekLabel(ui.week) + ' seront retirés.', 'Vider', () => { delete db.weeks[ui.week]; save(); rerender(); toast('Semaine vidée'); }, true), 50));
  A.install = async () => { if (!ui.installEvt) return; ui.installEvt.prompt(); try { await ui.installEvt.userChoice; } catch (e) { } ui.installEvt = null; rerender(); };
  A.hideInstall = () => { db.settings.hideInstall = true; save(); rerender(); };

  // --- choisir un repas ---
  function usedRecently(rid, wk) {
    const base = dateOf(wk);
    for (const [k, w] of Object.entries(db.weeks)) {
      const diff = (dateOf(k) - base) / 864e5;
      if (diff < -21 || diff > 0) continue;
      for (const items of Object.values(w.slots || {})) if (items.some(it => it.rid === rid)) return true;
    }
    return false;
  }
  function lastUse(rid) {
    let best = null;
    for (const [k, w] of Object.entries(db.weeks)) if (k <= ui.week && Object.values(w.slots || {}).some(items => items.some(it => it.rid === rid))) if (!best || k > best) best = k;
    if (!best) return 'Jamais au menu';
    const n = Math.round((dateOf(ui.week) - dateOf(best)) / 864e5 / 7);
    return n === 0 ? 'Déjà cette semaine' : 'Au menu il y a ' + plural(n, 'sem.', 'sem.');
  }
  function pickerSheet() {
    const p = ui.picker; const [d, m] = p.sk.split('-');
    let h = '<div class="sheet-head"><div><small>' + DAYS[d] + ' ' + fmtShort(addDays(dateOf(ui.week), +d)) + '</small><h3>' + (m === 'midi' ? 'Midi' : 'Soir') + '</h3></div><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>';
    if (!Object.keys(db.recipes).length) return h + '<p class="muted">Tu n\'as pas encore de recette.</p><button class="btn primary wide" data-act="pickerNewRecipe">+ Ajouter une recette</button>';
    h += '<div class="row-between"><span>Personnes</span>' + stepper(p.people, 'pickPeople') + '</div>';
    h += '<div class="search"><input type="search" data-in="pickQ" placeholder="Chercher une recette" value="' + esc(p.q) + '"></div>';
    h += '<div id="pick-tags">' + chips(p.tags, 'pickTag') + '</div>';
    h += '<button class="btn surprise wide" data-act="surprise">🎲 Surprends-moi</button>';
    h += '<div id="pick-list">' + pickerList() + '</div>';
    return h;
  }
  function pickerList() {
    const p = ui.picker;
    const list = filterRecipes(p.q, p.tags);
    let h = '';
    if (p.suggest && db.recipes[p.suggest]) {
      const r = db.recipes[p.suggest];
      h += '<div class="suggest" style="--c:' + colOf(r) + '"><small>Et pourquoi pas…</small><div class="sg-emo">' + r.emoji + '</div><b>' + esc(r.title) + '</b><small>' + esc(metaLine(r)) + '</small>' +
        '<div class="btn-row"><button class="btn ghost" data-act="surprise">Une autre</button><button class="btn primary" data-act="pickRecipe" data-id="' + r.id + '">Ajouter</button></div></div>';
    }
    if (!list.length) return h + '<p class="muted center pad">Aucune recette ne correspond.</p>';
    return h + '<div class="rlist">' + list.map(r => '<button class="rcard" style="--c:' + colOf(r) + '" data-act="pickRecipe" data-id="' + r.id + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + esc(r.title) + '</b><small>' + esc([metaLine(r), lastUse(r.id)].filter(Boolean).join('  ·  ')) + '</small></span><span class="plus">+</span></button>').join('') + '</div>';
  }
  A.addMeal = el => { ui.picker = { sk: el.dataset.slot, people: db.settings.people, q: '', tags: [], suggest: null, replace: null }; openSheet(pickerSheet); };
  A.pickPeople = el => { ui.picker.people = Math.max(1, Math.min(30, ui.picker.people + +el.dataset.d)); el.parentNode.querySelector('b').textContent = ui.picker.people; };
  A.pickTag = el => { const t = el.dataset.v, a = ui.picker.tags; ui.picker.tags = a.includes(t) ? a.filter(x => x !== t) : a.concat(t); $('#pick-tags').innerHTML = chips(ui.picker.tags, 'pickTag'); ui.picker.suggest = null; $('#pick-list').innerHTML = pickerList(); };
  A.surprise = () => {
    const p = ui.picker;
    const list = filterRecipes(p.q, p.tags);
    if (!list.length) { toast('Aucune recette avec ces filtres'); return; }
    let pool = list.filter(r => !usedRecently(r.id, ui.week) && r.id !== p.suggest);
    if (!pool.length) pool = list.filter(r => r.id !== p.suggest);
    if (!pool.length) pool = list;
    p.suggest = pool[Math.floor(Math.random() * pool.length)].id;
    $('#pick-list').innerHTML = pickerList();
    const s = $('.sheet'); if (s) s.scrollTo({ top: $('#pick-list').offsetTop - 80, behavior: 'smooth' });
  };
  A.pickRecipe = el => {
    const p = ui.picker; const w = getWeek(ui.week, true);
    const arr = w.slots[p.sk] = w.slots[p.sk] || [];
    const item = { rid: el.dataset.id, people: p.people };
    if (p.replace != null) arr[p.replace] = item; else arr.push(item);
    save(); closeSheet(() => { rerender(); toast(db.recipes[item.rid].emoji + ' Ajouté au menu'); });
  };
  A.pickerNewRecipe = () => closeSheet(() => { go('#recettes'); setTimeout(A.addRecipe, 60); });
  function mealSheet() {
    const { sk, i } = ui.meal; const w = getWeek(ui.week); const it = w && w.slots[sk] && w.slots[sk][i];
    if (!it) return '<p>…</p>';
    const r = db.recipes[it.rid]; const [d, m] = sk.split('-');
    return '<div class="sheet-head"><div><small>' + DAYS[d] + ' · ' + (m === 'midi' ? 'Midi' : 'Soir') + '</small><h3>' + r.emoji + ' ' + esc(r.title) + '</h3></div><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>' +
      '<div class="row-between"><span>Personnes</span>' + stepper(it.people, 'mealPeople') + '</div>' +
      '<div class="sheet-menu"><button data-act="mealOpen">📖 Voir la recette</button><button data-act="mealCook">👩‍🍳 Mode cuisine</button><button data-act="mealReplace">🔄 Remplacer</button><button data-act="mealRemove" class="danger-text">Retirer du menu</button></div>';
  }
  const mealItem = () => getWeek(ui.week).slots[ui.meal.sk][ui.meal.i];
  A.mealMenu = el => { ui.meal = { sk: el.dataset.slot, i: +el.dataset.i }; openSheet(mealSheet); };
  A.mealPeople = el => { const it = mealItem(); it.people = Math.max(1, Math.min(30, it.people + +el.dataset.d)); save(); drawSheet(); rerender(); };
  A.mealOpen = () => { const it = mealItem(); ui.people[it.rid] = it.people; closeSheet(() => go('#recette-' + it.rid)); };
  A.mealCook = () => { const it = mealItem(); ui.people[it.rid] = it.people; ui.cook = null; closeSheet(() => go('#cuisine-' + it.rid)); };
  A.mealReplace = () => { const it = mealItem(); ui.picker = { sk: ui.meal.sk, people: it.people, q: '', tags: [], suggest: null, replace: ui.meal.i }; sheetFn = pickerSheet; drawSheet(); };
  A.mealRemove = () => { const w = getWeek(ui.week); w.slots[ui.meal.sk].splice(ui.meal.i, 1); if (!w.slots[ui.meal.sk].length) delete w.slots[ui.meal.sk]; save(); closeSheet(() => { rerender(); toast('Retiré du menu'); }); };

  // --- recettes ---
  A.filterTag = el => { const t = el.dataset.v; ui.tags = ui.tags.includes(t) ? ui.tags.filter(x => x !== t) : ui.tags.concat(t); rerender(); };
  A.addRecipe = () => openSheet(() => '<h3 class="sheet-title">Ajouter une recette</h3><div class="options">' +
    '<button data-act="addManual"><span>✍️</span><b>Saisir à la main</b><small>Une fiche simple à compléter</small></button>' +
    '<button data-act="addPaste"><span>📋</span><b>Coller une recette</b><small>Depuis un site, un message, une capture…</small></button>' +
    '<button data-act="addAI"><span>✨</span><b>Avec une IA</b><small>Une capture, un lien, ou « trouve-moi une blanquette »</small></button></div>');
  A.addManual = () => closeSheet(() => { ui.draft = newDraft(); go('#nouvelle'); });
  A.addPaste = () => { sheetFn = () => '<div class="sheet-head"><h3>Coller une recette</h3><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>' +
    '<p class="muted small">Copie le texte d\'une recette (site, message, notes…) et colle-le ici. Pour une capture d\'écran : appui long sur l\'image (ou Google Lens) → sélectionne le texte → Copier.</p>' +
    '<textarea id="paste-text" rows="10" placeholder="Colle ta recette ici…"></textarea><button class="btn primary wide" data-act="analyze">Analyser</button>'; drawSheet(); };
  A.addAI = () => { sheetFn = () => '<div class="sheet-head"><h3>Importer avec une IA</h3><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>' +
    '<ol class="howto"><li><b>Copie la consigne</b><button class="btn soft small" data-act="copyPrompt">📋 Copier la consigne</button></li>' +
    '<li><b>Colle-la dans ton IA</b> et ajoute à la suite ta recette : une capture, un lien, un texte, ou juste « une bonne blanquette pour 4 ».<div class="ai-links">' + AI_LINKS.map(([n, u]) => '<a href="' + u + '" target="_blank" rel="noopener">' + n + '</a>').join('') + '</div></li>' +
    '<li><b>Copie sa réponse</b> et colle-la ici :</li></ol>' +
    '<textarea id="paste-text" rows="7" placeholder="TITRE: …"></textarea><button class="btn primary wide" data-act="analyze">Importer</button>'; drawSheet(); };
  A.copyPrompt = async () => { try { await navigator.clipboard.writeText(aiPrompt()); toast('Consigne copiée ✓'); } catch (e) { toast('Copie impossible'); } };
  A.analyze = () => {
    const t = $('#paste-text').value;
    if (!t.trim()) { toast('Colle d\'abord une recette'); return; }
    const p = PM.parseRecipe(t);
    if (!p.title && !p.ingredients.length) { toast('Je n\'ai pas reconnu de recette'); return; }
    closeSheet(() => { ui.draft = draftFromParsed(p); go('#nouvelle'); });
  };
  A.detPeople = el => { const id = el.dataset.id; ui.people[id] = Math.max(1, Math.min(30, (ui.people[id] || db.settings.people) + +el.dataset.d)); rerender(); };
  A.cook = el => { ui.cook = null; go('#cuisine-' + el.dataset.id); };
  A.toMenu = el => {
    const id = el.dataset.id;
    ui.toMenu = { id, day: Math.min(6, Math.max(0, Math.round((new Date() - dateOf(ui.week)) / 864e5))), meal: 'soir', people: ui.people[id] || db.settings.people };
    if (dateOf(ui.week) > new Date()) ui.toMenu.day = 0;
    openSheet(toMenuSheet);
  };
  function toMenuSheet() {
    const t = ui.toMenu; const mon = dateOf(ui.week);
    return '<h3 class="sheet-title">Ajouter au menu</h3>' + weekNav(true).replace(/weekMove/g, 'tmWeek') +
      '<div class="days">' + DAYS.map((d, k) => '<button class="day-chip' + (k === t.day ? ' on' : '') + '" data-act="tmDay" data-v="' + k + '"><small>' + d.slice(0, 3) + '</small><b>' + addDays(mon, k).getDate() + '</b></button>').join('') + '</div>' +
      '<div class="seg">' + MEALS.map(([m, l]) => '<button class="' + (t.meal === m ? 'on' : '') + '" data-act="tmMeal" data-v="' + m + '">' + l + '</button>').join('') + '</div>' +
      '<div class="row-between"><span>Personnes</span>' + stepper(t.people, 'tmPeople') + '</div>' +
      '<button class="btn primary wide" data-act="tmAdd">Ajouter</button>';
  }
  A.tmWeek = el => { ui.week = keyOf(addDays(dateOf(ui.week), 7 * +el.dataset.d)); drawSheet(); };
  A.tmDay = el => { ui.toMenu.day = +el.dataset.v; drawSheet(); };
  A.tmMeal = el => { ui.toMenu.meal = el.dataset.v; drawSheet(); };
  A.tmPeople = el => { ui.toMenu.people = Math.max(1, Math.min(30, ui.toMenu.people + +el.dataset.d)); drawSheet(); };
  A.tmAdd = () => {
    const t = ui.toMenu; const w = getWeek(ui.week, true); const sk = t.day + '-' + t.meal;
    (w.slots[sk] = w.slots[sk] || []).push({ rid: t.id, people: t.people }); save();
    closeSheet(() => toast('📅 Ajouté : ' + DAYS[t.day].toLowerCase() + ' ' + (t.meal === 'midi' ? 'midi' : 'soir')));
  };
  A.share = el => {
    const id = el.dataset.id;
    openSheet(() => '<h3 class="sheet-title">Partager la recette</h3><div class="options">' +
      '<button data-act="shareLink" data-id="' + id + '"><span>🔗</span><b>Lien Popote &amp; Mijote</b><small>Ton ami l\'ajoute à son appli en un geste</small></button>' +
      '<button data-act="shareText" data-id="' + id + '"><span>📝</span><b>Texte de la recette</b><small>Lisible par tout le monde</small></button></div>');
  };
  A.shareLink = async el => {
    const r = db.recipes[el.dataset.id];
    const url = appUrl() + '#r=' + await encodeRecipe(r);
    closeSheet(() => shareOrCopy({ title: r.title, text: r.emoji + ' ' + r.title + ' — une recette à ajouter dans Popote & Mijote :', url }, 'Lien copié ✓'));
  };
  A.shareText = el => {
    const r = db.recipes[el.dataset.id]; const n = ui.people[r.id] || r.servings;
    closeSheet(() => shareOrCopy({ title: r.title, text: PM.recipeToText(r, n) }, 'Recette copiée ✓'));
  };
  A.importAdd = () => {
    const r = clone(ui.imp.recipe); r.id = uid(); r.created = Date.now();
    db.recipes[r.id] = r; save(); ui.imp = null; toast('Recette ajoutée 🎉'); go('#recette-' + r.id);
  };

  // --- éditeur ---
  A.pickEmoji = () => openSheet(() => '<h3 class="sheet-title">Choisis un emoji</h3><div class="emoji-grid">' + EMOJIS.map(e => '<button data-act="setEmoji" data-v="' + e + '">' + e + '</button>').join('') + '</div>');
  A.setEmoji = el => { ui.draft.emoji = el.dataset.v; ui.draft.emojiManual = true; closeSheet(rerender); };
  A.dColor = el => { ui.draft.color = el.dataset.v; rerender(); };
  A.dServ = el => { ui.draft.servings = Math.max(1, Math.min(30, ui.draft.servings + +el.dataset.d)); ui.draft.servingsUnknown = false; rerender(); };
  A.dTag = el => { const t = el.dataset.v, d = ui.draft; d.tags = d.tags.includes(t) ? d.tags.filter(x => x !== t) : d.tags.concat(t); el.classList.toggle('on'); };
  A.ingAdd = () => { ui.draft.ings.push(blankIng()); rerender(); const ins = document.querySelectorAll('#ings .ing-row .q'); if (ins.length) ins[ins.length - 1].focus(); };
  A.ingDel = el => { ui.draft.ings.splice(+el.dataset.i, 1); if (!ui.draft.ings.length) ui.draft.ings.push(blankIng()); rerender(); };
  A.saveDraft = () => {
    const d = ui.draft;
    if (!d.title.trim()) { toast('Donne un nom à ta recette'); const t = $('.title-in'); if (t) t.focus(); return; }
    const n = d.servings || 1;
    const id = d.id || uid();
    const old = db.recipes[id] || {};
    db.recipes[id] = {
      id, title: d.title.trim(), emoji: d.emoji, color: d.color, servings: n,
      time: parseInt(d.time, 10) || null, tags: d.tags.filter(t => db.tags.includes(t)),
      ingredients: d.ings.filter(i => i.name.trim()).map(i => { const q = PM.parseNumber(i.qty); return { qty: q != null && !isNaN(q) ? q / n : null, unit: i.unit, name: i.name.trim(), note: i.note || '', cat: i.cat || PM.categorize(i.name) }; }),
      steps: d.steps.split('\n').map(s => s.replace(/^\s*(\d+\s*[.)\-:]|[-•*])\s*/, '').trim()).filter(Boolean),
      notes: d.notes.trim(), created: old.created || Date.now(), updated: Date.now(),
    };
    save(); ui.draft = null; toast(d.id ? 'Recette mise à jour ✓' : 'Recette enregistrée 🎉');
    location.replace('#recette-' + id);
  };
  A.delRecipe = () => {
    const d = ui.draft;
    confirmSheet('Supprimer « ' + d.title + ' » ?', 'Elle sera aussi retirée de tes menus.', 'Supprimer', () => {
      delete db.recipes[d.id];
      for (const w of Object.values(db.weeks)) for (const k of Object.keys(w.slots || {})) { w.slots[k] = w.slots[k].filter(it => it.rid !== d.id); if (!w.slots[k].length) delete w.slots[k]; }
      save(); ui.draft = null; toast('Recette supprimée'); location.replace('#recettes');
    }, true);
  };

  // --- cuisine ---
  A.cookPeople = el => { ui.cook.people = Math.max(1, Math.min(30, ui.cook.people + +el.dataset.d)); rerender(); };
  A.cookIng = el => { const k = el.dataset.i; ui.cook.ing[k] = !ui.cook.ing[k]; el.classList.toggle('done'); };
  A.cookStep = el => { const k = el.dataset.i; ui.cook.step[k] = !ui.cook.step[k]; rerender(); const cur = $('.cook-steps .current'); if (cur && ui.cook.step[k]) cur.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  A.cookExit = () => { const id = ui.cook && ui.cook.id; ui.cook = null; if (ui.nav > 0) history.back(); else go(id ? '#recette-' + id : '#semaine'); };

  // --- courses ---
  A.check = el => { const w = getWeek(ui.week, true); const k = el.dataset.key; if (w.checked[k]) delete w.checked[k]; else w.checked[k] = 1; save(); rerender(); };
  A.checkExtra = (el, e) => { if (e.target.closest('[data-act="delExtra"]')) return; const w = getWeek(ui.week, true); const x = w.extras[+el.dataset.i]; x.done = !x.done; save(); rerender(); };
  A.delExtra = el => { const w = getWeek(ui.week, true); w.extras.splice(+el.dataset.i, 1); save(); rerender(); };
  A.uncheckAll = () => { const w = getWeek(ui.week, true); w.checked = {}; w.extras.forEach(e => { e.done = false; }); save(); rerender(); };
  A.pantryToList = el => { const w = getWeek(ui.week, true); w.extras.push({ text: el.dataset.v, done: false }); save(); rerender(); toast('Ajouté aux courses'); };
  A.shareList = () => { const list = PM.buildShoppingList(weekEntries(ui.week), db.pantry); shareOrCopy({ title: 'Liste de courses', text: listText(list, getWeek(ui.week)) }, 'Liste copiée ✓'); };
  A.itemMenu = el => {
    const key = el.dataset.key;
    const list = PM.buildShoppingList(weekEntries(ui.week), db.pantry);
    let item; for (const g of list.groups) for (const i of g.items) if (i.key === key) item = i;
    if (!item) return;
    openSheet(() => '<h3 class="sheet-title">' + esc(item.name) + '</h3><p class="muted small">Utilisé dans : ' + esc(item.recipes.join(', ')) + '</p><div class="sheet-menu"><button data-act="toPantry" data-v="' + esc(item.name) + '">🏠 J\'en ai toujours (ranger au placard)</button></div>');
  };
  A.toPantry = el => { db.pantry.push(el.dataset.v); save(); closeSheet(() => { rerender(); toast('Rangé dans ton placard'); }); };

  // --- plus ---
  A.defPeople = el => { db.settings.people = Math.max(1, Math.min(30, db.settings.people + +el.dataset.d)); save(); rerender(); };
  A.pantryDel = el => { db.pantry.splice(+el.dataset.i, 1); save(); rerender(); };
  A.tagDel = el => { const t = db.tags[+el.dataset.i]; confirmSheet('Supprimer le tag « ' + t + ' » ?', 'Il sera retiré des recettes qui l\'utilisent.', 'Supprimer', () => { db.tags = db.tags.filter(x => x !== t); for (const r of Object.values(db.recipes)) r.tags = (r.tags || []).filter(x => x !== t); save(); rerender(); }, true); };
  A.histView = el => { ui.week = el.dataset.k; go('#semaine'); };
  A.histReuse = el => {
    const src = el.dataset.k; let target = defaultWeek(); if (target === src) target = keyOf(addDays(dateOf(src), 7));
    const has = weekEntries(target).length;
    confirmSheet('Réutiliser ce menu ?', 'Il sera copié dans la semaine du ' + weekLabel(target) + '.' + (has ? ' Les repas déjà prévus cette semaine-là seront remplacés.' : ''), 'Copier', () => {
      const w = getWeek(target, true); w.slots = clone(db.weeks[src].slots); w.checked = {}; save(); ui.week = target; go('#semaine'); toast('Menu copié ✓');
    });
  };
  A.exportData = async () => {
    const data = JSON.stringify(db, null, 1);
    const name = 'popote-mijote-' + keyOf(new Date()) + '.json';
    const file = new File([data], name, { type: 'application/json' });
    db.settings.lastExport = Date.now(); save();
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Sauvegarde Popote & Mijote' }); rerender(); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Sauvegarde téléchargée ✓'); rerender();
  };

  // ================= SAISIES =================
  const I = {};
  I.q = el => { ui.q = el.value; $('#rec-list').innerHTML = recipeCards(); };
  I.pickQ = el => { ui.picker.q = el.value; ui.picker.suggest = null; $('#pick-list').innerHTML = pickerList(); };
  I.dTitle = el => { ui.draft.title = el.value; if (!ui.draft.emojiManual) { ui.draft.emoji = PM.guessEmoji(el.value); const b = $('.emo-btn'); if (b) b.textContent = ui.draft.emoji; } };
  I.dTime = el => { ui.draft.time = el.value.replace(/\D/g, ''); };
  I.dSteps = el => { ui.draft.steps = el.value; };
  I.dNotes = el => { ui.draft.notes = el.value; };
  I.ingQty = el => { ui.draft.ings[+el.dataset.i].qty = el.value; };
  I.ingUnit = el => { ui.draft.ings[+el.dataset.i].unit = el.value; };
  I.ingCat = el => { const i = ui.draft.ings[+el.dataset.i]; i.cat = el.value; i.catManual = true; };
  I.ingName = el => {
    const i = ui.draft.ings[+el.dataset.i]; i.name = el.value;
    if (!i.catManual) { i.cat = PM.categorize(el.value); const s = el.parentNode.querySelector('.c'); if (s) s.value = i.cat; }
  };
  I.importFile = async el => {
    const f = el.files && el.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !d.recipes) throw new Error('format');
      let n = 0;
      for (const [id, r] of Object.entries(d.recipes)) { if (!db.recipes[id]) n++; db.recipes[id] = Object.assign({}, r, db.recipes[id] && db.recipes[id].updated > r.updated ? db.recipes[id] : {}); }
      for (const [k, w] of Object.entries(d.weeks || {})) if (!db.weeks[k]) db.weeks[k] = w;
      for (const p of d.pantry || []) if (!db.pantry.some(x => PM.fold(x) === PM.fold(p))) db.pantry.push(p);
      for (const t of d.tags || []) if (!db.tags.includes(t)) db.tags.push(t);
      save(); toast(plural(n, 'recette ajoutée', 'recettes ajoutées') + ' ✓'); rerender();
    } catch (e) { toast('Fichier de sauvegarde illisible'); }
    el.value = '';
  };

  // ================= ÉVÉNEMENTS =================
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const fn = A[a.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(a, e);
  });
  document.addEventListener('input', e => { const t = e.target.closest('[data-in]'); if (t && t.type !== 'file' && I[t.dataset.in]) I[t.dataset.in](t, e); });
  document.addEventListener('change', e => { const t = e.target.closest('input[type=file][data-in]'); if (t && I[t.dataset.in]) I[t.dataset.in](t, e); });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-act-submit]'); if (!f) return;
    e.preventDefault();
    const v = (f.elements.t.value || '').trim(); if (!v) return;
    const act = f.dataset.actSubmit;
    if (act === 'addExtra') { getWeek(ui.week, true).extras.push({ text: v, done: false }); }
    else if (act === 'pantryAdd') { if (!db.pantry.some(x => PM.fold(x) === PM.fold(v))) db.pantry.push(v.charAt(0).toUpperCase() + v.slice(1)); }
    else if (act === 'tagAdd') { if (!db.tags.includes(v)) db.tags.push(v.charAt(0).toUpperCase() + v.slice(1)); }
    save(); rerender();
    const inp = document.querySelector('form[data-act-submit="' + act + '"] input'); if (inp) inp.focus();
  });
  document.addEventListener('contextmenu', e => { const it = e.target.closest('.item[data-key]'); if (it) { e.preventDefault(); A.itemMenu(it); } });

  // ---------- démarrage ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  render();
  window.__pm = { db: () => db, ui };
})();
