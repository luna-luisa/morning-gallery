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
Movement and group topics carry `era` (display name), `from`/`to` (rounded years, checked against Tate's art terms) and `look` (what the movement is known for). When a player picks the wrong picture, the app tags it with its movement and explains, using these fields, whether it was painted before or after the asked movement and what its own movement is known for. Every work that overlaps in time with another movement should have a hand-written `why` in works.json: one vivid, checked sentence (12 to 25 words) on what makes it its own movement, pointing to something visible or a concrete fact, not starting with the movement or the year. The app shows the movement and timing first, then the note, in place of the generic "known for" text. Write one for every new work you add (two independent checks, as always). New topics need `era`, `from`, `to` and `look` too, all checked.
