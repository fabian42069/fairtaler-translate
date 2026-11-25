# Fairtaler Translate

A private translator for Linux and Android, with extra help for Japanese.

> ℹ️ The programs I publish are always free and open source. I generate them with AI for no other reason than that I need and use the app myself. I publish them so anyone who wants to can use them too. Because I don't know anything about programming, I probably won't accept merge requests, but feel free to fork the project and make something beautiful out of it.

## Features
- Choose your translation source: offline (Mozilla, text stays on your device), Google, Google via a privacy proxy, DuckDuckGo, MyMemory, Apertium, LibreTranslate or Ollama
- Japanese help: readings and romaji, type in romaji, draw kanji/kana by hand
- Listen to text with offline voices
- Translation history and saved translations, stored locally only

## Download
Get the **AppImage** (Linux) or **APK** (Android) from the [Releases](../../releases) page.

### In your browser (Windows, Linux, macOS)
Download **Fairtaler-Translate-…-web.zip** from the [Releases](../../releases) page and unpack it.
- Windows: double-click `Start Fairtaler.cmd`.
- Linux / macOS: run `sh start-fairtaler.sh` (needs Python 3).

Fairtaler then opens in your normal browser at `http://localhost:47831/`. It runs from your own computer: nothing to install, no website involved, and it works offline.

## Build
```
npm install
npm run appimage   # Linux AppImage
npm run apk        # Android APK
npm run web        # browser version (zip)
```

## License
GPL-3.0-or-later
