# Auto-Renewal Reminder

A reminder for subscribers who turned auto-renewal off. It appears when they open a story and keeps
coming back until auto-renewal is on. One reminder, three versions:

- **Desktop web**: a pop-up over the article on theatlantic.com. `index.html#/article`
- **Mobile web**: the same site in a phone's browser. `index.html#/mweb?device=phone`
- **Mobile app**: a bottom sheet over the article screen, reached from the Today feed. `index.html#/app?device=phone`

One tap on "Turn On Auto-Renewal" turns it on in place. "Not now" sets it aside until the next story.

- Entry point: `index.html`. The **Tours & screens** button (bottom left) opens the presenter drawer.
  **This screen** switches between the three versions and has Restart (auto-renewal back to off, reminder due again)
- A link can start a tour directly: `#/article?dk-tour=site-on`, `site-later`, `site-fail`,
  `#/mweb?dk-tour=mweb-on`, `mweb-later`, `#/app?dk-tour=app-on`, `app-later`, `app-apple`
- Two dials: when the reminder comes back after "Not now" (next story or next visit), and who bills the
  app subscriber (The Atlantic, or Apple, where the button opens Apple's own screen)
- Mobile web and the mobile app sit in an iPhone-sized frame (393 x 852), scaled to fit the window
- Stories are real, published 2026-11-12; body text is placeholder
- Visual only: nothing is charged. Everyone in it is made up

Single-file prototype on the article shell, kit 2.2.0. Chrome harvested from production on 2026-11-10.
App screens are drawn from the app's code (theme, feed, article bar, button and sheet styles); its logo
and icons are in `app-icons.js`.

Run: proto serve   →   http://localhost:8792/atlantic-prototypes/accounts/autorenew-reminder/
