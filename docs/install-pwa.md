# Progressive Web App (PWA) Guide

## Table of Contents

- [What is a PWA?](#what-is-a-pwa)
- [Features](#features)
  - [Offline Support](#offline-support)
  - [File Handling](#file-handling)
- [Installation by Platform](#installation-by-platform)
  - [Desktop Chrome/Edge](#desktop-chromeedge)
  - [Desktop Safari (macOS)](#desktop-safari-macos)
  - [Desktop Firefox](#desktop-firefox)
  - [iPadOS (Safari)](#ipados-safari)
  - [Android (Chrome)](#android-chrome)
- [Using File Handling Features](#using-file-handling-features)
  - [Desktop: "Open With" Integration](#desktop-open-with-integration)
  - [Android: Share Sheet](#android-share-sheet)
  - [iOS: Manual File Opening](#ios-manual-file-opening)

## What is a PWA?

Progressive Web Apps (PWAs) are web applications that can be installed on your device and work like native applications.

## Features

### Offline Support

Once installed, teXt0wnz works completely offline.

### File Handling

**Desktop (Chrome/Edge):**

- OS-level "Open With" integration
- Right-click `.ans`, `.xb`, `.bin`, etc files → "Open with teXt0wnz"

**Android:**

- Share sheet integration
- Share files from Files app directly to teXt0wnz

**iOS/iPadOS:**

- **No share target support!**
- Manual file picker accepts all file types
- Drag-and-drop from Files app

**Supported File Types:**
.ans, .ansi, .xb, .xbin, .bin, .txt, .nfo, .diz, .utf8ans

## Installation by Platform

# Progressive Web App (PWA) Install Instructions by Platform

This document provides step-by-step instructions for installing a Progressive Web App (PWA), like **teXt0wnz** across major platforms and browsers. PWAs offer app-like experiences directly from your browser, with offline support and native-like features.

## 1. Desktop Chrome

![desktop install](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/pwa-chrome.png)

**Steps:**

1. Navigate to the website you want to install as a PWA in Google Chrome.
2. If the site is a PWA, you will see a "Install" icon in the address bar (typically a plus (+) symbol inside a monitor).
3. Click the "Install" icon.
4. Confirm installation in the prompt.
5. The app will open in its own window and be accessible from your desktop or app launcher.

**What you get after installing:**

- Standalone app window
- Desktop shortcut
- **OS file association** - Right-click text art files → "Open with teXt0wnz"

**Reference:**

- [Google Chrome Help: Install a Progressive Web App](https://support.google.com/chrome/answer/9658361?hl=en)

---

## 2. Desktop Safari (macOS)

![safari install](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/pwa-ios.png)

**Steps:**

1. Open the website in Safari on your Mac.
2. Click the "Share" button in the Safari toolbar.
3. Select "Add to Home Screen."
4. The PWA will be added to your Launchpad and can be opened like a native app.

> **Note:** As of macOS Sonoma and later, Safari supports installation of web apps to the dock, similar to PWAs.
> For older versions, home screen installation is limited or unavailable.

**Reference:**

- [Apple: Add a website icon to your Home Screen](https://support.apple.com/en-gb/guide/safari-iphone/iph3d60f5ef/ios)
- [Apple Developer: Web Apps on macOS](https://developer.apple.com/news/?id=7n3z7a2q)

---

## 3. Desktop Firefox

**Steps:**

1. Firefox _does not_ natively support PWA installation as a standalone app on desktop.
2. You can use a third-party extension like [PWAs-For-FireFox](https://addons.mozilla.org/en-US/firefox/addon/pwas-for-firefox/)
3. Alternatively, use Chrome or Edge for PWA installation on desktop.

**Reference:**

- [Mozilla Bugzilla: PWA Desktop App Support](https://bugzilla.mozilla.org/show_bug.cgi?id=1603312)

---

## 4. iPadOS (Safari)

![ipad install](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/pwa-ios.png)

**Steps:**

1. Open the website in Safari on your iPad.
2. Tap the "Share" button (square with an arrow pointing up).
3. Tap “Add to Home Screen.”
4. Enter a name for the app and tap "Add."
5. The web app will appear on your home screen and can be launched like any other app.

**What you get after installing:**

- Home screen icon
- Enhanced file picker (accepts all files)
- _No share target or Finder integration (iOS limitation)_

**Reference:**

- [Apple: Add a website icon to your Home Screen](https://discussions.apple.com/thread/255899735)

---

## 5. Android (Chrome)

![android install](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/pwa-android.png)

**Steps:**

1. Open the website in Chrome on your Android device.
2. If the site is a PWA, a banner or popup may appear prompting installation.
3. If not, tap the three-dot menu in the top-right corner.
4. Tap “Install app” or “Add to Home screen.”
5. Confirm installation; the app icon will appear on your home screen.

**What you get after installing:**

- Home screen icon
- **Share sheet integration** - Share files directly to teXt0wnz

**Reference:**

- [Google Chrome Help: Install a Progressive Web App](https://support.google.com/chrome/answer/9658361?hl=en)
- [Web.dev: PWA install prompts](https://web.dev/install-criteria/)

---

## Using File Handling Features

### Desktop: "Open With" Integration

**After installation, you can open text art files directly from your OS:**

1. Right-click any `.ans`, `.xb`, `.bin`, etc. file
2. Select "Open with" → "teXt0wnz"
3. File opens directly in the app

**First time setup (Chrome/Edge):**

- The first time you open a file, Chrome may ask to confirm the file association
- Check "Always use teXt0wnz" to remember your choice

### Android: Share Sheet

**After installation, you can share files to teXt0wnz:**

1. Open Files app
2. Long-press a text art file (or the 3 dots from a file manager app)
3. Tap "Share"
4. Select "teXt0wnz" from share sheet
5. File opens in the app

### iOS: Manual File Opening

**iOS doesn't support share targets, but you can still open files:**

**Method 1: File Picker**

1. Tap "Open" in teXt0wnz menu
2. Tap "Browse" in file picker
3. All files are selectable (not just recognized types)

**Method 2: Drag & Drop**

1. Open Files app
2. Use Split View to show both Files and teXt0wnz
3. Drag files from Files into teXt0wnz

## Additional Information

- For Microsoft Edge (desktop/mobile), installation steps are nearly identical to Chrome.
- Some browsers and platforms may not fully support all PWA features or installation flows.
  > See: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest

---

## Citations

1. [Google Chrome Help: Install a Progressive Web App](https://support.google.com/chrome/answer/9658361?hl=en)
2. [Apple: Add a website icon to your Home Screen](https://support.apple.com/en-gb/guide/safari-iphone/iph3d60f5ef/ios)
3. [Apple Developer: Web Apps on macOS](https://developer.apple.com/news/?id=7n3z7a2q)
4. [Mozilla Bugzilla: PWA Desktop App Support](https://bugzilla.mozilla.org/show_bug.cgi?id=1603312)
5. [Web.dev: PWA install prompts](https://web.dev/install-criteria/)
