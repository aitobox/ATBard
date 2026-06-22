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
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"Recitation {self.id} - {self.voice} ({self.timestamp})"
