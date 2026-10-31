/* Popote & Mijote — moteur : lecture de recettes, unités, rayons, liste de courses */
(function (root) {
  'use strict';

  // ---------- Pliage du texte (minuscules, sans accents, même longueur) ----------
  function foldChar(c) {
    const b = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (b.length === 1 ? b : c).toLowerCase();
  }
  function foldSameLength(s) { let o = ''; for (const c of s) o += foldChar(c); return o; }
  function fold(s) {
    return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
  }
  // clé d'ingrédient : pliée, singulier approximatif
  function ingKey(name) {
    return fold(name).replace(/^(de |des |du |d'|l'|le |la |les )/, '')
      .replace(/[^a-z0-9' ]+/g, ' ').trim().split(/\s+/)
      .map(w => (w.length > 3 && /[sx]$/.test(w) && !/ss$/.test(w)) ? w.slice(0, -1) : w)
      .join(' ');
  }

  // ---------- Rayons ----------
  const CATEGORIES = [
    { id: 'fl', name: 'Fruits & légumes', emoji: '🥕' },
    { id: 'vp', name: 'Viandes & poissons', emoji: '🍗' },
    { id: 'cf', name: 'Crèmerie & frais', emoji: '🧀' },
    { id: 'bo', name: 'Boulangerie', emoji: '🥖' },
    { id: 'ep', name: 'Épicerie', emoji: '🥫' },
    { id: 'ec', name: 'Épices & condiments', emoji: '🧂' },
    { id: 'su', name: 'Surgelés', emoji: '🧊' },
    { id: 'bs', name: 'Boissons', emoji: '🍷' },
    { id: 'au', name: 'Autre', emoji: '🛒' },
  ];
  const RULES = [
    ['cf', 'pate feuilletee|pate brisee|pate sablee|pate a pizza|pate a tarte|gnocchi|pates fraiches|tofu|houmous'],
    ['ep', "lait de coco|creme de coco|tomates? pelee|tomates? concassee|concentre|coulis|passata|puree de tomate|sucre glace|en boite|en conserve|haricots? rouge|haricots? blanc|pois chiche|olive|noix de coco|chocolat|bouillon|beurre de cacahuete|lait concentre|thon|sardine|mais|cornichon|capre"],
    ['su', 'surgel|glace'],
    ['ec', "sel|poivre|paprika|cumin|curry|curcuma|cannelle|muscade|piment d'espelette|herbes de provence|thym|laurier|romarin|origan|moutarde|ketchup|mayonnaise|gingembre moulu|vanille|cardamome|clou de girofle|ras el hanout|quatre epices|4 epices|sauce soja|sauce worcestershire|tabasco|harissa|sumac|zaatar|graines de"],
    ['fl', "tomate|oignon|ail|echalote|carotte|poireau|pomme|patate|courgette|aubergine|poivron|salade|laitue|epinard|chou|brocoli|champignon|citron|orange|poire|banane|fraise|framboise|myrtille|avocat|concombre|radis|navet|celeri|fenouil|potiron|potimarron|courge|butternut|haricots? vert|petits? pois|persil|coriandre|basilic|menthe|ciboulette|aneth|gingembre|mangue|ananas|raisin|kiwi|betterave|artichaut|asperge|endive|mache|roquette|cebette|oignon nouveau|piment|panais|topinambour|blette|cresson|pamplemousse|clementine|mandarine|peche|abricot|prune|cerise|melon|pasteque|figue|grenade|citronnelle|legume|fruit|herbe"],
    ['vp', "boeuf|veau|porc|poulet|dinde|canard|agneau|lardon|jambon|saucisse|chorizo|steak|viande|hache|escalope|saumon|cabillaud|crevette|moule|poisson|merlu|colin|lieu|truite|bacon|magret|cuisse|rumsteck|bavette|cote|roti|blanc de|filet mignon|pintade|lapin|calamar|encornet|noix de saint|saint-jacques|dorade|bar |maquereau|haddock|surimi|merguez|chipolata|pancetta|coppa|speck|rillette|pate de campagne"],
    ['cf', "lait|beurre|creme|oeuf|fromage|yaourt|yogourt|mozzarella|parmesan|gruyere|emmental|comte|feta|chevre|ricotta|mascarpone|reblochon|raclette|faisselle|skyr|burrata|roquefort|bleu|camembert|brie|cheddar|pecorino|halloumi|saint-moret|petit suisse"],
    ['bo', 'pain|baguette|brioche|tortilla|wrap|pita|focaccia|croissant|burger bun|bun'],
    ['ep', "pate|spaghetti|tagliatelle|penne|fusilli|lasagne|linguine|macaroni|coquillette|riz|semoule|quinoa|boulgour|lentille|farine|sucre|levure|maizena|fecule|cacao|miel|confiture|huile|vinaigre|amande|noisette|noix|pignon|raisins secs|chapelure|biscuit|flocons|sirop|nouille|vermicelle|tahini|cacahuete|pistache|graine|sesame|polenta|couscous|lentilles|chips|galette de riz|feuille de brick|cereale|compote|cafe|the |tisane|agar|gelatine|bicarbonate|sauce"],
    ['bs', 'vin|biere|jus|cidre|eau gazeuse|rhum|cognac|porto|whisky|vodka|calvados|limonade|soda|champagne|prosecco|martini|liqueur'],
  ].map(([id, kws]) => [id, new RegExp("(^|[^a-z])(" + kws + ")")]);
  function categorize(name) {
    const n = fold(name);
    for (const [id, re] of RULES) if (re.test(n)) return id;
    return 'au';
  }

  // ---------- Unités ----------
  const UNIT_ALIASES = {
    'g': ['grammes', 'gramme', 'grs', 'gr', 'g'],
    'kg': ['kilogrammes', 'kilogramme', 'kilos', 'kilo', 'kg'],
    'mg': ['mg'],
    'ml': ['millilitres', 'millilitre', 'ml'],
    'cl': ['centilitres', 'centilitre', 'cl'],
    'dl': ['decilitres', 'decilitre', 'dl'],
    'l': ['litres', 'litre', 'l'],
    'c. à s.': ['cuilleres a soupe', 'cuillere a soupe', 'cuillers a soupe', 'cuiller a soupe', 'cuilleree a soupe', 'cuillerees a soupe', 'cuil. a soupe', 'cuil a soupe', 'c. a soupe', 'c.a.s.', 'c.a.s', 'c. a s.', 'c. a s', 'c a s', 'cas', 'cs', 'c.s.', 'tbsp', 'cuilleres', 'cuillere', 'cuil.'],
    'c. à c.': ['cuilleres a cafe', 'cuillere a cafe', 'cuillers a cafe', 'cuiller a cafe', 'cuilleree a cafe', 'cuillerees a cafe', 'cuil. a cafe', 'cuil a cafe', 'c. a cafe', 'c.a.c.', 'c.a.c', 'c. a c.', 'c. a c', 'c a c', 'cac', 'cc', 'c.c.', 'tsp'],
    'pincée': ['pincees', 'pincee'],
    'gousse': ['gousses', 'gousse'],
    'tranche': ['tranches', 'tranche'],
    'botte': ['bottes', 'botte'],
    'bouquet': ['bouquets', 'bouquet'],
    'brin': ['brins', 'brin'],
    'branche': ['branches', 'branche'],
    'feuille': ['feuilles', 'feuille'],
    'sachet': ['sachets', 'sachet'],
    'boîte': ['boites', 'boite'],
    'pot': ['pots', 'pot'],
    'verre': ['verres', 'verre'],
    'tasse': ['tasses', 'tasse'],
    'poignée': ['poignees', 'poignee'],
    'filet': ['filets', 'filet'],
    'cube': ['cubes', 'cube'],
    'paquet': ['paquets', 'paquet'],
    'morceau': ['morceaux', 'morceau'],
    'noix': ['noix'],
    'tablette': ['tablettes', 'tablette'],
    'rouleau': ['rouleaux', 'rouleau'],
    'brique': ['briques', 'brique'],
    'bouteille': ['bouteilles', 'bouteille'],
    'barquette': ['barquettes', 'barquette'],
    'zeste': ['zestes', 'zeste'],
    'boule': ['boules', 'boule'],
    'tête': ['tetes', 'tete'],
  };
  const UNITS = [''].concat(Object.keys(UNIT_ALIASES));
  const ALIAS_LIST = [];
  for (const [u, al] of Object.entries(UNIT_ALIASES)) for (const a of al) ALIAS_LIST.push([a, u]);
  ALIAS_LIST.sort((a, b) => b[0].length - a[0].length);
  const SYMBOL_UNITS = new Set(['g', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'c. à s.', 'c. à c.']);
  const PLURAL = { 'morceau': 'morceaux', 'rouleau': 'rouleaux', 'noix': 'noix' };
  function unitLabel(unit, qty) {
    if (!unit || SYMBOL_UNITS.has(unit)) return unit || '';
    if (qty != null && qty > 1) return PLURAL[unit] || unit + 's';
    return unit;
  }
  // famille + valeur de base
  function toBase(qty, unit) {
    switch (unit) {
      case 'g': return { fam: 'mass', v: qty };
      case 'kg': return { fam: 'mass', v: qty * 1000 };
      case 'mg': return { fam: 'mass', v: qty / 1000 };
      case 'ml': return { fam: 'vol', v: qty };
      case 'cl': return { fam: 'vol', v: qty * 10 };
      case 'dl': return { fam: 'vol', v: qty * 100 };
      case 'l': return { fam: 'vol', v: qty * 1000 };
      default: return { fam: 'u:' + (unit || ''), v: qty };
    }
  }

  // ---------- Nombres ----------
  const FRAC = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
  const WORDNUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, demi: .5, demie: .5, quinze: 15, vingt: 20 };
  function num(s) { return parseFloat(String(s).replace(',', '.')); }
  function parseNumber(str) { // nombre saisi par l'utilisateur
    if (str == null) return null;
    const s = String(str).trim();
    if (!s) return null;
    const r = parseQty(s);
    return r.qty;
  }
  // lit une quantité au début de s → {qty, rest}
  function parseQty(s) {
    let m;
    s = s.replace(/^\s+/, '');
    if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/))) return { qty: +m[1] + m[2] / m[3], rest: s.slice(m[0].length) };
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)/))) return { qty: m[1] / m[2], rest: s.slice(m[0].length) };
    if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔⅛])?/))) {
      let q = num(m[1]) + (m[2] ? FRAC[m[2]] : 0);
      let rest = s.slice(m[0].length);
      const r = rest.match(/^\s*(?:-|–|à|a|ou)\s*(\d+(?:[.,]\d+)?)(?=\s|[a-zA-Z]|$)/);
      if (r && num(r[1]) > q) { q = num(r[1]); rest = rest.slice(r[0].length); }
      rest = rest.replace(/^\s*x\s+/i, ' ');
      return { qty: q, rest };
    }
    if ((m = s.match(/^([½¼¾⅓⅔⅛])/))) return { qty: FRAC[m[1]], rest: s.slice(1) };
    const f = foldSameLength(s);
    if ((m = f.match(/^(un peu|quelques|du|de la|des|un soupcon|un trait)\b\s*(d'|de )?/))) return { qty: null, rest: s.slice(m[0].length) };
    if ((m = f.match(/^(une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|demie|demi)(?=[\s-])/))) {
      let rest = s.slice(m[0].length).replace(/^[\s-]+/, '');
      return { qty: WORDNUM[m[1]], rest };
    }
    return { qty: null, rest: s };
  }
  function parseUnit(s) {
    const t = s.replace(/^\s+/, '');
    const f = foldSameLength(t);
    for (const [a, u] of ALIAS_LIST) {
      if (f.startsWith(a)) {
        const next = f.charAt(a.length);
        if (next && /[a-z0-9]/.test(next)) continue;
        let rest = t.slice(a.length);
        if (u === 'noix' && !/^\s*(de |d')/i.test(foldSameLength(rest))) continue;
        return { unit: u, rest };
      }
    }
    return { unit: '', rest: t };
  }

  // ---------- Formatage ----------
  const FRAC_OUT = [[.25, '¼'], [.5, '½'], [.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
  function fmtNum(n, frac) {
    if (n == null || isNaN(n)) return '';
    const i = Math.floor(n + 1e-9), d = n - i;
    if (d < 0.02) return String(i);
    if (frac) for (const [v, c] of FRAC_OUT) if (Math.abs(d - v) < 0.04) return (i ? i + ' ' : '') + c;
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  }
  function roundTo(n, step, up) { return (up ? Math.ceil(n / step - 1e-9) : Math.round(n / step)) * step; }
  function niceBase(v, up) {
    if (v < 10) return up ? Math.ceil(v) : Math.round(v * 2) / 2 || v;
    if (v < 50) return roundTo(v, 5, up);
    if (v < 500) return roundTo(v, 10, up);
    return roundTo(v, 50, up);
  }
  // affiche une quantité (mode 'recipe' ou 'shop')
  function fmtAmount(qty, unit, mode) {
    if (qty == null || isNaN(qty) || qty <= 0) return '';
    const up = mode === 'shop';
    const b = toBase(qty, unit);
    if (b.fam === 'mass') {
      const v = niceBase(b.v, up);
      return v >= 1000 ? fmtNum(v / 1000) + ' kg' : fmtNum(v) + ' g';
    }
    if (b.fam === 'vol') {
      const v = niceBase(b.v, up);
      if (v >= 1000) return fmtNum(v / 1000) + ' l';
      if (v >= 50 && v % 10 === 0) return fmtNum(v / 10) + ' cl';
      return fmtNum(v) + ' ml';
    }
    let q;
    if (unit === 'c. à s.' || unit === 'c. à c.' || unit === 'pincée') q = up ? roundTo(qty, .5, true) : roundTo(qty, .25);
    else if (up) q = Math.ceil(qty - 0.05);
    else q = qty < 1 ? roundTo(qty, .25) || .25 : roundTo(qty, .5);
    return (fmtNum(q, true) + ' ' + unitLabel(unit, q)).trim();
  }

  // ---------- Lecture d'une ligne d'ingrédient ----------
  function cleanName(s) {
    return s.replace(/^\s*(de |d'|d’|des |du )/i, '').replace(/\(s\)/g, '').replace(/\s+/g, ' ').trim()
      .replace(/^[,;:.\-–]+|[,;:.]+$/g, '').trim();
  }
  function parseIngredientLine(line) {
    let s = String(line).replace(/^\s*([-•*–·▪◦✓✔]|\d+[.)]\s)\s*/, '').trim();
    if (!s) return [];
    // format IA : "qté unité | nom | rayon"
    if (s.includes('|')) {
      const [a, b, c] = s.split('|').map(x => x.trim());
      const q = parseQty(a); const u = parseUnit(q.rest);
      let name = cleanName(b || u.rest);
      const cat = c ? catFromName(c) : null;
      return name ? [mk(q.qty, q.qty != null ? u.unit : u.unit, name, '', cat)] : [];
    }
    // "Farine : 200 g"
    let m = s.match(/^([^:\d]{2,40})\s*:\s*(.+)$/);
    if (m && /^\s*[\d½¼¾]/.test(m[2])) {
      const q = parseQty(m[2]); const u = parseUnit(q.rest);
      return [mk(q.qty, u.unit, cleanName(m[1]), cleanName(u.rest))];
    }
    const q = parseQty(s);
    let unit = '', rest = q.rest;
    if (q.qty != null) { const u = parseUnit(rest); unit = u.unit; rest = u.rest; }
    else if (q.rest !== s) { const u = parseUnit(rest); if (u.unit) rest = u.rest; }
    else {
      // "une pincée de sel" déjà gérée ; "sel, poivre" → plusieurs
      const parts = rest.split(/\s*(?:,|\bet\b)\s*/).filter(Boolean);
      if (parts.length > 1 && parts.every(p => p.split(/\s+/).length <= 3 && !/\d/.test(p))) return parts.map(p => mk(null, '', cleanName(p), ''));
    }
    let note = '';
    const pm = rest.match(/\(([^)]*)\)/); if (pm) { note = pm[1]; rest = rest.replace(pm[0], ' '); }
    const ci = rest.indexOf(',');
    if (ci > 2) { note = (note ? note + ', ' : '') + rest.slice(ci + 1).trim(); rest = rest.slice(0, ci); }
    const name = cleanName(rest);
    if (!name) return [];
    return [mk(q.qty, unit, name, note)];
  }
  function mk(qty, unit, name, note, cat) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return { qty: qty, unit: unit || '', name, note: note || '', cat: cat || categorize(name) };
  }
  function catFromName(c) {
    const f = fold(c);
    const w = s => fold(s).split(/[^a-z]+/).filter(Boolean)[0] || '';
    for (const k of CATEGORIES) if (fold(k.name) === f) return k.id;
    for (const k of CATEGORIES) if (w(k.name) === w(c)) return k.id;
    return null;
  }

  // ---------- Lecture d'une recette complète ----------
  const H_ING = /^(ingr[ée]dients?|il vous faut|liste des ingr[ée]dients|pour la (p[âa]te|sauce|garniture|farce|cr[èe]me)[^a-z]*)\s*:?\s*$/i;
  const H_STEP = /^((la )?pr[ée]paration|[ée]tapes?|instructions?|m[ée]thode|d[ée]roul[ée]|recette|r[ée]alisation|progression)\s*:?\s*$/i;
  function parseTime(str) {
    const f = fold(str); let t = 0;
    const re = /(\d+)\s*(h|heures?)\s*(\d+)?|(\d+)\s*(min|mn|minutes?)/g; let m;
    while ((m = re.exec(f))) { if (m[1]) t += +m[1] * 60 + (m[3] ? +m[3] : 0); else t += +m[4]; }
    return t || null;
  }
  function parseRecipe(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    const r = { title: '', servings: null, time: null, tags: [], ingredients: [], steps: [], notes: '' };
    let mode = null; let prep = 0, cook = 0, total = null;
    const loose = [];
    for (let raw of lines) {
      if (/^\s*`{3}/.test(raw)) continue;
      let line = raw.trim().replace(/^[#*>]+\s*/, '').replace(/\*\*/g, '');
      const f = fold(line);
      let m;
      if ((m = f.match(/^titre\s*:\s*(.*)$/))) { r.title = line.slice(line.indexOf(':') + 1).trim(); continue; }
      if ((m = f.match(/^(personnes|portions|parts|pour)\s*:\s*(\d+)/))) { r.servings = +m[2]; continue; }
      if ((m = f.match(/^temps(?: total)?\s*:\s*(.*)$/))) { total = /^\d+$/.test(m[1].trim()) ? +m[1] : parseTime(m[1]); continue; }
      if ((m = f.match(/^tags?\s*:\s*(.*)$/))) { r.tags = line.slice(line.indexOf(':') + 1).split(/[,;]/).map(t => t.trim()).filter(Boolean); continue; }
      if ((m = f.match(/^notes?\s*:\s*(.*)$/))) { r.notes = line.slice(line.indexOf(':') + 1).trim(); mode = 'notes'; continue; }
      if ((m = f.match(/^(temps de )?preparation\s*:\s*(.+)$/))) { prep = parseTime(m[2]) || 0; continue; }
      if ((m = f.match(/^(temps de )?cuisson\s*:\s*(.+)$/))) { cook = parseTime(m[2]) || 0; continue; }
      if ((m = f.match(/^(temps de )?repos\s*:\s*(.+)$/))) { continue; }
      if ((m = f.match(/^temps total\s*:?\s*(.+)$/))) { total = parseTime(m[1]); continue; }
      const sv = f.match(/^(?:pour\s+)?(\d+)\s*(personnes?|pers\.?|parts?|portions?|couverts?)\b/) || f.match(/\bpour\s+(\d+)\s*(personnes?|pers\.?|parts?|portions?)/);
      if (sv && line.length < 40) { r.servings = +sv[1]; if (!/ingr/.test(f)) continue; }
      if (H_ING.test(line) || /^ingr[ée]dients/i.test(line) && line.length < 45) { mode = 'ing'; continue; }
      if (H_STEP.test(line)) { mode = 'step'; continue; }
      if (/^[ée]tape\s*\d+\s*:?\s*$/i.test(line)) { mode = 'step'; continue; }
      if (!r.title && !mode && line.length < 80 && !/^\s*[-•*\d½]/.test(line)) { r.title = line.replace(/[:.]$/, ''); continue; }
      if (mode === 'ing') {
        if (line.length > 90 && /[.!]$/.test(line)) { mode = 'step'; } else { r.ingredients.push(...parseIngredientLine(line)); continue; }
      }
      if (mode === 'step') { const s = line.replace(/^\s*(\d+\s*[.)\-:]|[ée]tape\s*\d+\s*[:.\-]?|[-•*–])\s*/i, '').trim(); if (s) r.steps.push(s); continue; }
      if (mode === 'notes') { r.notes += (r.notes ? '\n' : '') + line; continue; }
      loose.push(line);
    }
    // texte sans titres de section : on devine
    for (const line of loose) {
      const looksIng = line.length < 70 && (/^\s*([-•*]\s*)?(\d|½|¼|¾|une?\s|deux|trois|quatre|cinq|six)/i.test(line)) && !/[.!]\s*$/.test(line);
      if (looksIng) r.ingredients.push(...parseIngredientLine(line));
      else r.steps.push(line.replace(/^\s*(\d+\s*[.)\-:]|[-•*–])\s*/, ''));
    }
    r.time = total || (prep + cook) || null;
    return r;
  }

  // ---------- Emoji ----------
  const EMOJI_RULES = [
    ['🍲', 'soupe|veloute|potage|bouillon|blanquette|pot-au-feu|pot au feu|bourguignon|daube|ragout|mijote|chili|minestrone'],
    ['🥗', 'salade|taboule|bowl|poke'], ['🍝', 'pate|spaghetti|lasagne|tagliatelle|penne|carbonara|bolognaise|risotto'],
    ['🍕', 'pizza'], ['🍛', 'curry|dahl|dal|tajine|couscous|colombo|massala'], ['🍜', 'nouille|ramen|pho|wok|pad thai'],
    ['🍣', 'sushi|maki'], ['🌮', 'taco|fajita|burrito|quesadilla'], ['🍔', 'burger'], ['🥧', 'tarte|quiche|tourte'],
    ['🍳', 'omelette|oeuf|frittata|shakshuka'], ['🥞', 'crepe|pancake|galette'], ['🧀', 'gratin|raclette|fondue|tartiflette|croque'],
    ['🐟', 'poisson|saumon|cabillaud|thon|truite|dorade|merlu'], ['🦐', 'crevette|moule|fruits de mer|saint-jacques'],
    ['🍗', 'poulet|dinde|canard|volaille'], ['🥩', 'boeuf|steak|veau|agneau|porc|roti|cote'], ['🍰', 'gateau|cake|cheesecake|fondant|brownie|muffin|cookie'],
    ['🍫', 'chocolat|mousse'], ['🍮', 'flan|creme brulee|panna cotta|dessert|riz au lait'], ['🍎', 'pomme|compote|crumble'],
    ['🥕', 'legume|carotte|ratatouille|poelee'], ['🍚', 'riz'], ['🥪', 'sandwich|wrap'], ['🥙', 'falafel|kebab|pita'],
  ].map(([e, kws]) => [e, new RegExp('(^|[^a-z])(' + kws + ')')]);
  function guessEmoji(title) { const f = fold(title); for (const [e, re] of EMOJI_RULES) if (re.test(f)) return e; return '🍽️'; }

  // ---------- Liste de courses ----------
  // entries : [{recipe, people}] ; pantry : [noms] → {groups:[{cat, items}], pantryItems}
  function inPantry(key, pantryKeys) { return pantryKeys.some(p => key === p || key.startsWith(p + ' ')); }
  function buildShoppingList(entries, pantry) {
    const pk = (pantry || []).map(ingKey).filter(Boolean);
    const map = new Map();
    for (const { recipe, people } of entries) {
      if (!recipe) continue;
      for (const ing of recipe.ingredients || []) {
        const key = ingKey(ing.name); if (!key || key === 'eau') continue;
        let it = map.get(key);
        if (!it) { it = { key, name: ing.name, cat: ing.cat || categorize(ing.name), parts: new Map(), recipes: new Set() }; map.set(key, it); }
        it.recipes.add(recipe.title);
        if (ing.qty != null && !isNaN(ing.qty)) {
          const b = toBase(ing.qty * people, ing.unit);
          it.parts.set(b.fam, (it.parts.get(b.fam) || 0) + b.v);
        }
      }
    }
    const items = [], pantryItems = [];
    for (const it of map.values()) {
      const amounts = [];
      for (const [fam, v] of it.parts) {
        const unit = fam === 'mass' ? 'g' : fam === 'vol' ? 'ml' : fam.slice(2);
        amounts.push(fmtAmount(v, unit, 'shop'));
      }
      const out = { key: it.key, name: it.name, cat: it.cat, amount: amounts.filter(Boolean).join(' + '), recipes: [...it.recipes] };
      (inPantry(it.key, pk) ? pantryItems : items).push(out);
    }
    const groups = CATEGORIES.map(c => ({ cat: c, items: items.filter(i => (CATEGORIES.some(k => k.id === i.cat) ? i.cat : 'au') === c.id).sort((a, b) => a.name.localeCompare(b.name, 'fr')) })).filter(g => g.items.length);
    return { groups, pantryItems: pantryItems.sort((a, b) => a.name.localeCompare(b.name, 'fr')) };
  }

  // ---------- Recette → texte (lisible ET réimportable) ----------
  function recipeToText(r, people) {
    const n = people || r.servings || 1;
    const L = [];
    L.push('TITRE: ' + r.title);
    L.push('PERSONNES: ' + n);
    if (r.time) L.push('TEMPS: ' + r.time);
    if (r.tags && r.tags.length) L.push('TAGS: ' + r.tags.join(', '));
    L.push('', 'INGREDIENTS:');
    for (const i of r.ingredients) {
      const a = i.qty != null ? fmtAmount(i.qty * n, i.unit, 'recipe') : '';
      L.push('- ' + (a ? a + ' ' : '') + i.name + (i.note ? ' (' + i.note + ')' : ''));
    }
    L.push('', 'ETAPES:');
    r.steps.forEach((s, k) => L.push((k + 1) + '. ' + s));
    if (r.notes) L.push('', 'NOTES: ' + r.notes);
    return L.join('\n');
  }

  const api = { fold, ingKey, categorize, CATEGORIES, UNITS, unitLabel, toBase, parseQty, parseUnit, parseNumber, fmtNum, fmtAmount, parseIngredientLine, parseRecipe, parseTime, guessEmoji, buildShoppingList, recipeToText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PM = api;
})(typeof window !== 'undefined' ? window : globalThis);
