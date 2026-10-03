#
- `npm.cmd test` passed 4 local-intake tests simulating vague and multi-turn messages, delayed matching, and language, meeting-mode, location, and broad asset-range preferences.
- The local preview now asks for missing goal, meeting mode, geography, and broad asset preference instead of returning matches after the first message.
 ARCH-002: Align the web client with the approved architecture

**Status:** Frontend implementation aligned to the coordinated contract; standard Vite production build passed on 2026-10-02. Live backend integration and manual accessibility/voice checks remain unvalidated.

## Scope

Validate `web/src`, `web/src/style.css`, and `web/index.html` against `docs/technical-specification.md`, focusing on API/session behavior, browser-only voice, glossary interaction/accessibility, and language handling.

## Findings and fixes

- **Session/API contract ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â updated to the coordinated REST contract.** The frontend creates or restores a client-held session with `POST /session` and sends turns to `POST /session/{id}/message`, including `message`, BCP-47 `preferredLanguage`, and the last known `version`. It consumes `sessionId`, `text`, `glossaryTags`, `collectedPreferences`, `version`, and `matches`. The session ID, version, and localized glossary bundle are cached in `sessionStorage`. The backend routes and table contract now exist in source; deployed end-to-end compatibility remains unvalidated.
- **Voice I/O ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fixed.** The frontend uses only browser Web Speech API STT and browser `speechSynthesis` TTS. Chat sends text only; the Transcribe SDK and `/speak` request were removed. STT and TTS use `en-US`, `es-US`, and `zh-CN`; changing language stops active recognition. Unsupported STT shows the typed-input fallback while leaving the composer available.
- **Glossary interaction ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â implemented against server tags and bundle.** The client resolves tagged term IDs against a cached, localized `glossaryTerms` bundle, with a small local fallback glossary. It wraps exact UTF-16 offsets as focusable buttons connected with `aria-describedby` to `role="tooltip"` definitions. Tooltips open on hover, focus, or tap; remain hoverable; close on Escape; and use a 44px minimum trigger size. The backend returns localized glossary terms at session creation and after each message; deployed integration and manual accessibility behavior remain unvalidated.
- **Language ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â aligned in the client.** The selected BCP-47 locale sets the document language, browser speech locale, session initialization, and each message's `preferredLanguage`. Message responses refresh the localized glossary cache so language switches keep the same session and history.

## Validation evidence

- Current run (2026-10-02): `npm.cmd --prefix web run build` passed with Vite 5.4.21 (1873 modules transformed; production assets generated).
- Earlier standard build attempts failed before transforming code with an esbuild directory access error while loading `web/vite.config.js`; that error did not reproduce in the current standard build.
- `node.exe --check web/src/main.js`, `node.exe --check web/src/dictation.js`, and `git diff --check` passed on the latest frontend source.
- Static search found no remaining Transcribe or `/speak` references in `web/src`; the client now contains the `/session` and `/session/{id}/message` calls and glossary tooltip renderer.
- No browser/device screen-reader, voice-locale, deployed API, or manual WCAG review was run. Build success does not establish those behaviors.

## Remaining unvalidated requirements

Rerun the standard production build once the config access error is resolved. Run frontend/backend integration against the completed routes, including session restoration, optimistic version conflicts, language switches, and server glossary offsets/bundle localization. Verify persistent/hoverable tooltip behavior with keyboard, touch, and screen readers; test STT/TTS across supported browser and OS combinations. The specification's broader WCAG-EM audit and multilingual compliance sign-off remain outside repository validation.
