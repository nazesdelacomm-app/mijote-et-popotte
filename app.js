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
  // Les mises à jour de l'appli ne touchent jamais ces données : elles vivent dans le navigateur du téléphone.
  // Règle d'or : on ne réinitialise jamais des données existantes. On complète, on migre, on garde une copie.
  const DB_VERSION = 2, SNAP = KEY + '-copie', BAD = KEY + '-illisible';
  function defaultDb() { return { v: DB_VERSION, recipes: {}, weeks: {}, pantry: DEFAULT_PANTRY.slice(), tags: DEFAULT_TAGS.slice(), settings: { people: 2 } }; }
  function parseDb(raw) { const d = JSON.parse(raw); if (d && d.recipes && typeof d.recipes === 'object') return d; throw new Error('format'); }
  function migrate(d) {
    const base = defaultDb();
    const out = Object.assign(base, d, { settings: Object.assign(base.settings, d.settings || {}) });
    out.weeks = out.weeks || {}; out.pantry = out.pantry || []; out.tags = out.tags || [];
    out.v = DB_VERSION; return out;
  }
  let restoredFromCopy = false;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return defaultDb(); }
    if (raw) {
      try { return migrate(parseDb(raw)); }
      catch (e) { try { localStorage.setItem(BAD, raw); } catch (_) { } }
    }
    try { const c = JSON.parse(localStorage.getItem(SNAP) || 'null'); if (c && c.data) { restoredFromCopy = true; return migrate(parseDb(c.data)); } } catch (e) { }
    return defaultDb();
  }
  let db = load();
  let persistAsked = false;
  function save() {
    try {
      const str = JSON.stringify(db);
      const n = Object.keys(db.recipes).length;
      // garde-fou : ne jamais écraser une base pleine par une base vide
      if (!n) { const prev = localStorage.getItem(KEY); if (prev && prev.length > 2000) { try { if (Object.keys(parseDb(prev).recipes).length > 5) return; } catch (e) { } } }
      localStorage.setItem(KEY, str);
      let c = null; try { c = JSON.parse(localStorage.getItem(SNAP) || 'null'); } catch (e) { }
      if (n && (!c || Date.now() - c.at > 3600e3)) localStorage.setItem(SNAP, JSON.stringify({ at: Date.now(), data: str }));
    }
    catch (e) { toast("Impossible d'enregistrer sur ce téléphone"); }
    if (!persistAsked) { persistAsked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { } }
    if (typeof cloudSoon === 'function') cloudSoon();
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
  const A = {}; // actions (boutons)
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
  const FAV = '⭐ Favoris';
  const filterTags = () => (Object.values(db.recipes).some(r => r.fav) ? [FAV] : []).concat(db.tags);
  function chips(selected, act, all) {
    return '<div class="chips">' + (all || db.tags).map(t => '<button class="chip' + (selected.includes(t) ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>';
  }
  let lastHidden = 0;
  function filterRecipes(q, tags, list) {
    const f = PM.fold(q).trim();
    const base = (list || recipeList()).filter(r => (!tags.length || tags.every(t => t === FAV ? r.fav : (r.tags || []).includes(t))) &&
      (!f || PM.fold(r.title).includes(f) || (r.ingredients || []).some(i => PM.fold(i.name).includes(f))));
    if (!hasExclusions()) { lastHidden = 0; return base; }
    const kept = base.filter(r => !isExcluded(r)); lastHidden = base.length - kept.length;
    return ui.showExcluded ? base : kept;
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


  // ================= ALLERGIES & EXCLUSIONS =================
  // [id, libellé, emoji, mots-clés, exceptions]
  const ALLERGENS = [
    ['gluten', 'Gluten', '🌾', 'farine|pates?|spaghetti|tagliatelle|penne|fusilli|farfalle|macaroni|coquillette|lasagne|tortellini|ravioli|cannelloni|gnocchi|linguine|rigatoni|orecchiette|crozet|casarecce|nouille|vermicelle|pain|baguette|brioche|croissant|bagel|bun|pita|tortilla|wrap|chapelure|crouton|semoule|couscous|boulgour|ble|orge|seigle|epeautre|avoine|biscuit|cereale|pane|biere|sauce soja|crepe|gaufre|feuille de brick|flocons d\'avoine', 'farine de riz|farine de mais|nouilles de riz|vermicelles de riz|galette de riz'],
    ['crustaces', 'Crustacés', '🦐', 'crevette|gambas|langoustine|crabe|homard|ecrevisse', ''],
    ['oeufs', 'Œufs', '🥚', 'oeuf|mayonnaise|brioche|crepe|gaufre', ''],
    ['poisson', 'Poisson', '🐟', 'poisson|saumon|cabillaud|thon|sardine|anchois|colin|lieu|merlu|truite|dorade|bar|maquereau|haddock|morue|surimi|nuoc-mam|nuoc', ''],
    ['arachides', 'Arachides', '🥜', 'cacahuete|arachide', ''],
    ['soja', 'Soja', '🫘', 'soja|tofu|edamame|miso|tempeh', 'germes de soja|germe de soja'],
    ['lait', 'Lait', '🥛', 'lait|beurre|creme|fromage|yaourt|yogourt|mozzarella|parmesan|emmental|gruyere|comte|feta|chevre|ricotta|mascarpone|reblochon|raclette|cheddar|st moret|saint moret|bechamel|brioche|croissant|pecorino|beaufort|burrata|skyr|faisselle|petit suisse|portions? de fromage', 'lait de coco|creme de coco|beurre de cacahuete|creme de marron'],
    ['coque', 'Fruits à coque', '🌰', 'noix|noisette|amande|pistache|cajou|pecan|macadamia|praline', 'noix de muscade|noix de coco|noix de saint'],
    ['celeri', 'Céleri', '🥬', 'celeri', ''],
    ['moutarde', 'Moutarde', '🟡', 'moutarde', ''],
    ['sesame', 'Sésame', '⚪', 'sesame|tahini|houmous', ''],
    ['sulfites', 'Sulfites', '🍷', 'vin|vinaigre|raisins? secs?|cidre|porto|biere|abricots? secs?|champagne', ''],
    ['lupin', 'Lupin', '🌼', 'lupin', ''],
    ['mollusques', 'Mollusques', '🦪', 'moule|huitre|calamar|encornet|poulpe|seiche|saint-jacques|st jacques|escargot', ''],
  ];
  const DIETS = [
    ['vege', 'Végétarien', '🥕', 'viande|boeuf|veau|porc|poulet|dinde|canard|agneau|lardon|jambon|saucisse|saucisson|chorizo|steak|hache|escalope|bacon|magret|cuisse|rumsteck|bavette|roti|filet mignon|pintade|lapin|merguez|chipolata|pancetta|coppa|speck|rillette|chair a saucisse|echine|paupiette|quenelle|charcuterie|poisson|saumon|cabillaud|thon|sardine|anchois|colin|lieu|merlu|truite|crevette|moule|calamar|surimi|nuoc|nuoc-mam|bouillon de boeuf|bouillon de volaille|sauce d\'huitre|gelatine|gelee', 'jambon de|saucisse vegetale'],
    ['porc', 'Sans porc', '🐷', 'porc|lardon|jambon|saucisse|saucisson|chorizo|bacon|chipolata|pancetta|coppa|speck|rillette|chair a saucisse|echine|filet mignon|rosette|charcuterie|gelatine|gelee', 'jambon de dinde|jambon de poulet|saucisses? de volaille|saucisse vegetale'],
    ['alcool', 'Sans alcool', '🚫', 'vin|biere|cidre|rhum|cognac|porto|whisky|vodka|calvados|champagne|liqueur|martini', 'vinaigre'],
  ];
  const mkRe = (kw, ex) => ({ re: new RegExp("(^|[^a-z])(?:" + kw + ")[sx]?(?![a-z])"), ex: ex ? new RegExp(ex) : null });
  const RULES_A = ALLERGENS.map(([id, label, emoji, kw, ex]) => Object.assign({ id, label, emoji }, mkRe(kw, ex)));
  const DIET_WHAT = { vege: 'Viande ou poisson', porc: 'Porc', alcool: 'Alcool' };
  const RULES_D = DIETS.map(([id, label, emoji, kw, ex]) => Object.assign({ id, label, emoji, what: DIET_WHAT[id] }, mkRe(kw, ex)));
  const matchRule = (rule, f) => rule.re.test(rule.ex ? f.replace(rule.ex, ' ') : f);
  let exclVer = 0; const flagCache = new Map();
  const exclSettings = () => ({ a: db.settings.allergens || [], d: db.settings.diets || [], v: (db.settings.avoid || []).map(PM.ingKey).filter(Boolean) });
  const hasExclusions = () => { const s = exclSettings(); return !!(s.a.length || s.d.length || s.v.length); };
  // motifs d'exclusion déclenchés par un ingrédient (nom seul)
  function ingIssues(name, s) {
    const f = PM.fold(name), k = PM.ingKey(name), out = [];
    for (const r of RULES_A) if (s.a.includes(r.id) && matchRule(r, f)) out.push(r.label);
    for (const r of RULES_D) if (s.d.includes(r.id) && matchRule(r, f)) out.push(r.what);
    for (const w of s.v) if (k === w || k.includes(w) || (' ' + k + ' ').includes(' ' + w + ' ')) out.push(w);
    return out;
  }
  function recipeIssues(r) {
    if (!r) return [];
    const key = (r.id || r.title) + '|' + (r.updated || 0) + '|' + exclVer;
    if (flagCache.has(key)) return flagCache.get(key);
    const s = exclSettings(); const set = new Set();
    if (s.a.length || s.d.length || s.v.length) {
      for (const i of r.ingredients || []) for (const x of ingIssues(i.name, s)) set.add(x);
      const t = PM.ingKey(r.title); for (const w of s.v) if (t.includes(w)) set.add(w);
    }
    const out = [...set]; flagCache.set(key, out); return out;
  }
  const isExcluded = r => recipeIssues(r).length > 0;
  function exclusionNote(total, hidden, act) {
    if (!hidden) return '';
    return '<p class="excl-note">🚫 ' + plural(hidden, 'recette masquée', 'recettes masquées') + ' (allergies & exclusions) · <button class="link" data-act="' + act + '">' + (ui.showExcluded ? 'Les masquer' : 'Les afficher') + '</button></p>';
  }
  function issuesBanner(r) {
    const is = recipeIssues(r); if (!is.length) return '';
    return '<div class="banner warn">⚠️ Contient d\'après les ingrédients : <b>' + esc(is.join(', ')) + '</b><br><small>Vérifie toujours les étiquettes des produits.</small></div>';
  }
  function viewExclusions() {
    const s = exclSettings();
    const total = Object.keys(db.recipes).length, hidden = Object.values(db.recipes).filter(isExcluded).length;
    let h = '<header class="top"><button class="round ghost" data-act="back" data-to="plus" aria-label="Retour">‹</button><h1>Allergies & exclusions</h1></header>';
    h += '<p class="muted small pad-x">Les recettes concernées sont masquées par défaut : liste, choix des repas, menu aléatoire, communauté. ' + (hasExclusions() ? '<b>' + hidden + ' sur ' + total + '</b> sont masquées.' : '') + '</p>';
    h += '<div class="card"><h2>Allergies</h2><div class="chips grid">' + RULES_A.map(r => '<button class="chip' + (s.a.includes(r.id) ? ' on' : '') + '" data-act="exclToggle" data-k="allergens" data-v="' + r.id + '">' + r.emoji + ' ' + r.label + '</button>').join('') + '</div></div>';
    h += '<div class="card"><h2>Régimes</h2><div class="chips grid">' + RULES_D.map(r => '<button class="chip' + (s.d.includes(r.id) ? ' on' : '') + '" data-act="exclToggle" data-k="diets" data-v="' + r.id + '">' + r.emoji + ' ' + r.label + '</button>').join('') + '</div></div>';
    h += '<div class="card"><h2>Aliments que je ne mange pas</h2><p class="muted small">Ex. : coriandre, champignons, poivron…</p><div class="chips edit">' + (db.settings.avoid || []).map((t, k) => '<span class="chip on">' + esc(t) + '<button data-act="avoidDel" data-i="' + k + '" aria-label="Retirer">×</button></span>').join('') + '</div>' +
      '<form class="add-extra" data-act-submit="avoidAdd"><input name="t" placeholder="Ajouter un aliment" autocomplete="off"><button class="btn soft" type="submit">Ajouter</button></form></div>';
    h += '<div class="card note"><p>⚠️ <b>Une aide, pas une garantie.</b> La détection se fait à partir du <b>nom des ingrédients</b>. Elle ne connaît pas la composition des produits industriels (bouillon cube, sauces, charcuterie, plats préparés…). Vérifie toujours les étiquettes.</p><p class="muted small">Ces informations restent sur ton téléphone : elles ne sont jamais envoyées au serveur.</p></div>';
    return h;
  }
  A.exclToggle = el => { const k = el.dataset.k, v = el.dataset.v; const a = db.settings[k] || []; db.settings[k] = a.includes(v) ? a.filter(x => x !== v) : a.concat(v); exclVer++; save(); rerender(); };
  A.avoidDel = el => { db.settings.avoid.splice(+el.dataset.i, 1); exclVer++; save(); rerender(); };
  A.toggleExcluded = () => { ui.showExcluded = !ui.showExcluded; rerender(); };
  A.toggleExcludedPick = () => { ui.showExcluded = !ui.showExcluded; $('#pick-list').innerHTML = pickerList(); };

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
    h += catalogBanner() + weekNav();
    if (!nRec) {
      h += emptyState('🥄', 'Ta popote est vide', 'Ajoute tes premières recettes, puis reviens ici composer ton menu de la semaine.', '<button class="btn primary" data-act="addRecipe">+ Ajouter une recette</button>');
      return h;
    }
    const portions = entries.reduce((s, e) => s + e.people, 0);
    h += '<div class="summary"><span>' + (entries.length ? plural(entries.length, 'repas', 'repas') + ' · ' + plural(portions, 'portion') : 'Aucun repas prévu') + '</span>' +
      '<span class="sum-btns"><button class="btn small dice" data-act="randomMenu">🎲 ' + (entries.length ? 'Aléatoire' : 'Menu aléatoire') + '</button>' +
      (entries.length ? '<a class="btn small soft" href="#courses">🛒 Courses</a>' : '') + '</span></div>';
    for (let d = 0; d < 7; d++) {
      const day = addDays(mon, d); const dk = keyOf(day);
      h += '<section class="day' + (dk === today ? ' today' : '') + (dk < today ? ' past' : '') + '"><h2>' + DAYS[d] + ' <span>' + fmtShort(day) + '</span>' + (dk === today ? '<em>aujourd\'hui</em>' : '') + '</h2>';
      for (const [m, label] of MEALS) {
        const sk = d + '-' + m;
        const items = (w && w.slots[sk]) || [];
        h += '<div class="slot"><span class="slot-label">' + label + '</span><div class="slot-items">';
        items.forEach((it, i) => {
          const r = db.recipes[it.rid]; if (!r) return;
          h += '<button class="pill" style="--c:' + colOf(r) + '" data-act="mealMenu" data-slot="' + sk + '" data-i="' + i + '"><span class="e">' + r.emoji + '</span><b>' + (isExcluded(r) ? '⚠️ ' : '') + esc(r.title) + '</b><em>' + it.people + ' 👤</em></button>';
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
    h += catalogBanner() + '<div class="search"><input type="search" data-in="q" placeholder="Chercher (titre, ingrédient…)" value="' + esc(ui.q) + '"></div>';
    h += chips(ui.tags, 'filterTag', filterTags());
    h += '<div id="rec-list" class="rlist">' + recipeCards() + '</div>';
    h += '<button class="fab" data-act="addRecipe">+ Ajouter</button>';
    return h;
  }
  function recipeCards() {
    const list = filterRecipes(ui.q, ui.tags); const note = exclusionNote(list.length, lastHidden, 'toggleExcluded');
    if (!list.length) return note + '<p class="muted center pad">Aucune recette ne correspond.</p>';
    return note + list.map(r => '<a class="rcard" href="#recette-' + r.id + '" style="--c:' + colOf(r) + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + (r.fav ? '⭐ ' : '') + (isExcluded(r) ? '⚠️ ' : '') + esc(r.title) + '</b><small>' + esc(metaLine(r) || plural((r.ingredients || []).length, 'ingrédient')) + '</small></span><span class="chev">›</span></a>').join('');
  }

  // ---------- Détail recette ----------
  function ingList(r, n, mode) {
    return '<ul class="ings">' + (r.ingredients || []).map((i, k) => {
      const a = i.qty != null ? PM.fmtAmount(i.qty * n, i.unit, 'recipe') : '';
      const done = mode === 'cook' && ui.cook && ui.cook.ing[k];
      const fl = hasExclusions() && ingIssues(i.name, exclSettings()).length ? ' flag' : '';
      return '<li' + (mode === 'cook' ? ' data-act="cookIng" data-i="' + k + '" class="tick' + (done ? ' done' : '') + fl + '"' : (fl ? ' class="' + fl.trim() + '"' : '')) + '>' + (mode === 'cook' ? '<span class="box"></span>' : '') +
        '<span class="amt">' + esc(a) + '</span><span class="iname">' + esc(i.name) + (i.note ? ' <small>' + esc(i.note) + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function hero(r, back) {
    return '<div class="hero" style="--c:' + colOf(r) + '"><button class="round back" data-act="back" data-to="' + back + '" aria-label="Retour">‹</button>' +
      (r.id && db.recipes[r.id] ? '<button class="round fav' + (r.fav ? ' on' : '') + '" data-act="toggleFav" data-id="' + r.id + '" aria-label="Favori">' + (r.fav ? '★' : '☆') + '</button>' : '') +
      '<div class="hero-emo">' + r.emoji + '</div><h1>' + esc(r.title) + '</h1>' +
      '<div class="meta">' + (r.time ? '<span>⏱ ' + fmtTime(r.time) + '</span>' : '') + (r.tags || []).map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div></div>';
  }
  function adminRecipeRow(r) {
    if (typeof isAdmin !== 'function' || !isAdmin()) return '';
    const pub = r.catalogUpdated, dirty = !pub || (r.updated || 0) > pub;
    return '<div class="act-row two"><button class="btn soft" data-act="publishOne" data-id="' + r.id + '"' + (dirty ? '' : ' disabled') + '>📚 ' + (!pub ? 'Publier au catalogue' : dirty ? 'Mettre à jour le catalogue' : 'Au catalogue ✓') + '</button>' +
      (pub ? '<button class="btn ghost" data-act="unpublishOne" data-id="' + r.id + '">Retirer du catalogue</button>' : '') + '</div>';
  }
  function viewDetail(id) {
    const r = db.recipes[id];
    if (!r) return emptyState('🤔', 'Recette introuvable', 'Elle a peut-être été supprimée.', '<a class="btn primary" href="#recettes">Mes recettes</a>');
    const n = ui.people[id] || db.settings.people;
    let h = hero(r, 'recettes') + issuesBanner(r);
    h += '<div class="card"><div class="row-between"><h2>Ingrédients</h2><div class="pp">' + stepper(n, 'detPeople', 'data-id="' + id + '"') + '<small>pers.</small></div></div>' + ingList(r, n) + '</div>';
    if (r.steps && r.steps.length) h += '<div class="card"><h2>Préparation</h2><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>';
    if (r.notes) h += '<div class="card note"><h2>Notes</h2><p>' + esc(r.notes).replace(/\n/g, '<br>') + '</p></div>';
    h += '<div class="actions"><button class="btn primary big" data-act="cook" data-id="' + id + '">👩‍🍳 Mode cuisine</button>' +
      '<div class="act-row"><button class="btn soft" data-act="toMenu" data-id="' + id + '">📅 Au menu</button><button class="btn soft" data-act="share" data-id="' + id + '">↗ Partager</button><a class="btn soft" href="#edition-' + id + '">✏️ Modifier</a></div>' + adminRecipeRow(r) + '</div>';
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
    h += '<ol class="cook-steps">' + (r.steps || []).map((s, k) => '<li data-act="cookStep" data-i="' + k + '" class="' + (c.step[k] ? 'done' : k === current ? 'current' : '') + '"><span class="num">' + (c.step[k] ? '✓' : k + 1) + '</span><div class="st"><p>' + esc(s) + '</p>' + timerBtn(s, k) + '</div></li>').join('') + '</ol>';
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
    const nEx = (db.settings.allergens || []).length + (db.settings.diets || []).length + (db.settings.avoid || []).length;
    h += '<a href="#exclusions"><span class="mi">🚫</span><span class="mt"><b>Allergies & exclusions</b><small>' + (nEx ? plural(nEx, 'critère actif', 'critères actifs') : 'Aucune pour l\'instant') + '</small></span><span class="chev">›</span></a>';
    h += '<div class="mrow"><span class="mi">👥</span><span class="mt"><b>Personnes par défaut</b><small>Pour les nouveaux repas</small></span>' + stepper(db.settings.people, 'defPeople') + '</div>';
    const old = !db.settings.lastExport || (Date.now() - db.settings.lastExport > 30 * 864e5);
    h += '<a href="#sauvegarde"><span class="mi">💾</span><span class="mt"><b>Sauvegarde</b><small>' + (db.settings.lastExport ? 'Dernière : ' + new Date(db.settings.lastExport).toLocaleDateString('fr-FR') : 'Jamais faite') + '</small></span>' + (old && Object.keys(db.recipes).length ? '<span class="badge">!</span>' : '<span class="chev">›</span>') + '</a>';
    h += '<button class="mrow" data-act="loadStarter"><span class="mi">📚</span><span class="mt"><b>Recettes de départ</b><small>Ajouter les idées du livre de départ</small></span><span class="chev">›</span></button>';
    h += '<button class="mrow" data-act="shareApp"><span class="mi">💌</span><span class="mt"><b>Partager l\'app</b><small>Envoyer le lien à des amis</small></span><span class="chev">›</span></button>';
    if (ui.installEvt && !isStandalone()) h += '<button class="mrow" data-act="install"><span class="mi">📲</span><span class="mt"><b>Installer l\'app</b><small>Sur l\'écran d\'accueil</small></span><span class="chev">›</span></button>';
    if (ONLINE) {
      const n = catalogNews(); const k = n.add.length + n.upd.length;
      h += '<a href="#catalogue"><span class="mi">🆕</span><span class="mt"><b>Nouveautés du catalogue</b><small>' + (k ? plural(k, 'nouveauté', 'nouveautés') + ' à découvrir' : 'Tu es à jour') + '</small></span>' + (k ? '<span class="badge">' + k + '</span>' : '<span class="chev">›</span>') + '</a>';
    }
    h += '</div>';
    if (isAdmin()) {
      const tp = toPublish().length; const nm = ui.mod ? ui.mod.length : null; if (ui.mod === null) loadModeration();
      h += '<h3 class="menu-title">🛡️ Admin · ' + esc(sess.admin.email) + '</h3><div class="menu">' +
        '<a href="#moderation"><span class="mi">🛡️</span><span class="mt"><b>Modération</b><small>Recettes proposées par la communauté</small></span>' + (nm ? '<span class="badge">' + nm + '</span>' : '<span class="chev">›</span>') + '</a>' +
        '<button class="mrow" data-act="publishAll"><span class="mi">📚</span><span class="mt"><b>Publier dans le catalogue</b><small>' + (tp ? plural(tp, 'recette', 'recettes') + ' nouvelles ou modifiées' : 'Tout est publié ✓') + '</small></span><span class="chev">›</span></button>' +
        '<button class="mrow" data-act="adminLogout"><span class="mi">🚪</span><span class="mt"><b>Se déconnecter</b></span></button></div>';
    }
    h += '<div><p class="foot">' + LOGO + '<br>Popote &amp; Mijote<br><small>Tes recettes restent sur ce téléphone.</small>' + (ONLINE && !isAdmin() ? '<br><button class="link small" data-act="adminOpen">Espace admin</button>' : '') + '</p></div>';
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
      '<button class="btn primary wide" data-act="exportData">💾 Exporter mes données</button></div>' + cloudCard() +
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
    else if (h === 'exclusions') { html = viewExclusions(); tab = 'plus'; }
    else if (h === 'catalogue') { html = viewCatalog(); tab = 'recettes'; }
    else if (h.startsWith('communaute-')) { html = viewCommunityRecipe(h.slice(11)); tab = 'communaute'; }
    else if (h === 'communaute') { html = viewCommunity(); tab = 'communaute'; }
    else if (h === 'moderation') { html = viewModeration(); tab = 'plus'; }
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
  A.closeSheet = () => closeSheet();
  A.back = el => { if (ui.nav > 0) history.back(); else go('#' + (el.dataset.to || 'semaine')); };
  A.weekMove = el => { ui.week = keyOf(addDays(dateOf(ui.week), 7 * +el.dataset.d)); rerender(); };
  A.weekMenu = () => openSheet(() => '<h3 class="sheet-title">Semaine du ' + weekLabel(ui.week) + '</h3><div class="sheet-menu">' +
    '<button data-act="weekShare">📤 Partager le menu de la semaine</button>' +
    '<button data-act="weekRandom">🎲 Menu aléatoire</button>' +
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
    h += '<div id="pick-tags">' + chips(p.tags, 'pickTag', filterTags()) + '</div>';
    h += '<button class="btn surprise wide" data-act="surprise">🎲 Surprends-moi</button>';
    h += '<div id="pick-list">' + pickerList() + '</div>';
    return h;
  }
  function pickerList() {
    const p = ui.picker;
    const list = filterRecipes(p.q, p.tags);
    let h = exclusionNote(list.length, lastHidden, 'toggleExcludedPick');
    if (p.suggest && db.recipes[p.suggest]) {
      const r = db.recipes[p.suggest];
      h += '<div class="suggest" style="--c:' + colOf(r) + '"><small>Et pourquoi pas…</small><div class="sg-emo">' + r.emoji + '</div><b>' + esc(r.title) + '</b><small>' + esc(metaLine(r)) + '</small>' +
        '<div class="btn-row"><button class="btn ghost" data-act="surprise">Une autre</button><button class="btn primary" data-act="pickRecipe" data-id="' + r.id + '">Ajouter</button></div></div>';
    }
    if (!list.length) return h + '<p class="muted center pad">Aucune recette ne correspond.</p>';
    return h + '<div class="rlist">' + list.map(r => '<button class="rcard" style="--c:' + colOf(r) + '" data-act="pickRecipe" data-id="' + r.id + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + (r.fav ? '⭐ ' : '') + (isExcluded(r) ? '⚠️ ' : '') + esc(r.title) + '</b><small>' + esc([metaLine(r), lastUse(r.id)].filter(Boolean).join('  ·  ')) + '</small></span><span class="plus">+</span></button>').join('') + '</div>';
  }
  A.addMeal = el => { ui.picker = { sk: el.dataset.slot, people: db.settings.people, q: '', tags: [], suggest: null, replace: null }; openSheet(pickerSheet); };
  A.pickPeople = el => { ui.picker.people = Math.max(1, Math.min(30, ui.picker.people + +el.dataset.d)); el.parentNode.querySelector('b').textContent = ui.picker.people; };
  A.pickTag = el => { const t = el.dataset.v, a = ui.picker.tags; ui.picker.tags = a.includes(t) ? a.filter(x => x !== t) : a.concat(t); $('#pick-tags').innerHTML = chips(ui.picker.tags, 'pickTag', filterTags()); ui.picker.suggest = null; $('#pick-list').innerHTML = pickerList(); };
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
      '<div class="sheet-menu"><button data-act="mealOpen">📖 Voir la recette</button><button data-act="mealCook">👩‍🍳 Mode cuisine</button><button data-act="mealReroll">🎲 Une autre idée</button><button data-act="mealReplace">🔄 Choisir une autre recette</button><button data-act="mealRemove" class="danger-text">Retirer du menu</button></div>';
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
      '<button data-act="shareText" data-id="' + id + '"><span>📝</span><b>Texte de la recette</b><small>Lisible par tout le monde</small></button>' +
      (ONLINE && !String(id).startsWith('c') ? '<button data-act="shareCommunity" data-id="' + id + '"><span>🌍</span><b>Proposer à la communauté</b><small>Visible par tous après validation</small></button>' : '') + '</div>');
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
      const old = db.recipes[d.id]; db.settings.catalogDismissed = db.settings.catalogDismissed || {}; db.settings.catalogDismissed[d.id] = Math.max(old.updated || 0, old.catalogUpdated || 0, Date.now());
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


  // ================= MENU ALÉATOIRE =================
  const PASTA_RE = /(^|[^a-z])(pates?|spaghetti|tagliatelle|penne|fusilli|farfalle|macaroni|coquillette|lasagne|tortellini|ravioli|cannelloni|gnocchi|linguine|rigatoni|orecchiette|crozet|casarecce)/;
  function isPasta(r) {
    const t = s => { const f = PM.fold(s); return PASTA_RE.test(f) && !/pates? (brisee|feuilletee|a pizza|a brioche|sablee|a tarte)|pate de curry|pate a tartiner/.test(f); };
    return t(r.title) || (r.ingredients || []).some(i => t(i.name));
  }
  const isQuick = r => (r.time && r.time <= 30) || (r.tags || []).includes('Rapide');
  const rType = r => { const t = r.tags || []; return t.includes('Poisson') ? 'poisson' : t.includes('Viande') ? 'viande' : t.includes('Végé') ? 'vege' : 'autre'; };
  function rndOpts() { const s = db.settings; return { quick: s.rndQuick !== false, kids: !!s.rndKids }; }
  function weekIds(wk, skipSk, skipI) {
    const w = db.weeks[wk]; const ids = [];
    if (w) for (const [sk, items] of Object.entries(w.slots)) items.forEach((it, i) => { if (!(sk === skipSk && i === skipI)) ids.push(it.rid); });
    return ids;
  }
  function pickRandom(sk, opts, exclude, skipI) {
    const weekday = +sk.split('-')[0] < 5;
    const ids = weekIds(ui.week, sk, skipI);
    const inWeek = new Set(ids);
    const recs = ids.map(id => db.recipes[id]).filter(Boolean);
    const pastaCount = recs.filter(isPasta).length;
    const types = {}; for (const r of recs) types[rType(r)] = (types[rType(r)] || 0) + 1;
    let pool = recipeList().filter(r => !isExcluded(r) && !(r.tags || []).some(t => t === 'Dessert' || t === 'Apéro') && !(exclude && exclude.has(r.id)) && (r.ingredients || []).length);
    if (opts.kids) { const k = pool.filter(r => (r.tags || []).includes('Enfants')); if (k.length) pool = k; }
    const quickOk = r => !weekday || !opts.quick || isQuick(r);
    const rules = [
      r => !inWeek.has(r.id) && !usedRecently(r.id, ui.week) && quickOk(r) && !(isPasta(r) && pastaCount >= 1),
      r => !inWeek.has(r.id) && quickOk(r) && !(isPasta(r) && pastaCount >= 1),
      r => !inWeek.has(r.id) && quickOk(r),
      r => !inWeek.has(r.id),
      () => true,
    ];
    for (const rule of rules) {
      const cand = pool.filter(rule);
      if (!cand.length) continue;
      const month = dateOf(ui.week).getMonth(); const winter = month >= 9 || month <= 2;
      const season = r => { const t = r.tags || []; return (winter && t.includes('Été') && !t.includes('Hiver')) || (!winter && t.includes('Hiver') && !t.includes('Été')) ? .3 : 1; };
      const wts = cand.map(r => (r.fav ? 3 : 1) * season(r) * ((r.tags || []).includes('Soupe') ? .6 : 1) / (1 + (types[rType(r)] || 0)));
      let x = Math.random() * wts.reduce((a, b) => a + b, 0);
      for (let i = 0; i < cand.length; i++) { x -= wts[i]; if (x <= 0) return cand[i]; }
      return cand[cand.length - 1];
    }
    return null;
  }
  function slotState(sk) { const w = db.weeks[ui.week]; const items = (w && w.slots[sk]) || []; if (!items.length) return 'vide'; return items.every(it => it.rnd) ? 'rnd' : 'prevu'; }
  A.randomMenu = () => {
    const saved = db.settings.rndSlots || ['0-soir', '1-soir', '2-soir', '3-soir', '4-soir', '5-midi', '5-soir', '6-midi', '6-soir'];
    ui.rnd = { slots: saved.filter(sk => slotState(sk) !== 'prevu'), people: db.settings.people };
    openSheet(randomSheet);
  };
  A.weekRandom = () => closeSheet(() => setTimeout(A.randomMenu, 30));
  function randomSheet() {
    const r = ui.rnd; const o = rndOpts(); const mon = dateOf(ui.week);
    let h = '<div class="sheet-head"><div><small>Semaine du ' + weekLabel(ui.week) + '</small><h3>🎲 Menu aléatoire</h3></div><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>';
    h += '<p class="muted small">Choisis les repas à proposer. Ce que tu as déjà prévu est gardé.</p><div class="rnd-grid">';
    for (let d = 0; d < 7; d++) {
      h += '<div class="rnd-row"><span><b>' + DAYS[d].slice(0, 3) + '</b> ' + addDays(mon, d).getDate() + '</span>';
      for (const [m, l] of MEALS) {
        const sk = d + '-' + m; const st = slotState(sk);
        h += st === 'prevu' ? '<span class="rnd-chip done">✓ prévu</span>' : '<button class="rnd-chip' + (r.slots.includes(sk) ? ' on' : '') + '" data-act="rndSlot" data-v="' + sk + '">' + l + (st === 'rnd' ? ' 🎲' : '') + '</button>';
      }
      h += '</div>';
    }
    h += '</div><div class="rnd-quick"><button class="link" data-act="rndPreset" data-v="soirs">Tous les soirs</button><button class="link" data-act="rndPreset" data-v="tout">Tout</button><button class="link" data-act="rndPreset" data-v="rien">Rien</button></div>';
    h += '<div class="toggles"><button class="toggle' + (o.quick ? ' on' : '') + '" data-act="rndToggle" data-v="rndQuick"><span>⚡ Plats rapides en semaine</span><i></i></button>' +
      '<button class="toggle' + (o.kids ? ' on' : '') + '" data-act="rndToggle" data-v="rndKids"><span>🧒 Spécial enfants</span><i></i></button></div>';
    h += '<div class="row-between"><span>Personnes par repas</span>' + stepper(r.people, 'rndPeople') + '</div>';
    h += '<button class="btn primary wide big" data-act="rndGo">' + (r.slots.length ? 'Proposer ' + plural(r.slots.length, 'repas', 'repas') : 'Choisis au moins un repas') + '</button>';
    return h;
  }
  A.rndSlot = el => { const sk = el.dataset.v, a = ui.rnd.slots; ui.rnd.slots = a.includes(sk) ? a.filter(x => x !== sk) : a.concat(sk); drawSheet(); };
  A.rndPreset = el => {
    const all = []; for (let d = 0; d < 7; d++) for (const [m] of MEALS) all.push(d + '-' + m);
    const v = el.dataset.v; ui.rnd.slots = (v === 'rien' ? [] : all.filter(sk => v === 'tout' || sk.endsWith('soir'))).filter(sk => slotState(sk) !== 'prevu'); drawSheet();
  };
  A.rndToggle = el => { const k = el.dataset.v; db.settings[k] = k === 'rndQuick' ? !(db.settings[k] !== false) : !db.settings[k]; save(); drawSheet(); };
  A.rndPeople = el => { ui.rnd.people = Math.max(1, Math.min(30, ui.rnd.people + +el.dataset.d)); drawSheet(); };
  A.rndGo = () => {
    const r = ui.rnd; if (!r.slots.length) return;
    const order = []; for (let d = 0; d < 7; d++) for (const [m] of MEALS) if (r.slots.includes(d + '-' + m)) order.push(d + '-' + m);
    const w = getWeek(ui.week, true); const opts = rndOpts();
    for (const sk of order) { if (w.slots[sk] && w.slots[sk].every(it => it.rnd)) delete w.slots[sk]; }
    let n = 0;
    for (const sk of order) { const rec = pickRandom(sk, opts); if (rec) { (w.slots[sk] = w.slots[sk] || []).push({ rid: rec.id, people: r.people, rnd: true }); n++; } }
    db.settings.rndSlots = order;
    save(); closeSheet(() => { rerender(); toast(n ? '🎲 ' + plural(n, 'repas proposé', 'repas proposés') + ' · touche un plat pour le changer' : 'Pas assez de recettes'); });
  };
  A.mealReroll = () => {
    const it = mealItem(); const rec = pickRandom(ui.meal.sk, rndOpts(), new Set([it.rid]), ui.meal.i);
    if (!rec) { toast('Pas d\'autre idée avec ces critères'); return; }
    it.rid = rec.id; it.rnd = true; save(); drawSheet(); rerender(); toast(rec.emoji + ' ' + rec.title);
  };

  // ================= PARTAGE DU MENU =================
  function menuText() {
    const w = db.weeks[ui.week]; const mon = dateOf(ui.week);
    const L = ['🍽️ Menu de la semaine du ' + weekLabel(ui.week)];
    for (let d = 0; d < 7; d++) {
      const lines = [];
      for (const [m, l] of MEALS) {
        const items = ((w && w.slots[d + '-' + m]) || []).map(it => db.recipes[it.rid]).filter(Boolean);
        if (items.length) lines.push('   ' + l + ' : ' + items.map(r => r.emoji + ' ' + r.title).join(' + '));
      }
      if (lines.length) { L.push('', DAYS[d] + ' ' + fmtShort(addDays(mon, d))); L.push(...lines); }
    }
    return L.join('\n');
  }
  A.weekShare = () => closeSheet(() => {
    if (!weekEntries(ui.week).length) { toast('Aucun repas prévu cette semaine'); return; }
    shareOrCopy({ title: 'Menu de la semaine', text: menuText() }, 'Menu copié ✓');
  });

  // ================= FAVORIS =================
  A.toggleFav = el => { const r = db.recipes[el.dataset.id]; r.fav = !r.fav; r.updated = Date.now(); save(); rerender(); toast(r.fav ? '⭐ Ajoutée aux favoris' : 'Retirée des favoris'); };

  // ================= MINUTEURS =================
  function stepMinutes(s) {
    const f = PM.fold(s); let m;
    if ((m = f.match(/(\d+)\s*h(?:eures?)?(?:\s*(\d{1,2}))?(?![a-z])/))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
    if ((m = f.match(/(\d+)\s*(?:a|-|ou)\s*(\d+)\s*(?:min|mn)/))) return +m[2];
    if ((m = f.match(/(\d+)\s*(?:min|mn)/))) return +m[1];
    return null;
  }
  function timerBtn(s, k) { const n = stepMinutes(s); return n && n <= 600 ? '<button class="timer-btn" data-act="startTimer" data-min="' + n + '" data-label="Étape ' + (k + 1) + '">⏱ Lancer ' + fmtTime(n) + '</button>' : ''; }
  const timers = []; let actx = null, ringT = null;
  const tbar = document.createElement('div'); tbar.id = 'timerbar'; document.body.appendChild(tbar);
  const mmss = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(s); };
  function beep() {
    try {
      const t0 = actx.currentTime;
      [0, .3, .6].forEach(dt => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.25, t0 + dt); g.gain.exponentialRampToValueAtTime(.001, t0 + dt + .25); o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + .26); });
    } catch (e) { }
  }
  function ring(t) {
    toast('⏰ ' + t.label + ' : c\'est prêt !');
    try { if (navigator.vibrate) navigator.vibrate([500, 250, 500, 250, 500]); } catch (e) { }
    if (!ringT) { let n = 0; beep(); ringT = setInterval(() => { if (++n > 40 || !timers.some(x => x.done)) { clearInterval(ringT); ringT = null; return; } beep(); }, 1500); }
  }
  function drawTimers() {
    if (!timers.length) { tbar.className = ''; tbar.innerHTML = ''; document.body.classList.remove('has-timers'); return; }
    document.body.classList.add('has-timers'); tbar.className = 'on';
    tbar.innerHTML = timers.map(t => { const left = Math.max(0, Math.ceil((t.end - Date.now()) / 1000)); return '<div class="tm' + (t.done ? ' ring' : '') + '"><span class="tl">⏱ ' + esc(t.label) + '</span><b>' + (t.done ? 'Prêt !' : mmss(left)) + '</b><button data-act="stopTimer" data-id="' + t.id + '">' + (t.done ? 'OK' : 'Annuler') + '</button></div>'; }).join('');
  }
  setInterval(() => { if (!timers.length) return; for (const t of timers) if (!t.done && Date.now() >= t.end) { t.done = true; ring(t); } drawTimers(); }, 1000);
  A.startTimer = el => {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { }
    const r = ui.cook && db.recipes[ui.cook.id];
    timers.push({ id: uid(), label: el.dataset.label + (r ? ' · ' + r.title : ''), end: Date.now() + +el.dataset.min * 60000, done: false });
    drawTimers(); toast('⏱ Minuteur lancé : ' + fmtTime(+el.dataset.min));
  };
  A.stopTimer = el => { const i = timers.findIndex(t => t.id === el.dataset.id); if (i > -1) timers.splice(i, 1); drawTimers(); };


  // ================= SERVEUR (Firebase, appelé en direct, sans bibliothèque) =================
  const CFG = window.PM_CONFIG || {};
  const ONLINE = !!(CFG.apiKey && CFG.projectId);
  const FS = 'https://firestore.googleapis.com/v1/projects/' + CFG.projectId + '/databases/(default)/documents';
  const SKEY = 'popote-mijote-session';
  let sess = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch (e) { return {}; } })();
  const saveSess = () => { try { localStorage.setItem(SKEY, JSON.stringify(sess)); } catch (e) { } };
  const isAdmin = () => !!(ONLINE && sess.admin && sess.admin.refreshToken);
  async function authPost(url, body, form) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? body : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || 'connexion');
    return j;
  }
  async function idToken(kind) {
    const s = sess[kind];
    if (s && s.idToken && s.exp > Date.now() + 60000) return s.idToken;
    if (s && s.refreshToken) {
      const j = await authPost('https://securetoken.googleapis.com/v1/token?key=' + CFG.apiKey, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken), true);
      s.idToken = j.id_token; s.refreshToken = j.refresh_token; s.exp = Date.now() + (+j.expires_in) * 1000; saveSess(); return s.idToken;
    }
    if (kind === 'anon') {
      const j = await authPost('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + CFG.apiKey, { returnSecureToken: true });
      sess.anon = { idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, exp: Date.now() + (+j.expiresIn) * 1000 }; saveSess(); return j.idToken;
    }
    throw new Error('connexion admin requise');
  }
  async function adminLogin(email, password) {
    const j = await authPost('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + CFG.apiKey, { email, password, returnSecureToken: true });
    sess.admin = { email, idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, exp: Date.now() + (+j.expiresIn) * 1000 }; saveSess();
  }
  const fv = v => typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v == null ? '' : v) };
  const toFields = o => { const f = {}; for (const k in o) f[k] = fv(o[k]); return f; };
  const fromDoc = d => { const o = { _id: d.name.split('/').pop() }; for (const [k, v] of Object.entries(d.fields || {})) o[k] = 'stringValue' in v ? v.stringValue : 'integerValue' in v ? +v.integerValue : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : null; return o; };
  async function fsReq(method, path, body, auth) {
    const h = { 'Content-Type': 'application/json' };
    if (auth) h.Authorization = 'Bearer ' + await idToken(auth);
    const r = await fetch(FS + path + (path.includes('?') ? '&' : '?') + 'key=' + CFG.apiKey, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 403 ? 'accès refusé' : (j.error && j.error.message) || ('erreur ' + r.status));
    return j;
  }
  async function listAll(coll) {
    let out = [], tok = '';
    do { const j = await fsReq('GET', '/' + coll + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '')); if (!j) break; out = out.concat((j.documents || []).map(fromDoc)); tok = j.nextPageToken; } while (tok);
    return out;
  }
  async function queryStatus(coll, status, auth) {
    const j = await fsReq('POST', ':runQuery', { structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: status } } } } }, auth);
    return (j || []).filter(x => x.document).map(x => fromDoc(x.document));
  }
  const packRecipe = r => { const o = clone(r); delete o.fav; delete o.catalogUpdated; return JSON.stringify(o); };
  function unpackRecipe(str) {
    const r = typeof str === 'string' ? JSON.parse(str) : str;
    return {
      id: String(r.id || uid()), title: String(r.title || 'Recette').slice(0, 120), emoji: String(r.emoji || '🍽️').slice(0, 8), color: COLORS[r.color] ? r.color : COLOR_KEYS[hashIdx(r.title || '', COLOR_KEYS.length)],
      servings: Math.max(1, +r.servings || 4), time: +r.time || null, tags: (r.tags || []).map(String).filter(t => db.tags.includes(t)).slice(0, 8),
      ingredients: (r.ingredients || []).slice(0, 80).map(i => ({ qty: i.qty == null || isNaN(+i.qty) ? null : +i.qty, unit: PM.UNITS.includes(i.unit) ? i.unit : '', name: String(i.name || '').slice(0, 80), note: String(i.note || '').slice(0, 80), cat: PM.CATEGORIES.some(c => c.id === i.cat) ? i.cat : PM.categorize(String(i.name || '')) })).filter(i => i.name),
      steps: (r.steps || []).map(s => String(s).slice(0, 1500)).slice(0, 40), notes: String(r.notes || '').slice(0, 2000), created: +r.created || Date.now(), updated: +r.updated || Date.now(),
    };
  }
  window.addEventListener('online', () => { checkCatalog(); cloudSoon(); });

  // ---------- catalogue officiel ----------
  const CKEY = 'popote-mijote-catalogue';
  let catalog = (() => { try { return JSON.parse(localStorage.getItem(CKEY)) || null; } catch (e) { return null; } })();
  async function checkCatalog(force) {
    if (!ONLINE || (!navigator.onLine && !force)) return;
    if (!force && Date.now() - (db.settings.catalogChecked || 0) < 3 * 3600e3) return;
    try {
      const meta = await fsReq('GET', '/meta/catalog');
      db.settings.catalogChecked = Date.now();
      if (meta) {
        const v = fromDoc(meta).version || 0;
        if (!catalog || catalog.version !== v || force) {
          const docs = await listAll('catalog');
          catalog = { version: v, items: docs.map(d => ({ id: d._id, updated: d.updated || 0, title: d.title || '', data: d.data })) };
          try { localStorage.setItem(CKEY, JSON.stringify(catalog)); } catch (e) { }
        }
      }
      save(); if (['semaine', 'recettes', 'catalogue', 'plus'].includes(ui.route)) render(true);
      if (force) toast('Catalogue vérifié ✓');
    } catch (e) { if (force) toast('Catalogue injoignable (' + e.message + ')'); }
  }
  function catalogNews() {
    const res = { add: [], upd: [] }; if (!catalog) return res;
    const dis = db.settings.catalogDismissed || {};
    for (const it of catalog.items) {
      if (dis[it.id] && dis[it.id] >= it.updated) continue;
      const loc = db.recipes[it.id];
      if (!loc) res.add.push(it);
      else { const base = loc.catalogUpdated || loc.created || loc.updated || 0; if (it.updated > base) res.upd.push(Object.assign({ modified: (loc.updated || 0) > base }, it)); }
    }
    return res;
  }
  function catalogBanner() {
    if (!ONLINE || ui.hideNews) return '';
    const n = catalogNews(); if (!n.add.length && !n.upd.length) return '';
    const bits = []; if (n.add.length) bits.push(plural(n.add.length, 'nouvelle recette', 'nouvelles recettes')); if (n.upd.length) bits.push(plural(n.upd.length, 'mise à jour', 'mises à jour'));
    return '<a class="banner news" href="#catalogue"><span>📚 Catalogue : ' + bits.join(' · ') + '</span><b>Voir ›</b></a>';
  }
  function viewCatalog() {
    let h = '<header class="top"><button class="round ghost" data-act="back" data-to="recettes" aria-label="Retour">‹</button><h1>Nouveautés</h1><button class="round ghost" data-act="catRefresh" aria-label="Vérifier">↻</button></header>';
    if (!ONLINE) return h + serverOff();
    const n = catalogNews(); ui.catSel = ui.catSel || {};
    if (!n.add.length && !n.upd.length) return h + emptyState('✅', 'Tu es à jour', 'Aucune nouvelle recette dans le catalogue pour le moment.', '<button class="btn soft" data-act="catRefresh">Vérifier maintenant</button>');
    const row = (it, upd) => {
      if (!(it.id in ui.catSel)) ui.catSel[it.id] = !(upd && it.modified);
      let r; try { r = unpackRecipe(it.data); } catch (e) { return ''; }
      const is = recipeIssues(Object.assign({}, r, { id: 'cat-' + r.id }));
      return '<div class="item' + (ui.catSel[it.id] ? '' : ' off') + '" data-act="catSel" data-id="' + esc(it.id) + '"><span class="box sel"></span><span class="iname"><b>' + r.emoji + ' ' + esc(r.title) + '</b><small>' +
        esc([metaLine(r), upd && it.modified ? '✏️ remplacera ta version modifiée' : '', is.length ? '⚠️ ' + is.join(', ') : ''].filter(Boolean).join('  ·  ')) + '</small></span></div>';
    };
    h += '<p class="muted small pad-x">Coche ce que tu veux ajouter. Tes recettes et tes favoris sont conservés.</p>';
    if (n.add.length) h += '<section class="group"><h3>✨ Nouvelles recettes (' + n.add.length + ')</h3>' + n.add.map(it => row(it, false)).join('') + '</section>';
    if (n.upd.length) h += '<section class="group"><h3>🔄 Mises à jour (' + n.upd.length + ')</h3>' + n.upd.map(it => row(it, true)).join('') + '</section>';
    const k = [...n.add, ...n.upd].filter(it => ui.catSel[it.id]).length;
    h += '<div class="share-bar"><button class="btn primary" data-act="catApply"' + (k ? '' : ' disabled') + '>Ajouter la sélection (' + k + ')</button><button class="btn ghost" data-act="catIgnore">Ignorer le reste</button></div>';
    return h;
  }
  A.catRefresh = () => { toast('Vérification…'); checkCatalog(true); };
  A.catSel = el => { const id = el.dataset.id; ui.catSel[id] = !ui.catSel[id]; rerender(); };
  A.catApply = () => {
    const n = catalogNews(); let k = 0;
    for (const it of [...n.add, ...n.upd]) {
      if (!ui.catSel[it.id]) continue;
      try { const loc = db.recipes[it.id]; const r = unpackRecipe(it.data); r.id = it.id; r.updated = it.updated; r.catalogUpdated = it.updated; r.created = loc ? loc.created || it.updated : it.updated; if (loc && loc.fav) r.fav = true; db.recipes[it.id] = r; k++; } catch (e) { }
    }
    ui.catSel = {}; exclVer++; save(); toast('📚 ' + plural(k, 'recette importée', 'recettes importées') + ' ✓'); go('#recettes');
  };
  A.catIgnore = () => {
    const n = catalogNews(); db.settings.catalogDismissed = db.settings.catalogDismissed || {};
    for (const it of [...n.add, ...n.upd]) if (!ui.catSel[it.id]) db.settings.catalogDismissed[it.id] = it.updated;
    save(); rerender(); toast('C\'est noté');
  };

  // ---------- admin : publier dans le catalogue ----------
  const toPublish = () => Object.values(db.recipes).filter(r => !r.catalogUpdated || (r.updated || 0) > r.catalogUpdated);
  async function publishRecipes(list) {
    const queue = list.slice(); let done = 0;
    const worker = async () => {
      while (queue.length) {
        const r = queue.shift(); r.updated = r.updated || r.created || Date.now();
        await fsReq('PATCH', '/catalog/' + encodeURIComponent(r.id), { fields: toFields({ data: packRecipe(r), updated: r.updated, title: r.title }) }, 'admin');
        r.catalogUpdated = r.updated; done++;
        if (done % 10 === 0) { const t = $('#toast'); if (t) { t.textContent = '📤 ' + done + ' / ' + list.length; t.classList.add('show'); } }
      }
    };
    try { await Promise.all([1, 2, 3, 4, 5].map(worker)); }
    finally { if (done) await fsReq('PATCH', '/meta/catalog', { fields: toFields({ version: Date.now(), count: Object.values(db.recipes).filter(r => r.catalogUpdated).length }) }, 'admin'); save(); }
    return done;
  }
  A.publishOne = async el => {
    const r = db.recipes[el.dataset.id];
    try { await publishRecipes([r]); toast('📚 Publiée dans le catalogue'); rerender(); } catch (e) { toast('Publication impossible (' + e.message + ')'); }
  };
  A.unpublishOne = el => {
    const r = db.recipes[el.dataset.id];
    confirmSheet('Retirer « ' + r.title + ' » du catalogue ?', 'Les personnes qui l\'ont déjà gardent leur copie.', 'Retirer', async () => {
      try { await fsReq('DELETE', '/catalog/' + encodeURIComponent(r.id), null, 'admin'); await fsReq('PATCH', '/meta/catalog', { fields: toFields({ version: Date.now() }) }, 'admin'); delete r.catalogUpdated; save(); rerender(); toast('Retirée du catalogue'); }
      catch (e) { toast('Impossible (' + e.message + ')'); }
    }, true);
  };
  A.publishAll = () => {
    const list = toPublish(); if (!list.length) { toast('Tout est déjà publié ✓'); return; }
    confirmSheet('Publier ' + plural(list.length, 'recette', 'recettes') + ' ?', 'Les nouvelles recettes et tes modifications seront proposées à tous les utilisateurs.', 'Publier', async () => {
      toast('📤 Publication en cours…');
      try { const n = await publishRecipes(list); toast('📚 ' + plural(n, 'recette publiée', 'recettes publiées') + ' ✓'); rerender(); } catch (e) { toast('Publication interrompue (' + e.message + ')'); rerender(); }
    });
  };
  A.adminOpen = () => openSheet(() => '<h3 class="sheet-title">🔐 Espace admin</h3><p class="muted small">Réservé au créateur de l\'appli, pour publier le catalogue et valider les recettes de la communauté.</p>' +
    '<form class="stack" data-act-submit="adminLogin"><input name="email" type="email" placeholder="E-mail" autocomplete="username" required><input name="t" type="password" placeholder="Mot de passe" autocomplete="current-password" required><button class="btn primary wide" type="submit">Se connecter</button></form>');
  A.adminLogout = () => { delete sess.admin; saveSess(); rerender(); toast('Déconnecté'); };

  // ---------- communauté ----------
  ui.comm = { list: null, at: 0, q: '', tags: [] };
  async function loadCommunity(force) {
    if (!ONLINE || ui.comm.loading) return;
    if (!force && ui.comm.list && Date.now() - ui.comm.at < 600e3) return;
    ui.comm.loading = true; ui.comm.err = null; if (ui.route.startsWith('communaute')) render(true);
    try {
      const docs = await queryStatus('community', 'approved');
      ui.comm.list = docs.map(d => { try { const r = unpackRecipe(d.data); r.id = 'c' + d._id; return { docId: d._id, author: (d.author || '').slice(0, 30), created: d.created || 0, recipe: r }; } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.created - a.created);
      ui.comm.at = Date.now();
    } catch (e) { ui.comm.err = e.message; }
    ui.comm.loading = false; if (ui.route.startsWith('communaute')) render(true);
  }
  function serverOff() { return emptyState('🌍', 'Bientôt disponible', 'Cette partie s\'active dès que le serveur de l\'appli est branché.', ''); }
  function viewCommunity() {
    let h = '<header class="top"><h1>Communauté</h1><button class="round ghost" data-act="commRefresh" aria-label="Actualiser">↻</button></header>';
    if (!ONLINE) return h + serverOff();
    loadCommunity();
    h += '<button class="btn soft wide" data-act="commPropose">＋ Proposer une de mes recettes</button><div style="height:12px"></div>';
    const c = ui.comm;
    if (!c.list) return h + (c.err ? emptyState('📡', 'Pas de connexion', 'Impossible de joindre la communauté (' + esc(c.err) + ').', '<button class="btn primary" data-act="commRefresh">Réessayer</button>') : '<p class="muted center pad">Chargement des recettes…</p>');
    if (!c.list.length) return h + emptyState('🌱', 'Pas encore de recette partagée', 'Sois le premier à proposer une recette !', '');
    h += '<div class="search"><input type="search" data-in="commQ" placeholder="Chercher dans la communauté" value="' + esc(c.q) + '"></div>' + '<div id="comm-tags">' + chips(c.tags, 'commTag') + '</div><div id="comm-list" class="rlist">' + commCards() + '</div>';
    return h;
  }
  function commCards() {
    const c = ui.comm; const byId = {}; for (const x of c.list) byId[x.recipe.id] = x;
    const list = filterRecipes(c.q, c.tags, c.list.map(x => x.recipe)); const note = exclusionNote(list.length, lastHidden, 'toggleExcluded');
    if (!list.length) return note + '<p class="muted center pad">Aucune recette ne correspond.</p>';
    return note + list.map(r => { const x = byId[r.id]; const mine = !!db.recipes[r.id];
      return '<a class="rcard" href="#communaute-' + x.docId + '" style="--c:' + colOf(r) + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + (isExcluded(r) ? '⚠️ ' : '') + esc(r.title) + '</b><small>' + esc([x.author ? 'par ' + x.author : '', metaLine(r)].filter(Boolean).join('  ·  ')) + '</small></span>' + (mine ? '<span class="have">✓</span>' : '<span class="chev">›</span>') + '</a>'; }).join('');
  }
  function viewCommunityRecipe(docId) {
    if (!ui.comm.list) { loadCommunity(); return '<p class="muted center pad">Chargement…</p>'; }
    const x = ui.comm.list.find(y => y.docId === docId);
    if (!x) return emptyState('🤔', 'Recette introuvable', 'Elle a peut-être été retirée.', '<a class="btn primary" href="#communaute">Communauté</a>');
    const r = x.recipe; const mine = !!db.recipes[r.id];
    let h = hero(r, 'communaute') + issuesBanner(r);
    h += '<div class="actions">' + (mine ? '<a class="btn soft big" href="#recette-' + r.id + '">✓ Dans tes recettes · ouvrir</a>' : '<button class="btn primary big" data-act="commAdd" data-id="' + x.docId + '">+ Ajouter à mes recettes</button>') + '</div>';
    if (x.author) h += '<p class="muted small center">Proposée par <b>' + esc(x.author) + '</b></p>';
    h += '<div class="card"><h2>Ingrédients <small class="muted">pour ' + plural(r.servings, 'personne') + '</small></h2>' + ingList(r, r.servings) + '</div>';
    if (r.steps.length) h += '<div class="card"><h2>Préparation</h2><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>';
    if (r.notes) h += '<div class="card note"><h2>Notes</h2><p>' + esc(r.notes) + '</p></div>';
    if (isAdmin()) h += '<button class="btn danger-ghost wide" data-act="commRemove" data-id="' + x.docId + '">🛡️ Retirer de la communauté</button>';
    return h;
  }
  A.commRefresh = () => loadCommunity(true);
  A.commTag = el => { const t = el.dataset.v, a = ui.comm.tags; ui.comm.tags = a.includes(t) ? a.filter(x => x !== t) : a.concat(t); rerender(); };
  A.commAdd = el => {
    const x = ui.comm.list.find(y => y.docId === el.dataset.id); if (!x) return;
    const r = clone(x.recipe); r.created = Date.now(); r.updated = r.created; db.recipes[r.id] = r; save(); toast('Recette ajoutée 🎉'); go('#recette-' + r.id);
  };
  A.commRemove = el => confirmSheet('Retirer cette recette de la communauté ?', 'Elle ne sera plus visible. Ceux qui l\'ont ajoutée la gardent.', 'Retirer', async () => {
    try { await fsReq('DELETE', '/community/' + el.dataset.id, null, 'admin'); ui.comm.list = ui.comm.list.filter(y => y.docId !== el.dataset.id); toast('Retirée'); go('#communaute'); } catch (e) { toast('Impossible (' + e.message + ')'); }
  }, true);
  A.commPropose = () => { ui.prop = { q: '' }; openSheet(proposeSheet); };
  function proposeSheet() {
    const list = filterRecipes(ui.prop.q, [], recipeList().filter(r => !String(r.id).startsWith('c'))).slice(0, 80);
    return '<div class="sheet-head"><h3>Quelle recette partager ?</h3><button class="round ghost" data-act="closeSheet" aria-label="Fermer">×</button></div>' +
      '<div class="search"><input type="search" data-in="propQ" placeholder="Chercher une de mes recettes" value="' + esc(ui.prop.q) + '"></div><div id="prop-list" class="rlist">' + propList(list) + '</div>';
  }
  const propList = list => list.map(r => '<button class="rcard" style="--c:' + colOf(r) + '" data-act="commPick" data-id="' + r.id + '"><span class="emo">' + r.emoji + '</span><span class="rt"><b>' + esc(r.title) + '</b><small>' + ((db.settings.proposed || {})[r.id] ? 'Déjà proposée' : esc(metaLine(r))) + '</small></span><span class="plus">›</span></button>').join('') || '<p class="muted center pad">Aucune recette.</p>';
  A.commPick = el => { ui.prop.id = el.dataset.id; sheetFn = proposeConfirm; drawSheet(); };
  A.shareCommunity = el => { ui.prop = { id: el.dataset.id, q: '' }; sheetFn = proposeConfirm; drawSheet(); };
  function proposeConfirm() {
    const r = db.recipes[ui.prop.id];
    return '<h3 class="sheet-title">' + r.emoji + ' Partager « ' + esc(r.title) + ' »</h3><p class="muted small">Elle sera visible par tous après validation. Tu peux signer avec un pseudo (facultatif).</p>' +
      '<form class="stack" data-act-submit="commSend"><input name="t" placeholder="Ton pseudo (facultatif)" maxlength="30" value="' + esc(db.settings.pseudo || '') + '"><button class="btn primary wide" type="submit">🌍 Envoyer à la communauté</button></form>';
  }
  async function commSend(pseudo) {
    const r = db.recipes[ui.prop.id];
    db.settings.pseudo = pseudo; save();
    try {
      await fsReq('POST', '/community', { fields: toFields({ status: 'pending', data: packRecipe(r), title: r.title.slice(0, 120), author: pseudo.slice(0, 30), created: Date.now() }) }, 'anon');
      db.settings.proposed = db.settings.proposed || {}; db.settings.proposed[r.id] = Date.now(); save();
      closeSheet(() => toast('Merci ! Elle sera visible après validation 🙌'));
    } catch (e) { toast('Envoi impossible (' + e.message + ')'); }
  }

  // ---------- admin : modération ----------
  ui.mod = null;
  async function loadModeration() {
    if (ui.modLoading) return; ui.modLoading = true; ui.modAt = Date.now();
    try { ui.mod = (await queryStatus('community', 'pending', 'admin')).map(d => { try { const r = unpackRecipe(d.data); return { docId: d._id, author: d.author || '', created: d.created || 0, recipe: r }; } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.created - b.created); ui.modErr = null; }
    catch (e) { ui.modErr = e.message; ui.mod = ui.mod || []; }
    ui.modLoading = false; ui.modAt = Date.now();
    if (['moderation', 'plus'].includes(ui.route)) render(true);
  }
  function viewModeration() {
    let h = '<header class="top"><button class="round ghost" data-act="back" data-to="plus" aria-label="Retour">‹</button><h1>Modération</h1><button class="round ghost" data-act="modRefresh" aria-label="Actualiser">↻</button></header>';
    if (!isAdmin()) return h + emptyState('🔐', 'Réservé à l\'admin', '', '');
    if (!ui.mod || Date.now() - (ui.modAt || 0) > 5000) loadModeration();
    if (!ui.mod) return h + '<p class="muted center pad">Chargement…</p>';
    if (ui.modErr) h += '<div class="banner warn">' + esc(ui.modErr) + '</div>';
    if (!ui.mod.length) return h + emptyState('✅', 'Rien à valider', 'Aucune recette en attente.', '');
    for (const x of ui.mod) {
      const r = x.recipe;
      h += '<div class="card mod"><div class="mod-head"><span class="emo" style="--c:' + colOf(r) + '">' + r.emoji + '</span><div><b>' + esc(r.title) + '</b><small>' + esc([x.author ? 'par ' + x.author : 'anonyme', new Date(x.created).toLocaleDateString('fr-FR'), metaLine(r)].filter(Boolean).join(' · ')) + '</small></div></div>' +
        '<details><summary>Voir la recette</summary><p class="muted small">Pour ' + plural(r.servings, 'personne') + '</p>' + ingList(r, r.servings) + '<ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></details>' +
        '<div class="btn-row"><button class="btn ghost" data-act="modReject" data-id="' + x.docId + '">Refuser</button><button class="btn primary" data-act="modApprove" data-id="' + x.docId + '">Publier</button></div></div>';
    }
    return h;
  }
  A.modRefresh = () => { ui.mod = null; rerender(); };
  A.modApprove = async el => {
    try { await fsReq('PATCH', '/community/' + el.dataset.id + '?updateMask.fieldPaths=status', { fields: toFields({ status: 'approved' }) }, 'admin'); ui.mod = ui.mod.filter(x => x.docId !== el.dataset.id); ui.comm.at = 0; rerender(); toast('✅ Publiée dans la communauté'); }
    catch (e) { toast('Impossible (' + e.message + ')'); }
  };
  A.modReject = el => confirmSheet('Refuser cette recette ?', 'Elle sera supprimée définitivement.', 'Refuser', async () => {
    try { await fsReq('DELETE', '/community/' + el.dataset.id, null, 'admin'); ui.mod = ui.mod.filter(x => x.docId !== el.dataset.id); rerender(); toast('Refusée'); } catch (e) { toast('Impossible (' + e.message + ')'); }
  }, true);

  // ---------- sauvegarde en ligne par code ----------
  const CODE_ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode() { const a = new Uint8Array(16); crypto.getRandomValues(a); let s = ''; for (const x of a) s += CODE_ALPH[x % CODE_ALPH.length]; return s.match(/.{4}/g).join('-'); }
  const codeId = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function packText(str) {
    const bytes = new TextEncoder().encode(str);
    if (window.CompressionStream) { try { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'z' + b64u(new Uint8Array(await new Response(st).arrayBuffer())); } catch (e) { } }
    return 'j' + b64u(bytes);
  }
  async function unpackText(s) {
    let bytes = unb64u(s.slice(1));
    if (s[0] === 'z') { const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(st).arrayBuffer()); }
    return new TextDecoder().decode(bytes);
  }
  let cloudT = null, skipCloud = false;
  function cloudSoon() { if (skipCloud || !ONLINE || !db.settings.cloudCode) return; clearTimeout(cloudT); cloudT = setTimeout(() => { cloudT = null; cloudBackup(true); }, 20000); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cloudT) { clearTimeout(cloudT); cloudT = null; cloudBackup(true); } });
  async function cloudBackup(silent) {
    if (!ONLINE || !db.settings.cloudCode) return;
    try {
      const copy = clone(db); delete copy.settings.allergens; delete copy.settings.diets; delete copy.settings.avoid; // la santé reste sur le téléphone
      const data = await packText(JSON.stringify(copy));
      await fsReq('PATCH', '/backups/' + codeId(db.settings.cloudCode), { fields: toFields({ data, at: Date.now() }) }, 'anon');
      db.settings.cloudAt = Date.now(); skipCloud = true; save(); skipCloud = false;
      if (!silent) { toast('☁️ Sauvegardé en ligne'); rerender(); }
    } catch (e) { if (!silent) toast('Sauvegarde en ligne impossible (' + e.message + ')'); }
  }
  function cloudCard() {
    if (!ONLINE) return '';
    const c = db.settings.cloudCode;
    if (!c) return '<div class="card"><h2>☁️ Sauvegarde en ligne</h2><p class="muted">Tes recettes sont copiées automatiquement en ligne. Avec ton <b>code personnel</b>, tu les retrouves sur un autre téléphone, même si celui-ci est perdu ou réinitialisé.</p>' +
      '<button class="btn primary wide" data-act="cloudOn">Activer la sauvegarde en ligne</button><div style="height:8px"></div><button class="btn soft wide" data-act="cloudRestoreOpen">J\'ai déjà un code : récupérer mes recettes</button></div>';
    return '<div class="card"><h2>☁️ Sauvegarde en ligne</h2><p class="muted small">Activée · ' + (db.settings.cloudAt ? 'dernière : ' + new Date(db.settings.cloudAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'pas encore faite') + '</p>' +
      '<p class="muted small">Ton code de récupération (garde-le précieusement, envoie-le-toi par mail par exemple) :</p><div class="code-box">' + esc(c) + '</div>' +
      '<div class="btn-row"><button class="btn soft" data-act="cloudCopy">Copier le code</button><button class="btn primary" data-act="cloudNow">Sauvegarder</button></div><div style="height:8px"></div><button class="btn ghost wide" data-act="cloudRestoreOpen">Récupérer depuis un autre code</button></div>';
  }
  A.cloudOn = async () => { db.settings.cloudCode = newCode(); save(); rerender(); await cloudBackup(false); };
  A.cloudNow = () => cloudBackup(false);
  A.cloudCopy = () => shareOrCopy({ title: 'Mon code Popote & Mijote', text: 'Mon code de sauvegarde Popote & Mijote : ' + db.settings.cloudCode }, 'Code copié ✓');
  A.cloudRestoreOpen = () => openSheet(() => '<h3 class="sheet-title">Récupérer mes recettes</h3><p class="muted small">Entre ton code de sauvegarde. Les recettes récupérées s\'ajoutent à celles du téléphone, rien n\'est effacé.</p>' +
    '<form class="stack" data-act-submit="cloudRestore"><input name="t" placeholder="XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" required><button class="btn primary wide" type="submit">Récupérer</button></form>');
  async function cloudRestore(code) {
    try {
      const doc = await fsReq('GET', '/backups/' + codeId(code), null, 'anon');
      if (!doc) { toast('Code introuvable'); return; }
      const d = JSON.parse(await unpackText(fromDoc(doc).data));
      const n = mergeData(d);
      for (const k of ['pseudo', 'people']) if (d.settings && d.settings[k] != null && db.settings[k] == null) db.settings[k] = d.settings[k];
      db.settings.cloudCode = codeId(code).match(/.{1,4}/g).join('-'); save();
      closeSheet(() => { toast('☁️ ' + plural(n, 'recette récupérée', 'recettes récupérées') + ' ✓'); rerender(); });
    } catch (e) { toast('Récupération impossible (' + e.message + ')'); }
  }

  // ================= SAISIES =================
  const I = {};
  I.q = el => { ui.q = el.value; $('#rec-list').innerHTML = recipeCards(); };
  I.commQ = el => { ui.comm.q = el.value; $('#comm-list').innerHTML = commCards(); };
  I.propQ = el => { ui.prop.q = el.value; $('#prop-list').innerHTML = propList(filterRecipes(ui.prop.q, [], recipeList().filter(r => !String(r.id).startsWith('c'))).slice(0, 80)); };
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
  function mergeData(d) {
    if (!d || !d.recipes) throw new Error('format');
    let n = 0;
    for (const [id, r] of Object.entries(d.recipes)) { if (!db.recipes[id]) n++; db.recipes[id] = Object.assign({}, r, db.recipes[id] && db.recipes[id].updated > r.updated ? db.recipes[id] : {}); }
    for (const [k, w] of Object.entries(d.weeks || {})) if (!db.weeks[k]) db.weeks[k] = w;
    for (const p of d.pantry || []) if (!db.pantry.some(x => PM.fold(x) === PM.fold(p))) db.pantry.push(p);
    for (const t of d.tags || []) if (!db.tags.includes(t)) db.tags.push(t);
    save(); return n;
  }
  I.importFile = async el => {
    const f = el.files && el.files[0]; if (!f) return;
    try { const n = mergeData(JSON.parse(await f.text())); toast(plural(n, 'recette ajoutée', 'recettes ajoutées') + ' ✓'); rerender(); }
    catch (e) { toast('Fichier de sauvegarde illisible'); }
    el.value = '';
  };
  // recettes de départ (fichier recettes.json à côté de l'app)
  async function loadStarter() { const r = await fetch('recettes.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('absent'); return mergeData(await r.json()); }
  async function seedIfNeeded() {
    if (db.settings.seeded || Object.keys(db.recipes).length) return;
    try { const n = await loadStarter(); db.settings.seeded = true; save(); render(true); if (n) toast('📚 ' + n + ' recettes de départ chargées'); } catch (e) { }
  }
  A.loadStarter = () => confirmSheet('Ajouter les recettes de départ ?', 'Les recettes du livre de départ qui ne sont pas déjà dans ton appli seront ajoutées. Tes recettes et tes modifications sont conservées.', 'Ajouter', async () => {
    try { const n = await loadStarter(); db.settings.seeded = true; save(); toast(n ? plural(n, 'recette ajoutée', 'recettes ajoutées') + ' ✓' : 'Tu as déjà toutes les recettes de départ'); rerender(); }
    catch (e) { toast('Pas de connexion : réessaie plus tard'); }
  });
  A.shareApp = () => shareOrCopy({ title: 'Popote & Mijote', text: 'Popote & Mijote : mes recettes, le menu de la semaine et la liste de courses qui se fait toute seule. Ouvre le lien dans Chrome (ou Safari sur iPhone) et installe-la sur ton écran d\'accueil :', url: appUrl() }, 'Lien de l\'appli copié ✓');

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
    const act = f.dataset.actSubmit;
    const v = (f.elements.t.value || '').trim();
    if (act === 'commSend') { commSend(v); return; }
    if (!v) return;
    if (act === 'cloudRestore') { cloudRestore(v); return; }
    if (act === 'adminLogin') {
      adminLogin(f.elements.email.value.trim(), v).then(() => closeSheet(() => { toast('🔐 Connecté en admin'); rerender(); loadModeration(); }))
        .catch(err => toast(/PASSWORD|EMAIL|CREDENTIAL/.test(err.message) ? 'E-mail ou mot de passe incorrect' : 'Connexion impossible (' + err.message + ')'));
      return;
    }
    if (act === 'addExtra') { getWeek(ui.week, true).extras.push({ text: v, done: false }); }
    else if (act === 'pantryAdd') { if (!db.pantry.some(x => PM.fold(x) === PM.fold(v))) db.pantry.push(v.charAt(0).toUpperCase() + v.slice(1)); }
    else if (act === 'avoidAdd') { db.settings.avoid = db.settings.avoid || []; if (!db.settings.avoid.some(x => PM.fold(x) === PM.fold(v))) db.settings.avoid.push(v.toLowerCase()); exclVer++; }
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
  seedIfNeeded();
  checkCatalog();
  if (restoredFromCopy) setTimeout(() => toast('🛟 Tes recettes ont été restaurées depuis la copie de secours'), 800);
  window.__pm = { db: () => db, ui };
})();
