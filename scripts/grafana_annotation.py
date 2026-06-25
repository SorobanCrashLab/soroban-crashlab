import os
import json
import requests
from datetime import datetime, timezone

GRAFANA_URL = os.getenv('GRAFANA_URL')
API_KEY = os.getenv('GRAFANA_API_KEY')

if not GRAFANA_URL or not API_KEY:
    raise EnvironmentError('GRAFANA_URL and GRAFANA_API_KEY must be set in environment variables')


def create_annotation(panel_id: int, start_time: datetime, end_time: datetime = None, text: str = '', tags: list = None):
    """Create an annotation on a Grafana dashboard.

    Args:
        panel_id (int): ID of the Grafana dashboard panel.
        start_time (datetime): Start time of the annotation (UTC).
        end_time (datetime, optional): End time of the annotation. If omitted, the annotation is a point in time.
        text (str, optional): Description text for the annotation.
        tags (list, optional): List of tags (strings) for the annotation.
    """
    url = f"{GRAFANA_URL}/api/annotations"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_KEY}'
    }
    payload = {
        "panelId": panel_id,
        "time": int(start_time.replace(tzinfo=timezone.utc).timestamp() * 1000),
        "text": text,
        "tags": tags or []
    }
    if end_time:
        payload["timeEnd"] = int(end_time.replace(tzinfo=timezone.utc).timestamp() * 1000)
    response = requests.post(url, headers=headers, data=json.dumps(payload))
    response.raise_for_status()
    return response.json()

# Example usage (uncomment and adjust as needed):
# if __name__ == "__main__":
#     ann = create_annotation(
#         panel_id=1,
#         start_time=datetime.utcnow(),
#         text='Automated annotation from crash lab',
#         tags=['crashlab', 'auto']
#     )
#     print('Created annotation:', ann)
