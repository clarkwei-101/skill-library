# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# poppler-utils provides pdftotext/pdfinfo which the service can use for
# extra PDF handling; curl is used for the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        poppler-utils \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# The service reads/writes the shared storage tree.
ENV SKILL_STORAGE_DIR=/storage \
    PYTHONPATH=/app

RUN mkdir -p /storage/skills /storage/zips /storage/books

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
