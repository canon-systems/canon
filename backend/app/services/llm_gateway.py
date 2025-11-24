"""
LLM Gateway Service - Handles all AI/LLM API calls
"""
import httpx
from typing import List, Dict, Optional
from app.config import settings

class LLMGateway:
    def __init__(self):
        self.gateway_url = settings.VERCEL_AI_GATEWAY_URL
        self.api_key = settings.VERCEL_AI_GATEWAY_API_KEY
        self.default_model = settings.LLM_MODEL
        self.default_temperature = 0.3
    
    async def call(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> str:
        """
        Call the LLM gateway with messages.
        Returns the assistant's response text.
        """
        if not self.gateway_url or not self.api_key:
            raise ValueError("Gateway env vars missing")
        
        model_to_use = model or self.default_model
        temperature_to_use = temperature if temperature is not None else self.default_temperature
        
        # Clean up gateway URL (remove trailing slashes)
        url = self.gateway_url.rstrip('/') + '/chat/completions'
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    'content-type': 'application/json',
                    'authorization': f'Bearer {self.api_key}',
                    'x-vercel-ai-key': self.api_key
                },
                json={
                    'model': model_to_use,
                    'temperature': temperature_to_use,
                    'messages': messages
                },
                timeout=120.0  # 2 minute timeout for long generations
            )
            
            if not response.is_success:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                error_msg = error_data.get('error', {}).get('message') or error_data.get('message') or f'LLM HTTP {response.status_code}'
                raise Exception(error_msg)
            
            data = response.json()
            return str(data.get('choices', [{}])[0].get('message', {}).get('content', ''))

