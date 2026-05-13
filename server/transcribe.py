#!/usr/bin/env python3
"""Transcribe an audio file via the Perplexity LLM API.

Usage:
    python transcribe.py <audio_path> <media_type>

Outputs JSON on stdout:
    {"text": "...", "language_code": "...", "duration_sec": 1234}
"""
import asyncio
import base64
import json
import os
import sys

from pplx.python.sdks.llm_api import (
    AudioBlock,
    AudioSource,
    Client,
    Conversation,
    Identity,
    LLMAPIClient,
    MediaGenParams,
    SamplingParams,
    SpeechToTextParams,
)


async def transcribe(audio_path: str, media_type: str) -> dict:
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()
    b64 = base64.b64encode(audio_bytes).decode()
    convo = Conversation()
    convo.add_user(AudioBlock(source=AudioSource(media_type=media_type, data=b64)))

    client = LLMAPIClient()
    result = await client.messages.create(
        model="elevenlabs_scribe_v2",
        convo=convo,
        identity=Identity(client=Client.ASI, use_case="webserver_transcription"),
        sampling_params=SamplingParams(max_tokens=1),
        media_gen_params=MediaGenParams(
            speech_to_text=SpeechToTextParams(
                diarize=True,
                timestamps_granularity="word",
                language_code="zh",
            ),
        ),
    )

    if not result.transcriptions:
        raise RuntimeError("No transcription generated")

    t = result.transcriptions[0]
    # Build a diarized transcript by grouping consecutive words from the same speaker.
    lines = []
    cur_speaker = None
    cur_words: list[str] = []
    last_end = 0.0
    for w in t.words:
        spk = w.speaker_id if w.speaker_id is not None else "speaker_0"
        if cur_speaker is None:
            cur_speaker = spk
        if spk != cur_speaker:
            lines.append({"speaker": cur_speaker, "text": "".join(cur_words).strip()})
            cur_speaker = spk
            cur_words = []
        cur_words.append(w.text)
        if w.end is not None:
            last_end = max(last_end, float(w.end))
    if cur_words:
        lines.append({"speaker": cur_speaker, "text": "".join(cur_words).strip()})

    # Final plain-text transcript with speaker labels.
    label_map: dict[str, str] = {}
    pretty_lines = []
    for ln in lines:
        spk = ln["speaker"]
        if spk not in label_map:
            # First distinct speaker -> 面试官, second -> 我, others -> 说话人 N
            idx = len(label_map)
            if idx == 0:
                label_map[spk] = "面试官"
            elif idx == 1:
                label_map[spk] = "我"
            else:
                label_map[spk] = f"说话人 {idx + 1}"
        label = label_map[spk]
        text = ln["text"]
        if text:
            pretty_lines.append(f"{label}: {text}")

    transcript = "\n".join(pretty_lines) if pretty_lines else (t.text or "")
    return {
        "text": transcript,
        "language_code": t.language_code or "zh",
        "duration_sec": int(last_end) if last_end else 0,
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "usage: transcribe.py <path> <media_type>"}))
        sys.exit(1)
    audio_path = sys.argv[1]
    media_type = sys.argv[2]
    if not os.path.exists(audio_path):
        print(json.dumps({"error": f"file not found: {audio_path}"}))
        sys.exit(1)
    try:
        result = asyncio.run(transcribe(audio_path, media_type))
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()
