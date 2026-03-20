# Diffusing MCP Capsule (Standalone)

This is the standalone "Brain" of the Diffusing project. It manages the Python image generation backend and provides an interface for AI agents (MCP) and the VS Code extension (HTTP).

## Architecture

- **MCP (stdio)**: For Claude Desktop or other AI tools.
- **HTTP/SSE (Port 5556)**: For the VS Code extension.
- **Python (Port 5555)**: Internal workhorse, managed by this capsule.

## Setup

1. `npm install`
2. `npm run build` (Erzeugt ein kompaktes Bundle in `build/index.js`)

> [!TIP]
> Nach `npm run build` kannst du den `node_modules`-Ordner löschen. Die Kapsel benötigt nur noch die Datei `build/index.js`, um zu funktionieren.

## Running

### Standalone (Manual)
`npm start`

### In Claude Desktop
Add this to your `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "diffusing": {
      "command": "node",
      "args": ["C:/GIT/DiffusingMCP/build/index.js"],
      "env": {
        "LOCALAPPDATA": "C:/Users/DEIN_NAME/AppData/Local"
      }
    }
  }
}
```

### Als Windows-Daemon (Hintergrund-Dienst)
Damit die Kapsel immer im Hintergrund läuft (ohne offenes Terminal), empfiehlt sich **PM2**:

1. **PM2 installieren**: `npm install -g pm2`
2. **Starten**: `pm2 start build/index.js --name "diffusing-mcp"`
3. **Autostart beim Booten**: 
   - `npm install -g pm2-windows-startup`
   - `pm2-startup install`
   - `pm2 save`

## Features
- **Auto-Start**: Spawns the Python backend on demand.
- **Base64 Result**: Returns images direkt in den AI-Chat.
- **Idle Unload**: Schaltet das Backend nach 15 Min. Inaktivität ab (VRAM-Schutz).
- **Model Hot-Swap**: Startet das Backend bei Modell-Wechsel automatisch neu.
