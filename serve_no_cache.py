#!/usr/bin/env python3
"""Dev server that disables caching entirely, so phones/browsers always
fetch the latest JS while iterating. Only for local testing - not part of
the deployed app (GitHub Pages serves the plain static files)."""
import http.server
import socketserver

PORT = 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


with ReusableTCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving (no-cache) on port {PORT}")
    httpd.serve_forever()
