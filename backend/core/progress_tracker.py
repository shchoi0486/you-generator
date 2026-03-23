import asyncio
import json
from typing import Dict, List, Any

class ProgressTracker:
    def __init__(self):
        self.queues: List[asyncio.Queue] = []

    def subscribe(self):
        queue = asyncio.Queue()
        self.queues.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self.queues:
            self.queues.remove(queue)

    async def update(self, step: str, status: str, progress: int, message: str, data: Any = None):
        payload = {
            "step": step,
            "status": status,
            "progress": progress,
            "message": message,
            "data": data
        }
        event_data = f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        for queue in self.queues:
            await queue.put(event_data)

progress_tracker = ProgressTracker()
