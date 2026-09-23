#!/usr/bin/env bash
# GitHub Pages serves assets with `cache-control: max-age=600`, so for ten
# minutes after a deploy browsers keep running the old CSS/JS. This stamps each
# asset URL in index.html with a hash of that file's contents, so a changed file
# gets a new URL and an unchanged one stays cached.
#
# Run it after editing anything in assets/ and before committing.
set -euo pipefail
cd "$(dirname "$0")/.."

for f in theme.css config.js app.js city.js architecture.js; do
  h=$(md5 -q "assets/$f" 2>/dev/null || md5sum "assets/$f" | cut -d' ' -f1)
  h=${h:0:8}
  perl -pi -e "s{(\./)?(assets/\Q$f\E)(\?v=[0-9a-f]+)?}{\${1}\$2?v=$h}g" index.html
  echo "  assets/$f -> ?v=$h"
done

# preview-offline.html is a copy of index.html, not a link — keep it in step.
if [ -f preview-offline.html ]; then
  mh=$(md5 -q __mock.js 2>/dev/null || md5sum __mock.js | cut -d' ' -f1)
  mh=${mh:0:8}
  perl -pe "s{<script src=\"assets/config\\.js}{<script src=\"__mock.js?v=$mh\"></script>\\n<script src=\"assets/config.js}" index.html > preview-offline.html
  echo "  preview-offline.html regenerated"
fi
