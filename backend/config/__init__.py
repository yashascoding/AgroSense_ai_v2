from __future__ import annotations

from config.settings import Config

__all__ = ["Config"]


def __getattr__(name: str):
    """Delegate unknown attributes to Config (e.g. config.CLOUDINARY_CLOUD_NAME)."""
    return getattr(Config, name)
