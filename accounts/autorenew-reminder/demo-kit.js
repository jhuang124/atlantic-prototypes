/* ==========================================================================
   demo-kit.js 2.1.0
   Presenter layer, store, hash router and device frame for Atlantic prototypes. Vanilla ES2020,
   no dependencies; exposes window.DemoKit. Load order: checks.js, chrome.js, facts.js, fixtures.js,
   demo-kit.js, parts.js. The API, the parts and the primitives: COMPONENTS.md. History: CHANGELOG.md.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. Utilities: escaping, dates, hash parsing
     ------------------------------------------------------------------------ */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DAY = 86400000;

  function parseDay(s) {
    if (s instanceof Date) return new Date(s.getTime());
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const iso = (d) => parseDay(d).toISOString().slice(0, 10);
  function fmt(d, style) {
    const opts = style === 'short'
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return parseDay(d).toLocaleDateString('en-US', opts);
  }

  /* The fixture bank (fixtures.js): six made-up people every prototype shares. persona(id, anchor)
     resolves the fixture's day offsets against the anchor, the card's expiry in months, and the plan
     against the day's facts. Nothing in a fixture is a price; facts.js is. */
  const FIXTURES = () => window.ATL_FIXTURES || { personas: {}, clock: [] };
  function persona(id, anchor, facts) {
    const all = FIXTURES().personas;
    if (!all[id]) throw new Error(`DemoKit.persona: no persona "${id}" (one of: ${Object.keys(all).join(', ') || 'none; is fixtures.js loaded?'})`);
    const a = parseDay(anchor || new Date().toISOString());
    const day = (n) => iso(new Date(a.getTime() + n * DAY));
    const out = JSON.parse(JSON.stringify(all[id]));
    out.id = id;
    if (out.user) out.user.name = out.user.first_name + ' ' + out.user.last_name;
    if (out.subscription) {
      const sub = out.subscription;
      const plan = ((facts || window.ATL_FACTS || {}).plans || []).find((x) => String(x.planId || '').startsWith('plan_' + sub.plan + '_')) || {};
      Object.assign(sub, { start: day(sub.started), end: day(sub.ends), planName: plan.name || sub.plan, price: plan.price || '', period: plan.period || '' });
    }
    if (out.payment) {
      const m = new Date(a.getTime());
      m.setUTCDate(1);
      m.setUTCMonth(m.getUTCMonth() + out.payment.expires);
      const mm = String(m.getUTCMonth() + 1).padStart(2, '0');
      Object.assign(out.payment, { expMonth: m.getUTCMonth() + 1, expYear: m.getUTCFullYear(), exp: mm + '/' + String(m.getUTCFullYear()).slice(2) });
    }
    return out;
  }

  function parseHash() {
    let h = decodeURI(location.hash.replace(/^#/, ''));
    if (!h.startsWith('/')) h = '/' + h;
    const i = h.indexOf('?');
    const path = (i < 0 ? h : h.slice(0, i)) || '/';
    return { path, params: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
  }

  /* Route patterns: '/members/:id' → regex + key list. Values are decoded per segment. */
  function compileRoute(path) {
    const keys = [];
    const re = new RegExp('^' + path.split('/').map((seg) => {
      if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/') + '/?$');
    return { keys, re };
  }
  const isPattern = (path) => path.includes('/:');
  const safeDecode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const RESERVED_PARAM_KEYS = ['get', 'set', 'has', 'delete', 'append', 'entries', 'keys', 'values', 'forEach', 'toString', 'sort', 'size', 'getAll'];

  const FAMILIES = { serif: 'AGaramondPro', sans: 'Graphik', mono: 'Goldwyn' };

  const AREAS = [
    ['public', 'Before sign-in'],
    ['app', 'Signed-in account'],
    ['reference', 'Reference'],
  ];

  /* The tokens /design-system shows. Values are read from colors_and_type.css at run time. */
  const TOKENS = [
    ['page', 'Page background, footer'], ['surface', 'Fields, cards, header'], ['hairline', 'Dividers, card outlines'],
    ['ink', 'Headings'], ['ink-soft', 'Body copy, labels'], ['stone', 'Secondary text'], ['field-border', 'Field outline'],
    ['primary', 'Primary button (filled graphite)'], ['primary-hover', 'Primary button hover'],
    ['link', 'Links, focus ring, outlined secondary button'], ['secondary-bg', 'Secondary button fill'],
    ['alert', 'Error text, destructive actions, the brand mark'], ['danger-bg', 'Destructive button fill'],
    ['error', 'Field error outline'], ['success', 'Confirmation'], ['disabled', 'Disabled text'], ['disabled-bg', 'Disabled fill'],
  ];

  /* ------------------------------------------------------------------------
     2. init: registries and the store
     ------------------------------------------------------------------------ */
  function init(config) {
    const cfg = Object.assign({ scenarios: [], axes: [], personas: [], pages: [], paths: [], nav: [], saves: [], actions: {} }, config);
    if (!cfg.key) throw new Error('DemoKit.init: config.key is required (e.g. "proto-slug-v1")');
    if (!cfg.scenarios.length) throw new Error('DemoKit.init: at least one scenario is required');

    const KEY = cfg.key;
    const PATH_KEY = KEY + '-path';
    const ANCHOR_MS = parseDay(cfg.today || new Date().toISOString()).getTime();
    const anchorDate = () => new Date(ANCHOR_MS);          // frozen: fixtures build from this
    let todayMs = ANCHOR_MS;                               // the clock: moved by an axis option's `today`
    const todayDate = () => new Date(todayMs);             // a fresh copy every time
    const project = Object.assign({ name: 'Prototype', description: '' }, cfg.project);
    const company = cfg.company || project.company || 'the team';
    const mode = cfg.mode === 'sketch' ? 'sketch' : 'build';
    const sketch = mode === 'sketch';

    // Token overrides: { link: 'var(--color-secondary)' } sets --link on :root
    if (cfg.tokens && typeof cfg.tokens === 'object') {
      for (const [k, v] of Object.entries(cfg.tokens)) document.documentElement.style.setProperty('--' + k, v);
    }

    // Registries
    const scenarios = cfg.scenarios;
    const axes = cfg.axes;
    const personas = cfg.personas;
    const paths = cfg.paths;
    const pages = cfg.pages.slice();
    if (cfg.designSystem !== false && !pages.some((p) => p.path === '/design-system')) {
      pages.push({
        path: '/design-system', title: 'Design system', area: 'reference', layout: 'full', hidden: true,
        purpose: 'Tokens and components the prototype is built from.',
        render: renderDesignSystem,
      });
    }
    // Any link to something the prototype doesn't build lands here, in the chrome it came from.
    pages.push({
      path: '/not-built', title: 'Not built', area: 'reference', layout: 'full', hidden: true, notBuilt: true,
      render: (el, ctx) => {
        const what = ctx.params.get('what') || 'This page';
        const prod = ctx.params.get('prod');
        return `<div class="demo-notbuilt" role="note"><p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
          <h1>Not built in this prototype</h1><p>${esc(what)}</p>
          ${prod ? `<p class="demo-soft">On the live site this opens ${esc(prod)}</p>` : ''}
          <button type="button" class="demo-btn" data-dk-back>Go back</button></div>`;
      },
    });
    const CHROME = window.DemoKitChrome || null;
    const facts = cfg.facts || window.ATL_FACTS || null;
    const pageByPath = new Map(pages.filter((p) => !isPattern(p.path)).map((p) => [p.path, p]));
    const routes = pages.filter((p) => isPattern(p.path)).map((p) => Object.assign({ page: p }, compileRoute(p.path)));
    routes.forEach((r) => r.keys.filter((k) => RESERVED_PARAM_KEYS.includes(k)).forEach((k) =>
      console.warn(`DemoKit: route param ":${k}" in "${r.page.path}" shadows URLSearchParams.${k}; pick another name`)));
    const navItems = cfg.nav;
    const stubByPath = new Map(navItems.filter((n) => !pageByPath.has(n.path)).map((n) => [n.path, {
      path: n.path, title: n.label, area: n.area || 'app', roles: n.roles, stub: true, stubText: n.stub,
      render: () => `<div class="demo-notbuilt" role="note"><p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
        <h1>Not built in this prototype</h1><p>${esc(n.stub || n.label)}</p></div>`,
    }]));
    const NOT_FOUND = {
      path: '*', title: 'Page not found', area: 'reference', notFound: true,
      render: () => `<div class="demo-notbuilt" role="note"><p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
        <h1>No screen at this address</h1><p>This link doesn’t lead to any screen in the prototype.</p>
        <a class="demo-btn" href="#${esc(homePath())}">Go to ${esc(pageByPath.get(homePath())?.title || 'the start')}</a></div>`,
    };
    const concrete = (p) => !p.hidden && !isPattern(p.path);
    const firstOf = (area) => pages.find((p) => p.area === area && concrete(p));
    const homePath = () => (cfg.home || (firstOf('public') || pages.find(concrete) || pages[0]).path);

    const families = FAMILIES;

    // Saves registry: config list first, then labels passed to run()
    const saves = cfg.saves.slice();
    function registerSave(label) {
      if (label && !saves.includes(label)) { saves.push(label); if (drawerOpen) renderPanel(); }
    }

    /* --- Store: one object, versioned key, validated, try/catch --- */
    const META = ['scenario', 'session', 'persona', 'axes', 'clock'];
    // The clock dial ("Today is" in This screen): an option rebuilds the scenario with its dates moved, so its
    // subscription.end lands that many days after today. "Ends in 30 days" and "ends in 3 days" are one fixture
    // at two settings, and today stays the build's day, as in the React starter (whose app reads the real clock).
    const dial = cfg.clockDial === false ? [] : (Array.isArray(cfg.clockDial) ? cfg.clockDial : (FIXTURES().clock || []));
    const scenarioById = (id) => scenarios.find((s) => s.id === id);
    const personaById = (id) => personas.find((p) => p.id === id);
    const axisDefaults = () => Object.fromEntries(axes.map((a) => [a.key, a.default != null ? a.default : a.options[0].value]));

    function applyPersona(s, id) {
      const p = personaById(id);
      if (!p) return s;
      const patch = typeof p.apply === 'function' ? p.apply(s) || {} : {};
      return Object.assign({}, s, patch, { persona: p.id });
    }
    function clockOf(s) {
      // The last axis whose selected option carries `today` wins; cfg.clock(state, date) may override.
      let d = null;
      for (const ax of axes) {
        const o = ax.options.find((x) => x.value === ((s && s.axes) || {})[ax.key]);
        if (o && o.today) d = parseDay(o.today);
      }
      if (typeof cfg.clock === 'function') { const c = cfg.clock(s, d || anchorDate()); if (c) d = parseDay(c); }
      return d || anchorDate();
    }
    function dialShift(entities, clockId) {
      const opt = dial.find((o) => o.id === clockId);
      const end = entities && entities.subscription && entities.subscription.end;
      if (!opt || opt.before == null || !end) return 0;
      return Math.round((parseDay(end).getTime() - ANCHOR_MS) / DAY) - opt.before;
    }
    function buildScenario(id, keep) {
      const sc = scenarioById(id) || scenarios[0];
      const clock = keep && dial.some((o) => o.id === keep.clock) ? keep.clock : null;
      let entities = sc.build(anchorDate()) || {};
      const shift = dialShift(entities, clock);
      if (shift) entities = sc.build(new Date(ANCHOR_MS - shift * DAY)) || {};
      META.forEach((k) => delete entities[k]);
      const s = Object.assign({}, entities, {
        scenario: sc.id,
        session: keep ? keep.session : (cfg.startSession || 'out'),
        persona: keep ? keep.persona : (personas[0] ? personas[0].id : null),
        axes: keep ? Object.assign({}, keep.axes) : axisDefaults(),
        clock,
      });
      return s.persona ? applyPersona(s, s.persona) : s;
    }
    function validate(s) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
      if (!scenarioById(s.scenario)) return null;
      if (s.session !== 'in' && s.session !== 'out') return null;
      const a = Object.assign({}, s.axes);
      for (const ax of axes) if (!ax.options.some((o) => o.value === a[ax.key])) a[ax.key] = axisDefaults()[ax.key];
      const persona = personas.length ? (personaById(s.persona) ? s.persona : personas[0].id) : null;
      const clock = dial.some((o) => o.id === s.clock) ? s.clock : null;
      const out = Object.assign({}, s, { axes: a, persona, clock });
      if (typeof cfg.validate === 'function' && !cfg.validate(out)) return null;
      return out;
    }
    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        const s = raw ? validate(JSON.parse(raw)) : null;
        if (s) return s;
      } catch (e) { /* corrupt or blocked storage: fall through to the fixture */ }
      return buildScenario(cfg.defaultScenario || scenarios[0].id);
    }
    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode: memory only */ }
    }
    function computeDerived() {
      const d = typeof cfg.derive === 'function' ? cfg.derive(state, todayDate()) || {} : {};
      if (typeof cfg.role === 'function' && d.role == null) d.role = cfg.role(state, d);
      return d;
    }

    let state = load();
    todayMs = clockOf(state).getTime();
    let derived = computeDerived();
    let armed = false;           // one-shot error arm: memory only, a refresh disarms it
    let busy = false;            // double-submit lock
    let lastTrigger = null;      // the button that started the current save
    let activePath = null;
    try { activePath = localStorage.getItem(PATH_KEY); } catch (e) { /* ignore */ }

    function adopt(next) {
      state = next;
      todayMs = clockOf(state).getTime();
      derived = computeDerived();
    }
    function commit(next) {
      adopt(next);
      save();
    }

    /* ------------------------------------------------------------------------
       3. Writes: set, act, run (the error arm)
       ------------------------------------------------------------------------ */
    function set(fn) {
      const next = typeof fn === 'function' ? fn(state) : Object.assign({}, state, fn);
      if (!next || next === state) return state;
      commit(next);
      render();
      return state;
    }
    const builtins = { restore: (s, snapshot) => validate(snapshot) || s };
    function act(name, ...args) {
      const fn = cfg.actions[name] || builtins[name];
      if (!fn) throw new Error('DemoKit: unknown action "' + name + '"');
      return set((s) => fn(s, ...args));
    }

    async function run(action, failCopy, opts) {
      const o = typeof opts === 'string' ? { label: opts } : (opts || {});
      registerSave(o.label);
      if (busy) return false;
      busy = true;
      const trigger = o.trigger || lastTrigger;
      const scope = trigger && trigger.isConnected ? trigger.closest('form, dialog, [data-dk-scope]') : null;
      if (scope) scope.querySelectorAll('[data-dk-fail]').forEach((n) => n.remove());
      const locked = (scope ? [...scope.querySelectorAll('button, input, select, textarea')] : (trigger ? [trigger] : []))
        .filter((n) => !n.disabled);
      locked.forEach((n) => { n.disabled = true; });
      if (trigger) trigger.setAttribute('aria-busy', 'true');
      try {
        await sleep(o.delay != null ? o.delay : 700);
        if (armed) {
          armed = false;
          renderChrome();
          showFailure(scope, trigger, failCopy);
          return false;
        }
        await action();
        return true;
      } finally {
        busy = false;
        locked.forEach((n) => { if (n.isConnected) n.disabled = false; });
        if (trigger) trigger.removeAttribute('aria-busy');
      }
    }
    function showFailure(scope, trigger, copy) {
      const box = document.createElement('div');
      box.className = 'alert';
      box.setAttribute('role', 'alert');
      box.setAttribute('data-dk-fail', '');
      box.innerHTML = copy || 'That didn’t save, and nothing changed. Try again in a minute.';
      const slot = scope && scope.querySelector('[data-dk-error-slot]');
      const anchor = scope && scope.querySelector('.actions');
      if (slot) slot.append(box);
      else if (anchor) anchor.before(box);
      else if (scope) scope.prepend(box);
      else if (trigger && trigger.isConnected) (trigger.closest('.actions, li, p, div') || trigger).before(box);
      else toast(box.textContent);
    }

    /* ------------------------------------------------------------------------
       4. Scenarios, axes, personas, paths
       ------------------------------------------------------------------------ */
    function keepMeta() { return { session: state.session, persona: state.persona, axes: state.axes, clock: state.clock }; }
    function setClock(id) { commit(buildScenario(state.scenario, Object.assign(keepMeta(), { clock: id }))); render(); }
    function loadScenario(id) { commit(buildScenario(id, keepMeta())); render(); }
    function resetData() { loadScenario(state.scenario); }
    function setAxis(key, value) { set((s) => Object.assign({}, s, { axes: Object.assign({}, s.axes, { [key]: value }) })); }
    function setPersona(id) {
      const p = personaById(id);
      if (!p) return;
      commit(applyPersona(state, id));
      if (p.to) navigate(p.to, { session: p.session || 'in', push: true });
      else render();
    }
    function startPath(id) {
      const p = paths.find((x) => x.id === id);
      if (!p) return;
      const st = p.start || {};
      activePath = id;
      try { localStorage.setItem(PATH_KEY, id); } catch (e) { /* ignore */ }
      const meta = Object.assign(keepMeta(), st.clock !== undefined ? { clock: st.clock } : {});
      let s = st.scenario || st.clock !== undefined ? buildScenario(st.scenario || state.scenario, meta) : state;
      if (st.axes) s = Object.assign({}, s, { axes: Object.assign({}, s.axes, st.axes) });
      if (st.persona) s = applyPersona(s, st.persona);
      if (st.session) s = Object.assign({}, s, { session: st.session });
      // A tour opens on desktop unless its first page asks for the phone (preferences.md, desktop first)
      try { localStorage.setItem(DEVICE_KEY, /[?&]device=phone/.test(st.to || '') ? 'phone' : 'desktop'); } catch (e) { /* memory only */ }
      armed = false;
      commit(s);
      dismissIntro();
      closeDrawer(false);
      navigate(st.to || homePath(), { push: true });
    }

    /* ------------------------------------------------------------------------
       5. Router: navigate, params, setParam, guard
       ------------------------------------------------------------------------ */
    function navigate(hash, opts) {
      const o = opts || {};
      let h = String(hash || '/');
      if (!h.startsWith('#')) h = '#' + (h.startsWith('/') ? h : '/' + h);
      let changed = false;
      if (o.persona && o.persona !== state.persona) { state = applyPersona(state, o.persona); changed = true; }
      if (o.session && o.session !== state.session) { state = Object.assign({}, state, { session: o.session }); changed = true; }
      if (changed) commit(state);
      if (location.hash === h) { render(); return; }
      if (o.push === false) {
        try { history.replaceState(null, '', h); } catch (e) { location.replace(h); return; }
        render();
      } else {
        location.hash = h.slice(1);           // hashchange → render
      }
    }
    let routeParams = {};                 // from ':id' segments of the current page
    // One object for both kinds of param: URLSearchParams for the hash query, own
    // properties for route segments. kit.params().get('link') and kit.params().id.
    const params = () => Object.assign(parseHash().params, routeParams);
    function param(key, fallback) {
      if (routeParams[key] != null && routeParams[key] !== '') return routeParams[key];
      const v = parseHash().params.get(key);
      if (v != null && v !== '') return v;
      const pre = currentPage && (currentPage.preconditions || []).find((p) => p.key === key);
      if (pre) return pre.default != null ? pre.default : pre.options[0].value;
      return fallback == null ? null : fallback;
    }
    function setParam(key, value, opts) {
      const o = Object.assign({ push: false }, typeof key === 'object' ? value : opts);
      const entries = typeof key === 'object' ? Object.entries(key) : [[key, value]];
      const { path, params: p } = parseHash();
      for (const [k, v] of entries) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
      const q = p.toString();
      navigate('#' + path + (q ? '?' + q : ''), { push: o.push });
    }
    function match(path) {
      const exact = pageByPath.get(path) || stubByPath.get(path);
      if (exact) return { page: exact, route: {} };
      for (const r of routes) {
        const m = r.re.exec(path);
        if (m) { const route = {}; r.keys.forEach((k, i) => { route[k] = safeDecode(m[i + 1]); }); return { page: r.page, route }; }
      }
      return { page: NOT_FOUND, route: {} };
    }
    const resolve = (path) => match(path).page;
    const allowed = (page) => !page.roles || page.roles.includes(derived.role);
    function guard(page) {
      if (page.area !== 'app') return null;
      if (state.session !== 'in') return homePath();
      if (!allowed(page)) {
        const alt = pages.find((p) => p.area === 'app' && concrete(p) && allowed(p));
        return alt ? alt.path : homePath();
      }
      return null;
    }

    /* ------------------------------------------------------------------------
       6. Rendering: shell, <main>, side card
       ------------------------------------------------------------------------ */
    let root = null, lastShell = null, lastPath = null, currentPage = null, navOpen = false;

    /* The frame: production chrome (chrome.js) around the page body, at a device size.
       Desktop first; a narrow window scales the 1280 page down instead of reflowing it. */
    const DESK_W = 1280;
    // The device is presenter state, kept across navigation; ?device= in a link sets it.
    const DEVICE_KEY = KEY + '-device';
    function device() {
      const v = parseHash().params.get('device');
      if (v === 'phone' || v === 'desktop') { try { localStorage.setItem(DEVICE_KEY, v); } catch (e) { /* memory only */ } return v; }
      let kept = null;
      try { kept = localStorage.getItem(DEVICE_KEY); } catch (e) { /* none */ }
      if (kept === 'phone' || kept === 'desktop') return kept;
      if (cfg.device === 'phone') return 'phone';
      // A real phone (touch, narrow screen) opens on the phone layout; any desktop window, however narrow, on desktop.
      return matchMedia('(pointer: coarse) and (max-width: 480px)').matches ? 'phone' : 'desktop';
    }
    const part = (key) => (CHROME && CHROME.parts[key]) || '';
    let lastChrome = cfg.chrome || 'accounts';
    function chromeOf(page) {
      if (page.notBuilt || page.notFound || page.stub) return lastChrome;
      return page.chrome || cfg.chrome || 'accounts';
    }
    const HELP = '<a class="dk-help" href="#/not-built?what=Help%20(the%20help-desk%20chat)" aria-label="Help"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg></a>';
    function frameHtml(page, kind) {
      const top = [], bottom = [];
      if (kind === 'accounts') {
        top.push(part('accounts.header'));
        if (page.progress === 1) top.push(part('accounts.progress'));
        if (page.progress === 2) top.push(part('accounts.progress2'));
        if (page.progress === 3) top.push(part('accounts.progress3'));
        bottom.push(`<div class="dk-footer-wrap">${part('accounts.footer')}${HELP}</div>`);
      } else if (kind === 'psp') {
        top.push(part('psp.header'));
        bottom.push(`<div class="dk-footer-wrap">${part('psp.footer')}${HELP}</div>`);
      } else if (kind === 'www') {
        top.push(part('www.nav'));
        if (page.promo) top.push(`<div class="slot-promo" data-dk-promo></div>`);
        bottom.push(part('www.footer'));
      }
      return `<div class="dk-device" data-device="${device()}"><div class="dk-vp" data-chrome="${kind}">
        ${top.length ? `<div class="dk-chrome" data-dk-top>${top.join('')}</div>` : ''}
        <div class="dk-body" data-dk-slot></div>
        ${bottom.length ? `<div class="dk-chrome" data-dk-bottom>${bottom.join('')}</div>` : ''}
      </div></div>`;
    }
    // Chrome links: text the prototype maps (cfg.links) go to its page; the rest open "not built".
    // Accounts header slots follow the session unless the page sets them.
    function wireChrome(page, ctx) {
      const val = (v) => (typeof v === 'function' ? v(ctx) : v);
      const links = cfg.links || {};
      root.querySelectorAll('.dk-chrome a[data-prod-href]').forEach((a) => {
        const text = a.textContent.trim().replace(/\s+/g, ' ');
        if (links[text]) a.setAttribute('href', '#' + links[text]);
        else a.setAttribute('href', `#/not-built?what=${encodeURIComponent(text || 'This link')}&prod=${encodeURIComponent(a.dataset.prodHref)}`);
      });
      const h = page.header || {};
      const slot = (name, html) => { const el = root.querySelector(`.dk-chrome [data-slot="${name}"]`); if (el && html != null) el.innerHTML = html; };
      const right = val(h.right);
      if (right != null) slot('right', right);
      else {
        const a = root.querySelector('.dk-chrome [data-slot="right"] a');
        if (a) {
          a.textContent = state.session === 'in' ? 'Sign out' : 'Sign in';
          if (state.session === 'in') { a.setAttribute('href', '#' + homePath()); a.setAttribute('data-dk-signout', ''); }
          else if (cfg.signIn) a.setAttribute('href', '#' + cfg.signIn);
        }
      }
      slot('left', val(h.left));
      // Sign-in pages: production leaves the header slots empty and drops the footer's Sign In link.
      if (val(h.right) === '') root.querySelectorAll('.dk-chrome [data-dk-bottom] a, .dk-chrome a').forEach((a) => {
        if (a.closest('footer') && a.textContent.trim() === 'Sign In') a.remove();
      });
      const promo = root.querySelector('[data-dk-promo]');
      if (promo) promo.innerHTML = val(page.promo) || '';
    }
    // The pill rides above whatever is docked to the bottom of the page, so presenter chrome never covers
    // the thing being tested. A ResizeObserver keeps the lift right after fonts load or the dock changes.
    const DOCKS = '.slot-nudge, .onboard-bar, [data-dk-dock]';
    let dockWatch = null;
    // The pill sits 16px above the window's bottom edge and is 36 tall; when the dock overlaps that band (docked,
    // or stopped above the footer at the end of the page), the pill rises to 16px above the dock's top.
    function liftPill() {
      const dock = root && root.querySelector(DOCKS);
      const r = dock && dock.getBoundingClientRect();
      const band = window.innerHeight - 16 - 36;
      const lift = r && r.height && r.top < window.innerHeight - 16 && r.bottom > band ? Math.ceil(window.innerHeight - r.top) : 0;
      document.body.style.setProperty('--demo-pill-lift', lift + 'px');
    }
    function fitFrame() {
      const vp = root && root.querySelector('.dk-vp');
      if (!vp) return;
      const dock = root.querySelector(DOCKS);
      if (dockWatch) dockWatch.disconnect();
      // The dock moves when it resizes or when the page around it grows (an image loads), so watch both.
      if (dock && window.ResizeObserver) { dockWatch = new ResizeObserver(liftPill); dockWatch.observe(dock); dockWatch.observe(vp); }
      requestAnimationFrame(liftPill);
      const w = root.clientWidth;
      if (vp.closest('[data-device="phone"]') || !w || w >= DESK_W) { vp.style.width = ''; vp.style.zoom = ''; return; }
      vp.style.width = DESK_W + 'px';
      vp.style.zoom = (w / DESK_W).toFixed(4);
    }
    function accountNav(page) {
      const items = navItems.filter((n) => !n.roles || n.roles.includes(derived.role));
      const navPath = page.navPath || page.path;
      const current = items.find((n) => n.path === navPath);
      return `<nav class="dk-account-nav" aria-label="Account" data-open="${navOpen}">
        <button type="button" aria-expanded="${navOpen}">${esc(current ? current.label : 'Menu')} <span aria-hidden="true">⌄</span></button>
        <ul>${items.map((n) => `<li><a href="#${esc(n.path)}"${n.path === navPath ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul></nav>`;
    }
    const LAYOUTS = { utility: 'dk-utility', checkout: 'dk-checkout-main', confirm: 'dk-confirm', products: 'dk-products', article: 'dk-article', col: 'dk-col', full: 'dk-full' };

    function ctxFor(page) {
      return { state, derived, page, params: params(), today: todayDate(), kit };
    }

    function render() {
      if (!root) return;
      const route = parseHash();
      const hit = match(route.path);
      let page = hit.page;
      routeParams = hit.route;
      let shown = route.path;
      const redirect = guard(page);
      if (redirect && redirect !== route.path) {
        try { history.replaceState(null, '', '#' + redirect); } catch (e) { location.replace('#' + redirect); return; }
        page = resolve(redirect);
        routeParams = {};
        shown = redirect;
      }
      currentPage = page;
      const pathChanged = shown !== lastPath;     // concrete path, so /members/m-1 → /members/m-2 counts
      if (pathChanged) navOpen = false;
      document.title = page.title + ' · ' + project.name;
      const ctx = ctxFor(page);

      // Frame (rebuilt only when its markup changes): chrome, device, then the page body
      const kind = chromeOf(page);
      lastChrome = kind;
      const shellHtml = typeof cfg.shell === 'function' ? cfg.shell(ctx, frameHtml(page, kind)) : frameHtml(page, kind);
      const shellKey = shellHtml + '|' + state.session + '|' + JSON.stringify(page.header || {}) + '|' + (typeof page.promo === 'function' ? page.promo(ctx) : page.promo || '');
      if (shellKey !== lastShell) { root.innerHTML = shellHtml; lastShell = shellKey; wireChrome(page, ctx); }
      const slot = root.querySelector('[data-dk-slot]') || root;

      // Stage: a fresh <main> each time, so pages can attach listeners freely
      const stage = document.createElement('div');
      const main = document.createElement('main');
      main.id = 'main';
      const layout = page.layout || (page.area === 'app' && navItems.length ? 'account' : 'col');
      main.className = layout === 'account' ? 'dk-account-main' : LAYOUTS[layout] || 'dk-col';
      try {
        const out = page.render(main, ctx);
        if (typeof out === 'string') main.innerHTML = out;
      } catch (err) {
        console.error('DemoKit: page "' + page.path + '" failed to render', err);
        main.innerHTML = `<div class="demo-notbuilt" role="alert"><p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p><h1>${esc(page.title)} hit an error while rendering</h1><p>Details are in the console.</p></div>`;
      }
      if (layout === 'account') {
        stage.className = 'dk-account';
        stage.innerHTML = accountNav(page);
        stage.appendChild(main);
      } else if (layout === 'checkout') {
        stage.className = 'dk-checkout';
        stage.appendChild(main);
        const aside = typeof page.aside === 'function' ? page.aside(ctx) : page.aside;
        if (aside) { const a = document.createElement('aside'); a.className = 'dk-checkout-aside'; a.innerHTML = aside; stage.appendChild(a); }
      } else {
        stage.className = 'stage';
        stage.appendChild(main);
      }
      slot.replaceChildren(stage);
      fitFrame();

      if (pathChanged) {
        lastPath = shown;
        window.scrollTo(0, 0);
        const h1 = main.querySelector('h1');
        if (h1 && !drawerOpen) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
        root.querySelector('.dk-vp')?.scrollTo?.(0, 0);
      }
      renderChrome();
      scheduleChecks();
    }

    // Segmented control shared by panel and side card. An option's `tone` lands on data-tone.
    function seg(legend, options, current, attr) {
      const cols = options.length <= 3 ? options.length : 2;
      return `<fieldset class="demo-seg"><legend class="sr-only">${esc(legend)}</legend>
        <div class="demo-seg-track" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
        ${options.map((o) => `<button type="button" aria-pressed="${o.value === current}"${o.tone ? ` data-tone="${esc(o.tone)}"` : ''} ${attr(o)}>${esc(o.label)}</button>`).join('')}
        </div></fieldset>`;
    }

    // Error-arm switch, shared by the drawer and side cards that opt in (page.sideCardError)
    const errCopy = Object.assign({ title: 'Next save fails', hint: null }, cfg.errorSwitch);
    function armSwitch(id, extraAttr) {
      return `<label class="demo-switch-row" for="${id}"><span><span class="ttl">${esc(errCopy.title)}</span><span class="demo-soft">${esc(errCopy.hint || savesSentence())}</span></span>
        <button type="button" id="${id}" class="demo-switch" role="switch" aria-label="${esc(errCopy.title)}" aria-checked="${armed}" ${extraAttr}></button></label>`;
    }

    /* "This screen": the controls that set the scene for the current page, in the drawer.
       page.sideCardHead (string | fn(ctx) → { title, body }) names the section.
       Preconditions may carry: hero (the main comparison, drawn larger), group (a subheading
       such as "Display", shown where the group starts), row (label beside the control),
       fold (consecutive preconditions with the same fold label collapse into one summary
       row that opens to show them), hint (string | fn(ctx)); options may carry hint (shown
       while selected, wins over the precondition's) and tone. page.sideCardError puts the
       error switch here too. Every control writes a hash param, so a link opens the same
       screen in the same state. */
    function screenFields(page, ctx) {
      const p = ctx.params;
      return page.preconditions.map((pre) => {
        const cur = p.get(pre.key) || (pre.default != null ? pre.default : pre.options[0].value);
        return { pre, cur, opt: pre.options.find((o) => o.value === cur) };
      });
    }
    function heroChoice(page) {
      if (!page || !page.preconditions || !page.preconditions.length) return '';
      const f = screenFields(page, ctxFor(page)).find((x) => x.pre.hero);
      return f && f.opt ? f.opt.label : '';
    }
    function screenSection(page, ctx) {
      if (!page || !page.preconditions || !page.preconditions.length) return '';
      const val = (v) => (typeof v === 'function' ? v(ctx) : v);
      const head = val(page.sideCardHead);
      const intro = val(page.sideCardIntro);
      const extra = val(page.sideCardNote);
      const errorHere = val(page.sideCardError);
      const pres = screenFields(page, ctx);
      const field = ({ pre, cur, opt }) => {
        const hint = (opt && opt.hint) || val(pre.hint);
        return `<div class="demo-field${pre.hero ? ' is-hero' : ''}${pre.row ? ' is-row' : ''}"><p class="demo-eyebrow">${esc(pre.label)}</p>
          ${seg(pre.label, pre.options, cur, (o) => `data-op="param" data-key="${esc(pre.key)}" data-v="${esc(o.value)}" data-k="pa-${esc(pre.key)}-${esc(o.value)}"`)}
          ${hint ? `<p class="demo-hint">${hint}</p>` : ''}</div>`;
      };
      let group = null, html = '';
      for (let i = 0; i < pres.length; i++) {
        const { pre } = pres[i];
        if (pre.group && pre.group !== group) html += `<p class="demo-group">${esc(pre.group)}</p>`;
        group = pre.group || group;
        if (!pre.fold) { html += field(pres[i]); continue; }
        const run = [];
        while (i < pres.length && pres[i].pre.fold === pre.fold) run.push(pres[i++]);
        i--;
        html += `<details class="demo-fold"><summary><span class="demo-eyebrow">${esc(pre.fold)}</span>
          <span class="v">${esc(run.map((r) => (r.opt ? r.opt.label : r.cur)).join(' · '))}</span><span class="chg">Change</span></summary>
          <div class="demo-fold-body">${run.map(field).join('')}</div></details>`;
      }
      const title = head && typeof head === 'object' ? head.title : head;
      return `<div class="demo-screen">
        ${title ? `<p class="demo-screen-title">${esc(title)}</p>` : ''}
        ${head && head.body ? `<p class="demo-soft">${head.body}</p>` : ''}
        ${intro ? `<p class="demo-soft">${intro}</p>` : ''}
        ${page.sideCardWarning ? `<p class="demo-warn">${page.sideCardWarning}</p>` : ''}
        ${html}
        ${errorHere ? `<div class="demo-field demo-field-arm">${armSwitch('dk-arm-screen', 'data-op="arm" data-k="arm-screen"')}</div>` : ''}
        ${extra ? `<p class="demo-foot">${extra}</p>` : ''}
      </div>`;
    }

    /* ------------------------------------------------------------------------
       7. In-page presenter boxes: PROTOTYPE NOTE, NEXT IN THE DEMO
       ------------------------------------------------------------------------ */
    function note(text) {
      const body = typeof text === 'object' && text
        ? `Open question for ${esc(text.company || company)}: ${text.question} Until that’s answered, ${text.interim}`
        : text;
      return `<aside class="demo-note" data-dk-note><p class="demo-eyebrow"><span class="demo-dot"></span>Prototype note</p><p>${body}</p></aside>`;
    }
    function next(o) {
      const links = (o && o.links) || [];
      return `<aside class="demo-box" data-dk-next><p class="demo-eyebrow"><span class="demo-dot"></span>Next in the demo</p>
        <p>${o.text || ''}</p>
        ${links.length ? `<p class="demo-links">${links.map((l) => `<a href="${esc(l.to)}"${l.session ? ` data-dk-session="${esc(l.session)}"` : ''}${l.persona ? ` data-dk-persona="${esc(l.persona)}"` : ''}>${esc(l.label)}</a>`).join('')}</p>` : ''}
      </aside>`;
    }

    // The save confirmation as production shows it (SuccessMessage): 60px from the top, gone after 3 seconds.
    function success(text) {
      const vp = root && root.querySelector('.dk-vp');
      if (!vp || !window.DemoKit.parts) return toast(text);
      vp.querySelectorAll('[data-part="success-banner"]').forEach((n) => n.remove());
      vp.insertAdjacentHTML('beforeend', window.DemoKit.parts.successBanner(text));
      const el = vp.lastElementChild;
      setTimeout(() => el.remove(), 3000);
      return el;
    }

    /* ------------------------------------------------------------------------
       8. Toast and confirm dialog
       ------------------------------------------------------------------------ */
    let toastRegion = null;
    function toast(msg, opts) {
      const o = opts || {};
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<span>${esc(msg)}</span>${o.undo ? '<button type="button">Undo</button>' : ''}`;
      const kill = () => t.remove();
      if (o.undo) t.querySelector('button').addEventListener('click', () => { kill(); o.undo(); });
      toastRegion.replaceChildren(t);
      setTimeout(kill, o.duration || (o.undo ? 8000 : 5000));
      return kill;
    }

    // Confirm dialog: question title, consequence naming the object, verb-object buttons.
    // When failCopy is given the confirm runs through run(), so the error arm works here too.
    function confirm(o) {
      const d = document.createElement('dialog');
      d.className = 'dialog';
      d.setAttribute('aria-labelledby', 'dk-dialog-title');
      d.innerHTML = `<form method="dialog">
        <h2 id="dk-dialog-title">${esc(o.title)}</h2>
        <p>${o.body || ''}</p>
        <div class="actions">
          <button type="button" class="btn ${o.danger === false ? '' : 'btn-danger'}" data-dk-confirm>${esc(o.confirm || 'Confirm')}</button>
          <button type="button" class="link link-ink" data-dk-cancel>${esc(o.cancel || 'Cancel')}</button>
        </div></form>`;
      document.body.appendChild(d);
      d.addEventListener('close', () => d.remove());
      d.querySelector('[data-dk-cancel]').addEventListener('click', () => d.close());
      d.querySelector('[data-dk-confirm]').addEventListener('click', async (e) => {
        const ok = o.failCopy
          ? await run(o.onConfirm, o.failCopy, { label: o.save, trigger: e.currentTarget })
          : (await o.onConfirm(), true);
        if (ok && d.open) d.close();
      });
      d.showModal();
      d.querySelector('[data-dk-cancel]').focus();
      return d;
    }

    /* ------------------------------------------------------------------------
       9. Presenter panel: pill + drawer
       ------------------------------------------------------------------------ */
    let pill = null, drawer = null, scrim = null, drawerOpen = false, builderOpen = false;

    function savesSentence() {
      const list = saves.length ? ': ' + saves.join(', ') : '';
      return `The next form or confirm dialog shows its error instead of saving${list}. Turns itself off after one failure.`;
    }

    /* Drawer options (cfg.panel), all optional:
         title     heading and pill aria-label (default: the project's name)
         intro     HTML for the one-line disclaimer at the foot of Tours
         scenario  false hides the Scenario control and shows a plain Reset under Screens
         axes      false hides the axis controls (when This screen owns them)
         errors    false hides the global error switch (when screens carry it)
         labels    { paths, jump } tab names (default "Tours", "Screens")
       Three tabs, one job each, each meant to fit one screen: This screen (the page's
       preconditions, then any whole-demo controls), Tours (one row per path; steps only
       for the running one), Screens (titles only; purpose on hover; Reset; Builder tools).
       Paths may carry `group` (consecutive paths share a subheading; the first group is
       the lead) and `meta`. Pages may carry `jumpGroup`, `jumpSession` ('in' | 'out'),
       and `hidden` (left out of Screens, e.g. placeholders that aren't built). */
    const panel = Object.assign({ title: project.name || 'Demo controls', intro: null, scenario: true, axes: true, errors: true, labels: {} }, cfg.panel);
    let drawerTab = 'screen';

    function panelHtml(tab) {
      const shownTab = tab || drawerTab;
      const sc = scenarioById(state.scenario);

      // Sketch mode: the first path only; axes hidden; Whose side only if that path names a persona
      const shownPaths = sketch ? paths.slice(0, 1) : paths;
      const firstPersona = !!(paths[0] && paths[0].start && paths[0].start.persona);

      /* --- Tours: one row each; the running one shows its steps --- */
      const tourRow = (p) => {
        const isActive = p.id === activePath;
        return `<li class="demo-tour" data-active="${isActive}">
          <div class="demo-tour-row">
            <div class="txt"><span class="ttl">${esc(p.label)}</span><span class="syn" title="${esc(p.summary || '')}">${esc(p.summary || '')}</span></div>
            <button type="button" class="demo-btn${isActive ? ' demo-btn-quiet' : ''}" data-op="start" data-id="${esc(p.id)}" data-k="start-${esc(p.id)}" aria-label="${isActive ? 'Restart' : 'Start'}: ${esc(p.label)}">${isActive ? 'Restart' : 'Start'}</button>
          </div>
          ${isActive ? `<ol class="demo-steps">${p.steps.map((st) => `<li title="${esc(st)}"><span>${esc(st)}</span></li>`).join('')}</ol>` : ''}
        </li>`;
      };
      const runs = [];
      shownPaths.forEach((p) => {
        const last = runs[runs.length - 1];
        if (last && last.group === (p.group || null)) last.items.push(p);
        else runs.push({ group: p.group || null, items: [p] });
      });
      const toursTab = runs.map((r, k) =>
        `<div class="demo-tour-group${k === 0 ? ' is-lead' : ''}">${r.group ? `<h4>${esc(r.group)}</h4>` : ''}<ol class="demo-tours">${r.items.map(tourRow).join('')}</ol></div>`).join('')
        + `<p class="demo-foot" id="demo-desc">${panel.intro || 'Not part of the product. Nothing is charged, and everyone in it is made up. Data is saved in this browser.'}</p>`;

      /* --- This screen: the page's controls, then whole-demo controls --- */
      const field = (label, inner, hint) => `<div class="demo-field"><p class="demo-eyebrow">${esc(label)}</p>${inner}${hint ? `<p class="demo-hint">${esc(hint)}</p>` : ''}</div>`;
      const whole = [];
      if (panel.scenario) whole.push(field('Scenario', seg('Scenario', scenarios.map((s) => ({ value: s.id, label: s.label })), state.scenario, (o) => `data-op="scenario" data-v="${esc(o.value)}" data-k="sc-${esc(o.value)}"`), sc.description || ''));
      if (!sketch && panel.axes) axes.forEach((a) => {
        const cur = state.axes[a.key];
        const opt = a.options.find((o) => o.value === cur) || a.options[0];
        whole.push(field(a.label, seg(a.label, a.options, cur, (o) => `data-op="axis" data-key="${esc(a.key)}" data-v="${esc(o.value)}" data-k="ax-${esc(a.key)}-${esc(o.value)}"`), opt.description || ''));
      });
      const termEnd = state.subscription && state.subscription.end;
      if (!sketch && dial.length && termEnd) {
        const cur = dial.find((o) => o.id === state.clock) || dial[0];
        whole.push(field('Today is', seg('Today is', dial.map((o) => ({ value: o.id, label: o.label })), cur.id, (o) => `data-op="clock" data-v="${esc(o.value)}" data-k="ck-${esc(o.value)}"`),
          `${fmt(todayDate())}; the term ends ${fmt(termEnd)}. ${cur.note || ''}`));
      }
      if (personas.length && (!sketch || firstPersona)) whole.push(field('Whose side', seg('Whose side', personas.map((p) => ({ value: p.id, label: p.label })), state.persona, (o) => `data-op="persona" data-v="${esc(o.value)}" data-k="pe-${esc(o.value)}"`),
        typeof cfg.personaNote === 'function' ? cfg.personaNote(state, derived) : (cfg.personaNote || (personaById(state.persona) || {}).description || '')));
      if (panel.errors) whole.push(`<div class="demo-field demo-field-arm">${armSwitch('demo-fail-next', 'data-op="arm" data-k="arm"')}</div>`);
      const screenHtml = screenSection(currentPage, currentPage ? ctxFor(currentPage) : null);
      const ownsDevice = currentPage && (currentPage.preconditions || []).some((x) => x.key === 'device');
      const deviceRow = panel.device === false || ownsDevice ? '' : `<div class="demo-field is-row"><p class="demo-eyebrow">Opened on</p>
        ${seg('Opened on', [{ value: 'desktop', label: 'Desktop' }, { value: 'phone', label: 'Phone' }], device(), (o) => `data-op="device" data-v="${o.value}" data-k="dev-${o.value}"`)}
        <p class="demo-hint">Desktop is the page at 1280, scaled to fit this window. Phone is the same page at 375.</p></div>`;
      const tested = facts && (facts.plans || []).filter((p) => p.seen);
      const factsLine = facts && facts.capturedAt ? `<p class="demo-facts">Prices and plan copy from ${esc(facts.source || 'the live products page')}, captured ${esc(fmt(facts.capturedAt))}.${tested.length
        ? ` Under a live test that day: ${tested.map((p) => `${esc(p.name)} (${p.seen.map((x) => '$' + esc(x)).join(', ')})`).join('; ')}; this shows the most common.` : ''}</p>` : '';
      const screenTab = checksRow() + (screenHtml || (deviceRow || whole.length ? '' : `<p class="demo-soft">Nothing to set on this screen.</p>`)) + deviceRow
        + (whole.length ? `<div class="demo-whole">${screenHtml || deviceRow ? '<p class="demo-group">Whole demo</p>' : ''}${whole.join('')}</div>` : '') + factsLine;

      /* --- Screens: titles only, purpose on hover; Reset; Builder tools --- */
      // Pattern pages ('/members/:id') are listed only when they give an `example` path to open
      const jumpPath = (p) => isPattern(p.path) ? (typeof p.example === 'function' ? p.example(ctxFor(p)) : p.example) : p.path;
      const jumpable = pages.filter((p) => !p.hidden && jumpPath(p));
      const areaLabel = (p) => (AREAS.find(([a]) => a === p.area) || [])[1] || 'Other';
      const groupOf = (p) => p.jumpGroup || areaLabel(p);   // a page with neither lands in "Other"
      const jumpGroups = [...new Set(jumpable.map(groupOf))].map((label) => [label, jumpable.filter((p) => groupOf(p) === label)]);
      const resetRow = `<div class="demo-scope"><span>${esc(panel.resetHint || 'Puts the demo data back to how it started. Other settings stay.')}</span>
          <button type="button" class="demo-btn demo-btn-quiet" data-op="reset" data-k="reset">Reset</button></div>`;
      const builder = `<details class="demo-builder"${builderOpen ? ' open' : ''}><summary>Builder tools</summary>
        <div class="demo-builder-body">
          <a class="demo-btn demo-btn-quiet" href="#/design-system" data-op="jump" data-path="/design-system">Design system</a>
          <button type="button" class="demo-btn demo-btn-quiet" data-op="wipe" data-k="wipe">Clear everything stored</button>
          <pre class="demo-raw">${esc(JSON.stringify({ scenario: state.scenario, session: state.session, persona: state.persona, axes: state.axes, params: Object.fromEntries(parseHash().params) }, null, 2))}</pre>
        </div></details>`;
      const screensTab = jumpGroups.map(([label, list]) => {
        if (!list.length) return '';
        return `<div class="demo-jump-group"><span>${esc(label)}</span><ul>${list.map((p) => `<li>
          <button type="button" class="demo-jump" data-op="jump" data-path="${esc(jumpPath(p))}" data-k="j-${esc(p.path)}" title="${esc(p.purpose || '')}"${currentPage && currentPage.path === p.path ? ' aria-current="page"' : ''}>
            <span class="ttl">${esc(p.title)}</span><span class="here">You're here</span></button></li>`).join('')}</ul></div>`;
      }).join('') + (panel.scenario ? '' : resetRow) + builder;

      const tabs = [['screen', 'This screen'], ['tours', panel.labels.paths || 'Tours'], ['screens', panel.labels.jump || 'Screens']];
      const body = shownTab === 'tours' ? toursTab : shownTab === 'screens' ? screensTab : screenTab;
      return `
        <header class="demo-head">
          <div class="demo-head-top"><h2 class="demo-title" id="demo-title">${esc(panel.title)}</h2>
            <button type="button" class="demo-close" data-op="close" data-k="close" aria-label="Close">×</button></div>
          <div class="demo-tabs" role="tablist" aria-label="Presenter">
            ${tabs.map(([id, label]) => `<button type="button" role="tab" class="demo-tab" data-op="tab" data-v="${id}" data-k="tab-${id}" aria-selected="${shownTab === id}">${esc(label)}</button>`).join('')}
          </div>
        </header>
        <div class="demo-body" role="tabpanel" data-tab="${shownTab}">${body}</div>
        ${shownTab === 'screen' ? `<p class="demo-hintbar" aria-hidden="true">${esc(HINT_IDLE)}</p>` : ''}`;
    }

    /* Checks (checks.js) run after each render. A failure is a red dot on the pill and a row at the
       top of This screen; a clean page shows neither. Shown on localhost and file://, or with
       ?dk-checks=1; cfg.checks: false turns them off. */
    const CHECKS = window.DemoChecks || null;
    const checksOn = !!CHECKS && cfg.checks !== false
      && (/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || /[?&]dk-checks=1/.test(location.search + location.hash));
    let checkResults = [], checkTimer = null, checkRun = 0;
    function panelTabs() {
      return [['screen', 'This screen'], ['tours', panel.labels.paths || 'Tours'], ['screens', panel.labels.jump || 'Screens']]
        .map(([id, label]) => ({ id, label, html: panelHtml(id) }));
    }
    function scheduleChecks() {
      if (!checksOn || !root) return;
      clearTimeout(checkTimer);
      checkTimer = setTimeout(runChecks, 600);
    }
    async function runChecks() {
      if (!CHECKS || !root) return [];
      const n = ++checkRun;
      const results = await CHECKS.run({ root: root.querySelector('.dk-vp') || root, tabs: panelTabs });
      if (n !== checkRun) return results;
      const changed = JSON.stringify(results) !== JSON.stringify(checkResults);
      checkResults = checksOn ? results : [];
      if (changed) renderChrome();
      return results;
    }
    function checksRow() {
      const bad = checkResults.filter((r) => !r.ok);
      if (!bad.length) return '';
      return `<div class="demo-checks" role="status"><p class="demo-checks-head"><span class="demo-dot" aria-hidden="true"></span>Checks: ${bad.length} failed</p>
        <ul>${bad.map((r) => `<li><span class="ttl">${esc(r.label)}</span> ${esc(r.detail)}</li>`).join('')}</ul></div>`;
    }

    let renderingPanel = false;
    function renderPanel() {
      if (!drawer || !drawerOpen) return;
      const body = drawer.querySelector('.demo-body');
      const top = body ? body.scrollTop : 0;
      const focusK = document.activeElement && drawer.contains(document.activeElement) ? document.activeElement.dataset.k : null;
      renderingPanel = true;
      drawer.innerHTML = panelHtml();
      renderingPanel = false;
      const nb = drawer.querySelector('.demo-body');
      if (nb) nb.scrollTop = top;
      if (focusK) { const f = drawer.querySelector(`[data-k="${CSS.escape(focusK)}"]`); if (f) f.focus({ preventScroll: true }); }
    }
    function renderChrome() {
      if (pill) {
        pill.dataset.armed = String(armed); pill.setAttribute('aria-expanded', String(drawerOpen));
        const failed = checkResults.filter((r) => !r.ok).length;
        pill.dataset.checks = failed ? 'fail' : 'ok';
        pill.setAttribute('aria-label', panel.title + (failed ? ` (${failed} check${failed > 1 ? 's' : ''} failed)` : ''));
        const hero = heroChoice(currentPage);
        pill.innerHTML = `<span class="demo-dot" aria-hidden="true"></span>${hero ? `<span class="demo-pill-hero">${esc(hero)}</span>` : ''}<span>${esc(cfg.pill || 'Tours & screens')}</span>`;
      }
      document.querySelectorAll('[data-dk-arm]').forEach((b) => b.setAttribute('aria-checked', String(armed)));
      renderPanel();
    }
    function openDrawer() {
      dismissIntro();
      drawerOpen = true;
      drawer.hidden = false; scrim.hidden = false;
      renderChrome();
      drawer.querySelector('.demo-close').focus();
    }
    function closeDrawer(returnFocus) {
      if (!drawerOpen) return;
      drawerOpen = false;
      drawer.hidden = true; scrim.hidden = true;
      renderChrome();
      if (returnFocus !== false) pill.focus();
    }

    /* The caption strip under This screen: pointing at (or tabbing to) a control shows what it
       changes, in a fixed-height strip, so nothing in the panel moves. Leaving waits a beat before
       going back to idle, so sweeping across controls reads as one steady caption. */
    const HINT_IDLE = 'Point at a control to see what it changes.';
    let hintTimer = null;
    function hintFor(el) {
      const host = el && el.closest('.demo-field, .demo-switch-row');
      if (!host) return null;
      const t = host.querySelector('.demo-hint, .demo-switch-row .demo-soft');
      return t && t.textContent.trim() ? t.textContent.trim() : null;
    }
    function showHint(text) {
      const bar = drawer && drawer.querySelector('.demo-hintbar');
      if (!bar) return;
      clearTimeout(hintTimer);
      const next = text || HINT_IDLE;
      if (bar.textContent === next) return;
      bar.textContent = next;
      bar.classList.toggle('is-idle', !text);
    }
    function onHintOver(e) { const t = hintFor(e.target); if (t) showHint(t); else { clearTimeout(hintTimer); hintTimer = setTimeout(() => showHint(null), 180); } }

    function onPanelClick(e) {
      const step = e.target.closest('.demo-steps li');
      if (step) { step.classList.toggle('is-open'); return; }
      const b = e.target.closest('[data-op]');
      if (!b) return;
      const op = b.dataset.op, v = b.dataset.v;
      if (op === 'close') closeDrawer();
      else if (op === 'tab') { drawerTab = v; renderPanel(); const nb = drawer.querySelector('.demo-body'); if (nb) nb.scrollTop = 0; }
      else if (op === 'start') startPath(b.dataset.id);
      else if (op === 'scenario') loadScenario(v);
      else if (op === 'reset') { resetData(); toast(panel.scenario ? 'Demo data reset to ' + scenarioById(state.scenario).label + '.' : 'Demo data reset.'); }
      else if (op === 'axis') setAxis(b.dataset.key, v);
      else if (op === 'clock') setClock(v);
      else if (op === 'persona') setPersona(v);
      else if (op === 'arm') { e.preventDefault(); armed = !armed; renderChrome(); }
      else if (op === 'param') setParam(b.dataset.key, v, { push: false });
      else if (op === 'device') {
        try { localStorage.setItem(DEVICE_KEY, v); } catch (err) { /* memory only */ }
        if (parseHash().params.has('device')) setParam('device', v, { push: false }); else render();
      }
      else if (op === 'wipe') {
        try { localStorage.removeItem(KEY); localStorage.removeItem(PATH_KEY); localStorage.removeItem(INTRO_KEY); } catch (err) { /* ignore */ }
        location.hash = '#' + homePath();
        location.reload();
      }
      else if (op === 'jump') {
        e.preventDefault();
        const page = resolve(b.dataset.path);
        const session = page.jumpSession || (page.area === 'app' ? 'in' : page.area === 'public' ? 'out' : undefined);
        closeDrawer(false);
        navigate('#' + b.dataset.path, { session, push: true });   // the example path for pattern pages, not '/x/:id'
      }
    }

    function mountChrome() {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'demo-pill';
      pill.setAttribute('aria-label', panel.title);
      pill.setAttribute('aria-haspopup', 'dialog');
      pill.innerHTML = `<span class="demo-dot" aria-hidden="true"></span>${esc(cfg.pill || 'Tours & screens')}`;
      pill.addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));

      scrim = document.createElement('div');
      scrim.className = 'demo-scrim';
      scrim.hidden = true;
      scrim.addEventListener('click', () => closeDrawer());

      drawer = document.createElement('div');
      drawer.className = 'demo-drawer';
      drawer.dataset.mode = mode;
      drawer.hidden = true;
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-labelledby', 'demo-title');
      drawer.addEventListener('click', onPanelClick);
      drawer.addEventListener('pointerover', onHintOver);
      drawer.addEventListener('focusin', onHintOver);
      drawer.addEventListener('pointerleave', () => { clearTimeout(hintTimer); hintTimer = setTimeout(() => showHint(null), 180); });
      drawer.addEventListener('toggle', (e) => {
        if (!renderingPanel && e.target.matches('details.demo-builder')) builderOpen = e.target.open;
      }, true);

      toastRegion = document.createElement('div');
      toastRegion.className = 'toast-region';
      toastRegion.setAttribute('role', 'status');
      toastRegion.setAttribute('aria-live', 'polite');

      document.body.append(toastRegion, pill, scrim, drawer);
      mountIntro();
    }

    /* First-visit orientation (cfg.intro = { title, body, action }): a small card above the
       pill. "action" opens the drawer with the first path expanded; either button, opening
       the drawer, or starting a path dismisses it for good (stored per browser). */
    const INTRO_KEY = KEY + '-intro-seen';
    let intro = null;
    function mountIntro() {
      if (!cfg.intro) return;
      try { if (localStorage.getItem(INTRO_KEY)) return; } catch (e) { /* show it */ }
      intro = document.createElement('aside');
      intro.className = 'demo-intro';
      intro.setAttribute('aria-label', 'About this prototype');
      intro.innerHTML = `<p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
        <p class="demo-intro-title">${esc(cfg.intro.title)}</p><p class="demo-soft">${cfg.intro.body}</p>
        <div class="demo-intro-acts"><button type="button" class="demo-btn" data-intro="open">${esc(cfg.intro.action || 'Open the tours')}</button>
          <button type="button" class="demo-btn demo-btn-quiet" data-intro="close">Got it</button></div>`;
      intro.addEventListener('click', (e) => {
        const b = e.target.closest('[data-intro]');
        if (!b) return;
        dismissIntro();
        if (b.dataset.intro === 'open') { drawerTab = 'tours'; openDrawer(); }
        else pill.focus();
      });
      document.body.append(intro);
    }
    function dismissIntro() {
      if (!intro) return;
      intro.remove();
      intro = null;
      try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* memory only */ }
    }

    /* ------------------------------------------------------------------------
       10. Global delegation: links that set session/persona, sign out,
           side-card params, nav disclosure, data-act buttons
       ------------------------------------------------------------------------ */
    function onDocClick(e) {
      const t = e.target.closest('button, a, input[type="submit"]');
      if (t) lastTrigger = t;
      if (!t || (drawer && drawer.contains(t))) return;
      if (t.matches('a[data-dk-session], a[data-dk-persona]')) {
        e.preventDefault();
        navigate(t.getAttribute('href'), { session: t.dataset.dkSession, persona: t.dataset.dkPersona, push: true });
      } else if (t.matches('[data-dk-signout]')) {
        navigate('#' + homePath(), { session: 'out', push: true });
      } else if (t.matches('[data-dk-param]')) {
        setParam(t.dataset.dkParam, t.dataset.v, { push: false });
      } else if (t.matches('[data-dk-arm]')) {
        armed = !armed;
        renderChrome();
      } else if (t.matches('.dk-account-nav button')) {
        navOpen = !navOpen;
        t.closest('.dk-account-nav').dataset.open = String(navOpen);
        t.setAttribute('aria-expanded', String(navOpen));
      } else if (t.matches('[data-dk-nudge-close]')) {
        const slot = t.closest('.slot-nudge');
        if (slot) slot.replaceChildren(); else t.closest('[data-part="nudge"]')?.remove();
        liftPill();
      } else if (t.matches('[data-dk-back]')) {
        history.length > 1 ? history.back() : navigate('#' + homePath());
      } else if (t.matches('[data-act]')) {
        e.preventDefault();
        if (t.dataset.fail) run(() => act(t.dataset.act, t.dataset.arg), t.dataset.fail, { label: t.textContent.trim(), trigger: t });
        else act(t.dataset.act, t.dataset.arg);
      }
    }

    /* ------------------------------------------------------------------------
       11. /design-system: token swatches, type, buttons, field, list, banners
       ------------------------------------------------------------------------ */
    function fontLoaded(family) {
      const c = document.createElement('canvas').getContext('2d');
      const sample = 'mmmmmmmmmmlli1WQ@';
      return ['monospace', 'serif'].some((base) => {
        c.font = '32px ' + base; const w0 = c.measureText(sample).width;
        c.font = `32px '${family}', ${base}`; return c.measureText(sample).width !== w0;
      });
    }
    // What the page is really rendering, measured, never assumed. A fallback is named as one.
    function faceReport(k) {
      const fam = families[k];
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-' + k).trim();
      const rest = stack.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter((s) => s && s !== fam).join(', ');
      // colors_and_type.css declares the faces; a face counts once the browser has actually loaded it.
      const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === fam);
      if (faces.some((f) => f.status === 'loaded') || fontLoaded(fam)) return `${fam}, loaded from fonts/`;
      const why = !faces.length ? 'not declared: is colors_and_type.css next to this file?'
        : faces.some((f) => f.status === 'loading' || f.status === 'unloaded') ? 'still loading'
        : 'fonts/ missing next to this file, or opened via file:// (fonts need http)';
      return `system fallback, not ${fam} (${why}): one of ${rest}`;
    }
    let dsFontsAsked = false;
    function renderDesignSystem(el) {
      if (!dsFontsAsked) {   // load the three faces, then draw the report again with the answer
        dsFontsAsked = true;
        Promise.allSettled(Object.values(families).map((f) => document.fonts.load(`16px "${f}"`))).then(() => { if (currentPage && currentPage.path === '/design-system') render(); });
      }
      const css = getComputedStyle(document.documentElement);
      const movedBy = axes.filter((ax) => ax.options.some((o) => o.today));
      const clockRows = [
        ['Today', fmt(todayDate()) + (todayMs !== ANCHOR_MS ? ` (moved by ${movedBy.map((ax) => {
          const o = ax.key === '__dial' ? ax.options[0] : ax.options.find((x) => x.value === state.axes[ax.key]); return ax.label + ': ' + (o ? o.label : state.axes[ax.key]); }).join(', ')})` : '')],
        ['Fixtures anchored to', fmt(anchorDate())],
        ['Read it as', 'kit.today(), kit.days(n), ctx.today and the today passed to derive()'],
      ];
      // Type is scoped by surface, as production draws it: one class per role, no h1/h2/h3 ladder.
      const TYPE = [
        ['utility', [['title', 'Enter your email to sign in'], ['label', 'Your Email'], ['link', 'Forgot your password?']]],
        ['checkout', [['title', 'Add Payment Information'], ['section', 'Billing Address'], ['label', 'Credit Card'], ['fineprint', 'Your subscription renews automatically.']]],
        ['confirm', [['title', 'You are now a subscriber.'], ['body', 'You’ll receive a confirmation email.'], ['label', 'Subscription plan'], ['value', 'Digital']]],
        ['products', [['plan', 'Print & Digital'], ['price', '$99.99/year'], ['badge', 'Best value']]],
        ['www', [['kicker', 'Science'], ['hed', 'The Used-Battery Gold Rush Is Coming'], ['dek', 'If it can power an electric vehicle, why not a data center?'], ['body', 'Like all batteries, the giant lithium-ion ones in electric cars eventually fade.']]],
      ];
      const stamp = CHROME && CHROME.stamp;
      el.innerHTML = `<div class="ds">
        <h1 class="type-checkout-title">Design system</h1>
        <p class="field-hint" style="margin-top:8px">What this prototype is built from. Values come from colors_and_type.css, generated from production${stamp ? ` on ${esc(stamp.date)} (accounts-frontend ${esc(stamp.accounts.sha)}${stamp.www ? `, theatlantic.com ${esc(stamp.www.date)}` : ''})` : ''}. Primary actions are filled graphite; blue is for links, the focus ring and the outlined secondary.</p>
        <section style="margin-top:32px"><h2>Clock</h2>
          <table class="kv" data-dk-clock><tbody>${clockRows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
        <section><h2>Color</h2>
          <div class="ds-swatches">${TOKENS.map(([n, use]) => `<div class="ds-swatch"><div class="chip" style="background:var(--${n})"></div>
            <div class="meta"><span>${n}</span><code>${esc(css.getPropertyValue('--' + n).trim())}</code></div><div class="use">${esc(use)}</div></div>`).join('')}</div></section>
        <section><h2>Type, by surface</h2>
          <p class="field-hint">Serif: ${esc(faceReport('serif'))}. Sans: ${esc(faceReport('sans'))}. Buttons: ${esc(faceReport('mono'))}. Fields are Arial.</p>
          ${TYPE.map(([surface, roles]) => roles.map(([role, sample]) => `<div class="ds-type"><div class="type-${surface}-${role}">${esc(sample)}</div>
            <div class="spec"><code>.type-${surface}-${role}</code></div></div>`).join('')).join('')}</section>
        <section><h2>Buttons</h2>
          <div class="ds-row"><button class="btn" type="button">Continue</button><button class="btn btn-secondary" type="button">Manage</button>
            <button class="btn btn-danger" type="button">Cancel subscription</button><button class="btn" type="button" disabled>Continue</button>
            <button class="link" type="button">Not you?</button></div></section>
        <section><h2>Form</h2>
          <div class="field"><label for="ds-email">Your Email</label><input class="input" id="ds-email" placeholder="name@example.com"></div>
          <div class="row-fields" style="margin-top:24px"><div class="field"><label for="ds-city">City</label><input class="input" id="ds-city"></div>
            <div class="field"><label for="ds-zip">Zip/Postal Code</label><input class="input" id="ds-zip"></div></div>
          <p class="alert" style="margin-top:16px">An error, as production's ErrorMessage draws it.</p></section>
      </div>`;
    }

    /* ------------------------------------------------------------------------
       12. Public API and boot
       ------------------------------------------------------------------------ */
    const kit = {
      get state() { return state; },
      get derived() { return derived; },
      get page() { return currentPage; },
      get armed() { return armed; },
      get mode() { return mode; },                // 'sketch' | 'build'
      config: cfg, project, contact: cfg.contact,
      today: todayDate,                          // the clock: a Date, moved by axis options with `today`
      anchor: anchorDate,                        // config.today: what fixtures were built from
      params, param, set, act, run, navigate, setParam, toast, note, next, confirm,
      loadScenario, resetData, setAxis, setPersona, startPath, render,
      open: () => openDrawer(), close: () => closeDrawer(),
      esc, fmt,
      iso: (d) => iso(d),
      days: (n) => iso(new Date(todayMs + n * DAY)),   // relative to the clock, not the anchor
      daysBetween: (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY),
      fontLoaded,
      device, facts, chrome: CHROME && CHROME.stamp,
      notBuilt: (what) => '#/not-built?what=' + encodeURIComponent(what),
      persona: (id) => persona(id, anchorDate(), facts),   // a fixture person, dates resolved against config.today
      fixtures: FIXTURES(), setClock,
      get parts() { return window.DemoKit.parts || {}; },   // parts.js: COMPONENTS.md lists them
      success,                                   // production's save confirmation, top-center for 3 seconds
      arm: (on = true) => { armed = !!on; renderChrome(); },   // "Next save fails", for a walk or a script
      get checks() { return checkResults; },     // the last run of checks.js: [{ id, label, ok, skipped, detail }]
      runChecks, panelTabs,
    };
    window.DemoKit.current = kit;

    // #/any?dk-tour=<path id> starts that tour, exactly as the drawer's Start does
    function startTourFromLink() {
      const c = parseHash().params.get('dk-clock');
      if (c && c !== state.clock && dial.some((o) => o.id === c)) commit(buildScenario(state.scenario, Object.assign(keepMeta(), { clock: c })));
      const tour = parseHash().params.get('dk-tour');
      if (!tour || !paths.some((x) => x.id === tour)) return false;
      startPath(tour);
      return true;
    }

    function boot() {
      root = document.getElementById(cfg.root || 'app');
      if (!root) { root = document.createElement('div'); root.id = 'app'; document.body.prepend(root); }
      mountChrome();
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('submit', (e) => { lastTrigger = e.submitter || lastTrigger; }, true);
      // parts.radioList: the picked row opens
      document.addEventListener('change', (e) => {
        if (!e.target.matches('.pm-list .pm-radio')) return;
        e.target.closest('.pm-list').querySelectorAll('.pm-row').forEach((r) => r.classList.toggle('is-on', r.contains(e.target)));
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) { e.preventDefault(); closeDrawer(); } });
      window.addEventListener('hashchange', () => { if (!startTourFromLink()) render(); });
      window.addEventListener('resize', fitFrame);
      let lifting = false;
      window.addEventListener('scroll', () => { if (!lifting) { lifting = true; requestAnimationFrame(() => { lifting = false; liftPill(); }); } }, { passive: true });
      window.addEventListener('load', scheduleChecks);
      if (document.fonts) document.fonts.ready.then(scheduleChecks);
      window.addEventListener('storage', (e) => { if (e.key === KEY) { adopt(load()); render(); } });
      if (!location.hash || location.hash === '#') history.replaceState(null, '', '#' + homePath());
      // Opening a link starts on desktop unless the link says phone; the choice then holds across navigation.
      if (!parseHash().params.has('device')) { try { localStorage.removeItem(DEVICE_KEY); } catch (e) { /* none */ } }
      if (!startTourFromLink()) render();
    }
    // Boot after init returns, so page renders can use the `kit` constant.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else Promise.resolve().then(boot);

    return kit;
  }

  // The day's plan by name ('Print & Digital') or id ('print'), from facts.js; the first plan when none matches.
  const plan = (name) => { const ps = (window.ATL_FACTS || {}).plans || []; return ps.find((p) => p.name === name || String(p.planId).startsWith('plan_' + name + '_')) || ps[0] || {}; };
  window.DemoKit = { init, esc, fmt, iso, persona, plan, fixtures: FIXTURES, version: '2.2.0' };
})();
