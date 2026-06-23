from django.contrib import admin
from django.urls import path, re_path
from django.conf import settings
from django.views.static import serve
from .views import health_view, recite_view, history_view, index_view, settings_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health', health_view, name='health'),
    path('api/recite', recite_view, name='recite'),
    path('api/history', history_view, name='history'),
    path('api/settings', settings_view, name='settings'),
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': settings.STATICFILES_DIRS[0]}),
    re_path(r'^.*$', index_view, name='index'),
]
