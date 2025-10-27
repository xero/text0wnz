# Webserver Configuration

This guide covers webserver setup for serving the teXt0wnz application and proxying WebSocket connections for the collaboration server.

## Overview

The teXt0wnz deployment consists of two components:

1. **Static files** - The built application in `dist/` directory
2. **Collaboration server** - Node.js server for real-time collaboration (optional)

A webserver like nginx serves the static files and proxies WebSocket connections to the collaboration server.

## Nginx Configuration

### Basic Setup

**1. Install nginx:**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx

# macOS
brew install nginx
```

**2. Create configuration file:**

`/etc/nginx/sites-available/text0wnz`

```nginx
server {
    listen 80;
    listen 443 ssl;

    root /path/to/text0wnz/dist;
    index index.html;

    server_name text.0w.nz;  # Replace with your domain

    # Include your SSL configuration
    include snippets/ssl.conf;

    location ~ /.well-known {
        allow all;
    }

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy WebSocket connections for collaboration
    location /server {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_redirect off;
        proxy_pass http://localhost:1337/;  # Note the trailing slash
    }
}
```

**3. Enable the site:**

```bash
sudo ln -s /etc/nginx/sites-available/text0wnz /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

### Key Configuration Points

**Document Root:**

- Must point to the built `dist/` directory
- Contains `index.html`, `ui/`, and other assets
- Not the `src/` directory

**WebSocket Proxy:**

- `proxy_pass` must match your collaboration server port
- Trailing slash is **required** (`http://localhost:1337/`)
- WebSocket upgrade headers are essential
- Long timeout (86400 = 24 hours) for persistent connections

**Try Files:**

- `try_files $uri $uri/ /index.html` enables client-side routing
- Falls back to index.html for SPA behavior

## SSL/HTTPS Configuration

### SSL Snippet File

Create `/etc/nginx/snippets/ssl.conf`:

```nginx
# Certificate files
ssl_certificate /etc/ssl/private/letsencrypt-domain.pem;
ssl_certificate_key /etc/ssl/private/letsencrypt-domain.key;

# SSL protocols and ciphers
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;

# SSL session cache
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
```

### Let's Encrypt (Certbot)

**1. Install Certbot:**

```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

**2. Obtain certificate:**

```bash
sudo certbot --nginx -d text.0w.nz
```

**3. Auto-renewal:**

Certbot automatically sets up renewal. Verify with:

```bash
sudo certbot renew --dry-run
```

**4. Copy certificates to expected location:**

```bash
sudo cp /etc/letsencrypt/live/text.0w.nz/fullchain.pem /etc/ssl/private/letsencrypt-domain.pem
sudo cp /etc/letsencrypt/live/text.0w.nz/privkey.pem /etc/ssl/private/letsencrypt-domain.key
sudo chmod 644 /etc/ssl/private/letsencrypt-domain.pem
sudo chmod 600 /etc/ssl/private/letsencrypt-domain.key
```

**5. Set up renewal hook:**

Create `/etc/letsencrypt/renewal-hooks/deploy/copy-certs.sh`:

```bash
#!/bin/bash
cp /etc/letsencrypt/live/text.0w.nz/fullchain.pem /etc/ssl/private/letsencrypt-domain.pem
cp /etc/letsencrypt/live/text.0w.nz/privkey.pem /etc/ssl/private/letsencrypt-domain.key
chmod 644 /etc/ssl/private/letsencrypt-domain.pem
chmod 600 /etc/ssl/private/letsencrypt-domain.key
systemctl reload nginx
```

Make executable:

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-certs.sh
```

## Advanced Nginx Configuration

### Full Production Configuration

```nginx
# Map for WebSocket upgrade
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=text0wnz:10m rate=10r/s;

server {
    listen 80;
    server_name text.0w.nz;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name text.0w.nz;

    # Document root
    root /var/www/text0wnz/dist;
    index index.html;

    # SSL configuration
    include snippets/ssl.conf;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/javascript application/json image/svg+xml;

    # Brotli compression (if enabled)
    # brotli on;
    # brotli_comp_level 6;
    # brotli_types text/plain text/css text/xml text/javascript
    #              application/x-javascript application/xml+rss
    #              application/javascript application/json image/svg+xml;

    # Let's Encrypt challenge
    location ~ /.well-known {
        allow all;
    }

    # Static assets with long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Service worker and manifest - no cache
    location ~* (service\.js|site\.webmanifest)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        expires 0;
    }

    # Main application
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # WebSocket proxy for collaboration
    location /server {
        # Rate limiting
        limit_req zone=text0wnz burst=20 nodelay;

        # Proxy settings
        proxy_pass http://localhost:1337/;
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # Forwarding headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # Timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # Buffering
        proxy_buffering off;
        proxy_redirect off;
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### Performance Optimizations

**Worker processes:**

```nginx
# In nginx.conf
worker_processes auto;
worker_connections 1024;
```

**Caching:**

```nginx
# In http block
open_file_cache max=1000 inactive=20s;
open_file_cache_valid 30s;
open_file_cache_min_uses 2;
open_file_cache_errors on;
```

**Buffer sizes:**

```nginx
client_body_buffer_size 10K;
client_header_buffer_size 1k;
client_max_body_size 8m;
large_client_header_buffers 2 1k;
```

## Apache Configuration

Alternative setup using Apache:

### Virtual Host Configuration

`/etc/apache2/sites-available/text0wnz.conf`

```apache
<VirtualHost *:80>
    ServerName text.0w.nz
    Redirect permanent / https://text.0w.nz/
</VirtualHost>

<VirtualHost *:443>
    ServerName text.0w.nz
    DocumentRoot /var/www/text0wnz/dist

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/ssl/private/letsencrypt-domain.pem
    SSLCertificateKeyFile /etc/ssl/private/letsencrypt-domain.key
    SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5

    # Enable required modules
    # a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl

    <Directory /var/www/text0wnz/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted

        # Enable SPA routing
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    # WebSocket proxy for collaboration
    ProxyPreserveHost On
    ProxyRequests Off

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /server/(.*) ws://localhost:1337/$1 [P,L]
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /server/(.*) http://localhost:1337/$1 [P,L]

    ProxyPass /server http://localhost:1337/
    ProxyPassReverse /server http://localhost:1337/

    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
    </IfModule>

    # Caching
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/jpg "access plus 1 year"
        ExpiresByType image/jpeg "access plus 1 year"
        ExpiresByType image/gif "access plus 1 year"
        ExpiresByType image/png "access plus 1 year"
        ExpiresByType image/svg+xml "access plus 1 year"
        ExpiresByType text/css "access plus 1 year"
        ExpiresByType application/javascript "access plus 1 year"
        ExpiresByType application/x-font-woff "access plus 1 year"
    </IfModule>

    # Security headers
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
</VirtualHost>
```

**Enable site:**

```bash
sudo a2ensite text0wnz
sudo systemctl reload apache2
```

## Caddy Configuration

Modern alternative with automatic HTTPS:

### Caddyfile

```caddy
text.0w.nz {
    # Automatic HTTPS via Let's Encrypt

    # Document root
    root * /var/www/text0wnz/dist

    # Enable file server
    file_server

    # SPA routing
    try_files {path} /index.html

    # WebSocket proxy for collaboration
    handle /server* {
        reverse_proxy localhost:1337
    }

    # Compression
    encode gzip zstd

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
    }

    # Cache static assets
    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

**Start Caddy:**

```bash
sudo caddy start
```

## Troubleshooting

### WebSocket Connection Issues

**Problem: WebSocket fails to upgrade**

Check nginx error log:

```bash
sudo tail -f /var/log/nginx/error.log
```

Common fixes:

1. Ensure trailing slash in `proxy_pass`: `http://localhost:1337/`
2. Verify WebSocket headers are set
3. Check long timeout values
4. Test direct connection (bypass nginx)

**Problem: Connection drops after short time**

Increase timeouts:

```nginx
proxy_read_timeout 86400;
proxy_send_timeout 86400;
```

**Problem: 502 Bad Gateway**

Collaboration server not running:

```bash
# Check if server is running
ps aux | grep node

# Start server
bun server 1337
```

### SSL Certificate Issues

**Problem: Certificate errors in browser**

1. Verify certificate files exist and are readable
2. Check certificate validity:

```bash
openssl x509 -in /etc/ssl/private/letsencrypt-domain.pem -noout -dates
```

3. Ensure certificate matches domain
4. Check intermediate certificates are included

**Problem: Mixed content warnings**

Ensure all assets load over HTTPS:

1. Check service worker registration
2. Verify all URLs are relative or use HTTPS
3. Add CSP header to enforce HTTPS

### Static File Issues

**Problem: 404 errors for assets**

1. Verify document root points to `dist/` directory
2. Check file permissions:

```bash
ls -la /var/www/text0wnz/dist
```

3. Ensure nginx user can read files:

```bash
sudo chown -R www-data:www-data /var/www/text0wnz/dist
sudo chmod -R 755 /var/www/text0wnz/dist
```

**Problem: CSS/JS not loading**

1. Check MIME types in nginx:

```nginx
include /etc/nginx/mime.types;
default_type application/octet-stream;
```

2. Verify gzip compression doesn't break files
3. Check browser DevTools Network tab

### Performance Issues

**Problem: Slow page loads**

1. Enable gzip/brotli compression
2. Set proper cache headers
3. Enable HTTP/2
4. Optimize buffer sizes
5. Use CDN for static assets

**Problem: High memory usage**

1. Reduce worker connections
2. Limit request body size
3. Enable buffering for proxy
4. Monitor with `htop`

## Monitoring

### Nginx Access Logs

```bash
# Real-time access log
sudo tail -f /var/log/nginx/access.log

# Filter for errors
sudo grep "error" /var/log/nginx/error.log

# Count requests per IP
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

### Nginx Status Module

Enable in nginx.conf:

```nginx
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

Check status:

```bash
curl http://localhost/nginx_status
```

### Log Analysis Tools

- **GoAccess** - Real-time web log analyzer
- **AWStats** - Advanced web statistics
- **Webalizer** - Web server log analysis

## See Also

- [Collaboration Server](collaboration-server.md) - Server setup and configuration
- [Building and Developing](building-and-developing.md) - Build process
- [Testing](testing.md) - Testing setup
