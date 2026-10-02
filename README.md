# Erin Calendar

Erin Calendar is a personal Obsidian calendar plugin for navigating daily notes.
It is maintained independently for personal use and is not published to the
Obsidian Community Plugins directory.

## Install with BRAT

1. Install and enable the BRAT plugin in Obsidian.
2. In BRAT, choose **Add Beta Plugin**.
3. Enter `DudeThatsErin/Erin-Obsidian-Calendar`.
4. Enable **Erin Calendar** in Obsidian's Community Plugins settings.

Releases use plain numeric tags such as `0.0.1`; there is no `v` prefix.
BRAT downloads the release `main.js`, `styles.css`, and `manifest.json` files.

## Embed in a note

Add an empty `erin-calendar` code block in Reading view:

````markdown
```erin-calendar
```
````

The embedded calendar uses the same settings as the sidebar calendar.

## Features

- Navigate to existing daily notes from a calendar view.
- Create missing daily notes using Obsidian's configured Daily Notes settings.
- Display writing-progress dots based on note word count.
- Optionally show week numbers and open weekly notes.

## License and attribution

This is an independently maintained derivative of Liam Cain's Calendar plugin.
The original MIT copyright notice and license are retained in [LICENSE](LICENSE).
