# Crispy Math Café 🍗➗

A family-friendly multiplication game built for learning and fun.

## Current cloud version

This repository is the new source of truth for Crispy Math Café.

- Static hosting: GitHub Pages
- Cloud data: Supabase
- Player access: player name + private save code
- Cloud saves: level, coins, hints, streaks, unlocks, store name
- Games: Take Orders, 60-Second Rush, Duck Dash
- Leaderboards: ranked by unlocked level first, then score
- Shop: includes Halloween Chicken for 300 coins after Level 3

## Safety

Save codes are never stored in readable form in the database. The browser only uses the Supabase publishable key; no secret/service key belongs in this repository.

## Development

The app is intentionally plain HTML/CSS/JavaScript so it can run free on GitHub Pages with no build step.
