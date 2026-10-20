/* ==========================================================================
   demo-kit.js
   Drop-in presenter layer, store and hash router for demo prototypes.
   Vanilla ES2020, no dependencies. Exposes window.DemoKit.

     const kit = DemoKit.init({ key, today, project, contact, scenarios, axes,
                                personas, pages, paths, derive, actions, shell,
                                nav, brand, saves, tokens })

   See ~/.claude/skills/demo-prototype/references/architecture.md for the
   model, and references/demo-kit.md for the panel anatomy and fixed copy.

   Changelog
   1.1.0 (2026-10-16)
   - Route params. Page paths take `:id` segments ('/members/:id'). The value
     is on kit.params().id, ctx.params.id and kit.param('id'); hash-query
     preconditions (?link=expired) keep working on the same object. Pattern
     pages need `example` to be listed under Jump to, and may set `navPath`
     so the sidebar highlights their parent item. Jump to opens a pattern
     page at its example path, never at the literal '/members/:id'.
   - Clock-aware dates. An axis option may carry `today: 'YYYY-MM-DD'`. When
     that option is selected, kit.today(), kit.days(), ctx.today and the
     `today` passed to derive() move with it; fixtures still build from the
     anchor (config.today). kit.today is now a function, not a getter.
     /design-system shows the current date, the anchor and which axis moves it.
   - Fonts. `fonts: 'atlantic-accounts'` (or { dir, faces }) injects
     @font-face rules for the Atlantic woff2 files in a folder next to the
     prototype. /design-system names what actually rendered; a fallback is
     always labeled a fallback, never as the real face.
   - mode: 'sketch' | 'build' (default 'build'). Sketch is the quick, early-
     review panel: the first path only, Scenario, Error states and Jump to;
     axes are hidden, and Whose side shows only when the first path names a
     persona. Side cards, NEXT IN THE DEMO and PROTOTYPE NOTE work in both.
   1.0.0 (2026-10-16) First release.
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

  /* The Atlantic faces as shipped in ~/.claude/skills/atlantic-accounts/fonts (woff2 only).
     One file covers a weight range so semibold headings and medium buttons resolve to it. */
  const ATLANTIC_FACES = [
    { family: 'AGaramondPro', file: 'AGaramondPro-Regular.woff2', weight: '400 500', style: 'normal' },
    { family: 'AGaramondPro', file: 'AGaramondPro-Italic.woff2', weight: '400 500', style: 'italic' },
    { family: 'AGaramondPro', file: 'AGaramondPro-Semibold.woff2', weight: '600 700', style: 'normal' },
    { family: 'Graphik', file: 'Graphik-Regular.woff2', weight: '400 500', style: 'normal' },
    { family: 'Graphik', file: 'Graphik-Semibold.woff2', weight: '600 700', style: 'normal' },
    { family: 'LogicMonospace', file: 'LogicMonospace-Medium.woff2', weight: '400 700', style: 'normal' },
  ];
  const FAMILIES = { serif: 'AGaramondPro', sans: 'Graphik', mono: 'LogicMonospace' };

  const AREAS = [
    ['public', 'Before sign-in'],
    ['app', 'Signed-in account'],
    ['reference', 'Reference'],
  ];

  /* Look-floor token set, with usage lines for /design-system */
  const TOKENS = [
    ['page', '#F8F7F4', 'Page background, footer'],
    ['surface', '#FFFFFF', 'Top bar, form fields, cards'],
    ['hairline', '#E7E3DB', 'Dividers, nav and footer borders, list rows'],
    ['ink', '#000000', 'Headings, nav'],
    ['ink-soft', '#2C2825', 'Body copy, deks, field labels'],
    ['graphite', '#373737', 'Sidebar items, secondary button'],
    ['stone', '#6F6C69', 'Secondary text, field border, placeholder'],
    ['pebble', '#ABA9A8', 'Inactive button text'],
    ['mist', '#E6E5E5', 'Inactive button fill'],
    ['crimson', '#B80F15', 'Destructive text links'],
    ['error', '#B1383C', 'Field errors, destructive button'],
    ['error-tint', '#FFE8E6', 'Destructive button and red banner fill'],
    ['link', '#166999', 'Primary action, neutral text links'],
    ['success', '#2A654F', 'Confirmation banner text'],
    ['success-tint', '#DDE8D6', 'Confirmation banner fill'],
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

    // Token overrides: { link: '#123456' } sets --link on :root
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
        path: '/design-system', title: 'Design system', area: 'reference', width: 'wide',
        purpose: 'Tokens and components the prototype is built from.',
        render: renderDesignSystem,
      });
    }
    const pageByPath = new Map(pages.filter((p) => !isPattern(p.path)).map((p) => [p.path, p]));
    const routes = pages.filter((p) => isPattern(p.path)).map((p) => Object.assign({ page: p }, compileRoute(p.path)));
    routes.forEach((r) => r.keys.filter((k) => RESERVED_PARAM_KEYS.includes(k)).forEach((k) =>
      console.warn(`DemoKit: route param ":${k}" in "${r.page.path}" shadows URLSearchParams.${k}; pick another name`)));
    const navItems = cfg.nav;
    const stubByPath = new Map(navItems.filter((n) => !pageByPath.has(n.path)).map((n) => [n.path, {
      path: n.path, title: n.label, area: n.area || 'app', roles: n.roles, stub: true, stubText: n.stub,
      render: () => `<h1 class="t-heading">${esc(n.label)}</h1>
        <p class="stub-tag" style="margin-top:12px">${esc(n.stub || 'This page isn’t built in the prototype. It’s here so the navigation is complete.')}</p>`,
    }]));
    const NOT_FOUND = {
      path: '*', title: 'Page not found', area: 'reference', notFound: true,
      render: () => `<h1 class="t-heading">Page not found</h1>
        <p class="t-serif-sm" style="margin-top:12px">This link doesn’t lead to any screen in the prototype.</p>
        <p style="margin-top:20px"><a class="link" href="#${esc(homePath())}">Go to ${esc(pageByPath.get(homePath())?.title || 'the start')} &gt;</a></p>`,
    };
    const concrete = (p) => !p.hidden && !isPattern(p.path);
    const firstOf = (area) => pages.find((p) => p.area === area && concrete(p));
    const homePath = () => (cfg.home || (firstOf('public') || pages.find(concrete) || pages[0]).path);

    /* --- Fonts: inject @font-face for files next to the prototype; report honestly --- */
    const fontCfg = cfg.fonts === 'atlantic-accounts' ? { dir: './fonts' }
      : (cfg.fonts && typeof cfg.fonts === 'object' ? cfg.fonts : null);
    const families = Object.assign({}, FAMILIES, fontCfg && fontCfg.families);
    const fonts = { status: fontCfg ? 'loading' : 'off', dir: fontCfg ? String(fontCfg.dir || './fonts').replace(/\/$/, '') : null, loaded: {} };
    function mountFonts() {
      if (!fontCfg) return;
      const faces = fontCfg.faces || ATLANTIC_FACES;
      const style = document.createElement('style');
      style.setAttribute('data-dk-fonts', '');
      style.textContent = faces.map((f) => `@font-face{font-family:'${f.family}';font-style:${f.style || 'normal'};font-weight:${f.weight || '400'};font-display:swap;src:url('${fonts.dir}/${f.file}') format('woff2')}`).join('\n');
      document.head.appendChild(style);
      const fams = [...new Set(faces.map((f) => f.family))];
      const check = (fam) => document.fonts.load(`16px '${fam}'`).then((r) => { fonts.loaded[fam] = r.length > 0; }, () => { fonts.loaded[fam] = false; });
      Promise.all(fams.map(check)).then(() => {
        fonts.status = 'done';
        if (currentPage && currentPage.path === '/design-system') render();
      });
    }

    // Saves registry: config list first, then labels passed to run()
    const saves = cfg.saves.slice();
    function registerSave(label) {
      if (label && !saves.includes(label)) { saves.push(label); if (drawerOpen) renderPanel(); }
    }

    /* --- Store: one object, versioned key, validated, try/catch --- */
    const META = ['scenario', 'session', 'persona', 'axes'];
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
    function buildScenario(id, keep) {
      const sc = scenarioById(id) || scenarios[0];
      const entities = sc.build(anchorDate()) || {};
      META.forEach((k) => delete entities[k]);
      const s = Object.assign({}, entities, {
        scenario: sc.id,
        session: keep ? keep.session : (cfg.startSession || 'out'),
        persona: keep ? keep.persona : (personas[0] ? personas[0].id : null),
        axes: keep ? Object.assign({}, keep.axes) : axisDefaults(),
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
      const out = Object.assign({}, s, { axes: a, persona });
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
    const openPaths = new Set(activePath ? [activePath] : []);

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
      const anchor = scope && scope.querySelector('.actions');
      if (anchor) anchor.before(box);
      else if (scope) scope.prepend(box);
      else if (trigger && trigger.isConnected) (trigger.closest('.actions, li, p, div') || trigger).before(box);
      else toast(box.textContent);
    }

    /* ------------------------------------------------------------------------
       4. Scenarios, axes, personas, paths
       ------------------------------------------------------------------------ */
    function keepMeta() { return { session: state.session, persona: state.persona, axes: state.axes }; }
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
      openPaths.add(id);
      try { localStorage.setItem(PATH_KEY, id); } catch (e) { /* ignore */ }
      let s = st.scenario ? buildScenario(st.scenario, keepMeta()) : state;
      if (st.axes) s = Object.assign({}, s, { axes: Object.assign({}, s.axes, st.axes) });
      if (st.persona) s = applyPersona(s, st.persona);
      if (st.session) s = Object.assign({}, s, { session: st.session });
      armed = false;
      commit(s);
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

    function defaultShell(ctx) {
      const { page } = ctx;
      const signedIn = state.session === 'in';
      const items = navItems.filter((n) => !n.roles || n.roles.includes(derived.role));
      const sidebar = page.area === 'app' && items.length;
      const navPath = page.navPath || page.path;
      const current = items.find((n) => n.path === navPath);
      const firstApp = items[0] ? items[0].path : homePath();
      return `
        <header class="shell-header"><div class="shell-bar">
          <a href="#${esc(signedIn ? firstApp : homePath())}">Home</a>
          <span class="wordmark">${esc(cfg.brand || project.name)}</span>
          <div class="shell-actions">${signedIn
            ? '<button type="button" data-dk-signout>Sign out</button>'
            : `<a href="#${esc(homePath())}">Sign in</a>`}</div>
        </div></header>
        <div class="layout ${sidebar ? 'has-sidebar' : 'no-sidebar'}">
          ${sidebar ? `<nav class="sidebar" aria-label="Account" data-open="${navOpen}">
            <button type="button" class="nav-toggle" aria-expanded="${navOpen}">${esc(current ? current.label : 'Menu')} <span aria-hidden="true">▾</span></button>
            <ul>${items.map((n) => `<li><a href="#${esc(n.path)}"${n.path === navPath ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul>
          </nav>` : ''}
          <div class="content" data-dk-slot></div>
        </div>
        <footer class="shell-footer">${cfg.footer != null ? cfg.footer
          : cfg.contact ? `Questions? Your account manager is ${esc(cfg.contact.name)} (${esc(cfg.contact.email)}).` : ''}</footer>`;
    }

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

      // Shell (rebuilt only when its markup changes); public pages render outside it
      const inShell = page.area === 'app' || page.area === 'reference' && !page.bare;
      const shellHtml = inShell
        ? (typeof cfg.shell === 'function' ? cfg.shell(ctx, defaultShell) : defaultShell(ctx))
        : '<div class="public" data-dk-slot></div>';
      if (shellHtml !== lastShell) { root.innerHTML = shellHtml; lastShell = shellHtml; }
      const slot = root.querySelector('[data-dk-slot]') || root;

      // Stage: a fresh <main> each time, so pages can attach listeners freely
      const stage = document.createElement('div');
      const main = document.createElement('main');
      main.id = 'main';
      main.className = page.width === 'wide' ? 'col-wide' : 'col';
      if (page.width === 'wide') main.style.maxWidth = '880px';
      try {
        const out = page.render(main, ctx);
        if (typeof out === 'string') main.innerHTML = out;
      } catch (err) {
        console.error('DemoKit: page "' + page.path + '" failed to render', err);
        main.innerHTML = `<h1 class="t-heading">${esc(page.title)}</h1><div class="alert" style="margin-top:20px">This page hit an error while rendering. Details are in the console.</div>`;
      }
      const side = page.preconditions && page.preconditions.length ? sideCard(page, ctx) : '';
      stage.className = 'stage' + (side ? ' has-side' : '');
      stage.appendChild(main);
      if (side) stage.insertAdjacentHTML('beforeend', side);
      slot.replaceChildren(stage);

      if (pathChanged) {
        lastPath = shown;
        window.scrollTo(0, 0);
        const h1 = main.querySelector('h1');
        if (h1 && !drawerOpen) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
      }
      renderChrome();
    }

    // Segmented control shared by panel and side card
    function seg(legend, options, current, attr) {
      const cols = options.length <= 3 ? options.length : 2;
      return `<fieldset class="demo-seg"><legend class="sr-only">${esc(legend)}</legend>
        <div class="demo-seg-track" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
        ${options.map((o) => `<button type="button" aria-pressed="${o.value === current}" ${attr(o)}>${esc(o.label)}</button>`).join('')}
        </div></fieldset>`;
    }

    function sideCard(page, ctx) {
      const p = ctx.params;
      const extra = typeof page.sideCardNote === 'function' ? page.sideCardNote(ctx) : page.sideCardNote;
      return `<aside class="demo-sidecard" aria-label="Presenter only: scenario">
        <p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
        <h2>Scenario</h2>
        ${page.sideCardIntro ? `<p class="demo-soft">${page.sideCardIntro}</p>` : ''}
        ${page.sideCardWarning ? `<p class="demo-warn">${page.sideCardWarning}</p>` : ''}
        ${extra ? `<p class="demo-soft">${extra}</p>` : ''}
        ${page.preconditions.map((pre) => {
          const cur = p.get(pre.key) || (pre.default != null ? pre.default : pre.options[0].value);
          return `<div class="demo-field"><p class="demo-eyebrow">${esc(pre.label)}</p>
            ${seg(pre.label, pre.options, cur, (o) => `data-dk-param="${esc(pre.key)}" data-v="${esc(o.value)}"`)}</div>`;
        }).join('')}
      </aside>`;
    }

    /* ------------------------------------------------------------------------
       7. In-page presenter boxes: PROTOTYPE NOTE, NEXT IN THE DEMO
       ------------------------------------------------------------------------ */
    function note(text) {
      const body = typeof text === 'object' && text
        ? `Open question for ${esc(text.company || company)}: ${text.question} Until that’s answered, ${text.interim}`
        : text;
      return `<aside class="demo-box" data-dk-note><p class="demo-eyebrow"><span class="demo-dot"></span>Prototype note</p><p>${body}</p></aside>`;
    }
    function next(o) {
      const links = (o && o.links) || [];
      return `<aside class="demo-box" data-dk-next><p class="demo-eyebrow"><span class="demo-dot"></span>Next in the demo</p>
        <p>${o.text || ''}</p>
        ${links.length ? `<p class="demo-links">${links.map((l) => `<a href="${esc(l.to)}"${l.session ? ` data-dk-session="${esc(l.session)}"` : ''}${l.persona ? ` data-dk-persona="${esc(l.persona)}"` : ''}>${esc(l.label)}</a>`).join('')}</p>` : ''}
      </aside>`;
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
    let pill = null, drawer = null, scrim = null, drawerOpen = false;

    function sessionLabel() {
      if (state.session !== 'in') return 'Signed out';
      const p = personaById(state.persona);
      return p ? p.label : 'Signed in';
    }
    function savesSentence() {
      const list = saves.length ? ': ' + saves.join(', ') : '';
      return `The next form or confirm dialog shows its error instead of saving${list}. Turns itself off after one failure.`;
    }
    function section(title, aside, inner) {
      return `<section class="demo-section"><div class="demo-section-head"><h3>${esc(title)}</h3>${aside ? `<span>${esc(aside)}</span>` : ''}</div>${inner}</section>`;
    }

    function panelHtml() {
      const sc = scenarioById(state.scenario);
      const desc = project.description ? ' ' + project.description.replace(/\.?$/, '.') : '';
      const pad = (n) => String(n).padStart(2, '0');

      // Sketch mode: the first path only; axes hidden; Whose side only if that path names a persona
      const shownPaths = sketch ? paths.slice(0, 1) : paths;
      const firstPersona = !!(paths[0] && paths[0].start && paths[0].start.persona);
      const pathCards = shownPaths.map((p, i) => {
        const st = p.start || {};
        const loads = st.scenario ? scenarioById(st.scenario) : null;
        const isActive = p.id === activePath;
        return `<li class="demo-path" data-active="${isActive}">
          <details data-path="${esc(p.id)}"${openPaths.has(p.id) ? ' open' : ''}>
            <summary data-k="sum-${esc(p.id)}"><span class="num">${pad(i + 1)}</span>
              <span class="txt"><span class="ttl">${esc(p.label)}</span><span class="syn">${esc(p.summary)}</span></span>
              <span class="chev" aria-hidden="true">▾</span></summary>
            <ol class="demo-steps">${p.steps.map((s, j) => `<li><span>${j + 1}</span><div>${esc(s)}</div></li>`).join('')}</ol>
          </details>
          <div class="demo-path-foot"><span>${p.steps.length} steps${loads ? ' · loads ' + esc(loads.label) : ''}</span>
            <button type="button" class="demo-btn" data-op="start" data-id="${esc(p.id)}" data-k="start-${esc(p.id)}" aria-label="Start: ${esc(p.label)}">${loads ? 'Reset &amp; start' : 'Start'} <span aria-hidden="true">→</span></button></div>
        </li>`;
      }).join('');

      const scenarioSec = section('Scenario', '', `
        ${seg('Scenario', scenarios.map((s) => ({ value: s.id, label: s.label })), state.scenario, (o) => `data-op="scenario" data-v="${esc(o.value)}" data-k="sc-${esc(o.value)}"`)}
        <p class="demo-soft">${esc(sc.description || '')}</p>
        <div class="demo-scope"><span>Switching replaces all demo data.</span>
          <button type="button" class="demo-btn demo-btn-quiet" data-op="reset" data-k="reset"><span aria-hidden="true">↺</span> Reset data</button></div>`);

      const axisSecs = axes.map((a) => {
        const cur = state.axes[a.key];
        const opt = a.options.find((o) => o.value === cur) || a.options[0];
        return section(a.label, '', `
          ${seg(a.label, a.options, cur, (o) => `data-op="axis" data-key="${esc(a.key)}" data-v="${esc(o.value)}" data-k="ax-${esc(a.key)}-${esc(o.value)}"`)}
          <p class="demo-soft">${esc(opt.description || '')}</p>
          ${a.keptOnSwitch === false ? '' : '<div class="demo-scope"><span>Kept when you switch scenarios.</span></div>'}`);
      }).join('');

      const personaSec = personas.length && (!sketch || firstPersona) ? section('Whose side', '', `
        ${seg('Whose side', personas.map((p) => ({ value: p.id, label: p.label })), state.persona, (o) => `data-op="persona" data-v="${esc(o.value)}" data-k="pe-${esc(o.value)}"`)}
        <p class="demo-soft">${esc(typeof cfg.personaNote === 'function' ? cfg.personaNote(state, derived) : (cfg.personaNote || (personaById(state.persona) || {}).description || ''))}</p>`) : '';

      const errorSec = section('Error states', '', `
        <label class="demo-switch-row" for="demo-fail-next"><span><span class="ttl">Next save fails</span><span class="demo-soft">${esc(savesSentence())}</span></span>
          <button type="button" id="demo-fail-next" class="demo-switch" role="switch" aria-label="Next save fails" aria-checked="${armed}" data-op="arm" data-k="arm"></button></label>`);

      // Pattern pages ('/members/:id') are listed only when they give an `example` path to open
      const jumpPath = (p) => isPattern(p.path) ? (typeof p.example === 'function' ? p.example(ctxFor(p)) : p.example) : p.path;
      const jumpSec = section('Jump to', '', AREAS.map(([area, label]) => {
        const list = pages.filter((p) => p.area === area && !p.hidden && jumpPath(p));
        if (!list.length) return '';
        return `<div class="demo-jump-group"><span>${label}</span><ul>${list.map((p) => `<li>
          <button type="button" class="demo-jump" data-op="jump" data-path="${esc(jumpPath(p))}" data-k="j-${esc(p.path)}"${currentPage && currentPage.path === p.path ? ' aria-current="page"' : ''}>
            <span class="txt"><span class="ttl">${esc(p.title)}</span><span class="pur">${esc(p.purpose || '')}</span></span><span class="here">Here</span></button></li>`).join('')}</ul></div>`;
      }).join(''));

      return `
        <header class="demo-head">
          <div class="demo-head-top"><div><p class="demo-eyebrow"><span class="demo-dot"></span>Presenter only</p>
            <h2 class="demo-title" id="demo-title">Demo controls</h2></div>
            <button type="button" class="demo-close" data-op="close" data-k="close" aria-label="Close">×</button></div>
          <dl class="demo-status">
            <div><dt>Session</dt><dd>${esc(sessionLabel())}</dd></div>
            <div><dt>Scenario</dt><dd>${esc(sc.label)}</dd></div>
            <div><dt>Page</dt><dd>${esc(currentPage ? currentPage.title : '')}</dd></div>
          </dl>
        </header>
        <div class="demo-body">
          <p class="demo-disclaimer" id="demo-desc">Not part of the product. Data is saved in this browser.${esc(desc)} All companies, people and emails are made up.</p>
          ${section('Demo paths', sketch ? 'Sketch · first path only' : 'Scripted walkthroughs', `<ol class="demo-paths">${pathCards}</ol>`)}
          ${scenarioSec}${sketch ? '' : axisSecs}${personaSec}${errorSec}${jumpSec}
        </div>`;
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
      if (pill) { pill.dataset.armed = String(armed); pill.setAttribute('aria-expanded', String(drawerOpen)); }
      renderPanel();
    }
    function openDrawer() {
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

    function onPanelClick(e) {
      const b = e.target.closest('[data-op]');
      if (!b) return;
      const op = b.dataset.op, v = b.dataset.v;
      if (op === 'close') closeDrawer();
      else if (op === 'start') startPath(b.dataset.id);
      else if (op === 'scenario') loadScenario(v);
      else if (op === 'reset') { resetData(); toast('Demo data reset to ' + scenarioById(state.scenario).label + '.'); }
      else if (op === 'axis') setAxis(b.dataset.key, v);
      else if (op === 'persona') setPersona(v);
      else if (op === 'arm') { e.preventDefault(); armed = !armed; renderChrome(); }
      else if (op === 'jump') {
        const page = resolve(b.dataset.path);
        const session = page.area === 'app' ? 'in' : page.area === 'public' ? 'out' : undefined;
        closeDrawer(false);
        navigate('#' + b.dataset.path, { session, push: true });   // the example path for pattern pages, not '/x/:id'
      }
    }

    function mountChrome() {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'demo-pill';
      pill.setAttribute('aria-label', 'Demo controls');
      pill.setAttribute('aria-haspopup', 'dialog');
      pill.innerHTML = '<span class="demo-dot" aria-hidden="true"></span>Demo';
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
      drawer.setAttribute('aria-describedby', 'demo-desc');
      drawer.addEventListener('click', onPanelClick);
      drawer.addEventListener('toggle', (e) => {
        if (renderingPanel || !e.target.matches('details[data-path]')) return;
        const id = e.target.dataset.path;
        if (e.target.open) openPaths.add(id); else openPaths.delete(id);
      }, true);

      toastRegion = document.createElement('div');
      toastRegion.className = 'toast-region';
      toastRegion.setAttribute('role', 'status');
      toastRegion.setAttribute('aria-live', 'polite');

      document.body.append(toastRegion, pill, scrim, drawer);
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
      } else if (t.matches('.nav-toggle')) {
        navOpen = !navOpen;
        const nav = t.closest('.sidebar');
        nav.dataset.open = String(navOpen);
        t.setAttribute('aria-expanded', String(navOpen));
        lastShell = null;   // markup now differs from the cached string
      } else if (t.matches('[data-act]')) {
        act(t.dataset.act, t.dataset.arg);
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
      if (fontLoaded(fam)) return `${fam}${fonts.dir ? ', loaded from ' + fonts.dir : ''}`;
      const why = !fontCfg ? 'no fonts config'
        : fonts.status === 'loading' ? 'still loading'
        : `${fonts.dir}/ not found next to this file, or opened via file:// (fonts need http)`;
      return `system fallback, not ${fam} (${why}): one of ${rest}`;
    }
    function renderDesignSystem(el) {
      const css = getComputedStyle(document.documentElement);
      const face = faceReport;
      const movedBy = axes.filter((ax) => ax.options.some((o) => o.today));
      const clockRows = [
        ['Today', fmt(todayDate()) + (todayMs !== ANCHOR_MS ? ` (moved by ${movedBy.map((ax) => {
          const o = ax.options.find((x) => x.value === state.axes[ax.key]); return ax.label + ': ' + (o ? o.label : state.axes[ax.key]); }).join(', ')})` : '')],
        ['Fixtures anchored to', fmt(anchorDate())],
        ['Moved by', movedBy.length ? movedBy.map((ax) => `${ax.label} (${ax.options.filter((o) => o.today).map((o) => `${o.label} → ${fmt(o.today)}`).join(' · ')})`).join('; ')
          : 'nothing: no axis option carries a `today`'],
        ['Read it as', 'kit.today(), kit.days(n), ctx.today and the today passed to derive()'],
      ];
      const type = [
        ['t-display', 'serif', '32 / 37', 'Rare page title', 'Your team, in one place'],
        ['t-heading', 'serif', '30 / 1.15', 'Page heading', 'Manage members'],
        ['t-heading-sm', 'serif', '26 / 1.15', 'Heading on mobile, dialog title', 'Remove this member?'],
        ['t-dek', 'serif', '22 / 1.5', 'Dek under a heading', 'Invite colleagues and see who has joined.'],
        ['t-dek-sm', 'serif', '20 / 1.5', 'Dek on mobile', 'Invite colleagues and see who has joined.'],
        ['t-serif-sm', 'serif', '18 / 1.5', 'Small serif copy, list names', 'Each invite holds a seat until it’s accepted.'],
        ['t-ui', 'sans', '16', 'Field input, sidebar nav', 'Members'],
        ['t-nav', 'sans', '14 / 16', 'Top bar, helper text', 'Sign out'],
        ['t-label', 'sans', 'Medium 12, +3%', 'Field label', 'Email address'],
        ['t-caption', 'sans', '12 / 21', 'Footer legal, captions', 'All companies, people and emails are made up.'],
        ['t-button', 'mono', '16 / 1.1', 'Every button and action link', 'Send invite'],
      ];
      el.innerHTML = `
        <div class="page-head"><h1 class="t-display">Design system</h1>
          <p class="dek">The tokens and components this prototype is built from. Color is almost never decoration: one red for destructive, one blue for action, one green for confirmation.</p></div>
        <section class="section stack"><h2 class="t-heading-sm">Clock</h2>
          <p class="field-hint">Every date on screen is computed from this frozen day. Fixtures build from the anchor; an axis option with a <code>today</code> moves the clock.</p>
          <table class="kv" data-dk-clock><tbody>${clockRows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table></section>
        <section class="section stack"><h2 class="t-heading-sm">Color</h2>
          <div class="ds-swatches">${TOKENS.map(([n, hex, use]) => {
            const v = (css.getPropertyValue('--' + n).trim() || hex).toUpperCase();
            return `<div class="ds-swatch"><div class="chip" style="background:var(--${n})"></div>
              <div class="meta"><span>${n}</span><code>${esc(v)}</code></div><div class="use">${esc(use)}</div></div>`;
          }).join('')}</div></section>
        <section class="section stack"><h2 class="t-heading-sm">Typography</h2>
          <p class="field-hint">Three families, one job each. Serif: ${esc(face('serif'))}. Sans: ${esc(face('sans'))}. Mono: ${esc(face('mono'))}.</p>
          <div>${type.map(([cls, fam, size, use, sample]) => `<div class="ds-type"><div class="${cls}">${esc(sample)}</div>
            <div class="spec"><code>.${cls}</code>--font-${fam} ${esc(size)}<br>${esc(use)}</div></div>`).join('')}</div></section>
        <section class="section stack"><h2 class="t-heading-sm">Buttons</h2>
          <p class="field-hint">Solid buttons for the main action; underlined mono links for secondary and destructive actions.</p>
          <div class="ds-row"><button class="btn" type="button">Send invite</button><button class="btn" type="button" disabled>Send invite</button>
            <button class="btn" type="button" aria-busy="true" disabled>Sending…</button><button class="btn btn-black" type="button">Continue</button>
            <button class="btn btn-ghost" type="button">Cancel</button><button class="btn btn-danger" type="button">Remove member</button></div>
          <div class="ds-row"><button class="link" type="button">Resend</button><button class="link link-danger" type="button">Remove</button>
            <button class="link" type="button" disabled>Resend</button><button class="btn btn-pill" type="button">Help</button></div></section>
        <section class="section stack"><h2 class="t-heading-sm">Form</h2>
          <p class="field-hint">Type an address without @ to see the error state.</p>
          <form data-ds-form novalidate><div class="row-fields"><div class="field"><label for="ds-first">First name</label><input class="input" id="ds-first"></div>
            <div class="field"><label for="ds-last">Last name</label><input class="input" id="ds-last"></div></div>
            <div class="field" style="margin-top:12px"><label for="ds-email">Email address</label><input class="input" id="ds-email" placeholder="name@example.com" aria-describedby="ds-email-err">
            <p class="field-error" id="ds-email-err" hidden>Enter a full email address, like name@example.com.</p></div>
            <div class="actions" style="margin-top:20px"><button class="btn" type="button" disabled>Send invite</button></div></form></section>
        <section class="section stack"><h2 class="t-heading-sm">List rows and banners</h2>
          <ul class="list">
            <li><div class="row-main"><span class="row-title">Jordan Rivera</span><span class="status">Active · last login Oct 2</span></div><div class="row-actions"><button class="link link-danger" type="button">Remove</button></div></li>
            <li><div class="row-main"><span class="row-title">sam.okafor@example.com</span><span class="status">Pending · invited Oct 1 · expires Oct 31</span></div><div class="row-actions"><button class="link" type="button">Revoke</button></div></li>
            <li><div class="row-main"><span class="row-title">lee.park@example.com</span><span class="status attn">Invite expired Sep 12 · no seat held</span></div><div class="row-actions"><button class="link" type="button">Resend</button></div></li>
          </ul>
          <div class="banner"><strong>Your plan renews on Nov 8, 2026.</strong> Nothing changes for your members until then. <a class="link" href="#/design-system">Email your account manager &gt;</a></div>
          <div class="banner banner-red"><strong>Your plan ended on Oct 2, 2026.</strong> Members can keep working until Nov 1, 2026 while it’s renewed. After that, 14 people lose access.</div>
          <div class="banner banner-success">Your account is active.</div></section>
        <section class="section stack"><h2 class="t-heading-sm">Layout and spacing</h2>
          <table class="kv"><tbody>${[
            ['Top rule', '4px black bar above the top bar'], ['Top bar padding', '18px vertical, 32px horizontal; 1px hairline below'],
            ['Content column', '560px; 640px beside the sidebar'], ['Sidebar', '164px wide, 64px from the left edge, 20px between items'],
            ['Heading → dek', '12px'], ['Blocks / sections', '20px between blocks, 32px between sections'],
            ['Label → field', '8px; field rows 12px apart'], ['Field', '52px tall, 16px padding, 1px stone border, 4px radius'],
            ['Button', '42px tall, 12 × 24px padding (32px in dialogs), 4px radius'], ['Above footer', '104px; footer padding 48 × 80px'],
            ['Radius', '4px on buttons and fields, 48px pill for Help, 0 elsewhere'], ['Elevation', 'None in the product; the presenter panel carries the only shadow'],
          ].map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('')}</tbody></table></section>`;
      const email = el.querySelector('#ds-email');
      email.addEventListener('input', () => {
        const bad = email.value.length > 0 && !email.value.includes('@');
        email.setAttribute('aria-invalid', String(bad));
        el.querySelector('#ds-email-err').hidden = !bad;
      });
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
      get fonts() { return fonts; },
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
    };

    function boot() {
      root = document.getElementById(cfg.root || 'app');
      if (!root) { root = document.createElement('div'); root.id = 'app'; document.body.prepend(root); }
      mountFonts();
      mountChrome();
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('submit', (e) => { lastTrigger = e.submitter || lastTrigger; }, true);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) { e.preventDefault(); closeDrawer(); } });
      window.addEventListener('hashchange', render);
      window.addEventListener('storage', (e) => { if (e.key === KEY) { adopt(load()); render(); } });
      if (!location.hash || location.hash === '#') history.replaceState(null, '', '#' + homePath());
      render();
    }
    // Boot after init returns, so page renders can use the `kit` constant.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else Promise.resolve().then(boot);

    return kit;
  }

  window.DemoKit = { init, esc, fmt, iso, version: '1.1.0' };
})();
