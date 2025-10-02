import traceback
import asyncio
from typing import Optional, List, Any, Dict, Tuple
from pydantic import BaseModel
from openai.types import Image
from .image_base_provider import ImageProviderBase
from ..utils.image_utils import get_image_info_and_save, generate_image_id
from services.config_service import config_service
import base64
import json
from utils.http_client import get_http_client


class GoogleVertexImageProvider(ImageProviderBase):
    """Google Vertex AI image generation provider implementation"""

    async def generate(
        self,
        prompt: str,
        model: str,
        aspect_ratio: str = "1:1",
        input_images: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs: Any
    ) -> Tuple[str, int, int, str]:
        """
        Generate image using Google Vertex AI

        Args:
            prompt: Image generation prompt
            model: Model name to use for generation
            aspect_ratio: Image aspect ratio
            input_images: Optional input images for reference or editing
            metadata: Optional metadata to be saved in PNG info
            **kwargs: Additional provider-specific parameters

        Returns:
            Tuple[str, int, int, str]: (mime_type, width, height, filename)
        """
        try:
            # Get Google Vertex configuration
            config = config_service.app_config.get('googlevertex', {})
            api_key = str(config.get('api_key', '')).strip()
            url = str(config.get('url', 'https://generativelanguage.googleapis.com')).rstrip('/')

            if not api_key:
                raise ValueError("Google Vertex API key is not configured")

            # Map aspect ratio to dimensions
            aspect_ratio_map = {
                "1:1": {"width": 1024, "height": 1024},
                "16:9": {"width": 1280, "height": 720},
                "4:3": {"width": 1024, "height": 768},
                "3:4": {"width": 768, "height": 1024},
                "9:16": {"width": 720, "height": 1280}
            }

            dimensions = aspect_ratio_map.get(aspect_ratio, aspect_ratio_map["1:1"])
            width = dimensions["width"]
            height = dimensions["height"]

            # Build API request
            if model == "gemini-2.5-flash-image-preview":
                # For Gemini image preview model
                api_endpoint = f"{url}/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key={api_key}"
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": prompt
                                }
                            ]
                        }
                    ],
                    "generationConfig": {
                        "responseMimeType": "image/png",
                        "responseSchema": {
                            "type": "object",
                            "properties": {
                                "image": {
                                    "type": "string",
                                    "format": "binary"
                                }
                            },
                            "required": ["image"]
                        },
                        "aspectRatio": {
                            "width": width,
                            "height": height
                        },
                        "maxOutputTokens": 2048
                    }
                }
            else:
                # Default image generation for other models
                api_endpoint = f"{url}/v1beta/images:generate?key={api_key}"
                payload = {
                    "prompt": prompt,
                    "model": model,
                    "size": f"{width}x{height}",
                    "n": 1
                }

            # Send request to Google Vertex API
            async with get_http_client().create_aiohttp_client_session(provider_key="googlevertex") as session:
                async with session.post(api_endpoint, json=payload) as response:
                    if response.status != 200:
                        error_message = await response.text()
                        raise ValueError(f"Google Vertex API request failed with status {response.status}: {error_message}")

                    # Process response based on model type
                    if model == "gemini-2.5-flash-image-preview":
                        # Handle Gemini response
                        response_bytes = await response.read()
                        # Assume response is directly image data
                        mime_type = "image/png"
                        # Save image and get filename
                        filename = await get_image_info_and_save(
                            response_bytes,
                            mime_type,
                            prompt,
                            model,
                            metadata=metadata
                        )
                        return (mime_type, width, height, filename)
                    else:
                        # Handle standard image generation response
                        json_data = await response.json()
                        if "data" in json_data and len(json_data["data"]) > 0:
                            image_data = json_data["data"][0]
                            if "b64_json" in image_data:
                                # Handle base64 encoded image
                                image_bytes = base64.b64decode(image_data["b64_json"])
                                mime_type = "image/png"
                                # Save image and get filename
                                filename = await get_image_info_and_save(
                                    image_bytes,
                                    mime_type,
                                    prompt,
                                    model,
                                    metadata=metadata
                                )
                                return (mime_type, width, height, filename)
                            elif "url" in image_data:
                                # Handle URL response
                                # Note: This is a simplified example, you might need to download the image
                                image_url = image_data["url"]
                                # For URL response, we need to download the image
                                async with session.get(image_url) as image_response:
                                    if image_response.status != 200:
                                        raise ValueError(f"Failed to download image from URL: {image_url}")
                                    image_bytes = await image_response.read()
                                    mime_type = image_response.content_type or "image/png"
                                    # Save image and get filename
                                    filename = await get_image_info_and_save(
                                        image_bytes,
                                        mime_type,
                                        prompt,
                                        model,
                                        metadata=metadata
                                    )
                                    return (mime_type, width, height, filename)
                        raise ValueError("Invalid response format from Google Vertex API")
        except Exception as e:
            traceback.print_exc()
            raise ValueError(f"Google Vertex image generation failed: {str(e)}")