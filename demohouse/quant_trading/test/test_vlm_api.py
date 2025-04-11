import os
import time

import base64
import requests


ip = "192.168.35.51"
port = 8080
stream = True

with open("tgb-homepage.png", "rb") as image_file:
    image_data = image_file.read()
    base64_image = base64.b64encode(image_data).decode("utf-8")


url = f"http://{ip}:{port}/api/v1/bots/chat/completions"
data= {
    "model": "doubao-1-5-pro-32k-250115",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": '描述一下这张图片',
                },
                {
                    "type": 'image_url',
                    "image_url": {
                        "url": f"data:image/png;base64,{base64_image}",
                    },
                },
            ]
        }
    ],
    "stream": stream
}
headers = {'Content-Type': 'application/json'}

start_time = time.time()
response = requests.post(url, headers=headers, json=data)
print('cost time: {:.2f}'.format(time.time() - start_time))
print(response.status_code)

if stream:
    print(response.text)
else:
    print(response.json())
