from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None

try:
    import pytesseract
    from PIL import Image
except Exception:  # pragma: no cover
    pytesseract = None
    Image = None

ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = ROOT / "backend" / "data" / "uploads"
PROJECTS_DIR = ROOT / "backend" / "data" / "projects"
STATIC_DIR = ROOT / "backend" / "app" / "static"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Menu Editor MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class TextBlock(BaseModel):
    id: str
    page: int
    text: str
    x: float
    y: float
    w: float
    h: float
    font_family: str = "Arial"
    font_size: int = 18
    color: str = "#111111"


class SavePayload(BaseModel):
    blocks: list[TextBlock]


class ProjectMeta(BaseModel):
    id: str
    filename: str
    mime_type: str
    created_at: str
    updated_at: str
    status: str


def project_file(project_id: str) -> Path:
    return PROJECTS_DIR / f"{project_id}.json"


def extract_from_pdf(pdf_path: Path) -> tuple[list[dict[str, Any]], str]:
    if fitz is None:
        return [], "PyMuPDF not installed: cannot extract PDF text in this environment."

    blocks: list[dict[str, Any]] = []
    doc = fitz.open(pdf_path)
    for page_index, page in enumerate(doc, start=1):
        for block in page.get_text("blocks"):
            x0, y0, x1, y1, text, *_ = block
            cleaned = (text or "").strip()
            if not cleaned:
                continue
            blocks.append(
                {
                    "id": str(uuid.uuid4()),
                    "page": page_index,
                    "text": cleaned,
                    "x": float(x0),
                    "y": float(y0),
                    "w": float(x1 - x0),
                    "h": float(y1 - y0),
                }
            )

    status = "ok" if blocks else "No embedded text found. For scanned PDFs, add OCR pipeline."
    return blocks, status


def extract_from_image(image_path: Path) -> tuple[list[dict[str, Any]], str]:
    if pytesseract is None or Image is None:
        return [], "pytesseract/Pillow not installed: cannot OCR images in this environment."

    image = Image.open(image_path)
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    blocks: list[dict[str, Any]] = []

    for i, text in enumerate(data.get("text", [])):
        cleaned = (text or "").strip()
        conf = data.get("conf", ["-1"])[i]
        if not cleaned:
            continue
        try:
            confidence = float(conf)
        except ValueError:
            confidence = -1.0
        if confidence < 0:
            continue

        blocks.append(
            {
                "id": str(uuid.uuid4()),
                "page": 1,
                "text": cleaned,
                "x": float(data["left"][i]),
                "y": float(data["top"][i]),
                "w": float(data["width"][i]),
                "h": float(data["height"][i]),
            }
        )

    status = "ok" if blocks else "No text detected in image."
    return blocks, status


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/upload", response_model=ProjectMeta)
async def upload(file: UploadFile = File(...)) -> ProjectMeta:
    if file.content_type not in {"application/pdf", "image/jpeg", "image/png"}:
        raise HTTPException(status_code=400, detail="Only PDF, JPEG, and PNG are supported.")

    project_id = str(uuid.uuid4())
    destination = UPLOADS_DIR / f"{project_id}-{file.filename}"
    content = await file.read()
    destination.write_bytes(content)

    if file.content_type == "application/pdf":
        blocks, status = extract_from_pdf(destination)
    else:
        blocks, status = extract_from_image(destination)

    now = datetime.now(timezone.utc).isoformat()
    project_doc = {
        "id": project_id,
        "filename": file.filename,
        "mime_type": file.content_type,
        "created_at": now,
        "updated_at": now,
        "status": status,
        "source_path": str(destination),
        "blocks": blocks,
    }
    project_file(project_id).write_text(json.dumps(project_doc, indent=2))

    return ProjectMeta(**{k: project_doc[k] for k in ProjectMeta.model_fields.keys()})




@app.get("/api/projects")
def list_projects() -> list[dict[str, Any]]:
    projects: list[dict[str, Any]] = []
    for path in sorted(PROJECTS_DIR.glob("*.json"), reverse=True):
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        projects.append(
            {
                "id": doc.get("id", path.stem),
                "filename": doc.get("filename", "unknown"),
                "updated_at": doc.get("updated_at", ""),
                "status": doc.get("status", "unknown"),
            }
        )
    projects.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return projects

@app.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict[str, Any]:
    path = project_file(project_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")
    return json.loads(path.read_text())


@app.put("/api/projects/{project_id}")
def save_project(project_id: str, payload: SavePayload) -> dict[str, Any]:
    path = project_file(project_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    doc = json.loads(path.read_text())
    doc["blocks"] = [item.model_dump() for item in payload.blocks]
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(doc, indent=2))
    return {"ok": True, "updated_at": doc["updated_at"]}


@app.get("/api/projects/{project_id}/source")
def get_source(project_id: str) -> FileResponse:
    path = project_file(project_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    doc = json.loads(path.read_text())
    source_path = Path(doc["source_path"])
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Source file missing")
    return FileResponse(source_path)
