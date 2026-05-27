"""
Voice Discovery Script for MiMo TTS API
=========================================
Tests a wide range of voice IDs to find which ones the MiMo API supports.
Run this script and report the results back to Claude to update the preset list.

Usage:
    cd backend
    python discover_voices.py

Requires MIMO_API_KEY in .env or environment variable.
"""

import asyncio
import httpx
import os
import sys
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("MIMO_API_KEY", "")
API_BASE = os.getenv("MIMO_API_BASE", "https://token-plan-cn.xiaomimimo.com/v1")

# Voice candidates to test - organized by category
VOICE_CANDIDATES = {
    "中文女声": [
        "mimo_default", "冰糖", "茉莉", "苏打", "云溪", "云锦", "云星", "云萱",
        "晓晓", "晓墨", "晓涵", "晓悠", "晓萱", "晓曼", "晓梦",
        "楠楠", "思悦", "小萌", "小月", "佳佳", "美佳", "婷婷",
        "甜甜", "小雪", "小薇", "雅琴", "雅楠", "静香", "若曦",
        "诗涵", "梦瑶", "紫萱", "雨薇", "欣怡", "思琪", "可馨",
        "心怡", "雨桐", "语嫣", "清雅", "悠然", "暖暖", "蜜糖",
        "棉花糖", "小清新", "知性", "空灵", "御姐", "甜美", "温柔",
        "活泼", "可爱", "成熟", "清冷", "治愈", "元气", "少女",
    ],
    "中文男声": [
        "白桦", "云逸", "云阳", "云龙", "云天", "云松",
        "晓峰", "晓明", "晓东", "晓刚",
        "思远", "大龙", "建华", "小强", "小刚",
        "浩然", "子轩", "宇辰", "天佑", "明哲", "志远",
        "沉稳", "磁性", "低沉", "阳光", "成熟", "知性", "儒雅",
        "少年", "青年", "大叔", "绅士", "暖男",
    ],
    "英文女声": [
        "Mia", "Chloe", "Aria", "Jenny", "Sara", "Emma", "Stella",
        "Ava", "Sophia", "Olivia", "Isabella", "Mia2", "Luna",
        "Grace", "Lily", "Zoe", "Ruby", "Ivy", "Ella", "Nora",
    ],
    "英文男声": [
        "Milo", "Dean", "Guy", "Davis", "Tony", "Andrew", "Brian",
        "James", "Oliver", "Ethan", "Lucas", "Henry", "Alexander",
        "Benjamin", "Daniel", "Samuel", "Jack", "Leo", "Max", "Ryan",
    ],
    "特色/角色": [
        "narrator", "storyteller", "newscaster", "teacher", "assistant",
        "robot", "alien", "whisper", "shouting", "singing",
        "旁白", "讲故事", "新闻播报", "老师", "助手",
        "机器人", "精灵", "仙女", "恶魔", "天使",
        "吸血鬼", "女巫", "骑士", "国王", "公主",
    ],
}

TEST_TEXT = "你好，这是一段测试语音。"
TEST_TEXT_EN = "Hello, this is a voice test."


async def test_voice(client: httpx.AsyncClient, voice_id: str, text: str) -> bool:
    """Test if a voice ID works with the MiMo API. Returns True if successful."""
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [{"role": "assistant", "content": text}],
        "modalities": ["text", "audio"],
        "audio": {"voice": voice_id, "format": "wav"},
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = await client.post(
            f"{API_BASE}/chat/completions",
            headers=headers,
            json=payload,
            timeout=30.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            # Check if audio data is present
            audio = data.get("choices", [{}])[0].get("message", {}).get("audio", {}).get("data", "")
            return len(audio) > 100  # Valid audio is a long base64 string
        return False
    except Exception as e:
        return False


async def main():
    if not API_KEY:
        print("ERROR: MIMO_API_KEY not set!")
        print("Set it in backend/.env or as an environment variable.")
        sys.exit(1)

    print(f"API Base: {API_BASE}")
    print(f"Testing voice IDs against MiMo TTS API...\n")

    results = {}  # category -> list of (voice_id, success)
    all_success = []

    async with httpx.AsyncClient(trust_env=False) as client:
        for category, voices in VOICE_CANDIDATES.items():
            print(f"=== {category} ===")
            category_results = []
            for voice_id in voices:
                text = TEST_TEXT_EN if any(c.isascii() and c.isalpha() for c in voice_id) else TEST_TEXT
                success = await test_voice(client, voice_id, text)
                status = "OK" if success else "FAIL"
                print(f"  {voice_id:20s} -> {status}")
                category_results.append((voice_id, success))
                if success:
                    all_success.append((category, voice_id))
                # Small delay to avoid rate limiting
                await asyncio.sleep(0.3)
            results[category] = category_results
            print()

    # Summary
    print("=" * 60)
    print("SUMMARY - Working voice IDs:")
    print("=" * 60)
    current_cat = None
    for cat, voice_id in all_success:
        if cat != current_cat:
            print(f"\n  {cat}:")
            current_cat = cat
        print(f"    - {voice_id}")

    print(f"\n\nTotal working: {len(all_success)} / {sum(len(v) for v in VOICE_CANDIDATES.values())}")

    # Output as JSON for easy copy-paste
    import json
    json_result = {}
    for cat, voice_id in all_success:
        json_result.setdefault(cat, []).append(voice_id)
    print("\n\nJSON format (for updating code):")
    print(json.dumps(json_result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
