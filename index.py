"""Vercel FastAPI 진입점 — 이름은 Vercel 탐지 규칙(index.py 의 app)을 따른다. 구성은 deploy/vercel_app.py."""

from deploy.vercel_app import create_public_app

app = create_public_app()
