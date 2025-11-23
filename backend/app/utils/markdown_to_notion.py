"""
Convert Markdown/HTML to Notion Blocks
"""
from typing import List, Dict, Any, Optional
from html.parser import HTMLParser

def markdown_to_notion_blocks(html: str) -> List[Dict[str, Any]]:
    """Convert HTML to Notion blocks format"""
    parser = NotionBlockParser()
    parser.feed(html)
    return parser.blocks

class NotionBlockParser(HTMLParser):
    """HTML parser that converts to Notion blocks"""
    
    def __init__(self):
        super().__init__()
        self.blocks: List[Dict[str, Any]] = []
        self.current_block: Optional[Dict[str, Any]] = None
        self.stack: List[str] = []
    
    def handle_starttag(self, tag: str, attrs: Dict[str, Any]):
        """Handle opening HTML tags"""
        if tag == 'h1':
            self._finish_current_block()
            self.current_block = {'type': 'heading_1', 'heading_1': {'rich_text': []}}
        elif tag == 'h2':
            self._finish_current_block()
            self.current_block = {'type': 'heading_2', 'heading_2': {'rich_text': []}}
        elif tag == 'h3':
            self._finish_current_block()
            self.current_block = {'type': 'heading_3', 'heading_3': {'rich_text': []}}
        elif tag == 'p':
            self._finish_current_block()
            self.current_block = {'type': 'paragraph', 'paragraph': {'rich_text': []}}
        elif tag == 'ul':
            self._finish_current_block()
        elif tag == 'ol':
            self._finish_current_block()
        elif tag == 'li':
            self._finish_current_block()
            list_type = 'bulleted_list_item' if self.stack and self.stack[-1] == 'ul' else 'numbered_list_item'
            self.current_block = {'type': list_type, list_type: {'rich_text': []}}
        elif tag == 'code':
            self.stack.append('code')
        elif tag == 'strong' or tag == 'b':
            self.stack.append('bold')
        elif tag == 'em' or tag == 'i':
            self.stack.append('italic')
        elif tag == 'a':
            href = dict(attrs).get('href', '')
            self.stack.append(('link', href))
        elif tag == 'pre':
            self._finish_current_block()
            self.current_block = {'type': 'code', 'code': {'rich_text': [], 'language': 'plain text'}}
            self.stack.append('pre')
        elif tag == 'blockquote':
            self._finish_current_block()
            self.current_block = {'type': 'quote', 'quote': {'rich_text': []}}
        elif tag == 'hr':
            self._finish_current_block()
            self.blocks.append({'type': 'divider', 'divider': {}})
    
    def handle_endtag(self, tag: str):
        """Handle closing HTML tags"""
        if tag in ['h1', 'h2', 'h3', 'p', 'li', 'blockquote']:
            self._finish_current_block()
        elif tag == 'code' and 'code' in self.stack:
            self.stack.remove('code')
        elif tag == 'strong' or tag == 'b':
            if 'bold' in self.stack:
                self.stack.remove('bold')
        elif tag == 'em' or tag == 'i':
            if 'italic' in self.stack:
                self.stack.remove('italic')
        elif tag == 'a':
            self.stack = [s for s in self.stack if not isinstance(s, tuple) or s[0] != 'link']
        elif tag == 'pre':
            if 'pre' in self.stack:
                self.stack.remove('pre')
            self._finish_current_block()
    
    def handle_data(self, data: str):
        """Handle text content"""
        if not data.strip():
            return
        
        # Get current block's rich_text array
        rich_text = None
        if self.current_block:
            block_type = self.current_block.get('type')
            if block_type == 'heading_1':
                rich_text = self.current_block['heading_1']['rich_text']
            elif block_type == 'heading_2':
                rich_text = self.current_block['heading_2']['rich_text']
            elif block_type == 'heading_3':
                rich_text = self.current_block['heading_3']['rich_text']
            elif block_type == 'paragraph':
                rich_text = self.current_block['paragraph']['rich_text']
            elif block_type == 'bulleted_list_item':
                rich_text = self.current_block['bulleted_list_item']['rich_text']
            elif block_type == 'numbered_list_item':
                rich_text = self.current_block['numbered_list_item']['rich_text']
            elif block_type == 'quote':
                rich_text = self.current_block['quote']['rich_text']
            elif block_type == 'code':
                rich_text = self.current_block['code']['rich_text']
        
        if rich_text is not None:
            # Build annotations
            annotations = {}
            link_url = None
            
            for item in self.stack:
                if item == 'bold':
                    annotations['bold'] = True
                elif item == 'italic':
                    annotations['italic'] = True
                elif item == 'code':
                    annotations['code'] = True
                elif isinstance(item, tuple) and item[0] == 'link':
                    link_url = item[1]
            
            text_item = {
                'type': 'text',
                'text': {'content': data}
            }
            
            if annotations:
                text_item['annotations'] = annotations
            
            if link_url:
                text_item['text']['link'] = {'url': link_url}
            
            rich_text.append(text_item)
    
    def _finish_current_block(self):
        """Finish current block and add to blocks list"""
        if self.current_block:
            self.blocks.append(self.current_block)
            self.current_block = None
    
    def close(self):
        """Finish parsing"""
        self._finish_current_block()
        super().close()

