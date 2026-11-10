#!/bin/bash
# Claude's owner-only mailer: emails Apex users from hello@apexrunning.app via netlify/functions/apex-mail.js.
# usage: apex-mail.sh message.json   (JSON: {"subject","text","to":[...]}; add "send":true to actually send)
KEY=$(cat ~/.config/apex/stats-key 2>/dev/null) || { echo "No key in ~/.config/apex/stats-key"; exit 1; }
curl -s -X POST https://apexrunning.app/.netlify/functions/apex-mail -H "x-apex-stats-key: $KEY" -H "Content-Type: application/json" --data @"$1"
