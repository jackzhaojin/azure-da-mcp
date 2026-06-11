# Pipeline Patterns -- ffmpeg and ElevenLabs Reference

## Table of Contents

1. [ElevenLabs API Patterns](#elevenlabs-api-patterns)
2. [ffmpeg Audio Merge Patterns](#ffmpeg-audio-merge-patterns)
3. [Freeze-Frame Algorithm](#freeze-frame-algorithm)
4. [Background Music Mix](#background-music-mix)
5. [Utility Commands](#utility-commands)

---

## ElevenLabs API Patterns

### Per-Caption TTS Generation

```javascript
const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
  method: 'POST',
  headers: {
    'xi-api-key': API_KEY,
    'Content-Type': 'application/json',
    Accept: 'audio/mpeg',
  },
  body: JSON.stringify({
    text: caption.text,
    model_id: 'eleven_turbo_v2_5',
    previous_text: prevCaption?.text,   // voice continuity
    next_text: nextCaption?.text,       // voice continuity
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  }),
});
fs.writeFileSync(`caption_${String(id).padStart(2, '0')}.mp3`,
  Buffer.from(await resp.arrayBuffer()));
```

### Caching Pattern

```javascript
if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
  console.log(`[cached] Caption ${id}`);
  return outPath;
}
```

### Voice Selection

| Voice | ID | Tier | Style |
|-------|----|------|-------|
| Matilda | `XrExE9yKIg1WjnnlVkGX` | Free (premade) | Knowledgeable, Professional |
| Rachel | (browse /v1/voices) | Free (premade) | Calm, Narrator |

### Model Selection

| Model | Latency | Credits/char | Pause Support |
|-------|---------|-------------|---------------|
| `eleven_turbo_v2_5` | 75ms | ~0.5 | SSML `<break>` |
| `eleven_multilingual_v2` | Higher | ~1.0 | SSML `<break>` |
| `eleven_flash_v2_5` | Ultra-low | ~0.5 | SSML `<break>` |

### Cost Estimation

```
total_chars = sum of all caption text lengths
credits = total_chars * 0.5  (for Turbo v2.5)
Free tier: 10,000 credits/month (~20k chars, ~15-20 min of narration)
```

---

## ffmpeg Audio Merge Patterns

### V1: adelay + amix (Simple Merge)

Position each audio clip at its video timestamp:

```bash
ffmpeg -y \
  -i video.webm \
  -i caption_01.mp3 \
  -i caption_02.mp3 \
  ... \
  -filter_complex \
    "[1]adelay=1400|1400,aformat=sample_rates=44100:channel_layouts=mono[a1]; \
     [2]adelay=5500|5500,aformat=sample_rates=44100:channel_layouts=mono[a2]; \
     ... \
     [a1][a2]...amix=inputs=N:normalize=0,apad=pad_dur=3[voice]" \
  -map 0:v -map "[voice]" \
  -c:v libx264 -crf 20 -preset medium \
  -c:a aac -b:a 192k \
  -shortest \
  output.mp4
```

Key flags:
- `adelay=N|N` -- delay start by N ms (left|right, same for mono)
- `aformat` -- normalize sample rate/channels
- `amix=inputs=N:normalize=0` -- mix without volume normalization
- `apad=pad_dur=3` -- pad 3s silence at end
- `-shortest` -- output length = video duration

### V2: Freeze-Frame Merge (No Overlaps)

Insert video pauses where narration needs more time:

```bash
ffmpeg -y \
  -i video.webm \
  -i caption_01.mp3 ... \
  -filter_complex \
    "[0:v]trim=start=0:end=T1,setpts=PTS-STARTPTS[seg0]; \
     [0:v]trim=start=T1:end=T1.08,setpts=PTS-STARTPTS,tpad=stop_duration=D1:stop_mode=clone[seg1]; \
     [0:v]trim=start=T1,setpts=PTS-STARTPTS[seg2]; \
     ... \
     [seg0][seg1][seg2]...concat=n=N:v=1:a=0[vfrozen]; \
     [1]adelay=A1|A1,...[a1]; \
     ... \
     [a1]...[aN]amix=inputs=N:normalize=0,apad=pad_dur=5[voice]" \
  -map "[vfrozen]" -map "[voice]" \
  -c:v libx264 -crf 20 -preset medium \
  -c:a aac -b:a 192k \
  -shortest \
  output.mp4
```

Key technique:
- `trim=start=S:end=E` -- cut video segment
- `tpad=stop_duration=D:stop_mode=clone` -- repeat last frame for D seconds
- `concat=n=N:v=1:a=0` -- join video segments

---

## Freeze-Frame Algorithm

```
Constants:
  AUDIO_SHIFT = -0.5   // voice starts 500ms before visual caption
  MIN_GAP = 0.3        // 300ms minimum silence between clips

Algorithm:
  videoShift = 0       // cumulative freeze time inserted
  prevEnd = -Infinity

  FOR each caption:
    visualNew = caption.startSec + videoShift
    idealStart = visualNew + AUDIO_SHIFT
    earliest = prevEnd + MIN_GAP

    IF idealStart < earliest:
      freezeDur = ceil((earliest - idealStart) * 10) / 10
      INSERT freeze frame at caption.startSec for freezeDur seconds
      videoShift += freezeDur
      idealStart = earliest

    caption.newAudioStart = max(idealStart, 0)
    prevEnd = caption.newAudioStart + caption.audioDuration
```

### Freeze Frame Video Filter Construction

For each freeze point `{originalTime, duration}`:

1. Normal segment: `trim=start=lastCut:end=originalTime`
2. Freeze: `trim=start=originalTime:end=originalTime+0.08, tpad=stop_duration=duration:stop_mode=clone`
3. Update lastCut = originalTime

Final: concat all segments.

---

## Background Music Mix

```bash
ffmpeg -y \
  -i voiced-video.mp4 \
  -stream_loop -1 -i music.mp3 \
  -filter_complex "[1:a]volume=0.15[music];[0:a][music]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  output.mp4
```

Key flags:
- `-stream_loop -1` -- loop music indefinitely
- `volume=0.15` -- music at 15% (~-18dB)
- `amix=duration=first` -- trim to video length
- `-c:v copy` -- no video re-encode (fast)

Music sources: Pixabay Music (CC0, no attribution required).

---

## Utility Commands

### Get audio duration

```bash
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "file.mp3"
```

### Convert webm to mp4

```bash
ffmpeg -i input.webm -c:v libx264 -crf 20 -preset medium -c:a aac output.mp4
```

### Generate silence

```bash
ffmpeg -f lavfi -t 2 -i anullsrc=r=44100:cl=stereo silence_2s.mp3
```

### Pad audio to exact duration

```bash
ffmpeg -i input.mp3 -af "apad=whole_dur=5" output.mp3
```
