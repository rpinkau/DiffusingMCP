---
globs: '["**/*"]'
description: Wird angewendet, wenn read_file aufgerufen wird oder Dateipfade in
  Code verwendet werden. Stellt sicher, dass die korrekte relative Pfadsyntax
  vom Projektroot aus verwendet wird.
---

use read_file mit Parameter filepath = "relative/pfad/vom/Projektroot" (kein ./, kein path-Parameter)