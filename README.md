# Erin Calendar

Erin Calendar is a deliberately personal, independently maintained fork of
[Liam Cain's Calendar plugin](https://github.com/liamcain/obsidian-calendar-plugin).
It is made for Erin's own Obsidian workflow: changes will only be implemented
when they are useful to that workflow. It is not intended to be a general
community-maintained fork or an official continuation of the original project.

Others are welcome to use it, but it is available **only through BRAT** and
will not be submitted to Obsidian's Community Plugins directory.

## Install with BRAT

Install it through BRAT on every device where it is needed, including iPad and
iPhone. Do not copy or sync the plugin folder between devices: BRAT installs
the complete release files and handles updates reliably.

1. Install and enable the **BRAT** plugin in Obsidian.
2. Open BRAT's settings and choose **Add Beta Plugin**.
3. Enter `DudeThatsErin/Erin-Obsidian-Calendar` as the repository.
4. Let BRAT install the latest release, then enable **Erin Calendar** in
   Obsidian's Community Plugins settings.
5. Use BRAT's update command whenever a newer release is available.

Releases use plain numeric tags such as `0.0.1` (without a `v` prefix). BRAT
downloads the release `main.js`, `styles.css`, and `manifest.json` files.

## Embed in a note

Add an `erin-calendar` code block in Reading view:

````markdown
```erin-calendar
```
````

An empty block follows the sidebar Calendar settings. To customize just one
embedded calendar, put YAML settings inside its code block. Those values apply
only to that block—they are not saved and do not change the sidebar or any
other calendar. Settings omitted from the block continue to follow the sidebar
setting, including later changes to it.

For example, this calendar opens as a twelve-month overview, starts on Monday,
uses single-letter weekday headings, has no date-tag markers, and creates notes
without confirmation:

````markdown
```erin-calendar
calendarView: "year"
weekdayLabelFormat: "d"
weekStart: "monday"
shouldConfirmBeforeCreate: false
showDateTags: false
```
````

Every Calendar setting can be supplied this way. Copy the fields you want from
this reference; all values are optional. Quote Moment formats and paths so
YAML reads them as text.

````markdown
```erin-calendar
# Display
calendarView: "month" # month or year
wordsPerDot: 250
weekdayLabelFormat: "ddd"
weekStart: "locale" # locale, sunday, monday, tuesday, wednesday, thursday, friday, saturday
localeOverride: "system-default"

# Opening and creating notes
shouldConfirmBeforeCreate: true

# Header and week-note links
showWeeklyNote: false
showMonthlyNote: false
showQuarterlyNote: false
showYearlyNote: false
weeklyNoteFormat: "gggg-[W]ww"
weeklyNoteTemplate: "Templates/Weekly note.md"
weeklyNoteFolder: "Calendar/Weeks"

# Date associations
showDateTags: true
useMetadataDates: false
metadataDateProperty: "date"
metadataDateFormat: "YYYY-MM-DD"
```
````

For the three weekly-note path settings, an empty string keeps inheriting the
configured Calendar or Periodic Notes value. If a block contains an unknown or
invalid setting, the calendar still renders and shows an explanation beneath
that block.

Set `calendarView: "year"` to open that embed as a responsive January–December
overview. The **Month**/**Year** button in the calendar header lets you switch
layouts at any time without changing another embedded calendar. In a normal
Calendar tab, choose the default layout in **Settings → Erin Calendar →
Calendar view**; the same header button is always available there too. Click a
month name in the year overview to inspect that month in detail.

Use lowercase `gggg` and `ww` when weekly filenames should follow the block's
`weekStart` choice. Uppercase `GGGG` and `WW` are ISO week tokens and always
use Monday-based week numbering.

## Improvements in this fork

In addition to the original calendar experience, this fork focuses on a few
personal workflow improvements:

- The Calendar command reuses and focuses an existing calendar tab without
  moving it; modifier-clicked note opens use a new tab.
- Calendar localization and first-day-of-week changes update the calendar
  immediately.
- Optional month, quarter, and year links can open notes managed by Periodic
  Notes.
- Daily and weekly notes are found more reliably when their configured formats
  use nested folders, quoted text, or other non-default Moment formats.
- Notes associated with a date through a date tag or frontmatter date can be
  surfaced from the calendar, including a choice when more than one note maps
  to the same day.
- Hover previews are dismissed cleanly when leaving a calendar day.
- Each embedded calendar can now use its own complete set of Calendar
  settings, including locale and first-day-of-week, without changing the
  sidebar or another embedded calendar.
- A responsive year overview is available in both Calendar tabs and embedded
  calendars, with locale-aware month grids, note markers, and daily/weekly
  note actions.

Some of these additions depend on Obsidian's Daily Notes or Periodic Notes
plugins and their corresponding settings.

### Optional integrations

- To use imported notes whose dates live in frontmatter rather than filenames,
  enable **Use frontmatter dates as daily notes** in Calendar's **Date
  Associations** settings, then set the property name and Moment format. ISO
  dates and timestamps are understood automatically.
- **Show date-tagged items** marks exact `#YYYY-MM-DD` tags anywhere in the
  vault. Hover a marked date or open its context menu to see the matching
  notes and task/event summary.
- With Periodic Notes configured, enable the monthly, quarterly, or yearly
  header link toggles in Calendar settings to open those notes from the
  calendar title.

## Core features

- Navigate to existing daily notes from a calendar view.
- Move directly to the previous or next existing daily note, skipping empty days.
- Create missing daily notes using Obsidian's configured Daily Notes settings.
- Honor Daily Notes folder/date formats, including nested paths such as `YYYY/MM/DD`.
- Display writing-progress dots based on note word count.
- Optionally show week numbers and open weekly notes.

## License and attribution

This is an independently maintained derivative of
[Liam Cain's Calendar plugin](https://github.com/liamcain/obsidian-calendar-plugin).
The original MIT copyright notice and license are retained in [LICENSE](LICENSE).
