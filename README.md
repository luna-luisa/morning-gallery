# Morning Gallery content

Questions, artworks and weekly news for the Morning Gallery art quiz. The app on Hostinger reads these files directly, so changes here go live within a few minutes.

- `content/topics.json`: topics, introductions and questions (each question has a level 1 to 5: Visitor, Regular, Enthusiast, Connoisseur, Curator)
- `content/works.json`: artworks and where their images load from
- `content/news.json`: this week's art news questions (refreshed every morning, rolling 7 days)
- `content/cleared.json`: flagged questions that were checked and are fine again. Any player's flag hides a question for everyone straight away; listing its key here with a later date brings it back. Never delete or reorder hand-written questions in topics.json: their keys are their position, so replace a bad one in place instead.
- `app/`: the app's code and styles (the site on Hostinger loads these, so design changes here also go live without re-uploading)
- `proposals/`: weekly suggestions waiting for Luna's approval

Nothing personal is stored here. Profiles, progress and feedback live in Supabase.
