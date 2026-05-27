"""
Marketplace router — proxy endpoints for desktop mode when Supabase JS client isn't available.
For native/Android, the frontend calls Supabase directly via supabase.ts.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter()

# These endpoints are proxies — the actual Supabase calls happen on the frontend.
# This router exists so the desktop backend can provide API endpoints if needed.
# For now, the frontend handles all marketplace operations via Supabase JS client directly.


@router.get("/health")
async def marketplace_health():
    return {"status": "ok", "message": "Marketplace API — use Supabase client for data operations"}
