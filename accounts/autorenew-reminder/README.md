# Auto-Renewal Reminder

A reminder for subscribers who turned auto-renewal off. It appears when they open a story and keeps
coming back until auto-renewal is on. One reminder, two surfaces:

- **On theatlantic.com**: a pop-up over the article. `index.html#/article`
- **In the app**: a bottom sheet over the article screen, reached from the Today feed. `index.html#/app?device=phone`

One tap on "Turn On Auto-Renewal" turns it on in place. "Not now" sets it aside until the next story.

- Entry point: `index.html`. The **Tours & screens** button (bottom left) opens the presenter drawer:
  This screen, Tours and Screens. A link can start a tour directly:
  `#/article?dk-tour=site-on`, `site-later`, `site-fail`, `#/app?dk-tour=app-on`, `app-later`, `app-apple`
- Two dials in the drawer: when the reminder comes back after "Not now" (next story or next visit),
  and who bills the app subscriber (The Atlantic, or Apple, where the button opens Apple's own screen)
- The site opens on desktop; "Opened on" switches to a phone-width frame. The app screens are always phone-width
- Stories are real, published 2026-11-12; body text is placeholder
- Visual only: nothing is charged. Everyone in it is made up

Single-file prototype on the article shell, kit 2.2.0. Chrome harvested from production on 2026-11-10.
App screens are drawn from the app's code (theme, feed, article bar, button and sheet styles); its logo
and icons are in `app-icons.js`.

Run: proto serve   →   http://localhost:8792/atlantic-prototypes/accounts/autorenew-reminder/
