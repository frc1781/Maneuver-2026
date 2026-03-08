# Statbotics Integration (2026)

This document summarizes the Statbotics EPA features added to Maneuver-2026.

## Overview

Statbotics support was added as an external analytics source (alongside TBA/Nexus) to provide team-event EPA breakdown metrics for:
- API Data workflows
- Team Statistics page
- Strategy Overview page

Primary endpoint used per team/event:
- `/team_event/{teamNumber}/{eventKey}`

## API + Proxy Support

Added provider support in Netlify API proxy:
- `provider=statbotics`
- Base URL: `https://api.statbotics.io/v3`
- Allowed endpoint: `/team_event/{team}/{event}`

## New Cached Statbotics Layer

Added `src/core/lib/statbotics/epaUtils.ts` with:
- Fetch + cache helpers for event-wide team EPA data
- Local storage key prefix: `statbotics_event_epa_{eventKey}`
- Event key discovery helpers
- Team extraction helpers from TBA matches
- TBA team-key fetch helper (`/event/{event}/teams/keys`) so all event teams can be loaded

### Cache schema migration

Added cache schema versioning to handle metric changes safely:
- `schemaVersion: 2`
- Legacy cached entries auto-normalize teleop fuel behavior on read

## API Data Page Features

Added a dedicated Data Type option:
- **Statbotics EPA**

Behavior:
- Loads all event teams from TBA team keys when possible
- Falls back to teams extracted from validation matches if needed
- Fetches Statbotics for each team at the selected event
- Caches results locally

Also integrated Statbotics refresh into Match Validation data load flow.

## Data Status + Stored Data Behavior

EPA data now counts as stored event data, similar to COPR:
- Included in `hasStoredEventData(...)`
- Included in clear-event-data removal
- API page stored-data warnings update immediately after loading EPA

## Team Statistics Features

Statbotics EPA fields are now available in Team Stats output and UI.

### Supported Statbotics metrics

From `epa.breakdown`:
- `total_points`
- `auto_points`
- `teleop_points`
- `endgame_points`
- `total_fuel`
- `auto_fuel`
- `teleop_fuel`
- `endgame_fuel`
- `total_tower`
- `auto_tower`
- `endgame_tower`

### Fuel metric behavior

By request, Team Stats uses:
- **Statbotics Teleop Fuel = `teleop_fuel + endgame_fuel`**

and does not show a separate endgame-fuel row in scoring sections.

### Empty-state logic updates

Team Stats no longer shows "No Match Scouting Data" / "No scoring data" when local matches are zero but external COPR/EPA data exists.

### Team Stats display customization (new)

Added a Team Stats field customization workflow similar to Strategy Overview column customization:
- **Customize Stats** sheet on Team Stats page
- Manual per-field visibility toggles (with Show All / Hide All)
- **Auto-hide uncollected stats** option to suppress empty/zero metrics
- Header indicator showing how many fields are currently hidden

Category and labeling improvements for usability:
- Scoring options grouped by section (for example: `Scoring — Auto Fuel`, `Scoring — Teleop Fuel`, then climbing sections)
- Performance rate options grouped by section (including separate Active/Inactive role groups)
- Overview key-rate options merged into the main overview category to avoid one-item groups
- Duplicate source-style labels disambiguated using both heading and subtitle (for example: `Statbotics EPA — Auto Points`, `TBA COPR — Tower Points`)

Persistence and framework notes:
- Team Stats visibility preferences persist in localStorage (`team_stats_hidden_fields`, `team_stats_auto_hide_uncollected`)
- This customization scaffolding was also promoted into `maneuver-core` so future yearly repos inherit the same behavior

## Strategy Overview Features

Strategy Overview now includes EPA-only teams/events:
- Centralized stats hook merges Statbotics values into team rows
- Supplemental cached-only team generation includes Statbotics-only teams
- Event selector derives from computed team stats (not only local scouting entries)

This allows Strategy Overview to display EPA columns even when no local scouting entries exist.

## Display Ordering

Per request, Statbotics metrics are listed above TBA COPR metrics where both appear together.

## Attribution

Data attribution component now supports Statbotics in compact/full/inline variants.

## Key Files Updated

- `netlify/functions/api-proxy.ts`
- `src/core/lib/apiProxy.ts`
- `src/core/lib/statbotics/epaUtils.ts`
- `src/core/pages/APIDataPage.tsx`
- `src/core/components/tba/EventConfiguration/DataTypeSelector.tsx`
- `src/core/components/tba/DataManagement/DataOperationsCard.tsx`
- `src/core/components/tba/DataManagement/StatboticsEPADataDisplay.tsx`
- `src/core/components/tba/DataManagement/DataStatusCard.tsx`
- `src/core/lib/tba/eventDataUtils.ts`
- `src/core/hooks/useMatchValidation.ts`
- `src/core/hooks/useTeamStats.ts`
- `src/core/hooks/useAllTeamStats.ts`
- `src/core/pages/TeamStatsPage.tsx` (attribution + stats customization controls/filtering)
- `src/core/components/team-stats/TeamStatsFieldSettingsSheet.tsx`
- `src/core/pages/StrategyOverviewPage.tsx`
- `src/core/types/team-stats.ts`
- `src/game-template/game-schema.ts`
- `src/game-template/analysis.ts`
- `src/game-template/components/team-stats/StatOverview.tsx`
- `src/game-template/components/team-stats/ScoringAnalysis.tsx`

## Usage Notes

1. On API Data page, load **Statbotics EPA** (or Match Validation Data, which also refreshes EPA).
2. Then view Team Stats / Strategy Overview and enable desired Statbotics columns.
3. If values seem stale, reload Statbotics EPA for that event.

## Additional Change Log Entries

Cross-feature updates that are not specific to Statbotics are tracked in:
- [CHANGELOG_2026.md](CHANGELOG_2026.md)
