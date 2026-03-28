import json
import os
import socket
import subprocess
import tempfile
import threading
from base64 import b64decode, b64encode
from dataclasses import asdict, dataclass
from pathlib import Path

import requests
from flask import Flask, jsonify, render_template, request


DATA_FILE = Path("decks.json")
SETTINGS_FILE = Path("settings.json")
LEARN_PROGRESS_FILE = Path("learn_progress.json")
LOCAL_PIPER_MODEL = Path("models/en_US-lessac-medium.onnx")
LOCAL_PIPER_EXE = Path("tools/piper/piper.exe")
MODELS_DIR = Path("models")
CUSTOM_VOICES_DIR = MODELS_DIR / "custom_voices"
DEFAULT_SETTINGS = {
    "openrouter_api_key": "",
    "openrouter_model": "",
    "piper_executable": str(LOCAL_PIPER_EXE if LOCAL_PIPER_EXE.exists() else "piper"),
    "piper_model": str(LOCAL_PIPER_MODEL),
    "whisper_model_size": "base",
    "whisper_compute_type": "int8",
    "theme_bg": "#eaf3ff",
    "theme_bg2": "#dcecff",
    "theme_panel": "#ffffff",
    "theme_text": "#1d2b4a",
    "theme_muted": "#60739d",
    "theme_primary": "#2f7cff",
    "theme_primary_dark": "#2469db",
    "theme_danger": "#ef5a6f",
    "theme_success": "#34b56f",
    "theme_warning": "#ffac3d",
    "theme_ring": "#87b6ff",
}
_WHISPER_MODELS: dict[tuple[str, str], object] = {}
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5000


@dataclass
class Card:
    term: str
    definition: str


@dataclass
class Deck:
    name: str
    cards: list[Card]


def load_decks() -> list[Deck]:
    if not DATA_FILE.exists():
        return []
    try:
        raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        decks: list[Deck] = []
        for item in raw:
            cards = [Card(**card_item) for card_item in item.get("cards", [])]
            decks.append(Deck(name=item["name"], cards=cards))
        return decks
    except (json.JSONDecodeError, KeyError, TypeError):
        return []


def save_decks(decks: list[Deck]) -> None:
    payload = [{"name": d.name, "cards": [asdict(c) for c in d.cards]} for d in decks]
    DATA_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def find_deck(decks: list[Deck], deck_name: str) -> Deck | None:
    for deck in decks:
        if deck.name.lower() == deck_name.lower():
            return deck
    return None


def parse_cards(raw_text: str, term_sep: str, card_sep: str) -> tuple[list[Card], list[str]]:
    cards: list[Card] = []
    errors: list[str] = []
    if not term_sep:
        return cards, ["Term separator cannot be empty."]
    if not card_sep:
        return cards, ["Card separator cannot be empty."]

    chunks = raw_text.split(card_sep)
    for idx, chunk in enumerate(chunks, start=1):
        line = chunk.strip()
        if not line:
            continue
        if term_sep not in line:
            errors.append(f"Card {idx}: missing separator.")
            continue
        term, definition = line.split(term_sep, 1)
        term = term.strip()
        definition = definition.strip()
        if not term or not definition:
            errors.append(f"Card {idx}: term or definition empty.")
            continue
        cards.append(Card(term=term, definition=definition))
    return cards, errors


def load_settings() -> dict[str, str]:
    if not SETTINGS_FILE.exists():
        return dict(DEFAULT_SETTINGS)
    try:
        raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_SETTINGS)

    settings = dict(DEFAULT_SETTINGS)
    for key in DEFAULT_SETTINGS:
        if key in raw:
            settings[key] = str(raw[key])
    if not settings.get("piper_executable", "").strip() and LOCAL_PIPER_EXE.exists():
        settings["piper_executable"] = str(LOCAL_PIPER_EXE)
    if not settings.get("piper_model", "").strip() and LOCAL_PIPER_MODEL.exists():
        settings["piper_model"] = str(LOCAL_PIPER_MODEL)
    return settings


def save_settings(settings: dict[str, str]) -> None:
    payload = {key: str(settings.get(key, DEFAULT_SETTINGS[key])) for key in DEFAULT_SETTINGS}
    SETTINGS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_learn_progress() -> dict[str, dict]:
    if not LEARN_PROGRESS_FILE.exists():
        return {}
    try:
        raw = json.loads(LEARN_PROGRESS_FILE.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_learn_progress(progress: dict[str, dict]) -> None:
    LEARN_PROGRESS_FILE.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def list_piper_models() -> list[dict[str, str]]:
    if not MODELS_DIR.exists():
        return []
    models: list[dict[str, str]] = []
    for path in sorted(MODELS_DIR.rglob("*.onnx")):
        config_path = Path(f"{path}.json")
        if not config_path.exists():
            continue
        label = path.stem.replace("_", " ").replace("-", " ").strip()
        label = " ".join(part.capitalize() for part in label.split())
        relative_parent = path.parent.relative_to(MODELS_DIR)
        if str(relative_parent) != ".":
            label = f"{label or path.stem} ({relative_parent})"
        models.append({"path": str(path), "label": label or path.stem})
    return models


def _sanitize_model_filename(filename: str) -> str:
    name = Path(filename).name.strip()
    if not name:
        raise ValueError("File name is required.")
    if any(part in {"", ".", ".."} for part in Path(name).parts):
        raise ValueError("Invalid file path.")
    return name


def _piper_model_config_path(model_path: Path) -> Path:
    return Path(f"{model_path}.json")


def whisper_model(settings: dict[str, str], model_size_override: str | None = None):
    model_size = (model_size_override or settings["whisper_model_size"] or "base").strip() or "base"
    compute_type = settings["whisper_compute_type"] or "int8"
    key = (model_size, compute_type)
    if key in _WHISPER_MODELS:
        return _WHISPER_MODELS[key]

    from faster_whisper import WhisperModel

    model = WhisperModel(model_size, device="cpu", compute_type=compute_type)
    _WHISPER_MODELS[key] = model
    return model


def warmup_whisper_models() -> None:
    try:
        settings = load_settings()
        # Warm default mode and tiny mode for faster manual transcription.
        whisper_model(settings)
        whisper_model(settings, model_size_override="tiny")
    except Exception:
        # Non-fatal: warmup failures should not block app startup.
        pass


def resolve_server_port(host: str, preferred_port: int) -> int:
    for port in range(preferred_port, preferred_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
                return port
            except OSError:
                continue

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def call_openrouter(settings: dict[str, str], term: str, definition: str, spoken_text: str) -> dict:
    api_key = settings.get("openrouter_api_key", "").strip()
    model = settings.get("openrouter_model", "").strip()
    if not api_key:
        raise ValueError("OpenRouter API key is missing in Settings.")
    if not model:
        raise ValueError("OpenRouter model name is missing in Settings.")

    system_prompt = (
        "You evaluate flashcard answers. Return ONLY strict JSON with keys: "
        "is_correct (boolean), score (number 0-1), correction (string), explanation (string)."
    )
    user_prompt = (
        f"Term: {term}\n"
        f"Expected definition: {definition}\n"
        f"Student spoken answer: {spoken_text}\n"
        "Be lenient for paraphrases, strict for wrong concepts. "
        "In correction, state the right answer succinctly. "
        "In explanation, provide a short teaching explanation (1-2 sentences)."
    )
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=35,
    )
    if not resp.ok:
        raise ValueError(f"OpenRouter error: {resp.status_code} {resp.text[:200]}")

    content = resp.json()["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return {
        "is_correct": bool(parsed.get("is_correct", False)),
        "score": float(parsed.get("score", 0.0)),
        "correction": str(parsed.get("correction", "")).strip(),
        "explanation": str(parsed.get("explanation", "")).strip(),
    }


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _normalize_issues(raw_issues: object) -> list[str]:
    allowed = {"spelling", "grammar", "clarity", "possible_incorrect", "format"}
    if not isinstance(raw_issues, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in raw_issues:
        key = str(item).strip().lower()
        if key in allowed and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def call_openrouter_quality_check(
    settings: dict[str, str],
    cards: list[dict[str, object]],
    threshold: float,
) -> list[dict[str, object]]:
    api_key = settings.get("openrouter_api_key", "").strip()
    model = settings.get("openrouter_model", "").strip()
    if not api_key:
        raise ValueError("OpenRouter API key is missing in Settings.")
    if not model:
        raise ValueError("OpenRouter model name is missing in Settings.")

    system_prompt = (
        "You are a flashcard quality checker. Analyze spelling, grammar, clarity, and potential factual errors. "
        "Return ONLY strict JSON with this exact top-level key: results (array). "
        "Each result object must include: index_in_chunk (int), issues (string array using only "
        "spelling|grammar|clarity|possible_incorrect|format), confidence (0-1), severity (low|medium|high), "
        "possible_incorrect (boolean), suggested_term (string), suggested_definition (string), reason (string). "
        "Keep suggestions concise and preserve original meaning unless clearly wrong."
    )
    user_prompt = json.dumps(
        {
            "cards": cards,
            "instructions": {
                "preserve_meaning": True,
                "fix_spelling_and_grammar": True,
                "flag_possible_incorrect_when_uncertain": True,
            },
        },
        ensure_ascii=False,
    )

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    if not resp.ok:
        raise ValueError(f"OpenRouter error: {resp.status_code} {resp.text[:200]}")

    content = resp.json()["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    raw_results = parsed.get("results", [])
    if not isinstance(raw_results, list):
        raise ValueError("Quality check response is malformed (results missing).")

    by_index: dict[int, dict] = {}
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        idx = item.get("index_in_chunk")
        try:
            idx_int = int(idx)
        except (TypeError, ValueError):
            continue
        by_index[idx_int] = item

    results: list[dict[str, object]] = []
    for card in cards:
        chunk_index = int(card["index_in_chunk"])
        source = by_index.get(chunk_index, {})
        original_term = str(card.get("term", "")).strip()
        original_definition = str(card.get("definition", "")).strip()
        suggested_term = str(source.get("suggested_term", original_term)).strip() or original_term
        suggested_definition = (
            str(source.get("suggested_definition", original_definition)).strip() or original_definition
        )
        confidence = _clamp(float(source.get("confidence", 0.0) or 0.0), 0.0, 1.0)
        issues = _normalize_issues(source.get("issues", []))
        possible_incorrect = bool(source.get("possible_incorrect", False) or ("possible_incorrect" in issues))
        wrong_flag = possible_incorrect and confidence >= threshold
        has_changes = (suggested_term != original_term) or (suggested_definition != original_definition)
        severity = str(source.get("severity", "")).strip().lower()
        if severity not in {"low", "medium", "high"}:
            severity = "high" if wrong_flag else "medium" if has_changes else "low"

        results.append(
            {
                "card_index": int(card["card_index"]),
                "original": {
                    "term": original_term,
                    "definition": original_definition,
                },
                "suggestion": {
                    "term": suggested_term,
                    "definition": suggested_definition,
                },
                "issues": issues,
                "confidence": confidence,
                "severity": severity,
                "possible_incorrect": possible_incorrect,
                "wrong_flag": wrong_flag,
                "has_changes": has_changes,
                "reason": str(source.get("reason", "")).strip(),
            }
        )
    return results


app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/decks")
def list_decks():
    decks = load_decks()
    result = [{"name": d.name, "count": len(d.cards)} for d in decks]
    return jsonify({"decks": result})


@app.post("/api/decks")
def create_deck():
    data = request.get_json(force=True)
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"error": "Deck name is required."}), 400
    decks = load_decks()
    if find_deck(decks, name):
        return jsonify({"error": "Deck already exists."}), 409
    decks.append(Deck(name=name, cards=[]))
    save_decks(decks)
    return jsonify({"ok": True})


@app.delete("/api/decks/<path:deck_name>")
def delete_deck(deck_name: str):
    decks = load_decks()
    before = len(decks)
    decks = [d for d in decks if d.name.lower() != deck_name.lower()]
    if len(decks) == before:
        return jsonify({"error": "Deck not found."}), 404
    save_decks(decks)
    progress = load_learn_progress()
    key = deck_name.lower()
    if key in progress:
        del progress[key]
        save_learn_progress(progress)
    return jsonify({"ok": True})


@app.get("/api/decks/<path:deck_name>")
def get_deck(deck_name: str):
    decks = load_decks()
    deck = find_deck(decks, deck_name)
    if deck is None:
        return jsonify({"error": "Deck not found."}), 404
    return jsonify(
        {
            "name": deck.name,
            "cards": [asdict(c) for c in deck.cards],
        }
    )


@app.post("/api/decks/<path:deck_name>/cards")
def add_card(deck_name: str):
    data = request.get_json(force=True)
    term = str(data.get("term", "")).strip()
    definition = str(data.get("definition", "")).strip()
    if not term or not definition:
        return jsonify({"error": "Both term and definition are required."}), 400

    decks = load_decks()
    deck = find_deck(decks, deck_name)
    if deck is None:
        return jsonify({"error": "Deck not found."}), 404
    deck.cards.append(Card(term=term, definition=definition))
    save_decks(decks)
    return jsonify({"ok": True})


@app.post("/api/decks/<path:deck_name>/cards/bulk-update")
def bulk_update_cards(deck_name: str):
    data = request.get_json(force=True) or {}
    updates = data.get("updates", [])
    if not isinstance(updates, list):
        return jsonify({"error": "updates list is required."}), 400

    decks = load_decks()
    deck = find_deck(decks, deck_name)
    if deck is None:
        return jsonify({"error": "Deck not found."}), 404

    updated = 0
    seen: set[int] = set()
    for item in updates:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("card_index"))
        except (TypeError, ValueError):
            continue
        if index in seen:
            continue
        if index < 0 or index >= len(deck.cards):
            continue
        term = str(item.get("term", "")).strip()
        definition = str(item.get("definition", "")).strip()
        if not term or not definition:
            continue

        deck.cards[index] = Card(term=term, definition=definition)
        seen.add(index)
        updated += 1

    if updated:
        save_decks(decks)
    return jsonify({"ok": True, "updated": updated})


@app.post("/api/decks/<path:deck_name>/quality-check")
def quality_check(deck_name: str):
    data = request.get_json(silent=True) or {}
    try:
        threshold = _clamp(float(data.get("threshold", 0.65) or 0.65), 0.0, 1.0)
    except (TypeError, ValueError):
        threshold = 0.65
    try:
        batch_size = int(data.get("batch_size", 20) or 20)
    except (TypeError, ValueError):
        batch_size = 20
    batch_size = max(1, min(batch_size, 50))
    try:
        start_index = int(data.get("start_index", 0) or 0)
    except (TypeError, ValueError):
        start_index = 0
    try:
        limit = int(data.get("limit", 0) or 0)
    except (TypeError, ValueError):
        limit = 0

    decks = load_decks()
    deck = find_deck(decks, deck_name)
    if deck is None:
        return jsonify({"error": "Deck not found."}), 404
    total_cards = len(deck.cards)
    if not deck.cards:
        return jsonify(
            {
                "results": [],
                "summary": {"total": 0, "needs_fix": 0, "wrong_flags": 0},
                "start_index": 0,
                "processed_count": 0,
                "total_cards": 0,
            }
        )

    start_index = max(0, min(start_index, total_cards))
    if limit <= 0:
        limit = total_cards - start_index
    end_index = max(start_index, min(start_index + limit, total_cards))
    cards_to_process = deck.cards[start_index:end_index]

    settings = load_settings()
    all_results: list[dict[str, object]] = []

    for start in range(0, len(cards_to_process), batch_size):
        chunk_cards = cards_to_process[start : start + batch_size]
        payload_cards = [
            {
                "index_in_chunk": i,
                "card_index": start_index + start + i,
                "term": card.term,
                "definition": card.definition,
            }
            for i, card in enumerate(chunk_cards)
        ]
        try:
            chunk_results = call_openrouter_quality_check(settings, payload_cards, threshold)
        except Exception as exc:  # noqa: BLE001
            chunk_results = []
            for i, card in enumerate(chunk_cards):
                chunk_results.append(
                    {
                        "card_index": start_index + start + i,
                        "original": {
                            "term": card.term,
                            "definition": card.definition,
                        },
                        "suggestion": {
                            "term": card.term,
                            "definition": card.definition,
                        },
                        "issues": [],
                        "confidence": 0.0,
                        "severity": "low",
                        "possible_incorrect": False,
                        "wrong_flag": False,
                        "has_changes": False,
                        "reason": "",
                        "error": str(exc),
                    }
                )
        all_results.extend(chunk_results)

    needs_fix = sum(1 for r in all_results if bool(r.get("has_changes")) or bool(r.get("wrong_flag")))
    wrong_flags = sum(1 for r in all_results if bool(r.get("wrong_flag")))
    return jsonify(
        {
            "results": all_results,
            "summary": {
                "total": len(all_results),
                "needs_fix": needs_fix,
                "wrong_flags": wrong_flags,
            },
            "start_index": start_index,
            "processed_count": len(all_results),
            "total_cards": total_cards,
        }
    )


@app.post("/api/import")
def import_cards():
    data = request.get_json(force=True)
    deck_name = str(data.get("deck_name", "")).strip()
    raw_text = str(data.get("raw_text", ""))
    term_separator = str(data.get("term_separator", ""))
    card_separator = str(data.get("card_separator", ""))

    if not deck_name:
        return jsonify({"error": "Deck name is required."}), 400

    cards, errors = parse_cards(raw_text, term_separator, card_separator)
    if not cards:
        return jsonify({"error": "No valid cards to import.", "errors": errors}), 400

    decks = load_decks()
    deck = find_deck(decks, deck_name)
    if deck is None:
        deck = Deck(name=deck_name, cards=[])
        decks.append(deck)
    deck.cards.extend(cards)
    save_decks(decks)
    return jsonify({"ok": True, "imported": len(cards), "errors": errors[:10]})


@app.get("/api/settings")
def get_settings():
    return jsonify(load_settings())


@app.get("/api/voices")
def get_voices():
    return jsonify({"voices": list_piper_models()})


@app.post("/api/voices/upload")
def upload_voices():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    CUSTOM_VOICES_DIR.mkdir(parents=True, exist_ok=True)
    allowed_ext = {".onnx", ".json"}
    saved_files: list[str] = []
    uploaded_onnx_paths: list[Path] = []
    for file in files:
        filename = _sanitize_model_filename(file.filename or "")
        suffix = Path(filename).suffix.lower()
        if suffix not in allowed_ext:
            continue
        destination = CUSTOM_VOICES_DIR / filename
        file.save(destination)
        saved_files.append(str(destination))
        if suffix == ".onnx":
            uploaded_onnx_paths.append(destination)

    if not saved_files:
        return jsonify({"error": "Upload only .onnx and .json files."}), 400
    missing_configs = [str(path) for path in uploaded_onnx_paths if not _piper_model_config_path(path).exists()]
    return jsonify(
        {
            "ok": True,
            "saved": saved_files,
            "missing_configs": missing_configs,
            "voices": list_piper_models(),
        }
    )


@app.post("/api/settings")
def update_settings():
    data = request.get_json(force=True) or {}
    current = load_settings()
    for key in DEFAULT_SETTINGS:
        if key in data:
            current[key] = str(data.get(key, "")).strip()
    save_settings(current)
    return jsonify({"ok": True})


@app.get("/api/learn-progress/<path:deck_name>")
def get_learn_progress(deck_name: str):
    progress = load_learn_progress()
    item = progress.get(deck_name.lower())
    return jsonify({"progress": item})


@app.post("/api/learn-progress/<path:deck_name>")
def upsert_learn_progress(deck_name: str):
    data = request.get_json(force=True) or {}
    state = data.get("state")
    if not isinstance(state, dict):
        return jsonify({"error": "state object is required."}), 400

    progress = load_learn_progress()
    progress[deck_name.lower()] = {
        "deck_name": deck_name,
        "state": state,
    }
    save_learn_progress(progress)
    return jsonify({"ok": True})


@app.delete("/api/learn-progress/<path:deck_name>")
def delete_learn_progress(deck_name: str):
    progress = load_learn_progress()
    key = deck_name.lower()
    if key in progress:
        del progress[key]
        save_learn_progress(progress)
    return jsonify({"ok": True})


@app.post("/api/voice/stt")
def voice_stt():
    data = request.get_json(force=True) or {}
    audio_base64 = str(data.get("audio_base64", "")).strip()
    if not audio_base64:
        return jsonify({"error": "audio_base64 is required."}), 400

    settings = load_settings()
    suffix = ".webm"
    if "wav" in str(data.get("mime_type", "")).lower():
        suffix = ".wav"

    try:
        raw_audio = b64decode(audio_base64)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(raw_audio)
            tmp_path = Path(f.name)

        stt_mode = str(data.get("stt_mode", "")).strip().lower()
        model_size_override = "tiny" if stt_mode == "manual" else "base"
        model = whisper_model(settings, model_size_override=model_size_override)
        segments, _ = model.transcribe(str(tmp_path), language="en")
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return jsonify({"text": text})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"STT failed: {exc}"}), 500
    finally:
        try:
            if "tmp_path" in locals() and tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass


@app.post("/api/voice/tts")
def voice_tts():
    data = request.get_json(force=True) or {}
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required."}), 400

    settings = load_settings()
    piper_executable = settings.get("piper_executable", "").strip() or "piper"
    piper_model = settings.get("piper_model", "").strip()
    if not piper_model:
        return jsonify({"error": "Set Piper model path in Settings first."}), 400
    piper_model_path = Path(piper_model)
    if not piper_model_path.exists():
        return jsonify({"error": f"Piper model not found: {piper_model_path}"}), 400
    piper_model_config_path = _piper_model_config_path(piper_model_path)
    if not piper_model_config_path.exists():
        return (
            jsonify(
                {
                    "error": (
                        f"Missing Piper config for model: {piper_model_path.name}. "
                        f"Expected sidecar file: {piper_model_config_path.name}. "
                        "Upload both `.onnx` and matching `.onnx.json`."
                    )
                }
            ),
            400,
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as out:
            out_path = Path(out.name)

        cmd = [piper_executable, "--model", piper_model, "--output_file", str(out_path)]
        subprocess.run(
            cmd,
            input=text,
            text=True,
            capture_output=True,
            check=True,
        )
        wav_b64 = b64encode(out_path.read_bytes()).decode("ascii")
        return jsonify({"audio_base64": wav_b64, "mime_type": "audio/wav"})
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or exc.stdout or str(exc)).strip()
        return jsonify({"error": f"TTS failed: {err[:300]}"}), 500
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"TTS failed: {exc}"}), 500
    finally:
        try:
            if "out_path" in locals() and out_path.exists():
                out_path.unlink()
        except OSError:
            pass


@app.post("/api/voice/evaluate")
def voice_evaluate():
    data = request.get_json(force=True) or {}
    term = str(data.get("term", "")).strip()
    definition = str(data.get("definition", "")).strip()
    spoken_text = str(data.get("spoken_text", "")).strip()
    if not term or not definition or not spoken_text:
        return jsonify({"error": "term, definition, and spoken_text are required."}), 400

    try:
        result = call_openrouter(load_settings(), term, definition, spoken_text)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Evaluation failed: {exc}"}), 500


if __name__ == "__main__":
    threading.Thread(target=warmup_whisper_models, daemon=True).start()
    host = os.environ.get("FLASK_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    try:
        preferred_port = int(os.environ.get("PORT", str(DEFAULT_PORT)))
    except ValueError:
        preferred_port = DEFAULT_PORT

    port = resolve_server_port(host, preferred_port)
    if port != preferred_port:
        print(f"Port {preferred_port} is busy, using port {port} instead.")
    else:
        print(f"Using port {port}.")

    app.run(host=host, port=port, debug=True, use_reloader=False)
