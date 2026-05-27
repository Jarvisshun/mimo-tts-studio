from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from models.schemas import TTSRequest
from services.mimo_client import get_client_for_provider
from utils.audio import save_audio
from models.database import get_db
import uuid
import json
import os
import base64

router = APIRouter()


@router.post("/synthesize")
async def synthesize(req: TTSRequest, db=Depends(get_db)):
    try:
        client = await get_client_for_provider(db)

        # Route to appropriate model based on voice_type
        if req.voice_type == 'clone':
            # Look up the voice's audio from the voices table
            cursor = await db.execute(
                "SELECT audio_path FROM voices WHERE id = ? AND type = 'clone'",
                (req.voice,),
            )
            row = await cursor.fetchone()
            if not row or not row["audio_path"]:
                raise HTTPException(status_code=404, detail="克隆音色未找到或缺少音频")

            audio_path = row["audio_path"]
            if not os.path.isabs(audio_path):
                from utils.config import AUDIO_STORE_PATH
                audio_path = os.path.join(AUDIO_STORE_PATH, audio_path)

            with open(audio_path, "rb") as f:
                audio_bytes = f.read()
            audio_b64 = base64.b64encode(audio_bytes).decode()
            ext = os.path.splitext(audio_path)[1].lstrip(".")
            if ext not in ("wav", "mp3"):
                ext = "wav"

            result = await client.voice_clone(
                text=req.text,
                audio_base64=audio_b64,
                audio_format=ext,
                output_format=req.format.value if req.format.value not in ("pcm", "pcm16") else "wav",
                emotion=req.emotion,
            )
        elif req.voice_type == 'design':
            description = req.voice_description or "标准音色"
            result = await client.voice_design(
                description=description,
                text=req.text,
                format=req.format.value if req.format.value not in ("pcm", "pcm16") else "wav",
            )
        else:
            result = await client.tts(
                text=req.text,
                model=req.model,
                voice=req.voice,
                format=req.format.value,
                speed=req.speed,
                emotion=req.emotion,
            )

        save_format = req.format.value
        audio_path = save_audio(result["audio"], save_format, "tts")
        # PCM gets converted to WAV in save_audio
        if save_format in ("pcm", "pcm16"):
            save_format = "wav"
        gen_id = f"gen_{uuid.uuid4().hex[:12]}"

        model_used = req.model
        if req.voice_type == 'clone':
            model_used = "mimo-v2.5-tts-voiceclone"
        elif req.voice_type == 'design':
            model_used = "mimo-v2.5-tts-voicedesign"

        await db.execute(
            "INSERT INTO generations (id, model, voice, text_content, audio_path, format, speed, emotion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (gen_id, model_used, req.voice, req.text, audio_path, save_format, req.speed, req.emotion),
        )
        await db.commit()

        return {
            "success": True,
            "data": {
                "audio": result["audio"],
                "format": save_format,
                "generation_id": gen_id,
                "audio_path": audio_path,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def synthesize_stream(req: TTSRequest, db=Depends(get_db)):
    client = await get_client_for_provider(db)

    async def event_generator():
        try:
            async for chunk in client.tts_stream(
                text=req.text,
                model=req.model,
                voice=req.voice,
                format=req.format.value,
                speed=req.speed,
                emotion=req.emotion,
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
