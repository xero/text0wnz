# Browser Compatibility Analysis Guide

**Version:** 1.0
**Last Updated:** 2025-11-13 17:13:56 UTC
**Authors:** @xero @copilot
**Purpose:** Guide for analyzing browser compatibility using caniuse.com data

---

## Current Support Status

# Browser Support Matrix

| Browser                                                    | Chrome                                                                                                                        | Firefox                                                                                                                         | Safari                                                                                                                                          | Edge                                                                                                                      | Opera                                                                                                                       | iOS                                                                                                                                   | iPadOS                                                                                                                                | Android                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Updated:** [2025-11-13](https://github.com/Fyrd/caniuse) | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/chrome/chrome.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/firefox/firefox.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/archive/safari_8-13/safari_8-13.png"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/edge/edge.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/opera/opera.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/safari-ios/safari-ios.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/safari-ios/safari-ios.svg"width="50" height="50"> | <img src="https://raw.githubusercontent.com/alrra/browser-logos/refs/heads/main/src/archive/chrome-android_18-36/chrome-android_18-36.png"width="50" height="50"> |
| **Supported**                                              | 95.0+                                                                                                                         | 93.0+                                                                                                                           | 15.0+                                                                                                                                           | 95.0+                                                                                                                     | 81.0+                                                                                                                       | 15.0+                                                                                                                                 | 15.0+                                                                                                                                 | 95.0+                                                                                                                                                             |
| **Unsupported**                                            | <94.0                                                                                                                         | <92.0                                                                                                                           | <14.0                                                                                                                                           | <94.0                                                                                                                     | <80.0                                                                                                                       | <14.0                                                                                                                                 | <14.0                                                                                                                                 | <94.0                                                                                                                                                             |
| **Latest Dev**                                             | Canary ✅                                                                                                                     | Nightly ✅                                                                                                                      | -                                                                                                                                               | -                                                                                                                         | -                                                                                                                           | -                                                                                                                                     | -                                                                                                                                     | -                                                                                                                                                                 |

---

## Table of Contents

1. [Overview](#overview)
2. [Data Source](#data-source)
3. [Analysis Methodology](#analysis-methodology)
4. [File Locations](#file-locations)
5. [Step-by-Step Process](#step-by-step-process)
6. [Feature Detection Patterns](#feature-detection-patterns)
7. [Output Formats](#output-formats)
8. [Common Pitfalls](#common-pitfalls)

---

## Overview

This guide documents the process for analyzing browser compatibility for web features used in the text0wnz application. The analysis uses data from the [Fyrd/caniuse](https://github.com/Fyrd/caniuse) repository, which maintains the canonical browser support database used by caniuse.com.

### Target Browser Versions

Based on project requirements, we target:

```json
{
	"chrome": "95+",
	"firefox": "93+",
	"safari": "15+",
	"edge": "95+",
	"opera": "81+",
	"iphone": "15.0+",
	"ipad": "15.0+",
	"android-chrome": "95+"
}
```

---

## Data Source

### Repository Information

- **Repository:** Fyrd/caniuse
- **Repository ID:** 3238243
- **Data Location:** `/features-json/` directory
- **File Format:** JSON (one file per feature)
- **Update Frequency:** Regular updates from caniuse.com

### Key Files Structure

Each feature has its own JSON file in `features-json/`:

```
Fyrd/caniuse/
└── features-json/
    ├── es6-module.json
    ├── indexeddb.json
    ├── serviceworkers.json
    ├── canvas.json
    ├── promises.json
    ├── websockets.json
    ├── webworkers.json
    ├── async-functions.json
    ├── typedarrays.json
    ├── requestanimationframe.json
    ├── customevent.json
    ├── namevalue-storage.json  (localStorage)
    ├── fetch.json
    ├── fileapi.json
    ├── filereader.json
    ├── bloburls.json
    ├── textencoder.json
    ├── atob-btoa.json
    ├── requestidlecallback.json
    ├── fullscreen.json
    ├── notifications.json
    ├── web-app-manifest.json
    ├── matchmedia.json
    ├── css-variables.json
    ├── css-nesting.json
    ├── dialog.json
    ├── pointer.json
    └── high-resolution-time.json  (performance.now)
```

---

## Analysis Methodology

### 1. Identify Features Used in Codebase

Search the codebase for API usage patterns:

**Example from text0wnz:**

```bash
# Find IndexedDB usage
grep -r "indexedDB" src/

# Find Service Worker registration
grep -r "serviceWorker" src/

# Find ES6 imports
grep -r "import.*from" src/
```

### 2. Map Features to Caniuse Files

Create a mapping between code features and caniuse data files:

| Code Feature              | Caniuse File                | Notes                         |
| ------------------------- | --------------------------- | ----------------------------- |
| `import/export`           | `es6-module.json`           | ES6 modules                   |
| `window.indexedDB`        | `indexeddb.json`            | Database API                  |
| `navigator.serviceWorker` | `serviceworkers.json`       | PWA feature                   |
| `localStorage`            | `namevalue-storage.json`    | Note: NOT `localstorage.json` |
| `performance.now()`       | `high-resolution-time.json` | Timing API                    |

⚠️ **Important:** File names don't always match feature names exactly!

### 3. Batch Retrieve Feature Data

Organize features into logical batches for efficient retrieval:

**Batch 1 - Core JavaScript (5 features):**

- ES6 Modules
- IndexedDB
- Service Workers
- Canvas 2D
- Promises

**Batch 2 - Networking & Workers (5 features):**

- WebSockets
- Web Workers
- async/await
- Typed Arrays
- requestAnimationFrame

**Batch 3 - File Handling (5 features):**

- CustomEvent
- localStorage
- Fetch API
- File API
- FileReader

**Batch 4 - Advanced APIs (5 features):**

- Blob URLs
- TextEncoder
- atob/btoa
- requestIdleCallback
- Fullscreen API

**Batch 5 - Modern Features (5 features):**

- Notifications
- Web App Manifest
- matchMedia
- CSS Variables
- CSS Nesting

**Batch 6 - UI & Performance (3 features):**

- Dialog element
- Pointer Events
- performance.now()

---

## File Locations

### In text0wnz Repository

```
xero/text0wnz/
└── docs/
    ├── browser-support-matrix.json              (machine format)
    └── browser-compatibility-analysis-guide.md  (this file)
```

### In Fyrd/caniuse Repository

```
Fyrd/caniuse/
├── features-json/
│   └── [feature-name].json                       (individual features)
└── data.json                                     (combined data - optional)
```

---

## Step-by-Step Process

### Step 1: Identify Features

1. Review application code for web APIs
2. List all browser-dependent features
3. Create initial feature list

**Example from main.js:**

```javascript
// Service Worker
if ('serviceWorker' in navigator) { ... }

// IndexedDB (via State.js)
State.saveToLocalStorage()

// requestIdleCallback
if ('requestIdleCallback' in window) { ... }
```

### Step 2: Retrieve Caniuse Data

Use the GitHub Read tool to fetch feature data:

```
Tool: githubread
Query: "Get the content of features-json/[feature-name].json from Fyrd/caniuse repository"
```

**Process in batches** to avoid overwhelming the API:

- 5-6 features per batch
- Review each batch before proceeding
- Note any anomalies or unexpected results

### Step 3: Parse Version Support

For each feature, extract version numbers from the `stats` object:

```json
{
	"stats": {
		"chrome": {
			"94": "n",
			"95": "y",
			"96": "y"
		},
		"safari": {
			"14.0": "n",
			"15.0": "y"
		}
	}
}
```

**Support Values:**

- `"y"` = Fully supported
- `"a"` = Partial support (check notes)
- `"n"` = Not supported
- `"p"` = Polyfill available
- `"u"` = Unknown
- `"x"` = Requires prefix
- `"d"` = Disabled by default

### Step 4: Compare Against Target Versions

For each browser, check if the first `"y"` version is ≤ target version:

```javascript
// Example logic
const targetChrome = 95;
const featureSupport = 95; // First "y" in chrome stats

if (featureSupport <= targetChrome) {
	// ✅ Supported
} else {
	// ❌ Not supported in target version
}
```

### Step 5: Document Special Cases

**Case 1: Fallback Implemented**

```json
{
	"requestidlecallback": {
		"safari": "NOT_SUPPORTED",
		"status": "✅ FULLY_SUPPORTED",
		"notes": "Has setTimeout fallback in code"
	}
}
```

**Case 2: Progressive Enhancement**

```json
{
	"fullscreen": {
		"iphone": "PARTIAL",
		"status": "⚠️ LIMITED_IOS",
		"notes": "iPhone has overlay button limitation"
	}
}
```

**Case 3: Platform-Specific**

```json
{
	"web-app-manifest": {
		"firefox": "NOT_SUPPORTED",
		"status": "✅ PARTIAL_SUPPORT",
		"notes": "Firefox desktop lacks A2HS, doesn't affect app"
	}
}
```

### Step 6: Generate Output Files

Create three outputs:

1. **Detailed Analysis**
   - Full feature list
   - Version numbers
   - Status indicators
   - Notes and caveats
   - Comment this in the PR

2. **Machine Format** (`docs/browser-support-matrix.json`)
   - Simple true/false per version
   - Includes "one below" version
   - Canary/Nightly support

3. **Markdown Table** (`README.md`)
   - Human-readable format
   - Quick reference
   - Update timestamp

---

## Feature Detection Patterns

### Pattern 1: Direct Feature Check

```javascript
if ('requestIdleCallback' in window) {
	requestIdleCallback(callback);
} else {
	setTimeout(callback, 100);
}
```

**Analysis:** Look for feature with fallback → Mark as "SUPPORTED with fallback"

### Pattern 2: API Existence

```javascript
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('service.js');
}
```

**Analysis:** Optional feature → Mark as "PROGRESSIVE_ENHANCEMENT"

### Pattern 3: Try-Catch Usage

```javascript
try {
	const db = await window.indexedDB.open('mydb');
} catch (error) {
	// Fallback to memory storage
}
```

**Analysis:** Has error handling → Mark as "SUPPORTED with graceful degradation"

### Pattern 4: Polyfill Detection

```javascript
import 'core-js/features/promise';
```

**Analysis:** External polyfill → Check if polyfill supports target browsers

---

## Output Formats

### Format 1: Detailed JSON

```json
{
  "_meta": {
    "date": "2025-11-13",
    "source": "caniuse.com",
    "target_browsers": { ... }
  },
  "features": {
    "feature-name": {
      "title": "Human Readable Name",
      "chrome": "95",
      "firefox": "93",
      "safari": "15",
      "status": "✅ FULLY_SUPPORTED",
      "notes": "Optional notes"
    }
  }
}
```

### Format 2: Machine JSON

```json
{
	"chrome": {
		"95.0": true,
		"94.0": false,
		"canary": true
	},
	"firefox": {
		"93.0": true,
		"92.0": false,
		"nightly": true
	}
}
```

### Format 3: Markdown Table

vertical style:

```markdown
|                 | Chrome         | Firefox        | Safari         | Edge  | Opera | iPhone | iPad  | Android Chrome |
| --------------- | -------------- | -------------- | -------------- | ----- | ----- | ------ | ----- | -------------- |
| **Supported**   | 95.0+          | 93.0+          | 15.0+          | 95.0+ | 81.0+ | 15.0+  | 15.0+ | 95.0+          |
| **Unsupported** | 94.0 and below | 92.0 and below | 14.0 and below | ...   |
| **Latest Dev**  | Canary ✅      | Nightly ✅     | -              | -     | -     | -      | -     | -              |
```

horizontal style:

```markdown
| Browser        | Supported | Not Supported  | Latest Dev Build |
| -------------- | --------- | -------------- | ---------------- |
| Chrome         | 95.0+     | 94.0 and below | Canary ✅        |
| Firefox        | 93.0+     | 92.0 and below | Nightly ✅       |
| Safari         | 15.0+     | 14.0 and below | -                |
| Edge           | 95.0+     | 94.0 and below | -                |
| Opera          | 81.0+     | 80.0 and below | -                |
| iPhone         | 15.0+     | 14.0 and below | -                |
| iPad           | 15.0+     | 14.0 and below | -                |
| Android Chrome | 95.0+     | 94.0 and below | -                |
```

---

## Common Pitfalls

### Pitfall 1: Filename Mismatches

❌ **Wrong:**

```
features-json/localstorage.json  (doesn't exist)
```

✅ **Correct:**

```
features-json/namevalue-storage.json
```

**Solution:** Search the caniuse repo first or check the feature list on caniuse.com

### Pitfall 2: Version Number Formats

Different browsers use different version formats:

- Chrome: `"95"`, `"96"`, `"142"`
- Firefox: `"93"`, `"94"`, `"144"`
- Safari: `"15"`, `"15.1"`, `"15.2-15.3"`
- iOS: `"15.0"`, `"15.0-15.1"`, `"15.2-15.3"`

**Solution:** Handle ranges and decimals when parsing

### Pitfall 3: Partial Support Meanings

`"a"` (partial) can mean many things:

- Requires prefix (`-webkit-`, `-moz-`)
- Missing some features
- Has known bugs
- Performance limitations

**Solution:** Always check `notes_by_num` in the JSON file

### Pitfall 4: Mobile vs Desktop

Safari desktop and iOS Safari can have different support:

```json
{
	"safari": { "15.0": "y" },
	"ios_saf": { "15.0": "a #1" } // Partial support!
}
```

**Solution:** Check both `safari` and `ios_saf` fields

### Pitfall 5: Forgetting Edge

Edge switched to Chromium in version 79:

- Edge 12-18: Old EdgeHTML engine
- Edge 79+: Chromium-based (same as Chrome)

**Solution:** Use Edge 79+ as minimum (aligns with Chrome 95+)

---

## Example: Complete Feature Analysis

Let's walk through analyzing `requestIdleCallback`:

### 1. Find the Feature in Code

```javascript
// src/js/client/main.js
if ('requestIdleCallback' in window) {
	requestIdleCallback(initSecondaryTools);
} else {
	setTimeout(initSecondaryTools, 100);
}
```

### 2. Retrieve Caniuse Data

Retrieve feature data from the Fyrd/caniuse GitHub repository:
You can fetch the content of `features-json/[feature-name].json` using the GitHub API or by downloading directly from the repository.

**Example using curl:**

````sh
curl -L https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/[feature-name].json -o [feature-name].json

Alternatively, use a look like `githubread`:

```bash
Tool: githubread
Query: "Get the content of features-json/requestidlecallback.json from Fyrd/caniuse"
````

### 3. Parse Key Data

```json
{
	"title": "requestIdleCallback",
	"stats": {
		"chrome": { "47": "y", "95": "y" },
		"firefox": { "55": "y", "93": "y" },
		"safari": { "TP": "y" }, // Only in Technical Preview!
		"ios_saf": { "all": "n" } // Not supported
	}
}
```

### 4. Analysis

- ✅ Chrome 95+: Supported (since v47)
- ✅ Firefox 93+: Supported (since v55)
- ❌ Safari 15+: NOT supported (only in TP)
- ❌ iOS 15+: NOT supported

### 5. Check for Fallback

```javascript
// Code has fallback!
} else {
    setTimeout(initSecondaryTools, 100);
}
```

### 6. Final Classification

```json
{
	"requestidlecallback": {
		"chrome": "47",
		"firefox": "55",
		"safari": "NOT_SUPPORTED",
		"iphone": "NOT_SUPPORTED",
		"ipad": "NOT_SUPPORTED",
		"status": "✅ FULLY_SUPPORTED",
		"notes": "Safari/iOS not supported, but setTimeout fallback implemented"
	}
}
```

### 7. Conclusion

✅ **App is compatible** because:

1. Fallback is implemented
2. Fallback provides similar functionality
3. No feature detection errors
4. Progressive enhancement pattern

---

## Checklist for Future Analysis

- [ ] Identify all browser-dependent features in code
- [ ] Map features to correct caniuse JSON files
- [ ] Retrieve data in batches (5-6 features)
- [ ] Parse version support for each target browser
- [ ] Check for partial support (`"a"`) and read notes
- [ ] Identify features with fallbacks in code
- [ ] Document progressive enhancement patterns
- [ ] Create detailed output for PR
- [ ] Create machine JSON output
- [ ] Create markdown table
- [ ] Review for filename mismatches
- [ ] Verify mobile vs desktop differences
- [ ] Test assumptions with actual browser testing (when possible)

---

## Quick Reference Commands

### Search for API Usage

```bash
# Service Workers
rg "serviceWorker" src/

# IndexedDB
rg "indexedDB|idb" src/

# Canvas
rg "getContext\('2d'\)" src/

# Fetch API
rg "fetch\(" src/

# LocalStorage
rg "localStorage|sessionStorage" src/
```

### Retrieve Caniuse Data

```
githubread query: "Get the content of features-json/[NAME].json from Fyrd/caniuse repository"
```

### Common Feature Mappings

| Feature           | Caniuse File                |
| ----------------- | --------------------------- |
| ES6 Modules       | `es6-module.json`           |
| Service Workers   | `serviceworkers.json`       |
| localStorage      | `namevalue-storage.json`    |
| Canvas 2D         | `canvas.json`               |
| Fetch API         | `fetch.json`                |
| async/await       | `async-functions.json`      |
| performance.now() | `high-resolution-time.json` |
| Web Notifications | `notifications.json`        |
| Fullscreen        | `fullscreen.json`           |
| Dialog element    | `dialog.json`               |

---

## Version History

| Version | Date       | Changes                                   |
| ------- | ---------- | ----------------------------------------- |
| 1.0     | 2025-11-13 | Initial documentation from first analysis |

---

## Related Files

- `browser-support-matrix.json` - machine format output

---

## Notes for Future Self

1. **Always batch requests** - Don't try to get all 28 features at once
2. **Check for fallbacks** - Code with fallbacks can support "unsupported" features
3. **Mobile ≠ Desktop** - Safari and iOS Safari are different
4. **Edge 79+ = Chromium** - Use same support as Chrome
5. **Filenames don't match** - `localStorage` → `namevalue-storage.json`
6. **Read the notes** - Partial support has important caveats
7. **Test assumptions** - When in doubt, test in actual browsers
8. **Document special cases** - Progressive enhancement, fallbacks, polyfills

---

**Remember:** The goal is to ensure the app works for users, not to have 100% native support. Fallbacks and progressive enhancement count as "supported"! ✅
