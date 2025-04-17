import os
import pdb
import json
import time
import requests


ip = "192.168.35.51"
port = 8080
stream = True

url = f"http://{ip}:{port}/api/v1/bots/chat/completions"
data= {
    "model": "doubao-1-5-pro-32k-250115",
    "messages": [
        {
            "role": "user",
            "content": "介绍你自己啊"
        }
    ],
    "stream": stream
}
headers = {'Content-Type': 'application/json'}

start_time = time.time()
response = requests.post(url, headers=headers, json=data)
print('cost time: {:.2f}'.format(time.time() - start_time))
print(response.status_code)

# pdb.set_trace()
if stream:
    # print(response.text)
    buffer = ''
    for chunk in response.iter_content(chunk_size=512):
        if chunk:
            buffer += chunk.decode('utf-8')
            print(chunk)
            while '\n' in buffer:
                line, buffer = buffer.split('\n', 1)
                try:
                    json_data = json.loads(line)
                    content = json_data.get('content', '')
                    for char in content:
                        print(char, end='', flush=True)
                        time.sleep(0.1)
                except json.JSONDecodeError:
                    pass
else:
    print(response.json())

