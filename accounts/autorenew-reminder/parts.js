/* ==========================================================================
   parts.js 1.0.0
   The compound parts a subscriber-flow prototype keeps needing, each a function from data to
   markup: DemoKit.parts.<name>(…) (also kit.parts). Styles are in demo-kit.css (section 4b) and
   use only colors_and_type.css. kit/COMPONENTS.md lists every part: when to use it, the snippet,
   and its anchor (production first; an approved prototype only where production has none).
   Text arguments are escaped; an argument whose name ends in Html is inserted as is.
   Load after demo-kit.js.
   ========================================================================== */
(function () {
  'use strict';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const notBuilt = (what) => '#/not-built?what=' + encodeURIComponent(what);
  const pad2 = (n) => String(n).padStart(2, '0');
  // Production's checkmark (assets/checkmark.svg), used by the banner and the cart
  const CHECK_PATH = 'M9.555.424A.562.562 0 0 0 9.072.3a.562.562 0 0 0-.369.335l-4.768 8.39-2.441-1.95a.562.562 0 0 0-.483-.123.562.562 0 0 0-.369.334L.068 8.611a.958.958 0 0 0-.037.599c.05.204.164.392.314.511l3.003 2.392 1.128.898c.15.12.326.162.483.123a.562.562 0 0 0 .369-.335l.574-1.323 5.058-9.043a.958.958 0 0 0 .037-.6.958.958 0 0 0-.314-.51l-1.128-.9z';
  const CHECK = `<svg class="success-check" viewBox="0 0 11 14" aria-hidden="true"><path d="${CHECK_PATH}" fill="currentColor"/></svg>`;

  /* --- theatlantic.com --------------------------------------------------------------------- */

  // One action contract for every part: { label, href } is a link; { label, act } runs a kit action, and with
  // fail: 'copy' it runs as a save through the error arm. style: 'link' draws it as a text link (an outcome).
  function action(a, cls) {
    if (!a) return '';
    const c = a.style === 'link' ? 'link' : cls;
    return a.act
      ? `<button type="button" class="${c}" data-act="${esc(a.act)}"${a.arg != null ? ` data-arg="${esc(a.arg)}"` : ''}${a.fail ? ` data-fail="${esc(a.fail)}"` : ''}>${esc(a.label)}</button>`
      : `<a class="${c}" href="${esc(a.href || notBuilt(a.label))}">${esc(a.label)}</a>`;
  }

  // The house nudge bar (approved dunning callout, 11-02). Docks to the bottom of an article in .slot-nudge.
  // On www, general status only: no card, amount, date or email (checks.js tests it). A failed save shows in its error slot.
  function nudge({ headline, headlineHtml = '', body = '', action: a = { label: 'Subscribe', href: notBuilt('The products page') }, close = true } = {}) {
    const x = close === false ? '' : `<button class="nudge-x" type="button" ${typeof close === 'string' ? close : 'data-dk-nudge-close'} aria-label="Close"></button>`;
    return `<aside class="nudge" data-part="nudge" data-dk-scope aria-label="From The Atlantic">${x}
      <div class="nudge-in"><span class="nudge-mark" aria-hidden="true">A</span>
        <div class="nudge-txt"><div class="nudge-error" data-dk-error-slot></div><h2 class="type-nudge-hed">${headlineHtml || esc(headline)}</h2>${body ? `<p class="type-nudge-body">${esc(body)}</p>` : ''}</div>
        ${action(a, 'nudge-btn type-nudge-btn')}</div></aside>`;
  }

  // The paywall gate: the story stops and the same nudge parts stack in its place. Production serves
  // the gate from Zephr (no markup in code), so this follows the approved nudge, stacked as its pop-up was.
  function gate({ headlineHtml = '', headline = 'You’ve reached your limit of free articles.', body = 'Subscribe for unlimited access.',
    action: a = { label: 'Subscribe', href: notBuilt('The products page') }, signIn = notBuilt('Sign in') } = {}) {
    return `<div class="slot-gate" data-part="gate"><div class="gate">
      <span class="nudge-mark" aria-hidden="true">A</span>
      <h2 class="type-nudge-hed">${headlineHtml || esc(headline)}</h2>${body ? `<p class="type-nudge-body">${esc(body)}</p>` : ''}
      ${action(a, 'nudge-btn type-nudge-btn')}
      ${signIn ? `<p class="gate-signin type-list-note">Already a subscriber? <a href="${esc(signIn)}">Sign in</a></p>` : ''}</div></div>`;
  }

  /* --- Account pages ----------------------------------------------------------------------- */

  // An inline notice on an account page: production's AutorenewPrompt anatomy (title, a dot, the line,
  // the action pinned top-right on desktop). tone 'prompt' is production's cream; 'info' (pastel blue)
  // and 'alert' (pastel red) are Proposed: production has no tinted notice in either.
  function callout({ tone = 'prompt', title = '', body = '', bodyHtml = '', action: a = null } = {}) {
    const act = action(a, 'btn callout-act');
    return `<section class="callout" data-part="callout" data-tone="${esc(tone)}"><div class="callout-in">
      ${title ? `<h2 class="type-card-title">${esc(title)}</h2>` : ''}
      <div class="callout-row"><span class="callout-dot" aria-hidden="true"></span><p class="callout-body type-notice">${bodyHtml || esc(body)}</p>${act}</div>
    </div></section>`;
  }

  const BRAND = { Visa: 'visa', MasterCard: 'mastercard', Mastercard: 'mastercard', 'American Express': 'amex', Amex: 'amex', Discover: 'discover', 'Diners Club': 'diners', PayPal: 'paypal', Paypal: 'paypal', 'Apple Pay': 'apple-pay', ApplePay: 'apple-pay' };
  const brandIcon = (brand) => BRAND[brand]
    ? `<img class="brand-icon${BRAND[brand] === 'apple-pay' ? ' is-applepay' : ''}" src="parts-assets/${BRAND[brand]}.png" alt="${esc(brand)}">` : '';

  // The card on file: production's Billing Information card (BillingInfo.js). Takes a persona's payment
  // (DemoKit.persona(id).payment) and the next billing date. No card: production's empty line.
  function savedPayment({ payment = null, nextBilling = '', add = true, title = 'Billing Information' } = {}) {
    const field = (label, valueHtml) => `<div class="saved-field"><div class="type-field-label">${esc(label)}</div><div class="saved-value type-field-value">${valueHtml}</div></div>`;
    const body = payment
      ? field('Payment Method', `${brandIcon(payment.brand)}<span>Ending in ${esc(payment.last4)}</span>`)
        + field('Card Expiration', `${pad2(payment.expMonth)}/${esc(payment.expYear)}`)
        + (nextBilling ? field('Next Billing Date', esc(nextBilling)) : '')
      : `<p class="type-notice">We don’t have a credit card on file for you.</p>`;
    return `<section class="saved" data-part="saved-payment"><div class="saved-in">
      <div class="saved-head"><h2 class="type-card-title">${esc(title)}</h2>
        ${add ? `<a class="btn btn-secondary saved-add" href="${notBuilt('Add a New Payment Method')}"><span aria-hidden="true">+ </span>Add a New Payment Method</a>` : ''}</div>
      <div class="saved-fields">${body}</div></div></section>`;
  }

  // The save confirmation: production's SuccessMessage, top-center, green border and glow. kit.success(text)
  // shows it the way production does (slides in, gone after 3 seconds); this returns the markup.
  function successBanner(text = 'Subscription successfully updated') {
    return `<div class="success" data-part="success-banner" role="status">${CHECK}<p class="type-success">${esc(text)}</p></div>`;
  }

  /* --- Checkout ---------------------------------------------------------------------------- */

  // The plan card beside checkout (PurchaseCart): plan name and up to three benefits from facts.js.
  const BENEFITS = {   // components/BenefitList.tsx names, three per plan as the cart shows them
    digital: ['Unlimited access on any device', 'The Atlantic app for iOS and Android', 'Narrated stories and podcasts'],
    print: ['Unlimited access on any device', '12 magazine issues delivered to your door', 'Complimentary tote bag'],
    premium: ['Unlimited, ad-free access on any device', '12 magazine issues delivered to your door', 'Free digital gift subscription'],
  };
  const planKey = (plan) => (String(plan.planId || '').match(/^plan_([a-z]+)_/) || [])[1] || 'digital';
  function cart({ plan = {}, benefits = BENEFITS[planKey(plan)] || [] } = {}) {
    return `<div class="cart" data-part="cart"><p class="type-cart-name">${esc(plan.name || '')} Subscription</p>
      <ul class="cart-list type-summary">${benefits.map((b) => `<li><svg class="cart-check" viewBox="0 0 11 14" preserveAspectRatio="none" aria-hidden="true"><path d="${CHECK_PATH}"/></svg><span>${esc(b)}</span></li>`).join('')}</ul></div>`;
  }

  // Order Summary (OrderSummary.js): beside the form at desktop, inside it on a phone (inline: true).
  function orderSummary({ plan = {}, tax = '––', due = null, note = 'Tax is based on your billing address and will be calculated before your purchase is complete.', inline = false } = {}) {
    const money = plan.price ? `$${plan.price}` : '';
    return `<div class="summary${inline ? ' summary-inline' : ''}" data-part="order-summary"><p class="type-summary-title">Order Summary</p><hr>
      <div class="summary-row type-summary"><span>Subtotal</span><span>${esc(money)}</span></div>
      <div class="summary-row type-summary"><span>Estimated tax</span><span>${esc(tax)}</span></div><hr class="summary-hr-bottom">
      <div class="summary-due type-summary-due"><span>Due today</span><span>${esc(due == null ? money : due)}</span></div>
      ${note ? `<p class="summary-note type-summary">${esc(note)}</p>` : ''}</div>`;
  }

  // Automatic Renewal (AutomaticRenewal.tsx + CancellationPolicy.js): production's annual terms by default.
  // disabled: a signed-out buyer. optIn: the checkbox variant (AutomaticRenewalOptInBox).
  const TERMS = (links) => `<h3 class="renewal-head type-renewal-head">Automatic Renewal</h3>By proceeding, you agree that your subscription will renew on an annual basis until you cancel. Before each renewal, you will receive a notification of your term and rate then in effect. Visit your <a href="${links.account}">account page</a>, <a href="${links.email}">email</a>, or call (855) 940-0585 to cancel. Cancellations take effect at the end of your current billing period. Please read our full terms <a href="${links.terms}">here</a>.`;
  function renewal({ termsHtml = null, disabled = false, optIn = false, optInLabel = 'Enroll in automatic renewal.' } = {}) {
    const text = termsHtml || TERMS({ account: notBuilt('Account page'), email: notBuilt('Email Customer Care'), terms: notBuilt('Terms of sale') });
    return `<div class="renewal${disabled ? ' is-disabled' : ''}" data-part="renewal"><div class="type-checkout-fineprint">
      ${optIn ? `<label class="renewal-optin"><input type="checkbox"${disabled ? ' disabled' : ''}><span>${esc(optInLabel)}</span></label>` : text}</div></div>`;
  }

  // The wallet stack (CreditCardFormStripe.js CardBranch): PayPal, then the express wallets one per row,
  // then "Or" above the card form. All 48 tall. The buttons themselves are PayPal's and Stripe's iframes,
  // drawn here: PayPal's black button (style.color "black" in Paypal.js), Stripe's default black wallets.
  const MARK = {
    apple_pay: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true" style="margin-top:-3px"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
    google_pay: '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
    paypal: '<span class="pp"><b>Pay</b><i>Pal</i></span>',
    card: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="1.5"/><path d="M2.5 9.5h19"/></svg>',
  };
  const WALLET_LABEL = { paypal: 'PayPal', apple_pay: 'Apple Pay', google_pay: 'Google Pay', card: 'Card' };
  function wallets({ paypal = true, express = ['apple_pay', 'google_pay'], divider = true, act = null, fail = null } = {}) {
    const inner = (w) => `${MARK[w]}${w === 'paypal' ? '' : '<span>Pay</span>'}`;
    const btn = (w) => act
      ? `<button class="wallet is-${w.replace('_', '-')} type-wallet" type="button" data-act="${esc(act)}" data-arg="${w}"${fail ? ` data-fail="${esc(fail)}"` : ''} aria-label="Pay with ${WALLET_LABEL[w]}">${inner(w)}</button>`
      : `<a class="wallet is-${w.replace('_', '-')} type-wallet" href="${notBuilt(`Pay with ${WALLET_LABEL[w]}`)}" aria-label="Pay with ${WALLET_LABEL[w]}">${inner(w)}</a>`;
    return `<div class="wallets" data-part="wallets">
      ${paypal ? `<div class="wallets-paypal">${btn('paypal')}</div>` : ''}
      ${express.length ? `<div class="wallets-express">${express.map(btn).join('')}</div>` : ''}
      ${divider ? '<div class="divider type-checkout-divider wallets-or">Or</div>' : ''}</div>`;
  }

  // One list of choices with the picked row open (approved dunning payment-method list, 10-30 and 11-01).
  // options: [{ value, label, tile: 'paypal' | 'apple_pay' | 'google_pay' | 'card' | null, note, bodyHtml }].
  // The kit opens the picked row on change. Production's own lists are simpler (COMPONENTS.md).
  function radioList({ name = 'pick', legend = 'Payment method', value = null, options = [] } = {}) {
    const on = value != null ? value : (options[0] || {}).value;
    const tile = (t) => (t && MARK[t] ? `<span class="pm-tile${t === 'apple_pay' ? ' is-dark' : ''}${t === 'card' ? ' is-card' : ''} type-tile" aria-hidden="true">${MARK[t]}${t === 'apple_pay' || t === 'google_pay' ? '<span>Pay</span>' : ''}</span>` : '');
    const row = (o) => `<div class="pm-row${o.value === on ? ' is-on' : ''}" data-pm="${esc(o.value)}">
      <label class="pm-head"><input class="pm-radio" type="radio" name="${esc(name)}" value="${esc(o.value)}"${o.value === on ? ' checked' : ''}>${tile(o.tile)}<span class="pm-name type-list-name">${esc(o.label)}</span></label>
      <div class="pm-body"><div class="pm-body-in">${o.bodyHtml ? `<div class="pm-pad">${o.bodyHtml}</div>` : o.note ? `<p class="pm-note type-list-note">${esc(o.note)}</p>` : ''}</div></div></div>`;
    return `<fieldset class="pm-list" data-part="radio-list"><legend class="sr-only">${esc(legend)}</legend>${options.map(row).join('')}</fieldset>`;
  }

  const parts = { nudge, gate, callout, savedPayment, successBanner, cart, orderSummary, renewal, wallets, radioList, brandIcon, benefits: (plan) => BENEFITS[planKey(plan)] || [] };
  window.DemoKit = window.DemoKit || {};
  window.DemoKit.parts = parts;
  if (window.DemoKit.current) window.DemoKit.current.parts = parts;
})();
