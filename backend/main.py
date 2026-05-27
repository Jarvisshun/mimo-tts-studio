from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn
import os
import sys
import webbrowser
import threading

import httpx
import time

from routers import tts, clone, design, batch, voices, history, config as config_router, marketplace
from models.database import init_db
from utils.config import AUDIO_STORE_PATH

try:
    import webview
    WEBVIEW_AVAILABLE = True
except ImportError:
    WEBVIEW_AVAILABLE = False


def get_base_dir():
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates = [
            getattr(sys, "_MEIPASS", ""),
            os.path.join(exe_dir, "_internal"),
            exe_dir,
        ]
        for candidate in candidates:
            if candidate and os.path.isdir(os.path.join(candidate, "static")):
                return candidate
        return getattr(sys, "_MEIPASS", exe_dir)
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = get_base_dir()
STATIC_DIR = os.path.join(BASE_DIR, "static")

def _read_version():
    try:
        # When frozen (PyInstaller), read from bundled VERSION file
        if getattr(sys, "frozen", False):
            base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
            vfile = os.path.join(base, "VERSION")
        else:
            vfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "VERSION")
        with open(vfile) as f:
            return f.read().strip()
    except Exception:
        return "0.0.0"

__version__ = _read_version()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="TTS Voxa", version=__version__, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{p}" for p in range(8000, 8021)
    ] + [
        f"http://127.0.0.1:{p}" for p in range(8000, 8021)
    ] + [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])
app.include_router(clone.router, prefix="/api/clone", tags=["Voice Clone"])
app.include_router(design.router, prefix="/api/design", tags=["Voice Design"])
app.include_router(batch.router, prefix="/api/batch", tags=["Batch"])
app.include_router(voices.router, prefix="/api/voices", tags=["Voices"])
app.include_router(history.router, prefix="/api/history", tags=["History"])
app.include_router(config_router.router, prefix="/api/config", tags=["Config"])
app.include_router(marketplace.router, prefix="/api/marketplace", tags=["Marketplace"])

audio_dir = AUDIO_STORE_PATH
os.makedirs(audio_dir, exist_ok=True)
app.mount("/audio", StaticFiles(directory=audio_dir), name="audio")


@app.get("/api/voices/presets")
async def get_preset_voices():
    return {
        "success": True,
        "data": [
            # 中文女声
            {"id": "mimo_default", "name": "默认", "style": "标准音色", "category": "zh-female"},
            {"id": "冰糖", "name": "冰糖", "style": "甜美女声", "category": "zh-female"},
            {"id": "茉莉", "name": "茉莉", "style": "温柔女声", "category": "zh-female"},
            {"id": "苏打", "name": "苏打", "style": "活泼女声", "category": "zh-female"},
            # 中文男声
            {"id": "白桦", "name": "白桦", "style": "沉稳男声", "category": "zh-male"},
            # 英文女声
            {"id": "Mia", "name": "Mia", "style": "英文女声", "category": "en-female"},
            # 英文男声
            {"id": "Milo", "name": "Milo", "style": "英文男声", "category": "en-male"},
            {"id": "Dean", "name": "Dean", "style": "英文男声", "category": "en-male"},
        ],
    }


@app.get("/api/health")
async def health():
    return {"status": "ok"}


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse 'v1.2.3' or '1.2.3' into (1, 2, 3)."""
    v = v.lstrip("v")
    parts = []
    for p in v.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            break
    return tuple(parts) or (0,)


GITHUB_REPO = "Jarvisshun/tts-voxa"
_update_cache = {"data": None, "ts": 0}


@app.get("/api/version")
async def get_version():
    return {"version": __version__}


@app.get("/api/update/check")
async def check_update():
    now = time.time()
    if _update_cache["data"] and now - _update_cache["ts"] < 600:
        return _update_cache["data"]

    result = {
        "current": __version__,
        "latest": __version__,
        "has_update": False,
        "download_url": None,
        "release_notes": None,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                headers={"Accept": "application/vnd.github+json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                tag = data.get("tag_name", "")
                latest_ver = tag.lstrip("v")
                download_url = None
                for asset in data.get("assets", []):
                    if asset.get("name", "").endswith(".zip"):
                        download_url = asset.get("browser_download_url")
                        break
                if not download_url:
                    download_url = data.get("html_url", "")

                result["latest"] = latest_ver
                result["has_update"] = _parse_version(latest_ver) > _parse_version(__version__)
                result["download_url"] = download_url
                result["release_notes"] = data.get("body", "")
                _update_cache["data"] = result
                _update_cache["ts"] = now
    except Exception:
        result["error"] = "检查失败，请稍后重试"

    return result


# Mount static files and SPA routes only if static dir exists
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.realpath(os.path.join(STATIC_DIR, full_path))
        if not file_path.startswith(os.path.realpath(STATIC_DIR) + os.sep):
            return JSONResponse({"error": "forbidden"}, status_code=403)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        index = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        return JSONResponse({"error": "not found"}, status_code=404)
else:
    @app.get("/")
    async def no_static_root():
        return JSONResponse(
            {"error": "Frontend not found", "static_dir": STATIC_DIR, "exists": False},
            status_code=503,
        )


def find_free_port(start=8000, end=8020):
    import socket
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start


def run_webview_app(port: int):
    """Launch native window with pywebview (exe mode)."""
    import asyncio

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    loop = asyncio.new_event_loop()

    def start_server():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(server.serve())
        loop.close()

    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}"
    # Wait for server to be ready
    import time as _time
    for _ in range(30):
        try:
            import urllib.request
            urllib.request.urlopen(url + "/api/health", timeout=1)
            break
        except Exception:
            _time.sleep(0.3)

    window = webview.create_window(
        "TTS Voxa",
        url,
        width=1280,
        height=860,
        min_size=(960, 640),
    )

    def on_closed():
        server.should_exit = True
        loop.call_soon_threadsafe(loop.stop)

    window.events.closed += on_closed
    webview.start(gui="edgechromium")


if __name__ == "__main__":
    try:
        port = find_free_port()
        print(f"Starting TTS Voxa on http://localhost:{port}")
        print(f"Static dir: {STATIC_DIR} (exists={os.path.isdir(STATIC_DIR)})")
        if getattr(sys, "frozen", False) and WEBVIEW_AVAILABLE:
            run_webview_app(port)
        else:
            if getattr(sys, "frozen", False):
                threading.Thread(
                    target=lambda: (time.sleep(2), webbrowser.open(f"http://localhost:{port}")),
                    daemon=True,
                ).start()
            uvicorn.run(app, host="127.0.0.1", port=port, reload=False)
    except Exception as e:
        print(f"\nError: {e}")
        input("Press Enter to exit...")
