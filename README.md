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
- Never explain the app's mechanics on screen (how levels, scoring, review rounds or progress are worked out). The only levelling text is "You're not far from becoming a <next level>." when someone is close.
- Question screen: answers sit just above the Check button and nothing moves when the answer appears. No "Pick N" line or tag on pick-several questions; the button counts down instead.
- Every topic intro has 3 cards, each with its own picture that matches the card (never repeated, never missing). Card 1 says who or what the topic is and what the art is like, so a complete newcomer gets a feel for it; "In the news" comes second.
