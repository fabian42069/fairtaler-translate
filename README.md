# Fairtaler Translate

A private translator for the web, Android and Linux, with extra help for Japanese.

> ℹ️ The programs I publish are always free and open source. I generate them with AI for no other reason than that I need and use the app myself. I publish them so anyone who wants to can use them too. Because I don't know anything about programming, I probably won't accept merge requests, but feel free to fork the project and make something beautiful out of it.

## Features
- Choose your translation source: offline (Mozilla, text stays on your device), Google, Google via a privacy proxy, DuckDuckGo, MyMemory, Apertium, LibreTranslate or Ollama
- Japanese help: readings and romaji, type in romaji, draw kanji/kana by hand
- Listen to text with offline voices
- Translation history and saved translations, stored locally only

## Use it
- **PC (any browser):** open **https://fabian42069.codeberg.page/fairtaler-translate/** — nothing to install. The offline translation models and voices are downloaded by your browser the first time you use them, so the first start takes a while; later visits are much faster.
- **Android:** get the **APK** from the [Releases](../../releases) page.
- **Linux app:** get the **AppImage** from the [Releases](../../releases) page.

## Build
```
npm install
npm run appimage   # Linux AppImage
npm run apk        # Android APK
npm run web        # publish the web version to Codeberg Pages
```

## License
GPL-3.0-or-later
