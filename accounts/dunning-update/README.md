# Dunning: Fix Your Payment

Sign-in-free payment update for subscribers whose renewal failed: the dunning email opens a
page on the accounts site that charges the renewal, whatever failed before.

- Entry point: `index.html`. One presenter drawer: the **Tours & screens** button (bottom left)
  opens the guided tours (start with "Start here"), **This screen** (the controls for the page
  you're on), Screens, and Reset. A link can start a tour directly: `index.html#/?dk-tour=one-tap`
- Two versions, switched from This screen on any screen ("Version"): **Today** (the current
  email, sign-in, Subscription page and card form) and **Proposed** (the sign-in-free page)
- Four entry points ("What happened" × "Starts from"): the email or a callout that rises over an
  article, for a **payment failed** or a **card expiring** before the renewal (nothing charged; the
  page saves a card)
- Two layouts, switched from This screen on the payment page ("Payment page"): **All methods**
  (one list: PayPal, Apple Pay, Google Pay, then Card, open by default; one button that follows the pick) or **Card only** (one clean card form, the
  hosted-update-page pattern)
- Opens on desktop; "Opened on" switches to a phone-width frame
- Visual only: nothing is charged and no payment provider is called
- All people, cards and emails are made up
- Real fonts load when served over http (GitHub Pages or `proto serve`)
