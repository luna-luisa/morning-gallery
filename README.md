# Morning Gallery content

Questions, artworks and weekly news for the Morning Gallery art quiz. The app on Hostinger reads these files directly, so changes here go live within a few minutes.

- `content/topics.json`: topics, introductions and questions (each question has a level 1 to 5: Visitor, Regular, Enthusiast, Connoisseur, Curator)
- `content/works.json`: artworks and where their images load from
- `content/news.json`: this week's art news questions (refreshed every morning, rolling 7 days)
- `content/places.json`: photos of museums and galleries. When all four answer options match a name or alias here, the app shows them as pictures.
- `content/cleared.json`: flagged questions that were checked and are fine again. Any player's flag hides a question for everyone straight away; listing its key here with a later date brings it back. Never delete or reorder hand-written questions in topics.json: their keys are their position, so replace a bad one in place instead.
- `index.html` and `manifest.json`: the page itself and its home-screen settings (Luna uploads these to Hostinger; `config.js` with the database settings lives only on Hostinger)
- `app/`: the app's code, styles, fonts and icons (the site on Hostinger loads these, so design changes here also go live without re-uploading)
- `proposals/`: weekly suggestions waiting for Luna's approval

Nothing personal is stored here. Profiles, progress and feedback live in Supabase.

- Questions may have "correct": N (N > 1): the first N options are all right, and players pick all that apply.

- index.html asks GitHub for the newest commit on main and loads `app/app.js` and `app/style.css` for exactly that commit from jsDelivr, so app changes pushed to main go live within minutes with no uploading. Only changes to `index.html`, `manifest.json` or `app/icons/` need a one-off upload to Hostinger.

## How the app should feel (Luna's rules, apply to every change)

- Always ask: how can this be as intuitive, fun and straightforward as possible? Keep wording minimal.
- The "Stretch" label on questions above your level stays (Luna likes it: it makes you feel smart).
- Never explain the app's mechanics on screen (how levels, scoring, review rounds or progress are worked out). The only levelling text is "You're not far from becoming a <next level>." when someone is close.
- Question screen: answers sit just above the Check button and nothing moves when the answer appears. No "Pick N" line or tag on pick-several questions; the button counts down instead.
- Levelling up only happens in the round summary, never mid-round: the question screens keep the same level all the way through. (Preview on Luna's profile only, 25 Nov 2026.)
- Timelines zoom in to the pictures on them. Open-ended movements (marked `fade`) only run about 12 years past the last picture, so dots stay far enough apart to tap; dots from nearly the same year fan out. (Preview on Luna's profile only, 25 Nov 2026.)
- Order questions use the topic's first intro picture when no work is tagged with the movement itself, so every row has a picture.
- Every topic intro has 3 cards, each with its own picture that matches the card (never repeated, never missing). Card 1 says who or what the topic is and what the art is like, so a complete newcomer gets a feel for it; "In the news" comes second.
- Everyone gets the searchable Topics page (sections by kind, What's on). Trial feature, shown only to the admin profile for now: "Swipe to discover" (upright works only, using each work's "hw" = height ÷ width; give new works an "hw" value). Requests from failed searches and from liked artists without their own topic arrive in the weekly feedback as kind "content": treat them as suggestions for new topics, especially artist topics.

## Level-up lessons (weekly task)
Each topic can have `lessons` in content/topics.json: `{"2":[cards],"3":[cards],...}`, keyed by level (2 Regular, 3 onwards). Cards have the same shape as intro cards (`title`, `text`, `art`, an existing works.json id). A lesson is shown once, at the start of the next round on that topic after someone levels up, and can be reopened from the topic page.
- Each week, check progress for topics where players have reached a level with no lesson yet, and write that lesson first (3 cards, going a little deeper than the intro, with historical context). Then fill in the most-played topics.
- Two independent fact checks before publishing, as for everything else.
- Questions you write can carry `notes`: `{"<wrong option>":"one short line about it"}`, shown when a player picks that option.
- Swipe deck: add upright works (`hw` ≥ 1.24, height ÷ width), especially modern ones, with `hw` set.

## Opening pictures
The opening card and the welcome screen use the hand-picked `SPLASH` list in app/app.js. Every picture must look good inside the arch: upright, filling it, with no frames, borders or blank margins showing. Check each new one by eye in the arch shape before adding it.

## Article links
Players tap through to the source on their phones, so every link players see ("source" on news, "url" on What's on, "page" on pictures) must be free to read, with no paywall, sign-up wall, newsletter pop-up or heavy adverts. Use, in order: the organisation's own page (museum, gallery, auction house press release or lot page, fair or Biennale), then the Guardian or BBC News, then Hyperallergic or Artnet News as backups (free articles only, never Artnet News Pro). Never link The Art Newspaper, ARTnews, finestresullarte, The National, FT, NYT, The Times, Telegraph, Substack or other newsletters, blogs, listings sites or aggregators. Facts can still be checked against any reliable source (The Art Newspaper is excellent for that); only the link players see must meet this rule. If no allowed page exists, leave the link out.

## Why a picked picture is wrong
Movement and group topics carry `era` (display name), `from`/`to` (rounded years, checked against Tate's art terms) and `look` (what the movement is known for). When a player picks the wrong picture, the app tags it with its movement and explains, using these fields, whether it was painted before or after the asked movement and what its own movement is known for. Every work that overlaps in time with another movement should have a hand-written `why` in works.json, shown under a wrong pick. It must make sense in that context: one visible clue in the painting and what it marks of its own movement, shaped "<visible clue>: <what it marks of its movement>.", 10 to 20 words, for example "Flat ornament fills the background around the figure: the decorative signature of Vienna 1900." No stories, biography or trivia unless the fact is itself the clue; do not name the movement it might be confused with. Other interesting facts about a painting go in `note`, which the answer screen does not show. Two independent checks, as always. New topics need `era`, `from`, `to` and `look` too, all checked.

## Time-bound intro cards
An intro card about something current must not go stale. The "In the news" card only shows while its topic is featured (and has a story from the last 10 days). Any other card that mentions a show, a date or something "on now" needs an `until` date (YYYY-MM-DD); the app hides it after that day. Keep evergreen cards timeless.

## Publishing rule (Luna, 24 Nov 2026)
- New app features and design changes: mock-up on the design canvas first, then Luna's profile only (topic or item flagged "preview", or an isAdmin() check), then everyone once she is happy.
- New content (topics, questions, comparisons, news): straight to everyone once the fact checks pass and every picture is confirmed to load.

## What's new (Luna, 24 Nov 2026: avoid fatigue)
- The What's new sheet pops up whenever `content/whatsnew.json` gets a new `id`, so change the id only for big-picture things people would be sorry to miss: a new feature, or new artist topics. Not more than once a day.
- One item, two at most. One short line each.
- Never repeat something already announced. Extra comparisons, What's on, fixes and picture swaps are not announced.
- When nothing qualifies, leave the file alone.

## Picture check (GitHub, daily)
A GitHub job (.github/workflows/check-images.yml, tools/check_images.py) opens every picture in works.json each morning and whenever works.json changes, and writes content/imagecheck.json: "broken" lists works whose picture won't load (with the reason), "hw" gives each picture's real height/width. It costs no Claude credits. Scheduled tasks: read content/imagecheck.json first; replace or remove every work listed under "broken" (repoint any card or question that used it), and correct "hw" in works.json where it differs by more than 0.1. After adding works, the check runs by itself within minutes of the push; look at imagecheck.json again before finishing.
Contact sheets: the same job puts small labelled thumbnails of every picture in the private repo luna-luisa/morning-gallery-sheets (replaced each run; never in this public repo or on the website). Attach it with add_repo (read access) and clone it, then look at them. For any picture whose square crop would show a frame, mount, wall or border, set "zoom" (for example 1.08 for a thin frame, 1.3 to 1.8 for a wall view) and "focus" (CSS background-position, for example "50% 50%"); for tall portraits whose face is not near the top, set "focus" to where the face is.

## The Wall (launched to everyone 24 Nov 2026)
- Points are counted quietly for everyone from 24 Nov 2026 (`state.pts`, `state.ptsAll`). Launched to everyone on 24 Nov 2026 with a clean start: points only count from SEASON in app.js (Luna's request, so nobody starts ahead). Luna plays like everyone else: no admin extras on the Wall.
- Rules: coffee round 10, mistake fixed for good 5, another day in a row 3, Swipe round 2. Added for everyone on 25 Nov 2026: 1 point for every 2 extra questions (topic rounds, quick fire, endless; not the coffee round or Spot the difference), Spot the difference 5 the first time on a comparison and 2 each repeat, 5 for each level gained. First picture from a free starter Swipe; change it after a top-3 week or 100 more points; last week's winner chooses a frame.

## Swipe picks and new artists
At the end of a Swipe round players can pick artists to learn more about. The Sunday weekly task reads the picks (only the picks) and adds at most 3 new artist topics a week across picks and feedback, the most-picked first. The topic's `name` must match the picked name exactly; the app then shows that pick as ready to play.

## Margins and mounts
The nightly picture check (tools/trim_deck.py) finds paper margins, mounts and pencil notes on every picture in discover.json and works.json and saves a `crop` box, cached in content/trim.json. New pictures are picked up the night after they're added. Don't write `crop` by hand; a hand-set `zoom` on a work always wins.

## Points bill (live for everyone since 25 Nov 2026)
- Every round summary shows a bill of the points from that round, line by line, with a total and this week's points. Lines: coffee round 10, topic round 5, quick fire round 5, Spot the difference 5 first time then 2, level up 5, mistake fixed for good 5, another day in a row 3.
- On this profile quick fire is a round of 10 questions and the old "1 point for every 2 extra questions" no longer applies. This is now live for everyone, together with levelling in the summary, timeline zoom, the smoother sheet and the new Today screen below. The quick fire summary has one button, "Another quick fire round", plus "Back to today".
- Today screen after the coffee round (live for everyone): "Something new" and "Go deeper" are both blue, because both are topics. Below them is a pink Quick fire card, "A round of 10 random questions", which replaces the "or play any topic" link. The quick fire progress bar at the top fills pink, in tenths.

## Loved list and starter end (live for everyone since 25 Nov 2026)
- One list, "Everything you loved", replaces the separate "Your picks" screen on this profile: the Swipe card on Topics always links to it, rows are ordered ready to play, then Requested, then Learn more, and the status reads Play, Requested (was "Coming soon") or Learn more. First visit only, the top row slides left once to show Remove.
- Starter picture screen: with one like it is already selected, with "Use as my picture", "Show me more first" available whenever there are fewer than 10 likes, "Choose later" at the top, and a line saying other likes are saved in Everything you loved.
- No weekly limit on "Learn more" requests for now (Luna's call): the more requests, the better the sense of which topics are popular. Review at the end of the week.
