from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Optional

import requests

IMAGES_DIR = Path(__file__).parent.parent / "static" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def download_image(url: str, post_id: str) -> Optional[str]:
    """
    Download an image from Instagram URL and save it locally.
    Returns the local filename if successful, None otherwise.
    """
    if not url:
        return None

    try:
        # Create a unique filename based on the URL hash and post ID
        url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
        filename = f"{post_id}_{url_hash}.jpg"
        filepath = IMAGES_DIR / filename

        # If file already exists, return the filename
        if filepath.exists():
            return filename

        # Download the image with proper headers to avoid blocking
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }

        response = requests.get(url, headers=headers, timeout=30, stream=True)
        response.raise_for_status()

        # Save the image
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        return filename

    except Exception as e:
        print(f"Failed to download image from {url}: {e}")
        return None


def get_image_url(filename: str) -> str:
    """Get the local URL for an image filename"""
    if not filename:
        return ""
    return f"/static/images/{filename}"