import json
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).parent
TOOLS_DIR = ROOT / "tools" / "piper"
MODELS_DIR = ROOT / "models"
SETTINGS_FILE = ROOT / "settings.json"
PIPER_EXE = TOOLS_DIR / "piper.exe"
MODEL_ONNX = MODELS_DIR / "en_US-lessac-medium.onnx"
MODEL_JSON = MODELS_DIR / "en_US-lessac-medium.onnx.json"

MODEL_ONNX_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "en/en_US/lessac/medium/en_US-lessac-medium.onnx"
)
MODEL_JSON_URL = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
)
LATEST_RELEASE_API = "https://api.github.com/repos/rhasspy/piper/releases/latest"


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, destination.open("wb") as out:
        shutil.copyfileobj(response, out)


def ensure_piper_windows() -> None:
    if sys.platform != "win32":
        print("Skipping Piper binary download: this bootstrap script currently auto-installs only for Windows.")
        print("Set piper_executable manually in app Settings for your platform.")
        return

    if PIPER_EXE.exists():
        print(f"Piper already present: {PIPER_EXE}")
        return

    print("Fetching latest Piper release metadata...")
    with urllib.request.urlopen(LATEST_RELEASE_API) as response:
        release = json.loads(response.read().decode("utf-8"))

    assets = release.get("assets", [])
    target_asset = None
    for asset in assets:
        name = str(asset.get("name", "")).lower()
        if "windows_amd64" in name and name.endswith(".zip"):
            target_asset = asset
            break

    if not target_asset:
        raise RuntimeError("Could not find a Windows amd64 Piper zip in the latest release.")

    download_url = target_asset.get("browser_download_url")
    if not download_url:
        raise RuntimeError("Piper release asset is missing browser_download_url.")

    print(f"Downloading Piper: {target_asset.get('name')}")
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = Path(tmp) / "piper.zip"
        download_file(download_url, zip_path)

        extract_dir = Path(tmp) / "extract"
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as archive:
            archive.extractall(extract_dir)

        candidates = list(extract_dir.rglob("piper.exe"))
        if not candidates:
            raise RuntimeError("Downloaded archive did not contain piper.exe")

        source_exe = candidates[0]
        source_dir = source_exe.parent
        if TOOLS_DIR.exists():
            shutil.rmtree(TOOLS_DIR)
        shutil.copytree(source_dir, TOOLS_DIR)

    print(f"Installed Piper to: {TOOLS_DIR}")


def ensure_model_files() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if not MODEL_ONNX.exists():
        print("Downloading bundled Piper voice model (.onnx)...")
        download_file(MODEL_ONNX_URL, MODEL_ONNX)
    else:
        print(f"Model exists: {MODEL_ONNX}")

    if not MODEL_JSON.exists():
        print("Downloading bundled Piper voice config (.onnx.json)...")
        download_file(MODEL_JSON_URL, MODEL_JSON)
    else:
        print(f"Model config exists: {MODEL_JSON}")


def update_settings_defaults() -> None:
    defaults = {
        "openrouter_api_key": "",
        "openrouter_model": "",
        "piper_executable": str(PIPER_EXE if PIPER_EXE.exists() else "piper"),
        "piper_model": str(MODEL_ONNX),
        "whisper_model_size": "base",
        "whisper_compute_type": "int8",
    }

    if SETTINGS_FILE.exists():
        try:
            settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            settings = {}
    else:
        settings = {}

    for key, value in defaults.items():
        current = str(settings.get(key, "")).strip()
        if not current:
            settings[key] = value

    SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    print(f"Updated defaults in: {SETTINGS_FILE}")


def main() -> None:
    print("Bootstrapping voice dependencies...")
    ensure_piper_windows()
    ensure_model_files()
    update_settings_defaults()
    print("Done. Next: set OpenRouter API key/model in app Settings.")


if __name__ == "__main__":
    main()
