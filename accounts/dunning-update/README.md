# Dunning: Fix Your Payment

Sign-in-free payment update for subscribers whose renewal failed: the dunning email opens a
page that takes Apple Pay, Google Pay, PayPal or a card, whatever failed before.

- Entry point: `index.html` (presenter controls behind the "Demo" button, bottom left)
- Visual only: nothing is charged and no payment provider is called
- All people, cards and emails are made up
- Real fonts load when served over http (GitHub Pages or `python3 -m http.server`)
