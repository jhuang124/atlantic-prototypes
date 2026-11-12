/* The fixture bank, generated from fixtures.json by build.mjs. Don't edit: edit fixtures.json. */
window.ATL_FIXTURES = {
 "about": "The fixture bank: six made-up people every prototype shares, so a build never invents a subscriber. Never a real person. Dates are whole days from the anchor, the build's today (negative is the past); card expiry is whole months. No prices: the kit takes them from facts.js, the React starter from the repo's plans fixture. Edit this file, then run `node kit/fixtures/build.mjs`, which writes kit/fixtures/fixtures.js and react/backend/defaults.json.",
 "clock": [
  {
   "id": "as-written",
   "label": "As written",
   "before": null,
   "note": "The dates as the fixture writes them."
  },
  {
   "id": "30-days",
   "label": "Ends in 30 days",
   "before": 30,
   "note": "Today moves to 30 days before the current term ends."
  },
  {
   "id": "3-days",
   "label": "Ends in 3 days",
   "before": 3,
   "note": "Today moves to 3 days before the current term ends."
  },
  {
   "id": "ended",
   "label": "Ended yesterday",
   "before": -1,
   "note": "Today moves to the day after the term ends: the renewal has run, or access has ended."
  }
 ],
 "personas": {
  "digital": {
   "label": "Typical digital",
   "purpose": "Digital, renews automatically on the Visa on file.",
   "user": {
    "first_name": "Jane",
    "last_name": "Morrison",
    "email": "jane.morrison@example.com",
    "account": true,
    "address": {
     "line1": "123 Atlantic Ave",
     "line2": "",
     "city": "Brooklyn",
     "state": "NY",
     "zip": "11201",
     "country": "US"
    }
   },
   "subscription": {
    "plan": "digital",
    "status": "active",
    "purchase": "standard",
    "autorenew": true,
    "started": -253,
    "ends": 112
   },
   "payment": {
    "brand": "Visa",
    "last4": "4242",
    "expires": 17
   }
  },
  "print": {
   "label": "Print and digital",
   "purpose": "Print & Digital with a mailing address; renews automatically on a Mastercard.",
   "user": {
    "first_name": "Daniel",
    "last_name": "Okafor",
    "email": "daniel.okafor@example.com",
    "account": true,
    "address": {
     "line1": "48 Elm Street",
     "line2": "",
     "city": "Evanston",
     "state": "IL",
     "zip": "60201",
     "country": "US"
    }
   },
   "subscription": {
    "plan": "print",
    "status": "active",
    "purchase": "standard",
    "autorenew": true,
    "started": -40,
    "ends": 325
   },
   "payment": {
    "brand": "Mastercard",
    "last4": "4444",
    "expires": 30
   }
  },
  "autorenew-off": {
   "label": "Auto-renew off",
   "purpose": "Digital with auto-renew turned off: access ends in 30 days unless she turns it back on.",
   "user": {
    "first_name": "Priya",
    "last_name": "Raman",
    "email": "priya.raman@example.com",
    "account": true,
    "address": {
     "line1": "715 Pine Street",
     "line2": "",
     "city": "Seattle",
     "state": "WA",
     "zip": "98101",
     "country": "US"
    }
   },
   "subscription": {
    "plan": "digital",
    "status": "active",
    "purchase": "standard",
    "autorenew": false,
    "started": -335,
    "ends": 30
   },
   "payment": {
    "brand": "American Express",
    "last4": "0005",
    "expires": 22
   }
  },
  "gift-recipient": {
   "label": "Gift recipient",
   "purpose": "A year of Digital given by someone else: no card on file, nothing renews.",
   "user": {
    "first_name": "Sam",
    "last_name": "Whitfield",
    "email": "sam.whitfield@example.com",
    "account": true,
    "address": {
     "line1": "9 Harbor Road",
     "line2": "",
     "city": "Portland",
     "state": "ME",
     "zip": "04101",
     "country": "US"
    }
   },
   "subscription": {
    "plan": "digital",
    "status": "active",
    "purchase": "gift",
    "autorenew": false,
    "started": -65,
    "ends": 300,
    "gift_from": "Ellen Whitfield"
   },
   "payment": null
  },
  "failing-card": {
   "label": "Failing card",
   "purpose": "Digital renewing in 7 days on a Visa that will decline; set the clock past the renewal to see it fail.",
   "user": {
    "first_name": "Marcus",
    "last_name": "Bell",
    "email": "marcus.bell@example.com",
    "account": true,
    "address": {
     "line1": "2210 Maple Avenue",
     "line2": "",
     "city": "Austin",
     "state": "TX",
     "zip": "78704",
     "country": "US"
    }
   },
   "subscription": {
    "plan": "digital",
    "status": "active",
    "purchase": "standard",
    "autorenew": true,
    "started": -358,
    "ends": 7
   },
   "payment": {
    "brand": "Visa",
    "last4": "0002",
    "expires": 5,
    "declines": true
   }
  },
  "no-account": {
   "label": "No account",
   "purpose": "A reader with no account: signed out, nothing on file. The email is what she types at checkout.",
   "user": {
    "first_name": "Elena",
    "last_name": "Ruiz",
    "email": "elena.ruiz@example.com",
    "account": false,
    "address": {
     "line1": "400 Cedar Lane",
     "line2": "",
     "city": "Denver",
     "state": "CO",
     "zip": "80203",
     "country": "US"
    }
   },
   "subscription": null,
   "payment": null
  }
 },
 "newsletters": {
  "lists": {
   "subscribed": [
    {
     "name": "The Atlantic Daily",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 1,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": true
    },
    {
     "name": "Politics and Policy Daily",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 2,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": true
    },
    {
     "name": "The Atlantic Family",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 3,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": true
    }
   ],
   "suggested": [
    {
     "name": "Big Tech Story",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 4,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": false
    },
    {
     "name": "The Atlantic Books",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 5,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": false
    },
    {
     "name": "This Week on The Atlantic",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 6,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": false
    },
    {
     "name": "Occasional Updates from Our Partners",
     "group": "Daily newsletters",
     "description": "Get our editors’ guide to what matters in the world, delivered to your inbox every weekday.",
     "id": 7,
     "preview_url": "https://www.theatlantic.com/newsletters/daily/",
     "subscribed": false
    }
   ]
  }
 },
 "previewModification": {
  "plans": [
   {
    "product_type": "print",
    "subtotal": -909,
    "shipping_subtotal": 0,
    "renewal_amount": 4999,
    "tax": 0
   },
   {
    "product_type": "premium",
    "subtotal": 4549,
    "shipping_subtotal": 0,
    "renewal_amount": 10000,
    "tax": 546
   }
  ]
 }
};
