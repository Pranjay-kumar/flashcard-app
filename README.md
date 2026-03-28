# Flashcard App

A local Python flashcard app with:
- Deck/card management
- Voice speech-to-text (Whisper)
- Voice text-to-speech (Piper)
- Optional OpenRouter-based spoken answer evaluation
- AI-powered card quality review (spelling, grammar, possible wrong content)
- Desktop wrapper (PySide6) and web mode (Flask)

## Requirements

- Python 3.10+ (tested locally with Python 3.14)
- Windows is best supported for bundled voice setup (`setup_voice.py`)

## Quick Start

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Optional but recommended: bootstrap voice binaries/models:

```powershell
python setup_voice.py
```

4. Start the app:

Web:
```powershell
python app.py
```
Then open [http://127.0.0.1:5000](http://127.0.0.1:5000).

Desktop wrapper:
```powershell
python desktop_app.py
```

## Quality Review Feature

- Select a deck, then click **Check Cards**.
- Run AI scan to flag spelling/grammar issues and cards that may be conceptually wrong.
- Accept/reject suggestions, manually edit inline, select the cards you want, and click **Apply Selected**.

## Configuration

- App settings are stored in `settings.json` (local only; ignored by git).
- Start from `settings.example.json` if you want a template.
- Set `openrouter_api_key` and `openrouter_model` in app Settings to enable answer evaluation.

## GitHub Notes

- This repo intentionally ignores local runtime files and downloaded model/binary assets.
- After cloning, run `python setup_voice.py` to re-download voice dependencies.
