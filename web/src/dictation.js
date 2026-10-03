// Voice input stays in the browser. Text is written into the composer and the
// normal chat request sends text only; browsers without Web Speech retain the
// typed-input path.
const SPEECH_LOCALES = { en: "en-US", es: "es-US", zh: "zh-CN" };

export function startDictation(_cfg, lang, onText) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error("Speech recognition is unavailable. Please type your message.");
  }

  const recognition = new SpeechRecognition();
  recognition.lang = SPEECH_LOCALES[lang] || SPEECH_LOCALES.en;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onresult = (event) => {
    let text = "";
    let final = true;
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
      if (!event.results[i].isFinal) final = false;
    }
    onText(text.trim(), final);
  };
  recognition.start();
  return { stop: () => recognition.stop(), engine: "browser speech" };
}
