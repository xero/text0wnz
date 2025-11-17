# Other Useful Tools

This document covers additional tools and utilities that are useful for developing, deploying, and maintaining teXt0wnz.

> [!NOTE]
> Use `bun` and `npm` interchangeably.

## Development Tools

### pin-github-action

Automatically pins GitHub Actions dependencies to specific SHAs for security and reproducibility.

**Purpose:**

- Ensures workflow reproducibility
- Prevents supply chain attacks
- Required for this repository (all workflows must use pinned hashes)

**Installation:**

```bash
bun i -g pin-github-action
# or
npm install -g pin-github-action
```

**Usage:**

```bash
# Pin actions in a workflow file
pin-github-action /path/to/.github/workflows/your-workflow.yml

# Pin all workflows
for file in .github/workflows/*.yml; do
  pin-github-action "$file"
done
```

**Example transformation:**

```yaml
# Before
- uses: actions/checkout@v4

# After
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1
```

**Benefits:**

- Specific commit SHAs can't be changed maliciously
- Easier to track what version is actually being used
- Better security posture for CI/CD

**Documentation:** https://github.com/mheap/pin-github-action

### npm-check-updates (ncu)

Upgrades package.json dependencies to the latest versions, ignoring existing version constraints.

**Purpose:**

- Keep dependencies up to date
- Find available updates quickly
- Batch update all dependencies

**Installation:**

```bash
bun i npm-check-updates
```

**Usage:**

```bash
# Check for updates (dry run)
ncu

# Update package.json
ncu -u

# Install updated packages
bun i

# Update specific packages
ncu -u eslint vitest

# Update only minor and patch versions
ncu -u --target minor

# Interactive mode
ncu -i
```

**Best practices:**

1. Always test after updating dependencies
2. Update incrementally (not all at once)
3. Check for breaking changes in changelogs
4. Run tests before committing updates
5. Review security advisories

**Documentation:** https://github.com/raineorshine/npm-check-updates

## Git Tools

### Git Pre-commit Hook

Custom pre-commit hook for ensuring code quality before commits.

**Location:** `docs/pre-commit`

**Installation:**

```bash
# Copy to .git/hooks/
cp docs/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**What it does:**

- Runs linting checks
- Runs formatting checks
- Prevents commits with issues
- Ensures code quality standards

```bash
#!/bin/sh
# kopimi mmxxv x0
printf "%s\n%s\n" "running pre commit hooks" "use --no-verify to skip"

# formatting & linting
bun fix
RESULT=$?
if [ $RESULT -ne 0 ]; then
	printf "\n%s\n" "linting failed. commit aborted."
	exit 1
fi
# update any tracked files that might have been formatted
git add -u

# git upstream
git rev-parse --abbrev-ref --symbolic-full-name "@{u}" > /dev/null 2>&1
RESULT=$?
if [ $RESULT -ne 0 ]; then
	printf "\n%s\n%s\n" "no upstream branch configured for the current branch." "configure an upstream using: \`git branch --set-upstream-to=origin/<branch> <branch>\`"
	exit 1
fi

printf "\n%s\n" "fetching git upstreams..."
git fetch

LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "@{u}")
BASE=$(git merge-base @ "@{u}")

if [ "$LOCAL" = "$REMOTE" ]; then
	# in sync
	exit 0
elif [ "$LOCAL" = "$BASE" ]; then
	# local is behind
	printf "\n%s\n%s\n" "your branch is behind the remote." "pull and resolve before committing."
	exit 1
else
	# local is ahead or diverged
	exit 0
fi
```

### Optimizing Tutorial Images

When adding new tutorial preview images, optimize them with a tool like [imagemagick](https://imagemagick.org/script/download.php) limiting their palettes to only 16 colors and stripping any metadata.

```bash
#!/bin/sh
for file in *; do
	if [ -f "$file" ] && [ "./$file" != "$0" ]; then
		convert "$file" -colors 16 -strip "$file"
	fi
done
```

## Code Quality Tools

### ESLint Extensions

Additional ESLint plugins for enhanced code quality:

**eslint-plugin-security**

```bash
bun add -D eslint-plugin-security
```

Identifies potential security issues in code.

**eslint-plugin-sonarjs**

```bash
bun add -D eslint-plugin-sonarjs
```

Detects bugs and code smells.

**eslint-plugin-unicorn**

```bash
bun add -D eslint-plugin-unicorn
```

Powerful ESLint rules for better code quality.

### Prettier Plugins

**prettier-plugin-organize-imports**

```bash
bun add -D prettier-plugin-organize-imports
```

Automatically organizes import statements.

**prettier-plugin-packagejson**

```bash
bun add -D prettier-plugin-packagejson
```

Formats package.json files consistently.

## Performance Tools

### Lighthouse CI

Automated performance, accessibility, and SEO testing.

**Installation:**

```bash
bun i -g @lhci/cli
```

**Usage:**

```bash
# Run Lighthouse
lhci autorun

# With custom config
lhci autorun --config=lighthouserc.json
```

**Example config (`lighthouserc.json`):**

```json
{
	"ci": {
		"collect": {
			"url": ["http://localhost:8060"],
			"numberOfRuns": 3
		},
		"assert": {
			"assertions": {
				"categories:performance": ["error", { "minScore": 0.9 }],
				"categories:accessibility": ["error", { "minScore": 0.9 }]
			}
		}
	}
}
```

### Bundle Analyzer

Analyze bundle size and dependencies.

**rollup-plugin-visualizer** (included with Vite):

```javascript
// Add to vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
	plugins: [
		visualizer({
			open: true,
			gzipSize: true,
			brotliSize: true,
		}),
	],
});
```

Then run:

```bash
bun bake
# Opens visualization in browser
```

## Deployment Tools

### PM2 (Process Manager)

Advanced process manager for Node.js applications.

**Installation:**

```bash
bun i -g pm2
```

**Usage:**

```bash
# Start server
pm2 start src/js/server/main.js --name text0wnz -- 1337

# List processes
pm2 list

# Monitor
pm2 monit

# Logs
pm2 logs text0wnz

# Restart
pm2 restart text0wnz

# Stop
pm2 stop text0wnz

# Delete from PM2
pm2 delete text0wnz

# Save process list
pm2 save

# Startup script
pm2 startup
```

**Ecosystem file (`ecosystem.config.js`):**

```javascript
module.exports = {
	apps: [
		{
			name: 'text0wnz',
			script: './src/js/server/main.js',
			args: '1337',
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: '1G',
			env: {
				NODE_ENV: 'production',
				SESSION_KEY: 'your-secret-key',
			},
		},
	],
};
```

Run with:

```bash
pm2 start ecosystem.config.js
```

## Monitoring Tools

### Uptime Kuma

Self-hosted monitoring tool.

**Installation:**

```bash
docker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data --name uptime-kuma louislam/uptime-kuma:1
```

**Setup monitors for:**

- Application URL (https://text.0w.nz)
- Collaboration server port
- SSL certificate expiration

### Netdata

Real-time performance monitoring.

**Installation:**

```bash
bash <(curl -Ss https://my-netdata.io/kickstart.sh)
```

**Monitors:**

- CPU usage
- Memory usage
- Disk I/O
- Network traffic
- nginx statistics
- Node.js process metrics

## Security Tools

### bun / npm audit

Check for vulnerabilities in dependencies.

**Usage:**

```bash
# Run audit
bun audit

# Fix vulnerabilities automatically
bun audit fix

# Force fix (may break things)
bun audit fix --force

# Detailed report
bun audit --json
```

### Snyk

Advanced security scanning for dependencies.

**Installation:**

```bash
bun i -g snyk
snyk auth
```

**Usage:**

```bash
# Test for vulnerabilities
snyk test

# Monitor project
snyk monitor

# Fix vulnerabilities
snyk fix
```

### Dependabot

GitHub's automated dependency updates.

**Configuration (`.github/dependabot.yml`):**

```yaml
version: 2
updates:
  - package-ecosystem: 'bun'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
    reviewers:
      - 'xero'
```

## CI/CD Tools

### GitHub Actions

Already configured in `.github/workflows/`.

**Useful actions:**

- `actions/checkout` - Checkout code
- `actions/setup-node` - Setup Node.js
- `actions/cache` - Cache dependencies
- `actions/upload-artifact` - Upload test results
- `peaceiris/actions-gh-pages` - Deploy to GitHub Pages

### Act (Local GitHub Actions)

Run GitHub Actions locally.

**Installation:**

```bash
# macOS
brew install act

# Linux
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

**Usage:**

```bash
# List workflows
act -l

# Run workflow
act push

# Run specific job
act -j test

# Dry run
act -n
```

## Documentation Tools

### Markdown Linters

**markdownlint-cli:**

```bash
bun i -g markdownlint-cli

# Check markdown files
markdownlint '**/*.md'

# Fix issues
markdownlint --fix '**/*.md'
```

### JSDoc

Generate API documentation from code comments.

**Installation:**

```bash
bun i -g jsdoc
```

**Usage:**

```bash
# Generate docs
jsdoc src/js/client/*.js -d docs/api

# With config
jsdoc -c jsdoc.json
```

## Accessibility Tools

### axe DevTools

Browser extension for accessibility testing.

**Installation:**

- Chrome: Install from Chrome Web Store
- Firefox: Install from Firefox Add-ons

**Usage:**

1. Open DevTools
2. Go to axe DevTools tab
3. Click "Scan ALL of my page"
4. Review issues and fix

### Pa11y

Automated accessibility testing.

**Installation:**

```bash
bun i -g pa11y
```

**Usage:**

```bash
# Test URL
pa11y http://localhost:8060

# With reporter
pa11y --reporter cli http://localhost:8060

# CI mode
pa11y --threshold 10 http://localhost:8060
```

## Backup Tools

### rsync

Backup session files and artwork.

**Usage:**

```bash
# Backup session directory
rsync -avz /path/to/text0wnz/session/ user@backup-server:/backups/text0wnz/

# Automated backup script
#!/bin/bash
DATE=$(date +%Y-%m-%d)
rsync -avz /var/www/text0wnz/session/ /backups/text0wnz-$DATE/
```

### Cron Jobs

Automated tasks.

**Example crontab:**

```bash
# Edit crontab
crontab -e

# Backup every day at 2 AM
0 2 * * * /usr/local/bin/backup-text0wnz.sh

# Cleanup old backups weekly
0 3 * * 0 find /backups/text0wnz-* -mtime +30 -delete

# Restart server daily
0 4 * * * systemctl restart text0wnz.service
```

## Debugging Tools

### Chrome DevTools

Built-in browser debugging.

**Key features:**

- Elements inspector
- Console
- Network monitoring
- Performance profiling
- Memory profiling
- Application (Service Worker, Storage)

### Node.js Inspector

Debug Node.js server.

**Usage:**

```bash
# Start with inspector
node --inspect src/js/server/main.js

# With break on start
node --inspect-brk src/js/server/main.js
```

Then open Chrome DevTools:

```
chrome://inspect
```

### curl

Test HTTP/WebSocket endpoints.

**Usage:**

```bash
# Test static file
curl http://localhost:8060/

# Test with headers
curl -I https://text.0w.nz/

# Test WebSocket upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:1337/server
```

## See Also

- [Building and Developing](building-and-developing.md) - Development workflow
- [Testing](testing.md) - Testing tools and setup
- [Collaboration Server](collaboration-server.md) - Server configuration
- [Webserver Configuration](webserver-configuration.md) - Webserver setup
