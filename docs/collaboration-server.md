# Collaboration Server (Backend App)

The teXt0wnz collaboration server enables real-time multi-user editing of text art. Built with Node.js and Express, it provides WebSocket-based communication for synchronized drawing and chat.

## Features

- **Real-time collaboration** - Multiple users can edit the same canvas simultaneously
- **Canvas persistence** - Canvas state auto-saved to disk at configurable intervals
- **Chat functionality** - Built-in chat for collaborators
- **Session management** - Named sessions with automatic state restoration
- **SSL support** - Optional HTTPS/WSS encryption
- **Minimal overhead** - Efficient message broadcasting and state management
- **User tracking** - Track connected users and their activities
- **Timestamped backups** - Automatic backup creation on save

## Server Architecture

### Core Files

```
src/js/server/
├── main.js         # Entry point and CLI argument processing
├── config.js       # Configuration parsing and validation
├── server.js       # Express server and middleware setup
├── text0wnz.js     # Collaboration engine and state management
├── websockets.js   # WebSocket server and message handling
├── fileio.js       # File I/O operations and SAUCE handling
└── utils.js        # Utility functions and helpers
```

### Component Overview

**main.js** - Server entry point. Processes command-line arguments and starts the server.

**config.js** - Parses and validates configuration options from CLI arguments.

**server.js** - Sets up Express server with session middleware, SSL support, and WebSocket routing.

**text0wnz.js** - Collaboration engine that manages canvas state, user sessions, and message broadcasting.

**websockets.js** - Handles WebSocket connections, message routing, and session cleanup.

**fileio.js** - Manages file reading/writing, SAUCE metadata creation, and binary data conversions.

**utils.js** - Helper functions for logging, data validation, and format conversions.

## How It Works

1. **Server starts** and listens on the configured port (default: 1337)
2. **Clients connect** via WebSocket (direct or through reverse proxy)
3. **Session loads** existing canvas state or creates new session
4. **Users collaborate** by sending drawing commands and chat messages
5. **Server broadcasts** all changes to connected clients in real-time
6. **Auto-save** persists canvas and chat at configured intervals
7. **Cleanup** manages disconnected users and stale sessions

## Installation & Setup

### Dependencies

Install required Node.js modules:

```bash
npm install
# or
bun i
```

Required packages:

- `express` (v5.1.0+) - Web framework
- `express-session` (v1.18.2+) - Session middleware
- `express-ws` (v5.0.2+) - WebSocket support

### Starting the Server

Basic start:

```bash
bun server
# or
node src/js/server/main.js
```

The server starts on port 1337 by default.

## Command-Line Options

| Option                 | Description                                      | Default            |
| ---------------------- | ------------------------------------------------ | ------------------ |
| `[port]`               | Port to run the server on                        | `1337`             |
| `--ssl`                | Enable SSL (requires certificates in `ssl-dir`)  | Disabled           |
| `--ssl-dir <path>`     | SSL certificate directory                        | `/etc/ssl/private` |
| `--save-interval <n>`  | Auto-save interval in minutes                    | `30` (minutes)     |
| `--session-name <str>` | Session file prefix (for state and chat backups) | `joint`            |
| `--debug`              | Enable verbose logging                           | `false`            |
| `--help`               | Show help message and usage examples             | -                  |

### Examples

**Basic usage with custom port:**

```bash
bun server 8080
```

**With SSL and custom session name:**

```bash
bun server 443 --ssl --ssl-dir /etc/letsencrypt --session-name myjam
```

**With custom save interval and debug mode:**

```bash
bun server 1337 --save-interval 10 --debug
```

**Complete configuration:**

```bash
bun server 8080 --ssl --ssl-dir /etc/letsencrypt --save-interval 15 --session-name collab --debug
```

## Environment Variables

You can set environment variables before starting the server:

| Variable      | Description                    | Example          |
| ------------- | ------------------------------ | ---------------- |
| `NODE_ENV`    | Node environment setting       | `production`     |
| `SESSION_KEY` | Session secret key for express | `supersecretkey` |

> [!IMPORTANT]
> By default, the session secret is set to `"sauce"`. For production use, set a strong value via `SESSION_KEY` or modify in `src/js/server/server.js`.

**Example with environment variables:**

```bash
NODE_ENV=production SESSION_KEY=your-secret-key bun server 1337
```

## WebSocket Protocol

### Client-to-Server Messages

| Message Type          | Format                                     | Description                                 |
| --------------------- | ------------------------------------------ | ------------------------------------------- |
| `join`                | `["join", username]`                       | User joins collaboration session            |
| `nick`                | `["nick", newUsername]`                    | User changes display name                   |
| `chat`                | `["chat", message]`                        | Chat message                                |
| `draw`                | `["draw", blocks]`                         | Drawing command with array of canvas blocks |
| `resize`              | `["resize", {columns, rows}]`              | Canvas size change                          |
| `fontChange`          | `["fontChange", {fontName}]`               | Font selection change                       |
| `iceColorsChange`     | `["iceColorsChange", {iceColors}]`         | Ice colors toggle                           |
| `letterSpacingChange` | `["letterSpacingChange", {letterSpacing}]` | Letter spacing toggle                       |

### Server-to-Client Messages

| Message Type          | Format                                        | Description               |
| --------------------- | --------------------------------------------- | ------------------------- |
| `start`               | `["start", sessionData, sessionID, userList]` | Initial session data      |
| `join`                | `["join", username, sessionID]`               | User joined notification  |
| `part`                | `["part", sessionID]`                         | User left notification    |
| `nick`                | `["nick", username, sessionID]`               | User name change          |
| `chat`                | `["chat", username, message]`                 | Chat message broadcast    |
| `draw`                | `["draw", blocks]`                            | Drawing command broadcast |
| `resize`              | `["resize", {columns, rows}]`                 | Canvas resize broadcast   |
| `fontChange`          | `["fontChange", {fontName}]`                  | Font change broadcast     |
| `iceColorsChange`     | `["iceColorsChange", {iceColors}]`            | Ice colors broadcast      |
| `letterSpacingChange` | `["letterSpacingChange", {letterSpacing}]`    | Letter spacing broadcast  |

## Session Management

### Canvas State (ImageData Object)

The server maintains canvas state in the following structure:

```javascript
{
  columns: number,        // Canvas width in characters
  rows: number,          // Canvas height in characters
  data: Uint16Array,     // Character/attribute data
  iceColours: boolean,   // Extended color palette enabled
  letterSpacing: boolean, // 9px font spacing enabled
  fontName: string       // Selected font name
}
```

### File Structure

Session files are stored in the server working directory:

- `{sessionName}.bin` - Binary canvas data (current state)
- `{sessionName}.json` - Chat history and metadata
- `{sessionName} {timestamp}.bin` - Timestamped backups

**Example:**

- `joint.bin` - Current canvas state
- `joint.json` - Current chat history
- `joint 2024-01-15T10-30-00.bin` - Backup from specific time

### State Persistence

**Auto-save:**

- Saves at configured intervals (default: 30 minutes)
- Creates timestamped backup on each save
- Persists both canvas and chat data

**Manual save:**

- Triggered by configuration changes
- Runs on server shutdown (graceful)

**State restoration:**

- Loads existing session on startup
- New users receive current state
- Seamless mid-session joins

## Process Management

### systemd (Recommended for Servers)

Create a systemd service file: `/etc/systemd/system/text0wnz.service`

```ini
[Unit]
Description=teXt0wnz Collaboration Server
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/text0wnz/src/js/server/main.js 1337
Restart=always
User=youruser
Environment=NODE_ENV=production
Environment=SESSION_KEY=your-secret-key
WorkingDirectory=/path/to/text0wnz/
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=text0wnz

[Install]
WantedBy=multi-user.target
```

**Enable and start:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now text0wnz.service
```

**Check status:**

```bash
sudo systemctl status text0wnz.service
```

**View logs:**

```bash
sudo journalctl -u text0wnz.service -f
```

### forever (Alternative)

Simple Node.js CLI tool for process management:

```bash
# Install
bun i -g forever

# Start server
forever start src/js/server/main.js 1337

# List running processes
forever list

# Stop server
forever stop src/js/server/main.js

# Restart server
forever restart src/js/server/main.js
```

**Pros:**

- Simple and lightweight
- Easy to set up

**Cons:**

- Less robust than systemd
- No system-level integration

## SSL Configuration

### Certificate Setup

The server expects SSL certificates in the configured directory (default: `/etc/ssl/private`):

- `letsencrypt-domain.pem` - Certificate file
- `letsencrypt-domain.key` - Private key file

### Let's Encrypt Example

```bash
# Obtain certificates
sudo certbot certonly --standalone -d text.0w.nz

# Copy to server directory
sudo cp /etc/letsencrypt/live/text.0w.nz/fullchain.pem /etc/ssl/private/letsencrypt-domain.pem
sudo cp /etc/letsencrypt/live/text.0w.nz/privkey.pem /etc/ssl/private/letsencrypt-domain.key

# Set permissions
sudo chmod 644 /etc/ssl/private/letsencrypt-domain.pem
sudo chmod 600 /etc/ssl/private/letsencrypt-domain.key

# Start server with SSL
bun server 443 --ssl --ssl-dir /etc/ssl/private
```

### Auto-renewal

Set up automatic certificate renewal:

```bash
# Renewal script with automatic server restart
sudo crontab -e

# Add this line for monthly renewal
0 3 1 * * certbot renew --quiet && systemctl restart text0wnz.service
```

## Server Settings Synchronization

All canvas settings automatically sync across connected clients:

- **Canvas size** - Resizing affects all connected users
- **Font selection** - Font changes apply to everyone
- **iCE colors** - Extended palette toggle syncs
- **Letter spacing** - 9px font spacing syncs

New users joining mid-session receive the current collaboration state, not the defaults. This ensures consistency across all participants.

## Troubleshooting

### Common Issues

**Port already in use:**

```bash
# Check what's using the port
sudo lsof -i :1337

# Kill the process or choose a different port
bun server 8080
```

**Permission denied (port < 1024):**

```bash
# Use sudo for privileged ports
sudo bun server 443 --ssl

# Or use a higher port and proxy with nginx
bun server 8443 --ssl
```

**SSL certificate errors:**

```bash
# Verify certificate files exist
ls -la /etc/ssl/private/letsencrypt-domain.*

# Check permissions
sudo chmod 644 /etc/ssl/private/letsencrypt-domain.pem
sudo chmod 600 /etc/ssl/private/letsencrypt-domain.key

# Verify certificate validity
openssl x509 -in /etc/ssl/private/letsencrypt-domain.pem -noout -dates
```

**Session not saving:**

```bash
# Check write permissions in working directory
ls -la session/

# Create session directory if needed
mkdir -p session
chmod 755 session

# Verify with debug mode
bun server 1337 --debug
```

**WebSocket connection fails:**

- Check firewall rules (ufw, iptables)
- Verify nginx proxy configuration
- Test direct connection (bypass proxy)
- Check browser console for errors

### Debug Mode

Enable verbose logging:

```bash
bun server 1337 --debug
```

Debug mode logs:

- Connection attempts
- Message broadcasts
- Save operations
- User joins/leaves
- Error details

## Performance Considerations

**Memory Usage:**

- Minimal baseline (Node.js + Express)
- Scales with number of connected users
- Canvas state kept in memory
- Chat history accumulates over time

**Network Bandwidth:**

- Drawing commands broadcast to all users
- Efficient binary protocol
- Message deduplication by worker

**Disk I/O:**

- Auto-save at intervals (not continuous)
- Timestamped backups on each save
- Consider SSD for better performance

**Optimization Tips:**

- Lower save interval for busy sessions
- Limit chat history size
- Use compression in nginx proxy
- Monitor with `top` or `htop`

## Security Best Practices

1. **Use strong session secrets** - Set `SESSION_KEY` environment variable
2. **Enable SSL in production** - Use Let's Encrypt certificates
3. **Run as non-root user** - Use systemd with dedicated user account
4. **Keep dependencies updated** - Regular `bun update` or `npm update`
5. **Use firewall rules** - Restrict access to collaboration port
6. **Monitor logs** - Watch for suspicious activity
7. **Backup session files** - Regular backups of session directory

## Scaling & High Availability

For production deployments with high traffic:

**Load Balancing:**

- Not currently supported (sticky sessions required)
- Use nginx for SSL termination only
- Consider horizontal scaling in future versions

**Database Integration:**

- Currently file-based storage
- Future: Redis/MongoDB for session storage
- Would enable multi-server deployments

**Monitoring:**

- Use PM2 for process monitoring
- Set up health check endpoints
- Monitor with tools like Grafana/Prometheus

## See Also

- [Webserver Configuration](webserver-configuration.md) - Nginx and reverse proxy setup
- [Editor Client](editor-client.md) - Frontend application details
- [Building and Developing](building-and-developing.md) - Development workflow
