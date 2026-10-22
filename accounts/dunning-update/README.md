# Dunning: Fix Your Payment

Sign-in-free payment update for subscribers whose renewal failed: the dunning email opens a
page on the accounts site that charges the renewal, whatever failed before.

- Entry point: `index.html` (presenter controls behind the "Demo" button, bottom left)
- Two layouts, switched from the side card ("Payment page"): **All methods** (PayPal, Apple Pay,
  Google Pay, then a card) or **Card only** (one clean card form, the hosted-update-page pattern)
- Visual only: nothing is charged and no payment provider is called
- All people, cards and emails are made up
- Real fonts load when served over http (GitHub Pages or `python3 -m http.server`)
