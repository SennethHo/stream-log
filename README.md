# Stream Diary — iPhone PWA

Stream Diary is a personal, offline-capable streaming-hours tracker with a soft pastel mobile design.

## Features

- Manual streamed/did-not-stream status for each date.
- Manual total-hours entry and editing for streamed days.
- Daily Bits entry with an automatic overall Bits total.
- Monthly calendar showing streamed and missed days.
- Weekly and monthly totals, streamed-day count and current streak.
- Notes for the game, topic or title streamed.
- Local IndexedDB storage with no server or subscription.
- JSON backup/restore and CSV export.
- Offline home-screen installation on iPhone.

## Data and cost

The app uses IndexedDB, the database built into Safari. No cloud database, account or paid hosting is required. Records stay inside the browser data for this website on the device being used.

Deleting Safari website data can also delete the local database. Use **Export Backup** regularly and keep the JSON file in iCloud Drive or another safe location.

## Publish free with GitHub Pages

1. Create a new public GitHub repository, for example `stream-log`.
2. Extract this ZIP file.
3. Upload everything **inside** the `StreamTrackerPWA` folder to the repository root.
4. Commit the files to `main`.
5. Open **Settings > Pages**.
6. Choose **Deploy from a branch**, branch **main**, folder **/(root)**.
7. Save and wait for the deployment to finish.

The address will normally be:

```text
https://YOUR-USERNAME.github.io/stream-log/
```

## Install on iPhone

1. Open the published address in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Keep **Open as Web App** enabled if shown.
5. Tap **Add**.
