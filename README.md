# Lunar Landing Site Navigator

Entry for the 2026 NASA Space Apps Challenge, challenge "Lunar Landing Site Navigator".
Singapore Local Event. Built from scratch during the hackathon (14–15 Nov 2026).

Status: scaffold only. Nothing computed yet.

## What it will do

Compare lunar landing sites and dates: where the Sun and Earth sit relative to the real terrain
horizon, and what that means for solar power and direct-to-Earth communication.

## Layout

- `pipeline/` — Python: ephemeris (SPICE) and terrain-horizon precomputation.
- `web/` — static web app that reads the precomputed files.
- `data/raw/` — downloaded NASA source files (not committed).

## NASA data and resources

To be filled in with exactly what is used (file names, versions, URLs). Planned:

- JPL NAIF generic SPICE kernels (DE440 ephemeris, lunar orientation).
- LOLA south-pole elevation models from NASA GSFC PGDA.
- JPL Horizons, as the independent check on our Sun and Earth angles.

## References

Every external dataset, library, image and paper used goes here before submission.

## Use of AI tools

Code in this repository is written with AI assistance (Claude Code, Anthropic). AI-assisted
commits carry a `Co-Authored-By: Claude` trailer. No AI-generated images, video or audio are used.

## Pre-event disclosure

A learning prototype existed before the event in a separate repository. No code or generated
data from it is used here.
