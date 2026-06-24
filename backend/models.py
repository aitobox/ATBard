from django.db import models

class RecitationHistory(models.Model):
    text = models.TextField()
    voice = models.CharField(max_length=50)
    style = models.CharField(max_length=50)
    speed = models.CharField(max_length=50)
    audio_base64 = models.TextField()  # Store the final playable Base64 WAV data
    duration = models.FloatField()
    text_length = models.IntegerField()
    prompt_used = models.TextField()
    elapsed_time_ms = models.IntegerField(default=0)
    prompt_tokens = models.IntegerField(default=0)
    candidates_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    session_id = models.CharField(max_length=100, blank=True, null=True)
    chunk_index = models.IntegerField(default=-1)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Recitation {self.id} - {self.voice} ({self.timestamp})"


class APISettings(models.Model):
    api_type = models.CharField(max_length=20, default='official') # 'official' | 'new_api'
    gemini_api_key = models.CharField(max_length=255, blank=True, default='')
    new_api_base_url = models.CharField(max_length=255, default='http://192.168.100.170:3000/v1')
    new_api_key = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, default='gemini-3.1-flash-tts')

    class Meta:
        verbose_name = "API Settings"

    @classmethod
    def get_settings(cls):
        settings_obj, created = cls.objects.get_or_create(id=1)
        return settings_obj
