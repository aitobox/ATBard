import os
import json
import base64
import struct
import time
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from dotenv import load_dotenv
from google import genai
from google.genai import types
from .models import RecitationHistory

load_dotenv()

# Helper to convert base64 little-endian 16-bit PCM bytes (24000Hz mono) into WAV
def pcm_to_wav(pcm_input, sample_rate: int = 24000) -> str:
    try:
        if isinstance(pcm_input, str):
            pcm_data = base64.b64decode(pcm_input)
        elif isinstance(pcm_input, bytes):
            pcm_data = pcm_input
        else:
            raise TypeError("pcm_input must be str or bytes")

        num_channels = 1
        bits_per_sample = 16
        block_align = num_channels * (bits_per_sample // 8)  # 1 * 2 = 2 bytes
        byte_rate = sample_rate * block_align  # 24000 * 2 = 48000 bytes/sec
        
        # 44-byte WAV Header construction
        header = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF',
            36 + len(pcm_data),
            b'WAVE',
            b'fmt ',
            16,
            1,            # Sample format: 1 (uncompressed integer PCM)
            num_channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
            b'data',
            len(pcm_data)
        )
        wav_data = header + pcm_data
        return base64.b64encode(wav_data).decode('utf-8')
    except Exception as e:
        print("Error in PCM to WAV conversion:", e)
        raise e

from .models import APISettings

# Lazy initialization of Google Gen AI client with settings caching
_cached_settings_data = None
_ai_client = None

def get_ai_client():
    global _ai_client, _cached_settings_data
    
    try:
        settings_obj = APISettings.get_settings()
        current_data = {
            "api_type": settings_obj.api_type,
            "gemini_api_key": settings_obj.gemini_api_key,
            "new_api_base_url": settings_obj.new_api_base_url,
            "new_api_key": settings_obj.new_api_key
        }
    except Exception as e:
        print("[Views] Error retrieving DB settings:", e)
        current_data = {
            "api_type": "official",
            "gemini_api_key": "",
            "new_api_base_url": "http://192.168.100.170:3000/v1",
            "new_api_key": ""
        }
        
    if _ai_client is None or _cached_settings_data != current_data:
        _cached_settings_data = current_data
        api_type = current_data["api_type"]
        
        if api_type == "new_api":
            api_key = current_data["new_api_key"] or os.environ.get("NEW_API_KEY") or os.environ.get("OPENAI_API_KEY")
            base_url = current_data["new_api_base_url"] or "http://192.168.100.170:3000/v1"
            
            if not api_key:
                raise ValueError("未配置 NEWAPI 密钥。请在设置中输入密钥。")
                
            clean_base = base_url.strip()
            if clean_base.endswith("/v1"):
                clean_base = clean_base[:-3]
            elif clean_base.endswith("/v1/"):
                clean_base = clean_base[:-4]
                
            _ai_client = genai.Client(
                api_key=api_key,
                http_options={
                    'base_url': clean_base,
                    'headers': {
                        'User-Agent': 'aistudio-build',
                    }
                }
            )
        else:
            api_key = current_data["gemini_api_key"] or os.environ.get("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("未配置 GEMINI_API_KEY。请在设置中输入密钥，或在 Secrets 中添加。")
                
            _ai_client = genai.Client(
                api_key=api_key,
                http_options={
                    'headers': {
                        'User-Agent': 'aistudio-build',
                    }
                }
            )
            
    return _ai_client

# Health check API
def health_view(request):
    try:
        settings_obj = APISettings.get_settings()
        api_type = settings_obj.api_type
        if api_type == "new_api":
            has_key = bool(settings_obj.new_api_key or os.environ.get("NEW_API_KEY") or os.environ.get("OPENAI_API_KEY"))
        else:
            has_key = bool(settings_obj.gemini_api_key or os.environ.get("GEMINI_API_KEY"))
    except Exception:
        api_type = "official"
        has_key = bool(os.environ.get("GEMINI_API_KEY"))
        
    return JsonResponse({
        "status": "ok",
        "hasKey": has_key,
        "apiType": api_type,
        "version": "3.1-flash"
    })

# Recite Generation API
@csrf_exempt
def recite_view(request):
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)
        
    start_time = time.time()
    try:
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON body"}, status=400)

        text = body.get("text")
        voice = body.get("voice", "Kore")
        style = body.get("style", "default")
        speed = body.get("speed", "medium")
        session_id = body.get("session_id")
        chunk_index = body.get("chunk_index", -1)

        if not text or not isinstance(text, str) or text.strip() == '':
            return JsonResponse({"error": "请输入需要朗诵的文本内容。"}, status=400)

        raw_text = text.strip()
        chosen_voice = voice
        chosen_style = style
        chosen_speed = speed

        # Direct Gemini TTS model with refined prompting based on Chinese context
        style_instruction = ""
        if chosen_style == "elegant":
            style_instruction = "朗诵风格应该充满儒雅和书卷气，语气温婉、和缓，带有古典文人的清雅，注重文字之间的灵动空隙和呼吸感。"
        elif chosen_style == "solemn":
            style_instruction = "朗诵风格应当厚重、庄严、宏大而深邃，每个字音都要平稳中气十足，语速沉缓，营造出史诗般的沧桑感和崇高感。"
        elif chosen_style == "emotional":
            style_instruction = "朗诵风格必须饱含深情、百转千回，情绪饱满而细腻，重点词句可以带有微微的颤音、叹息与情感波动，令人感同身受。"
        elif chosen_style == "energetic":
            style_instruction = "朗诵风格高昂激越、充满力量和朝气，语调清亮，节奏明快富有节奏感，展现出无限活力和进取精神。"
        elif chosen_style == "dramatic":
            style_instruction = "朗诵风格极富戏剧张力、跌宕起伏，时而低沉耳语，时而高亢爆发，善于利用节奏的急缓与语气的强烈对比。"
        else:
            style_instruction = "朗诵风格自然、流畅，语速适中，带有优雅的艺术美感和清晰的吐字。"

        # Speed control directive
        speed_instruction = ""
        if chosen_speed == "slow":
            speed_instruction = "请以非常缓慢、优雅且沉稳的节奏进行朗诵，每句话结束留出充足的艺术空白，突出文字意境。"
        elif chosen_speed == "fast":
            speed_instruction = "请以轻快、流畅且连续的节奏进行朗诵，减少字词之间的停顿，保持饱满清晰。"
        else:
            speed_instruction = "请以适宜朗诵的标准艺术节奏展示，主次分明，停顿有致。"

        # Formulate the dynamic instructions prepended in the prompt
        text_prompt = (
            f"你是一位顶级的艺术朗诵家和配音大师。请用以下艺术风格和语速要求，深情并茂地朗诵后面的文本。\n"
            f"【朗诵风格要求】:{style_instruction}\n"
            f"【语速掌控要求】:{speed_instruction}\n\n"
            f"注意：你只需要直接开始朗诵，不要输出任何其他的引言、解释、前言、结束语或任何干扰字符。只将以下给出的文字转化为纯粹的朗诵：\n\n"
            f"{raw_text}"
        )

        print(f"[Recite App] Generating recitation. Voice: {chosen_voice}, Style: {chosen_style}, Length: {len(raw_text)} chars")

        safety_settings = [
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
            types.SafetySetting(
                category=types.HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
                threshold=types.HarmBlockThreshold.BLOCK_NONE,
            ),
        ]

        ai = get_ai_client()
        response = ai.models.generate_content(
            model="gemini-3.1-flash-tts-preview",
            contents=text_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                safety_settings=safety_settings,
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=chosen_voice),
                    ),
                ),
            ),
        )

        # Log prompt feedback if present
        prompt_feedback = getattr(response, "prompt_feedback", None)
        if prompt_feedback:
            print(f"[Prompt Feedback] {prompt_feedback}")

        base64_pcm = None
        found_mime_type = None
        search_report = ""

        if response.candidates and len(response.candidates) > 0:
            for c, cand in enumerate(response.candidates):
                finish_reason = getattr(cand, "finish_reason", "UNKNOWN")
                finish_reason_str = finish_reason.name if hasattr(finish_reason, 'name') else str(finish_reason)
                
                search_report += f"Candidate {c} (FinishReason: {finish_reason_str}): "
                
                # Retrieve candidate safety ratings
                safety_ratings = getattr(cand, "safety_ratings", None)
                if safety_ratings:
                    ratings_list = []
                    for rating in safety_ratings:
                        cat_name = rating.category.name if hasattr(rating.category, 'name') else str(rating.category)
                        prob_name = rating.probability.name if hasattr(rating.probability, 'name') else str(rating.probability)
                        ratings_list.append(f"{cat_name}:{prob_name}")
                    search_report += f"[Safety: {', '.join(ratings_list)}] "

                if cand.content and cand.content.parts and len(cand.content.parts) > 0:
                    search_report += f"{len(cand.content.parts)} parts found. "
                    for p, part in enumerate(cand.content.parts):
                        inline_data = getattr(part, "inline_data", None)
                        if inline_data and inline_data.data:
                            base64_pcm = inline_data.data
                            found_mime_type = inline_data.mime_type
                            search_report += f"[Found audio in Part {p} with MIME: {found_mime_type}] "
                            break
                        else:
                            search_report += f"[Part {p} is text/other] "
                else:
                    search_report += "No parts. "
                if base64_pcm:
                    break
        else:
            search_report = "No candidates returned by Gemini."

        print(f"[Diagnostic Report] {search_report}")

        if not base64_pcm:
            first_candidate = response.candidates[0] if (response.candidates and len(response.candidates) > 0) else None
            finish_reason = getattr(first_candidate, "finish_reason", "UNKNOWN") if first_candidate else "none"
            finish_reason_str = finish_reason.name if hasattr(finish_reason, 'name') else str(finish_reason)
            error_msg = f"Gemini TTS 产生错误：无音频部分。原因报告:\n{search_report}\n首要原因: {finish_reason_str}"
            print(f"[Error] {error_msg}")
            return JsonResponse({"error": error_msg}, status=500)

        # Convert base64 PCM / raw bytes to base64 WAV
        base64_wav = pcm_to_wav(base64_pcm, 24000)
        
        # Calculate PCM data length in bytes
        if isinstance(base64_pcm, str):
            pcm_bytes_len = len(base64.b64decode(base64_pcm))
        else:
            pcm_bytes_len = len(base64_pcm)

        # 24000 Hz * 16-bit (2 bytes) = 48000 bytes per second
        calculated_duration_sec = round(pcm_bytes_len / 48000.0, 2)

        # Token usage calculation
        prompt_tokens = 0
        candidates_tokens = 0
        total_tokens = 0
        if getattr(response, 'usage_metadata', None):
            prompt_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0)
            candidates_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0)
            total_tokens = getattr(response.usage_metadata, 'total_token_count', 0)

        elapsed_time_ms = int((time.time() - start_time) * 1000)

        # Create record in Database
        record = RecitationHistory.objects.create(
            text=raw_text,
            voice=chosen_voice,
            style=chosen_style,
            speed=chosen_speed,
            audio_base64=base64_wav,
            duration=calculated_duration_sec,
            text_length=len(raw_text),
            prompt_used=text_prompt,
            elapsed_time_ms=elapsed_time_ms,
            prompt_tokens=prompt_tokens,
            candidates_tokens=candidates_tokens,
            total_tokens=total_tokens,
            session_id=session_id,
            chunk_index=chunk_index
        )

        return JsonResponse({
            "id": str(record.id),
            "audioData": base64_wav,
            "duration": calculated_duration_sec,
            "voice": chosen_voice,
            "textLength": len(raw_text),
            "promptUsed": text_prompt,
            "elapsedTimeMs": elapsed_time_ms,
            "promptTokens": prompt_tokens,
            "candidatesTokens": candidates_tokens,
            "totalTokens": total_tokens,
            "session_id": record.session_id,
            "chunk_index": record.chunk_index
        })

    except Exception as e:
        print("[Recite App] Server error:", e)
        error_msg = getattr(e, "message", str(e)) or "朗诵生成失败，请检查设置或稍后重试。"
        return JsonResponse({"error": error_msg}, status=500)

# Fetch History list API
def history_view(request):
    if request.method != 'GET':
        return JsonResponse({"error": "Method not allowed"}, status=405)
    try:
        records = RecitationHistory.objects.all().order_by('-timestamp')
        data = []
        for r in records:
            data.append({
                "id": str(r.id),
                "timestamp": r.timestamp.isoformat(),
                "text": r.text,
                "voice": r.voice,
                "style": r.style,
                "speed": r.speed,
                "audioData": r.audio_base64,
                "duration": r.duration,
                "textLength": r.text_length,
                "promptUsed": r.prompt_used,
                "elapsedTimeMs": r.elapsed_time_ms,
                "promptTokens": r.prompt_tokens,
                "candidatesTokens": r.candidates_tokens,
                "totalTokens": r.total_tokens,
                "session_id": r.session_id,
                "chunk_index": r.chunk_index
            })
        return JsonResponse(data, safe=False)
    except Exception as e:
        print("[Recite App] Fetch history error:", e)
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def settings_view(request):
    try:
        settings_obj = APISettings.get_settings()
    except Exception as e:
        return JsonResponse({"error": f"Failed to access DB settings: {str(e)}"}, status=500)
        
    if request.method == 'GET':
        masked_gemini = settings_obj.gemini_api_key or os.environ.get("GEMINI_API_KEY") or ""
        masked_new_api = settings_obj.new_api_key or os.environ.get("NEW_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
        
        if masked_gemini:
            masked_gemini = masked_gemini[:4] + "..." + masked_gemini[-4:] if len(masked_gemini) > 8 else "********"
        if masked_new_api:
            masked_new_api = masked_new_api[:4] + "..." + masked_new_api[-4:] if len(masked_new_api) > 8 else "********"
            
        return JsonResponse({
            "api_type": settings_obj.api_type,
            "gemini_api_key": masked_gemini,
            "new_api_base_url": settings_obj.new_api_base_url,
            "new_api_key": masked_new_api
        })
        
    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)
            
        api_type = body.get("api_type", "official")
        gemini_api_key = body.get("gemini_api_key", "")
        new_api_base_url = body.get("new_api_base_url", "http://192.168.100.170:3000/v1")
        new_api_key = body.get("new_api_key", "")
        
        # Prevent overwriting real keys when masked values are returned
        if gemini_api_key == "********" or (gemini_api_key and "..." in gemini_api_key):
            gemini_api_key = settings_obj.gemini_api_key
        if new_api_key == "********" or (new_api_key and "..." in new_api_key):
            new_api_key = settings_obj.new_api_key
            
        try:
            settings_obj.api_type = api_type
            settings_obj.gemini_api_key = gemini_api_key
            settings_obj.new_api_base_url = new_api_base_url
            settings_obj.new_api_key = new_api_key
            settings_obj.save()
        except Exception as e:
            return JsonResponse({"error": f"Failed to save settings: {str(e)}"}, status=500)
            
        return JsonResponse({"status": "success"})


# Serve built frontend index.html
def index_view(request):
    try:
        index_path = os.path.join(settings.BASE_DIR, 'dist', 'index.html')
        with open(index_path, 'r', encoding='utf-8') as f:
            return HttpResponse(f.read(), content_type='text/html')
    except IOError:
        return HttpResponse(
            "Frontend build not found. Please run `npm run build` or `npx vite build` to compile the frontend.",
            status=500
        )
