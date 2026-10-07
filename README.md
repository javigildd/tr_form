# Request Form — Trello Power-Up

A Power-Up that adds a **New request** button to a Trello board. The button opens a form
(thumbnail, name, a selector, a row of type buttons, up to four link fields, notes with pasted
images) and creates a card in the chosen list with the right labels and a sequential ID per
selector option (`100_Name`, `200_Name`, …). Board admins get a **Form settings** button.

**Nothing project-specific lives in this code.** Every word the form shows (title, field labels,
option names, hints, placeholders) and every mapping to a Trello label is entered in the settings
screen and stored on the board itself (`t.set('board','shared', …)`). The code ships with neutral
placeholders only (`Category A`, `Type A`, `Link 1`). Cards, thumbnails and attachments live in
Trello. The hosted files are static; the browser talks to `api.trello.com` directly.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Connector iframe Trello loads. Registers the board buttons and the settings screen. |
| `form.html` + `js/form.js` | The request form (opens in a Trello modal). |
| `settings.html` + `js/settings.js` | Admin settings, including JSON import/export of the whole configuration. |
| `js/common.js` | Config schema, ID logic (highest ID on the board + 1, per block), Trello REST wrapper, demo mock. |
| `css/powerup.css` | Styles. |
| `preview.html` + `serve.py` | Standalone demo with a simulated board. Not used by Trello. |

## Configuration

Open **Form settings** on the board (admins only). You can edit everything inline, or paste a
JSON into *Import / export* and click *Load*, then *Save*. The shape:

```json
{
  "title": "New request",
  "name": { "label": "Request name", "placeholder": "", "hint": "" },
  "category": { "label": "Category", "hint": "", "options": [
    { "name": "Category A", "label": "<trello label id>", "base": 100, "next": 120 } ] },
  "type": { "label": "Type", "options": [ { "name": "Type A", "label": "<trello label id>" } ] },
  "links": [ { "label": "Link 1", "placeholder": "https://…", "required": true } ],
  "notes": { "label": "Notes", "placeholder": "", "required": false },
  "listId": "<trello list id>",
  "pattern": "{id}_{name}",
  "admins": ["username"]
}
```

Keep your real configuration outside the repository (anything under `private/` or named
`*.private.json` is ignored by git).

## Deploy

1. **Host the folder** on any static HTTPS host (the pages must be reachable by URL; Trello loads
   them in an iframe from each member's browser). Note the base URL, e.g. `https://<host>/<path>/`.
2. **Allow the origin on the API key.** In <https://trello.com/power-ups/admin>, open the Power-Up
   that owns the API key and add the host origin (e.g. `https://<host>`) under *Allowed origins*.
   Without this the form cannot call the REST API to create cards.
3. **Register the Power-Up.** Same admin page: name, *Iframe connector URL* →
   `https://<host>/<path>/index.html`, icon → `https://<host>/<path>/icon.svg`.
   Under *Capabilities* enable `board-buttons` and `show-settings`.
4. **Add it to the board.** Board menu → Power-Ups → Custom → add it.
5. **First use.** The first time someone clicks *Create*, Trello asks them to authorize the
   Power-Up (read/write). Once per person.
6. **Configure.** Click *Form settings* (admins only), fill in the vocabulary and map labels.

## Notes

* The API key is public by design (Power-Ups run in the browser). Never put a token in the code.
* IDs come from the board itself: the form scans every card (including archived) and takes the
  highest ID in the chosen block plus one. Blocks are editable in settings, and the *Next IDs*
  section lets an admin skip ahead (`next`); it can never go below an ID that already exists.
* Settings visibility is enforced in the UI (board admins or allow-listed usernames). The config
  contains no secrets.
* Each board keeps its own settings and IDs, so the Power-Up can be added to several boards.
