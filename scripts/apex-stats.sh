#!/bin/bash
# Prints Apex's live numbers (sign-ups, active users, Pro) for Claude. Uses the private key in ~/.config/apex/stats-key,
# which must match APEX_STATS_KEY on Netlify. The key never goes in this repo.
KEY=$(cat ~/.config/apex/stats-key 2>/dev/null) || { echo "No key in ~/.config/apex/stats-key"; exit 1; }
curl -sf https://apexrunning.app/.netlify/functions/apex-stats -H "x-apex-stats-key: $KEY" || echo "Stats not reachable (key not on Netlify yet, or not deployed)"
