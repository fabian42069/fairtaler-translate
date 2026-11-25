#!/bin/sh
# Fairtaler Translate for the browser (Linux and macOS).
# Serves the app from this folder on http://localhost:47831/ (only reachable
# from this computer) and opens it in your normal browser. Nothing is sent
# anywhere; press Ctrl+C (or close the terminal) to stop Fairtaler.
# Run it with:  sh start-fairtaler.sh
cd "$(dirname "$0")/app" || { echo "The 'app' folder is missing. Unpack the whole download and try again."; exit 1; }
PORT=47831
URL="http://localhost:$PORT/"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is needed to run Fairtaler in the browser. Install it (for example: sudo apt install python3) and try again."
  exit 1
fi
open_browser() {
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  elif command -v open >/dev/null 2>&1; then open "$URL"
  else echo "Open $URL in your browser."; fi
}
open_browser &
echo ""
echo "  Fairtaler Translate is running at $URL"
echo "  Press Ctrl+C to stop it."
echo ""
exec python3 -c '
import http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
        ".json": "application/json", ".gz": "application/octet-stream", "": "application/octet-stream"}
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def log_message(self, *a): pass
try:
    http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
except OSError:
    print("Fairtaler is probably already running: opening it in the browser.")
except KeyboardInterrupt:
    pass
' "$PORT"
