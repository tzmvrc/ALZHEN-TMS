let context: AudioContext | null = null;
let lastPlayedAt = 0;
let soundBuffer: Promise<AudioBuffer> | null = null;
const MIN_SOUND_INTERVAL_MS = 1_200;

function loadSound(audio: AudioContext) {
  soundBuffer ??= fetch(`${import.meta.env.BASE_URL}sounds/driver-notification.mp3`)
    .then((response) => {
      if (!response.ok) throw new Error("Notification sound unavailable");
      return response.arrayBuffer();
    })
    .then((data) => audio.decodeAudioData(data))
    .catch((error: unknown) => {
      soundBuffer = null;
      throw error;
    });
  return soundBuffer;
}

function audioContext() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  context ??= new window.AudioContext();
  return context;
}

/** Browser audio policies require a user gesture before a realtime sound can play. */
export function installNotificationSoundUnlock() {
  const audio = audioContext();
  if (audio) void loadSound(audio).catch(() => {});
  const removeListeners = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  const unlock = () => {
    try {
      const audio = audioContext();
      if (!audio) return;
      if (audio.state === "running") {
        removeListeners();
      } else {
        void audio.resume().then(() => {
          if (audio.state === "running") removeListeners();
        }).catch(() => {});
      }
    } catch { /* Audio is optional; the visual notification still appears. */ }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return removeListeners;
}

function playFullSound(audio: AudioContext, buffer: AudioBuffer) {
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.onended = () => source.disconnect();
  source.start();
}

/** Play the supplied MP3 once per fresh event, with a guard for simultaneous updates. */
export function playDriverNotificationSound() {
  if (Date.now() - lastPlayedAt < MIN_SOUND_INTERVAL_MS) return;
  try {
    const audio = audioContext();
    if (!audio) return;
    lastPlayedAt = Date.now();
    void Promise.all([
      audio.state === "running" ? Promise.resolve() : audio.resume(),
      loadSound(audio),
    ]).then(([, buffer]) => {
      if (audio.state !== "running") return;
      playFullSound(audio, buffer);
    }).catch(() => {});
  } catch { /* Keep the notification functional if audio is unavailable. */ }
}
