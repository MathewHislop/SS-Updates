# Selling the Scheduler/CRM as a Downloadable Product

## The honest tension worth naming first

"Downloadable" and "passive" pull against each other more than they first look like they do, and it's worth being upfront about that before getting into mechanics:

- **Locally-installed software generates real support load**, especially from non-technical small business buyers on hardware and OS versions you don't control. Installation issues, antivirus flagging an unfamiliar installer, "it won't open," questions about basic use — this is the normal experience of selling desktop software to strangers, not a sign something's gone wrong. It's a much higher-touch business than a hosted SaaS you can see into and fix centrally.
- **A single local SQLite file is also a data-loss risk you'll own reputationally** — if a stranger's laptop dies and they never backed up, that's now a one-star review about "losing all my customers," even though it's not really a product bug. Worth having a simple, visible backup story (e.g. "Export to Excel" already exists — that's your safety net; make sure it's promoted as one) before selling this to people you don't know.
- **One-time purchases don't compound.** Every dollar of revenue next month requires a new customer next month — there's no recurring base building underneath you the way a subscription would. That's not a reason not to do it, but "passive income" undersells what this actually is: more like a real, ongoing small product business with lumpier income, not a set-and-forget royalty stream.

None of this rules the idea out — plenty of people run exactly this kind of business successfully — but "simple buy and be sent, passive" is the pitch to the customer, not an accurate description of what running it feels like on your end. Worth going in with that expectation set correctly.

## Buy-and-be-sent mechanics

**Platform: Lemon Squeezy**, not Gumroad or a raw Stripe integration. Reasoning specific to your situation:
- It's a full **Merchant of Record** — it handles VAT, GST, and sales tax collection/remittance across 190+ countries automatically. This matters a lot for "overseas customers" specifically: without an MoR, you're technically on the hook for understanding your own tax obligations in every country a buyer is in, which is the opposite of passive. Gumroad only handles this in *some* jurisdictions, leaving gaps.
- It has **built-in software license key generation and validation** — exactly the mechanic you need for "buy and be sent": someone pays, they're automatically emailed a download link and a license key, no manual step from you.
- Fees run around 5% per transaction with no monthly fee, cheaper than Gumroad's 10%, and it's now Stripe-owned, which is a reasonable stability signal for a platform you're trusting to handle global payments.

**What needs to be true about the software itself before this works smoothly:**
- **A real installer, not a folder of code.** Wrap it with Electron or Tauri (already flagged as an option in the Claude Code handoff) so a buyer double-clicks one file and it installs like normal software — asking a stranger overseas to run `npm install` themselves is not a buy-and-be-sent experience.
- **Code signing.** An unsigned installer trips Windows SmartScreen ("Windows protected your PC — unknown publisher") and macOS Gatekeeper, both of which look exactly like a virus warning to someone who's never heard of you. A Windows code-signing certificate and an Apple Developer account (roughly $100–400/year combined) are close to mandatory once you're selling to strangers rather than people who already trust you — without this, expect a real chunk of buyers to bail at install, assuming it's malware.
- **License key check on first run**, using Lemon Squeezy's license API — enough to stop casual copy-sharing without going overboard on DRM, which mostly just annoys legitimate buyers without stopping anyone determined.

## Marketing, for overseas customers specifically

- **Lead with a real demo video**, not screenshots — this is visual software and strangers need to see it actually work before trusting an unknown solo seller with a purchase. You already have a working AI video pipeline from the Solo Founder OS project (~$0.61/video) — this is a direct reuse of that asset rather than a new skill to build.
- **Position explicitly against subscription fatigue** — "$X once, no monthly bill, ever" is a genuinely strong, honest pitch against a market that's almost entirely $12–100/user/month subscriptions (HubSpot, Pipedrive, Zoho, Jobber-style tools). This is a real, searched-for buyer intent — Capterra even has a dedicated "One-Time License" filter for small business CRM tools — so there's a real underserved segment here, not just a story you're telling yourself.
- **Niche communities over paid ads to start**: r/smallbusiness, r/Contractor and similar trade-focused subreddits, relevant Facebook groups, Indie Hackers, and a Product Hunt launch — cheap-to-free channels that reach exactly the "sick of subscriptions, wants to own their tools" buyer, without needing an ad budget you don't have yet.
- **AppSumo is worth knowing about but going in with clear eyes**: it's a lifetime-deal marketplace that can put you in front of a large audience fast, but AppSumo takes roughly 70% of the deal revenue, trains buyers to expect 80–95% off your normal price, and is generally used by companies as a customer-acquisition/cash-injection move *alongside* an ongoing subscription business — not as the whole business model. For a one-time-purchase product with no recurring revenue underneath it, giving away 70% of a deeply discounted price is a rough trade. Worth considering later as a visibility play once you have a "real" price point established elsewhere, not as the first move.
- **SEO content** targeting exactly that search intent ("CRM without a subscription," "one-time purchase scheduling software," "no monthly fee job scheduler") is a slow-burn but free channel worth a couple of blog posts once the product itself is ready — no ad spend, compounding over time unlike ads.

## Price point

Recommend a **one-time price in the $99–199 range**, not a $19–29 impulse-buy price. Reasoning:
- It needs to look like a genuinely good deal against the subscription alternative it's replacing — $149 once versus $29/month ($348/year) for a comparable tool is an easy, honest story to tell, and still leaves real margin since there's no ongoing hosting cost on your end (it's local).
- A $19–29 price point works for templates and simple digital downloads (that's the right range for something like Solo Founder OS), but undersells genuinely useful software with a database, calendar, exports, and file storage — pricing too low here signals "toy" rather than "tool," which actually hurts overseas strangers' trust rather than helping it.
- **Launch lower, raise it once you have proof.** Start around $79–99 for your first real batch of buyers in exchange for reviews/testimonials (the same founding-customer trade you used for the Solo Founder OS and Review Engine ideas), then move to $149–199 once you have social proof — a $0-review solo product asking full price from strangers is a harder sell than a discounted-but-real product with a few honest reviews attached.
- Given no brand recognition yet, pair whichever price you land on with a **free or time-limited trial** (Lemon Squeezy supports this) rather than a pure blind purchase — asking an overseas stranger to hand over $150 sight-unseen to a solo, unknown seller is a much harder ask than "try it for 14 days, then pay if it's useful."
