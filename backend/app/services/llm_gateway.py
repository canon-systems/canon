"""
LLM Gateway Service - Handles all AI/LLM API calls
"""
import httpx
from typing import List, Dict, Optional, AsyncIterator
from app.config import settings

class LLMGateway:
    def __init__(self):
        self.gateway_url = settings.VERCEL_AI_GATEWAY_URL
        self.api_key = settings.VERCEL_AI_GATEWAY_API_KEY
        self.default_temperature = 0.3
    
    async def call(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: Optional[float] = None
    ) -> str:
        """
        Call the LLM gateway with messages.
        Returns the assistant's response text.
        """
        if not self.gateway_url or not self.api_key:
            raise ValueError("Gateway env vars missing")
        
        if not model:
            raise ValueError("Model is required")
        
        model_to_use = model
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
    
    async def stream(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: Optional[float] = None
    ) -> AsyncIterator[str]:
        """
        Stream the LLM gateway response.
        Yields chunks of text as they become available.
        """
        if not self.gateway_url or not self.api_key:
            raise ValueError("Gateway env vars missing")
        
        if not model:
            raise ValueError("Model is required")
        
        model_to_use = model
        temperature_to_use = temperature if temperature is not None else self.default_temperature
        
        # Clean up gateway URL (remove trailing slashes)
        url = self.gateway_url.rstrip('/') + '/chat/completions'
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                'POST',
                url,
                headers={
                    'content-type': 'application/json',
                    'authorization': f'Bearer {self.api_key}',
                    'x-vercel-ai-key': self.api_key
                },
                json={
                    'model': model_to_use,
                    'temperature': temperature_to_use,
                    'messages': messages,
                    'stream': True
                },
                timeout=120.0
            ) as response:
                if not response.is_success:
                    error_data = await response.aread()
                    try:
                        import json
                        error_json = json.loads(error_data.decode())
                        error_msg = error_json.get('error', {}).get('message') or error_json.get('message') or f'LLM HTTP {response.status_code}'
                    except:
                        error_msg = f'LLM HTTP {response.status_code}'
                    raise Exception(error_msg)
                
                chunk_count = 0
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    
                    # Handle SSE format: data: {...}
                    if line.startswith('data: '):
                        line = line[6:]  # Remove 'data: ' prefix
                    
                    if line.strip() == '[DONE]' or line.strip() == 'data: [DONE]':
                        print(f"LLM Gateway: Received [DONE] signal after {chunk_count} chunks")
                        break
                    
                    try:
                        import json
                        chunk_data = json.loads(line)
                        
                        # Handle different response formats
                        # OpenAI format: choices[0].delta.content
                        # Some gateways might use different structure
                        content = ''
                        if 'choices' in chunk_data:
                            delta = chunk_data.get('choices', [{}])[0].get('delta', {})
                            content = delta.get('content', '')
                        elif 'content' in chunk_data:
                            content = chunk_data.get('content', '')
                        
                        if content:
                            chunk_count += 1
                            yield content
                    except json.JSONDecodeError as e:
                        # Log but continue - might be incomplete JSON
                        print(f"LLM Gateway: JSON decode error: {e}, line: {line[:100]}")
                        continue
                    except Exception as e:
                        # Log unexpected errors but continue
                        print(f"LLM Gateway: Unexpected error: {e}")
                        continue
                
                print(f"LLM Gateway: Stream completed. Total chunks: {chunk_count}")

