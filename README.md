# JobLens

Clean up LinkedIn — filter jobs, hide feed ads & distractions, mute people & keywords, and declutter profile pages.

## Features

### Jobs Page (`/jobs/search/`)
- **Reposted** detection (card text + detail panel scan)
- **Applied** detection (leaf node matching, excludes "Applied Materials" etc.)
- **No Sponsor** detection (25+ keyword patterns in job descriptions)
- **Unpaid** detection (volunteer/unpaid keyword scan)
- **Skip Company** list (exact match, case-insensitive, batch paste)
- **Skip Title Keyword** list (substring match)
- **Auto-Scan** — click-through scan with detail panel fingerprint detection
- **Dim filtered cards** toggle (opacity 0.35, hover 0.7)
- Badge persistence across LinkedIn DOM re-renders

### Feed Page (`/feed/`)
- **Hide Ads** (Promoted posts)
- **Hide Suggested** posts
- **Hide Recommended** posts and LinkedIn Learning promotions
- **Hide Strangers** (non-connection posts)
- **Force Recent** sort automatically
- **Hide Sidebar** (LinkedIn News + footer)
- **Mute by person** — click "Mute" next to any name
- **Mute by keyword** — hide posts containing specific terms
- Control panel with toggle switches and mute lists

### Profile Page (`/in/*`)
- **Hide right sidebar** (ads, "People you may know", recommendations)
- Separate control panel with toggle

## Install

1. Download or clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `joblens` folder
5. Visit LinkedIn — panels appear automatically on jobs, feed, and profile pages

## Design

Frosted glass panels with cream/rose brand palette and EB Garamond typography. All settings persist across sessions.

## Privacy

JobLens runs entirely in your browser. No data is collected or sent anywhere. See [privacy.html](privacy.html) for the full policy.

## Feedback

[Shape JobLens](https://kunli.co/joblens)
