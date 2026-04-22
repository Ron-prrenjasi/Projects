# Menu Editor MVP

Starter project for a menu editor that:
- uploads PDF/JPEG/PNG,
- extracts text blocks,
- allows editing text + style fields,
- saves edits for later,
- previews the original source document.

## Project structure

```text
backend/
  app/
    main.py            # FastAPI APIs
    static/
      index.html       # UI
      app.js           # UI logic
      styles.css       # styles
  data/
    uploads/           # uploaded source files
    projects/          # saved project JSON files
```

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000

## Notes

- PDF extraction uses **PyMuPDF** for embedded text.
- Image OCR uses **pytesseract** if Tesseract is installed on the machine.
- Scanned PDFs are not yet OCRed in this MVP; add a PDF-to-image OCR step next.
