# User Guide — Pandora Goat Farm ERP
# ব্যবহারকারী নির্দেশিকা — পান্ডোরা গোট ফার্ম ইআরপি

This guide walks through what each screen does and how to do the most common jobs. Every screen in the app itself has an EN/বাংলা switch in the top bar — this guide is written in both languages side by side.

এই নির্দেশিকায় প্রতিটি স্ক্রিন কী করে এবং সবচেয়ে সাধারণ কাজগুলো কীভাবে করবেন তা বলা আছে। অ্যাপের প্রতিটি স্ক্রিনে উপরের বারে EN/বাংলা বদলানোর বোতাম আছে — এই নির্দেশিকাটি দুই ভাষাতেই লেখা।

---

## Logging in / লগ ইন

Use your **phone number** and password — there is no email login, since a phone number is what everyone on the farm actually has. After 5 wrong attempts the account locks for 15 minutes, so mistype carefully.

আপনার **ফোন নম্বর** ও পাসওয়ার্ড দিয়ে লগ ইন করুন — ইমেইল লাগবে না। ৫ বার ভুল পাসওয়ার্ড দিলে ১৫ মিনিটের জন্য অ্যাকাউন্ট লক হয়ে যাবে, তাই সাবধানে টাইপ করুন।

---

## Dashboard / ড্যাশবোর্ড

The home screen. The top row of tiles shows active goats, does, kids under 6 months, 90-day mortality rate, this month's net money, and how long ago the last backup ran. Below that, **"Needs attention"** lists everything overdue right now — click any line to go straight to the screen that fixes it. **"Upcoming kiddings"** lists does due within 60 days.

হোম স্ক্রিন। উপরের ঘরগুলোতে সক্রিয় ছাগল, মাদি, ৬ মাসের কম বয়সী বাচ্চা, ৯০ দিনের মৃত্যুহার, এই মাসের নিট আয়, এবং শেষ ব্যাকআপ কতক্ষণ আগে হয়েছে তা দেখা যায়। নিচে **"নজর দরকার"** এখন যা কিছু বিলম্বিত তার তালিকা — যেকোনো লাইনে ক্লিক করলে সরাসরি সমাধানের স্ক্রিনে যাবেন। **"আসন্ন প্রসব"** ৬০ দিনের মধ্যে যেসব মাদির প্রসব হবে তার তালিকা।

---

## Herd / পাল

**Register (নিবন্ধন)** — add one goat: breed, sex, birth date (or tick "Estimated" if you're guessing an existing goat's age by its teeth), source, weight. A tag number like `PGF-0001` is generated automatically if you don't type one.

**একটি ছাগল** যোগ করুন: জাত, লিঙ্গ, জন্ম তারিখ (বিদ্যমান ছাগলের বয়স দাঁত দেখে আন্দাজ করলে "আনুমানিক" টিক দিন), উৎস, ওজন। ট্যাগ নম্বর (যেমন `PGF-0001`) না লিখলে নিজে থেকেই তৈরি হয়।

**Bulk intake (একসাথে যোগ)** — the fastest way to get your *existing* herd into the system: pick a shared breed/pen, then type sex, estimated age in months, and weight for each goat in a simple row-by-row grid. Meant for the one-time job of digitizing goats you already have.

আপনার **বিদ্যমান পাল** দ্রুত সিস্টেমে তোলার সবচেয়ে সহজ উপায়: একটা জাত ও খোঁয়াড় বেছে নিন, তারপর প্রতিটি ছাগলের লিঙ্গ, আনুমানিক বয়স (মাসে) ও ওজন সারি ধরে লিখুন।

**The animal profile (ছাগলের প্রোফাইল)** is the heart of the system — tap any goat in the list to open it. It shows current weight, status, pregnancy/withdrawal warnings, and a **Timeline** that fills in *automatically* every time anything happens to that goat (weighed, moved, treated, sold…) — you never type the timeline yourself. From here: **Weigh** (record a new weight — a jump of more than 15% needs confirmation, in case of a typo), **Move pen**, **Exit** (sale/death/disposal — closes the animal and, for a sale, books the income automatically), **Photo**, **QR** (print or show the goat's QR code).

**ছাগলের প্রোফাইল** সিস্টেমের কেন্দ্রবিন্দু — তালিকায় যেকোনো ছাগলে ট্যাপ করলে খুলবে। এখানে বর্তমান ওজন, অবস্থা, গর্ভাবস্থা/প্রত্যাহার সতর্কতা এবং একটি **টাইমলাইন** দেখা যায় যা প্রতিটি ঘটনার সাথে *নিজে থেকেই* ভরে যায় — টাইমলাইন কখনো নিজে লিখতে হয় না। এখান থেকে: **ওজন নিন**, **খোঁয়াড় বদল**, **বিদায়** (বিক্রি/মৃত্যু/অপসারণ), **ছবি**, **কিউআর**।

---

## Breeding / প্রজনন

**Heat (গরম)** — record when you notice a doe in heat; the system shows a recheck date 19 days later (if she doesn't come back into heat, she's likely pregnant).

**গরম** লক্ষ্য করলে লিখে রাখুন; সিস্টেম ১৯ দিন পরের একটি পুনঃপরীক্ষার তারিখ দেখাবে।

**Service (পাল দেওয়া)** — record natural mating (pick the buck) or AI (enter the semen batch). If the system detects the doe is underage, underweight, or related to the buck within two generations, it will warn you and ask you to type a reason before proceeding — this is a safety check, not a hard block.

**প্রাকৃতিক পাল** (পাঁঠা বাছুন) বা **কৃত্রিম প্রজনন** (সিমেন ব্যাচ লিখুন) লিখুন। মাদি অল্পবয়সী, কম ওজনের, বা পাঁঠার সাথে নিকট আত্মীয় হলে সিস্টেম সতর্ক করবে এবং কারণ লিখতে বলবে — এটি নিরাপত্তার জন্য, বাধা নয়।

**Pregnancies (গর্ভাবস্থা)** — the board of currently pregnant does, with a countdown to the expected kidding date. When the day comes, click **Kidding** on that row: enter total born and born alive, then one row per live kid (sex, birth weight) — the system creates each kid as a full animal with lineage already filled in, and schedules the colostrum check, dam check, and day-7 weighing tasks automatically.

**গর্ভাবস্থার বোর্ড** — বর্তমানে গর্ভবতী মাদিদের তালিকা, সম্ভাব্য প্রসবের দিন গোনা সহ। দিন এলে সেই সারিতে **প্রসব**-এ ক্লিক করুন: মোট জন্ম ও জীবিত সংখ্যা লিখুন, তারপর প্রতিটি জীবিত বাচ্চার জন্য একটি সারি (লিঙ্গ, জন্ম-ওজন) — সিস্টেম প্রতিটি বাচ্চাকে বংশ-তথ্যসহ পূর্ণ পশু হিসেবে তৈরি করবে এবং শাল দুধ, মা পরীক্ষা ও ৭ম দিনের ওজনের কাজ স্বয়ংক্রিয়ভাবে তৈরি করবে।

**Performance (পারফরম্যান্স)** — see which does and bucks have the best conception rate, litter size, and which does are "repeat breeders" (open 3 times running) needing a vet look.

কোন মাদি/পাঁঠার গর্ভধারণ হার ও গড় বাচ্চা সবচেয়ে ভালো, এবং কোন মাদি বারবার খালি থাকছে তা দেখুন।

---

## Health / স্বাস্থ্য

**Due protocols (বাকি টিকা/ডোজ)** — grouped lists like "PPR — 14 animals overdue". Tap **Administer** to select which animals, pick the medicine, and save — doses are calculated automatically from each goat's weight, and stock is deducted.

**"পিপিআর — ১৪টি বিলম্বিত"** এর মতো গোষ্ঠীবদ্ধ তালিকা। **প্রয়োগ করুন**-এ ট্যাপ করে পশু বাছুন, ওষুধ বাছুন, সংরক্ষণ করুন — ওজন অনুযায়ী ডোজ নিজে থেকেই হিসাব হবে এবং মজুত থেকে বাদ যাবে।

**Cases (কেস)** — open a case when a goat is sick: symptoms, severity. From the case you can log vitals (temperature/breathing — the app flags anything outside a healthy goat's normal range), move the goat to an isolation pen, give a treatment (which deducts stock and sets a withdrawal date — the goat can't be sold as meat until that date passes without an override), and finally close the case as recovered, referred, or (with cause details) died.

অসুস্থ ছাগলের জন্য **কেস** খুলুন: লক্ষণ, গুরুত্ব লিখুন। কেস থেকে শারীরিক মান (তাপমাত্রা/শ্বাস) লিখুন, পৃথককরণ খোঁয়াড়ে সরান, চিকিৎসা দিন (মজুত থেকে বাদ যাবে ও প্রত্যাহারের তারিখ বসবে), এবং শেষে কেস বন্ধ করুন — সুস্থ, রেফার, বা (কারণসহ) মৃত হিসেবে।

---

## Inventory / মজুত

Add every medicine, vaccine, dewormer, and feed item once as an **Item**. Each time stock arrives, use **Stock in** to record the batch number, expiry date, quantity, and cost — the system always uses the earliest-expiring batch first (FEFO) when medicine is given. **Adjust/waste** lets you correct counts or record spoilage — always with a reason. Red/amber badges warn about low stock and batches expiring within 30 days.

প্রতিটি ওষুধ, টিকা, কৃমিনাশক ও খাদ্য একবার **সামগ্রী** হিসেবে যোগ করুন। মজুত এলে **মজুত যোগ**-এ ব্যাচ নম্বর, মেয়াদ, পরিমাণ ও দাম লিখুন — চিকিৎসার সময় সিস্টেম সবসময় আগে মেয়াদ শেষ হওয়া ব্যাচ ব্যবহার করে। **সমন্বয়/অপচয়** দিয়ে গণনা ঠিক করুন বা নষ্ট হওয়া লিখুন — কারণসহ।

---

## Feed / খাদ্য

Once a day, for each occupied pen, pick the feed item and enter the quantity fed (and any wastage). Yesterday's entries pre-fill so most days it's a few taps. Stock is deducted automatically.

দিনে একবার, প্রতিটি ভরা খোঁয়াড়ের জন্য খাদ্য সামগ্রী বাছুন ও পরিমাণ লিখুন (এবং অপচয় থাকলে তাও)। গতকালের এন্ট্রি আগে থেকেই ভরা থাকে, তাই বেশিরভাগ দিন কয়েকটি ট্যাপেই কাজ হয়ে যায়। মজুত নিজে থেকেই বাদ যায়।

---

## Finance / হিসাব

Record **Income** or **Expense** with a category, amount, and payment method. Goat sales book themselves automatically the moment you record an animal's exit as a sale — you'll see them appear with an "auto" tag and cannot edit them directly here (edit the sale itself instead). The summary at the top shows this month's income, expense, net, and cost per goat.

খাত, পরিমাণ ও পেমেন্ট পদ্ধতিসহ **আয়** বা **ব্যয়** লিখুন। ছাগল বিক্রি করলে তার আয় স্বয়ংক্রিয়ভাবে এখানে যোগ হয়ে যায় — সেগুলো "স্বয়ংক্রিয়" চিহ্নসহ দেখা যাবে এবং সরাসরি এখানে সম্পাদনা করা যাবে না। উপরের সারাংশে এই মাসের আয়, ব্যয়, নিট ও প্রতি ছাগলে খরচ দেখা যায়।

---

## Tasks / কাজ

Today's checklist. Auto-generated tasks (from kiddings, protocol dues) show up alongside anything you add manually. Tick to complete; if a task repeats daily or weekly, completing it automatically schedules the next one. If you can't do something, use **Skip** and give a short reason — it's recorded, not silently dropped.

আজকের কাজের তালিকা। প্রসব বা টিকা থেকে স্বয়ংক্রিয় কাজগুলো আপনার নিজে যোগ করা কাজের পাশে দেখা যাবে। সম্পন্ন হলে টিক দিন; প্রতিদিন/সাপ্তাহিক পুনরাবৃত্তি হলে সম্পন্ন করার সাথেই পরেরটি তৈরি হবে। কিছু করতে না পারলে **বাদ দিন** বেছে সংক্ষিপ্ত কারণ লিখুন — এটি লিপিবদ্ধ থাকে, হারিয়ে যায় না।

---

## Farm Map / খামার মানচিত্র

A live map of the farm: fodder plots, sheds, fences, the tube well — traced over your siteplan. Plot colours show status at a glance: **green = planted**, **amber = harvest due**, **hatched grey = fallow**. Click any shape for details; a linked plot shows its growing crop and both areas — computed from the drawing and the recorded land-record figure. **Export image** makes a PNG for WhatsApp; **Print** makes a PDF via the browser's print dialog.

খামারের জীবন্ত মানচিত্র: ফডার জমি, শেড, বেড়া, নলকূপ — আপনার সাইটপ্ল্যানের উপর আঁকা। জমির রং অবস্থা দেখায়: **সবুজ = রোপিত**, **হলুদ = ফসল কাটার সময়**, **ডোরাকাটা ধূসর = পতিত**। যেকোনো আকৃতিতে ক্লিক করলে বিবরণ দেখা যায়। **ছবি ডাউনলোড** হোয়াটসঅ্যাপের জন্য PNG তৈরি করে; **প্রিন্ট** ব্রাউজারের প্রিন্ট থেকে PDF দেয়।

**One-time setup (Owner/Manager):**
1. **Upload the siteplan** — a photo or scan (JPG/PNG). If yours is a PDF, open it in macOS **Preview → File → Export → PNG** first. সাইটপ্ল্যান আপলোড করুন — PDF হলে আগে Preview দিয়ে PNG-তে রূপান্তর করুন।
2. **Calibrate** — pick two far-apart recognisable points (opposite boundary corners work best), and for each, long-press the same spot in **Google Maps**, copy, and paste the coordinates. This makes every area and length real (katha/bigha, sq ft). A rough guess is fine to start — re-pinning later fixes all measurements without redrawing anything. ক্যালিব্রেট — দূরের দুটি চেনা বিন্দু বাছুন, গুগল ম্যাপে সেই স্থান চেপে ধরে স্থানাঙ্ক কপি-পেস্ট করুন। পরে ঠিক করলেও আঁকা কিছু নষ্ট হয় না।
3. **Trace** — switch on edit mode, pick a tool (Plot/Building/Zone/Line/Point), click around the boundary, press **Enter**. Name it in both languages and link plots to their fodder records so the map shows what's planted where. এডিট মোড চালু করে টুল বেছে সীমানা বরাবর ক্লিক করুন, **Enter** চাপুন। দুই ভাষায় নাম দিন এবং জমিগুলো ফডার রেকর্ডের সাথে যুক্ত করুন।

---

## Settings / সেটিংস

**Backup** — shows when the last backup ran; the Owner can trigger one immediately with **Back up now**. **Farm** shows the farm profile and tag prefix. **Users** (Owner only) lets you create logins for other staff and assign their role — each role only sees and can do what its permission level allows.

**ব্যাকআপ** — শেষ ব্যাকআপ কখন হয়েছে তা দেখায়; মালিক তাৎক্ষণিকভাবে **এখনই ব্যাকআপ** চালাতে পারেন। **খামার** খামারের প্রোফাইল ও ট্যাগ প্রিফিক্স দেখায়। **ব্যবহারকারী** (শুধু মালিক) দিয়ে অন্য কর্মীদের লগইন ও ভূমিকা তৈরি করা যায় — প্রতিটি ভূমিকা শুধু তার অনুমতি অনুযায়ী দেখতে ও করতে পারে।

---

## Tips for daily use / দৈনিক ব্যবহারের পরামর্শ

- You can always back-date an entry — record today what actually happened yesterday. আপনি সবসময় পুরনো তারিখে এন্ট্রি করতে পারেন।
- **Install it like an app**: open the site on your phone, then use the browser's "Add to Home Screen" — it gets the farm icon and opens full-screen. আপনার ফোনে সাইটটি খুলে ব্রাউজারের "Add to Home Screen" ব্যবহার করুন — খামারের আইকনসহ পূর্ণ-স্ক্রিন অ্যাপের মতো খুলবে।
- If the Wi-Fi drops, an amber **"Offline"** banner appears — you can still open the app and look at pages you've already visited, but **saving needs a connection**. If a save fails, it shows an error rather than silently queuing; try again once connected. ওয়াইফাই চলে গেলে হলুদ **"অফলাইন"** ব্যানার দেখা যাবে — আগে দেখা পাতা খোলা যাবে, কিন্তু **সংরক্ষণ করতে সংযোগ লাগবে**। সংরক্ষণ ব্যর্থ হলে ত্রুটি দেখাবে, সংযোগ ফিরলে আবার চেষ্টা করুন।
- Anything you can't undo (a soft-deleted record) can only be restored by the Owner — ask them, don't recreate it from scratch. যা মুছে ফেলা যায় (soft-delete) তা শুধু মালিক ফিরিয়ে আনতে পারেন — নতুন করে তৈরি না করে তাকে বলুন।
