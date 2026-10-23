import { useState } from "react";
import { Check, Copy, Square, Volume2 } from "lucide-react";

/** Reads text aloud with the system voice; a second click stops it. */
export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  if (typeof speechSynthesis === "undefined") return null;
  return (
    <button
      type="button"
      className="copy-button"
      title={speaking ? "Stop" : "Speak"}
      aria-label={speaking ? "Stop speaking" : "Speak"}
      onClick={() => {
        speechSynthesis.cancel(); // one voice at a time; also ends another button's reading
        if (speaking) return setSpeaking(false);
        // Code blocks and markdown symbols read badly aloud.
        const plain = text.replace(/```[\s\S]*?```/g, " ").replace(/[*_#`>|~]/g, "");
        const u = new SpeechSynthesisUtterance(plain);
        u.onend = u.onerror = () => setSpeaking(false);
        setSpeaking(true);
        speechSynthesis.speak(u);
      }}
    >
      {speaking ? <Square size={13} /> : <Volume2 size={13} />}
    </button>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  notify,
}: {
  text: string;
  label?: string;
  notify: (text: string, error?: boolean) => void;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault(); // inside <summary>/<details>, don't toggle
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
            notify("Copied to clipboard");
          })
          .catch(() => notify("Couldn't copy to the clipboard", true));
      }}
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
