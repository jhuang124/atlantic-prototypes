/* ==========================================================================
   checks.js 1.0.0
   Six checks a build used to run by hand between rounds, as one module that runs in two places:
     - In the kit. demo-kit.js runs them after each render. A failure is a red dot on the
       presenter pill and a Checks row at the top of This screen. Presenter chrome only; the
       product's look never changes. Shown on localhost and file://; elsewhere add ?dk-checks=1.
     - Headless: require('<skill>/kit/checks.js').headless(page, opts) with a
       Playwright page. It injects this file when the page hasn't loaded it, then runs.
   Load it before chrome.js, so it hears console errors and missing files from the start.

   Checks
     files     console errors, uncaught errors, files that failed to load, the token file missing
     fonts     every face the page declares and uses has loaded (a fallback is a failure)
     overflow  nothing wider than the 375 phone frame
     drawer    every drawer tab fits a 768px-tall window; no :hover rule in presenter chrome moves anything;
               the pill covers nothing docked to the page (a nudge, the onboarding bar)
     www       on theatlantic.com, no subscriber specifics: card, amount, date, email
     nudge     the docked nudge is no taller than a quarter of an 812px phone screen (203px)

   DemoChecks.run(opts) → Promise<[{ id, label, ok, skipped, detail }]>
     opts.root     the page's frame (default .dk-vp, else document.body)
     opts.tabs     () → [{ label, html }]: drawer tabs to measure (default: the kit's own)
     opts.surface  'www' | 'accounts' (default: the frame's data-chrome)
     opts.only     [ids] to run a subset
   On a page that isn't a kit page, overflow and nudge measure the window as it is, so run
   them at 375 wide.
   ========================================================================== */
(function (factory) {
  const win = typeof window !== 'undefined' ? window : null;
  const api = factory(win);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (win) win.DemoChecks = api;
})(function (win) {
  'use strict';

  const PHONE_W = 375, PHONE_H = 812, DRAWER_H = 768 - 16;   // the drawer is inset 8px top and bottom
  const LABELS = { files: 'Files and errors', fonts: 'Fonts', overflow: 'Fits 375', drawer: 'Drawer and pill', www: 'No specifics on www', nudge: 'Nudge height' };
  const ORDER = Object.keys(LABELS);
  const pass = (detail) => ({ ok: true, detail: detail || '' });
  const fail = (detail) => ({ ok: false, detail });
  const skip = (detail) => ({ ok: true, skipped: true, detail });
  const uniq = (a) => [...new Set(a)];

  /* --- What the page said while loading: recorded from the moment this file runs --- */
  const heard = { errors: [], missing: [] };
  const short = (u) => {
    try { const x = new URL(u, win.location.href); return x.origin === win.location.origin ? x.pathname.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '') : x.host + x.pathname; } catch (e) { return String(u); }
  };
  const text = (v) => (v instanceof Error ? v.message : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch (e) { return String(v); } })());
  if (win) {
    const original = win.console.error;
    win.console.error = function (...args) {
      heard.errors.push(args.map(text).join(' ').slice(0, 240));
      return original.apply(this, args);
    };
    win.addEventListener('error', (e) => {
      const t = e.target;
      if (t && t !== win && (t.src || t.href)) heard.missing.push(short(t.src || t.href));
      else heard.errors.push((e.message || 'Uncaught error') + (e.filename ? ` (${short(e.filename)}:${e.lineno})` : ''));
    }, true);
    win.addEventListener('unhandledrejection', (e) => heard.errors.push('Unhandled rejection: ' + text(e.reason).slice(0, 200)));
  }

  /* --- 1. files --- */
  function files() {
    const doc = win.document;
    const missing = heard.missing.slice();
    // A 404 on a font or a stylesheet @import fires no element event; Chromium reports it here.
    for (const r of win.performance.getEntriesByType('resource')) if (r.responseStatus >= 400) missing.push(short(r.name));
    if (!win.getComputedStyle(doc.documentElement).getPropertyValue('--primary').trim()) missing.push('colors_and_type.css (no tokens on the page)');
    const errors = uniq(heard.errors);
    const out = [];
    for (let i = missing.length - 1; i >= 0; i--) if (/\.woff2?$/.test(missing[i])) missing.splice(i, 1);   // the fonts check names these
    if (missing.length) out.push(`missing ${uniq(missing).join(', ')}`);
    if (errors.length) out.push(`${errors.length} console error${errors.length > 1 ? 's' : ''}: ${errors.slice(0, 2).join(' · ')}`);
    return out.length ? fail(out.join('; ')) : pass();
  }

  /* --- 2. fonts --- */
  const famOf = (s) => String(s).split(',')[0].trim().replace(/^["']|["']$/g, '');
  const range = (w) => {
    const n = String(w).replace('normal', '400').replace('bold', '700').split(/\s+/).map(Number);
    return [n[0], n[1] == null ? n[0] : n[1]];
  };
  async function fonts(root) {
    const doc = win.document;
    if (!doc.fonts) return skip('This browser has no font loading API');
    const declared = [...doc.fonts];
    if (!declared.length) return skip('The page declares no fonts');
    const used = new Map();   // "family|weight|style" → a sample element
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(), i = 0; n && i < 4000; n = walker.nextNode(), i++) {
      if (!n.nodeValue.trim() || !n.parentElement || n.parentElement.closest('.demo-pill, .demo-drawer')) continue;
      const cs = win.getComputedStyle(n.parentElement);
      const key = `${famOf(cs.fontFamily)}|${cs.fontWeight}|${cs.fontStyle}`;
      if (!used.has(key)) used.set(key, n.parentElement);
    }
    const bad = [];
    for (const key of used.keys()) {
      const [fam, weight, style] = key.split('|');
      const faces = declared.filter((f) => famOf(f.family) === fam);
      if (!faces.length) continue;     // not a face this page ships (a system font, or a family production lacks locally)
      try { await doc.fonts.load(`${style} ${weight} 16px "${fam}"`); } catch (e) { /* the status below says why */ }
      const w = Number(weight);
      const match = faces.filter((f) => { const [a, b] = range(f.weight); return w >= a && w <= b && (f.style === style || f.style === 'normal'); });
      const pool = match.length ? match : faces;
      if (!pool.some((f) => f.status === 'loaded')) bad.push(`${fam} ${weight}${style === 'italic' ? ' italic' : ''}`);
    }
    if (!bad.length) return pass();
    const gone = uniq(heard.missing.concat(win.performance.getEntriesByType('resource').filter((r) => r.responseStatus >= 400).map((r) => short(r.name))).filter((u) => /\.woff2?$/.test(u)));
    const why = win.location.protocol === 'file:' ? ' (opened via file://; serve it)' : gone.length ? ` (missing ${gone.join(', ')})` : ' (a file in fonts/ is missing or blocked)';
    return fail(`fell back: ${uniq(bad).join(', ')}${why}`);
  }

  /* --- The phone layout: the live frame when it's on Phone, else a copy laid out at 375, off screen --- */
  function atPhone(root, fn) {
    const doc = win.document;
    if (!root.classList.contains('dk-vp')) {
      return win.innerWidth <= PHONE_W + 25 ? fn(root, true) : null;
    }
    if (root.closest('[data-device="phone"]')) return fn(root, false);
    const host = doc.createElement('div');
    host.className = 'dk-device';
    host.dataset.device = 'phone';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:absolute;left:-30000px;top:0;width:${PHONE_W}px;padding:0;min-height:0;visibility:hidden;pointer-events:none;contain:layout`;
    const copy = root.cloneNode(true);
    copy.style.width = PHONE_W + 'px';
    copy.style.zoom = '';
    copy.style.minHeight = '0';
    copy.style.margin = '0';
    // A copied radio with the page's name would join its group and uncheck the real one.
    copy.querySelectorAll('input[type="radio"]').forEach((r) => r.removeAttribute('name'));
    host.appendChild(copy);
    doc.body.appendChild(host);
    try { return fn(copy, false); } finally { host.remove(); }
  }
  const describe = (el) => {
    const cls = [...el.classList].filter((c) => !c.startsWith('demo-')).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };

  /* --- 3. overflow --- */
  function overflow(root) {
    const res = atPhone(root, (vp, whole) => {
      const box = whole ? { left: 0, right: win.innerWidth } : vp.getBoundingClientRect();
      const edge = box.left + PHONE_W + 1;
      const clipped = (el) => {
        for (let p = el.parentElement; p && p !== vp; p = p.parentElement) {
          const o = win.getComputedStyle(p).overflowX;
          if (o !== 'visible' && p.getBoundingClientRect().right <= edge) return true;
        }
        return false;
      };
      const over = [];
      for (const el of vp.querySelectorAll('*')) {
        if (!el.getClientRects().length) continue;
        const cs = win.getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.right > edge && r.width > 0 && !clipped(el) && !over.some((o) => o.contains(el))) over.push(el);
      }
      if (over.length) {
        const el = over[0], r = el.getBoundingClientRect();
        return fail(`${describe(el)} is ${Math.round(r.width)}px wide and runs ${Math.round(r.right - box.left - PHONE_W)}px past the 375 frame` + (over.length > 1 ? ` (${over.length - 1} more)` : ''));
      }
      const wide = vp.scrollWidth;
      return wide > PHONE_W + 1 ? fail(`the page is ${wide}px wide at 375`) : pass();
    });
    return res || skip('Not a kit page and the window is wider than 375');
  }

  /* --- 4. drawer --- */
  const HOVER_SAFE = /^(color|background|border-(top|right|bottom|left)-color|border-color|outline|box-shadow|opacity|text-decoration|text-underline|cursor|fill|stroke|filter|transition|caret-color|accent-color)/;
  function hoverRules() {
    const moves = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; }
        if (!r.selectorText || !r.selectorText.includes(':hover') || !r.selectorText.includes('.demo-')) continue;
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style[i];
          if (!HOVER_SAFE.test(p)) moves.push(`${r.selectorText.split(',')[0].trim()} sets ${p}`);
        }
      }
    };
    for (const s of win.document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* another origin's sheet */ } }
    return uniq(moves);
  }
  // The pill is fixed to the window; anything the page docks (fixed or sticky) must sit clear of it.
  function pillCovers(root) {
    const pill = win.document.querySelector('.demo-pill');
    if (!pill || !pill.getClientRects().length) return null;
    const p = pill.getBoundingClientRect();
    for (const el of root.querySelectorAll('*')) {
      const pos = win.getComputedStyle(el).position;
      if ((pos !== 'fixed' && pos !== 'sticky') || !el.getClientRects().length || el.classList.contains('dk-help')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top) return el;
    }
    return null;
  }
  function drawer(tabsFn, root) {
    const doc = win.document;
    const out = [];
    const covered = pillCovers(root);
    if (covered) out.push(`the pill covers ${covered.querySelector('[class]') && covered.classList.contains('slot-nudge') ? 'the nudge' : describe(covered)}`);
    const tabs = typeof tabsFn === 'function' ? tabsFn() : null;
    if (tabs && tabs.length) {
      const host = doc.createElement('div');
      host.className = 'demo-drawer';
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = `top:-30000px;bottom:auto;height:${DRAWER_H}px;visibility:hidden;pointer-events:none`;
      doc.body.appendChild(host);
      try {
        for (const t of tabs) {
          host.innerHTML = t.html;
          const body = host.querySelector('.demo-body');
          if (!body) continue;
          const extra = body.scrollHeight - body.clientHeight;
          if (extra > 1) out.push(`${t.label} is ${((DRAWER_H + extra) / DRAWER_H).toFixed(1)} screens tall at 768`);
        }
      } finally { host.remove(); }
    }
    const moves = hoverRules();
    if (moves.length) out.push(`hover moves things: ${moves.slice(0, 2).join('; ')}${moves.length > 2 ? ` (${moves.length - 2} more)` : ''}`);
    if (!tabs && !moves.length && !covered) return skip('No kit drawer to measure');
    return out.length ? fail(out.join('; ')) : pass();
  }

  /* --- 5. www --- */
  const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const SPECIFICS = [
    ['card', /\b(?:Visa|Mastercard|MasterCard|Amex|American Express|Discover)\b|[•*·]{2,}\s?\d{2,4}|\bending in \d{4}\b/],
    ['amount', /\$\s?\d[\d,]*(?:\.\d\d)?|\b\d+(?:\.\d\d)?\s?(?:USD|dollars)\b/],
    ['date', new RegExp(`\\b${MONTH}\\.? \\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b|\\b(?:in|within) \\d+ (?:days?|weeks?|months?)\\b|\\b\\d+ days? (?:left|remaining)\\b`)],
    ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ];
  // The article's own parts (hero, dateline, body) are editorial, not about the reader.
  const EDITORIAL = '.www-hero, .www-lead, .www-utility, .www-body, .demo-note, .demo-box, .demo-notbuilt, [data-dk-check-ignore]';
  function www(root, surface) {
    if ((surface || root.dataset.chrome) !== 'www') return skip('Not a theatlantic.com page');
    const doc = win.document;
    const found = [];
    const scopes = root.classList.contains('dk-vp') ? root.querySelectorAll('[data-dk-promo], .dk-body') : [root];
    for (const scope of scopes) {
      const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || el.closest(EDITORIAL) || !n.nodeValue.trim()) continue;
        for (const [kind, re] of SPECIFICS) {
          const m = n.nodeValue.match(re);
          if (m) {
            const where = el.closest('.slot-nudge, .slot-gate, .slot-promo, [data-dk-promo], [data-part]');
            found.push(`${kind} “${m[0].trim()}”${where ? ` in ${where.dataset.part || describe(where)}` : ''}`);
          }
        }
      }
    }
    return found.length ? fail(`subscriber specifics on www: ${uniq(found).slice(0, 3).join(', ')}`) : pass();
  }

  /* --- 6. nudge --- */
  function nudge(root) {
    const cap = PHONE_H / 4;
    if (!root.querySelector('.slot-nudge > *, [data-part="nudge"]')) return skip('No nudge on this screen');
    const res = atPhone(root, (vp) => {
      const tall = [...vp.querySelectorAll('.slot-nudge > *, [data-part="nudge"]')]
        .filter((el) => el.getClientRects().length).map((el) => el.scrollHeight).filter((h) => h > cap + 1);
      return tall.length ? fail(`the nudge needs ${Math.max(...tall)}px at 375; a quarter of the phone screen is ${cap}px`) : pass();
    });
    return res || skip('Not a kit page and the window is wider than 375');
  }

  /* --- run --- */
  async function run(opts) {
    const o = opts || {};
    const doc = win.document;
    const root = o.root || doc.querySelector('.dk-vp') || doc.body;
    const current = win.DemoKit && win.DemoKit.current;
    const tabs = o.tabs || (current && current.panelTabs);
    const only = o.only ? new Set(o.only) : null;
    const jobs = {
      files: () => files(),
      fonts: () => fonts(root),
      overflow: () => overflow(root),
      drawer: () => drawer(tabs, root),
      www: () => www(root, o.surface),
      nudge: () => nudge(root),
    };
    const results = [];
    for (const id of ORDER) {
      if (only && !only.has(id)) continue;
      let r;
      try { r = await jobs[id](); } catch (e) { r = fail(`the check itself broke: ${text(e)}`); }
      results.push(Object.assign({ id, label: LABELS[id], skipped: false }, r));
    }
    return results;
  }

  /* --- Headless (Node + Playwright). Nothing calls it yet; a page-walking checker would. --- */
  const FILE = typeof __filename !== 'undefined' ? __filename : null;
  async function headless(page, opts) {
    if (!(await page.evaluate(() => !!window.DemoChecks))) await page.addScriptTag({ path: FILE });
    return page.evaluate((o) => window.DemoChecks.run(o), opts || {});
  }

  return { version: '1.0.0', labels: LABELS, run, headless, heard };
});
