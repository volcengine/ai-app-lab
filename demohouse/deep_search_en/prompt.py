# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from jinja2 import Template


DEFAULT_SUMMARY_PROMPT = Template(
    """# Chat History  
{{chat_history}}  

# Online References  
{{reference}}  

# Current Environment Information  
{{meta_info}}  

---

# Task  
1. **Prioritize information from the 「Online References」** when crafting your response.  
2. Use **clear, structured language** (e.g., numbered lists, sections) to ensure ease of understanding.  
3. **Cite reference numbers** (e.g., [3][5]) in the body of your response if you use information from the 「Online References」.  
4. At the end of your response, **list all referenced materials** in the format:  
   `[Ref ID] Resource Name`  
   Example:  
   [1] Volcano Engine  
   [3] Volcano Ark Large Model Service Platform  

---

# Task Execution  
Follow the above requirements to answer the **「User Question」**:  
**User Question:**  
{{question}}  

---

# Your Response: 
"""
)

DEFAULT_PLANNING_PROMPT = Template(
    """
You are an internet information search expert. You need to gather relevant information through online searches based on the user's question and use this information to answer the user's query.

# User Question:  
{{question}}  

# Current Known Materials  
{{reference}}  

# Current Environment Information  
{{meta_info}}  

---

# Task  
1. Determine whether the **「Current Known Materials」** are sufficient to answer the user's question.  
2. If the **「Current Known Materials」** are sufficient, return **"No need to search"** without any additional content.  
3. If the materials are insufficient, **generate search keywords** that meet the following criteria:  
   - Each keyword must be **specific and self-contained** (include full subject-object relationships).  
   - Avoid ambiguity, pronouns, or cross-references between keywords.  
   - Generate **1 to {{max_search_words}} keywords**, prioritizing quality over quantity.  
   - DO NOT generate any additional content expect the keywords
4. Format multiple keywords with semicolons (`;`) as separators.  

# Your Response: 
"""
)
