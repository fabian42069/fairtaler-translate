# Fairtaler Translate

A private translator with extra help for Japanese — in your browser and on Android.

> ℹ️ The programs I publish are always free and open source. I generate them with AI for no other reason than that I need and use the app myself. I publish them so anyone who wants to can use them too. Because I don't know anything about programming, I probably won't accept merge requests, but feel free to fork the project and make something beautiful out of it.

## Get started

### 💻 On your computer: in the browser
**Open → https://fabian42069.codeberg.page/fairtaler-translate/**

Nothing to install, works in any modern browser. The first start takes a little longer, because the offline translator and the voices are downloaded once.

### 📱 On Android
1. On your phone, download **[Fairtaler-Translate-1.0.1.apk](https://github.com/fabian42069/fairtaler-translate/releases/download/v1.0.1/Fairtaler-Translate-1.0.1.apk)**.
2. Open the downloaded file and tap **Install**. If your phone asks, allow installing apps from this source.

Already have version 1.0.0? Uninstall it first; otherwise Android won't install the new version.

## What it does
- **Translate offline** (Mozilla's translator, your text never leaves your device), or choose an online source: Google, Google via a privacy proxy, DuckDuckGo, MyMemory, Apertium, LibreTranslate or Ollama.
- **Japanese help:** readings and romaji, type in romaji to write Japanese, draw kanji/kana by hand.
- **Listen** with natural offline voices.
- **History and saved translations**, kept only on your own device.

<details>
<summary>For developers: build it yourself</summary>

```
npm install
npm run build      # the website, in dist/
npm run web        # publish the website to Codeberg Pages
npm run apk        # Android APK
npm run appimage   # Linux AppImage
```
</details>

## License
GPL-3.0-or-later
