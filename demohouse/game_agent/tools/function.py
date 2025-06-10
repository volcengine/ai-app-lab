import os
from typing import Literal
from .utils_1 import *
from .utils_2 import *
from .ts_template import *

import json
import toml
import copy
import random
import string

npc_info = {
    "villager": [f"Female {i:02d}-{j}" for i in range(1, 23) for j in range(1, 5)] + [f"Male {i:02d}-{j}" for i in range(1, 19) for j in range(1, 5)],
    "enemy": [f"Enemy {i:02d}-1" for i in range(1, 15)] + [f"Enemy {i}" for i in range(18, 23)],
    "hero": ["Soldier 01-1", "Soldier 02-1", "Soldier 03-1", "Soldier 04-1", "Soldier 05-1", "Soldier 06-1", "Soldier 07-1"]
}


assets_info = {
    # 这些元素暂时只有一个瓦片
    "sword": {
        "source": "weapon/sword.tsx",
        "firstgid": "4505",
        "tilecount": 1
    },
    "axe": {
        "source": "weapon/axe.tsx",
        "firstgid": "4506",
        "tilecount": 1
    },
    "shield": {
        "source": "weapon/shield.tsx",
        "firstgid": "4507",
        "tilecount": 1
    },
    "food": {
        "source": "weapon/food.tsx",
        "firstgid": "4508",
        "tilecount": 1
    },
    "portion": {
        "source": "weapon/portion.tsx",
        "firstgid": "4509",
        "tilecount": 1
    },
    "BaseChip_pipo": {
        "source": "[Base]BaseChip_pipo.tsx",
        "firstgid": "1",
        "tilecount": 1000
    },
    "Water_pipo": {
        "source": "[A]Water_pipo.tsx",
        "firstgid": "1001",
        "tilecount": 3072
    },
    "Dirt_pipo": {
        "source": "[A]Dirt_pipo.tsx",
        "firstgid": "4073",
        "tilecount": 336
    },
    "Flower_pipo": {
        "source": "[A]Flower_pipo.tsx",
        "firstgid": "7437",
        "tilecount": 336
    }
}

map_info = {
    "grass_1": {
        "path": "main/worlds/grass_maps/grass_map_v1.tmx",
        "width": 25 * 32,
        "height": 20 * 32,
        "description": "草地地图，比较简单，有少量树"
    },
    "grass_2": {
        "path": "main/worlds/grass_maps/grass_map_v2.tmx",
        "width": 20 * 32,
        "height": 20 * 32,
        "description": "草地地图，比较复杂，有大量树与草地"
    },
    "snow_map": {
        "path": "main/worlds/snow_maps/snow_map.tmx",
        "width": 50 * 32,
        "height": 50 * 32,
        "description": "雪地地图，比较复杂"
    },
    "village_map": {
        "path": "main/worlds/village_maps/samplemap.tmx",
        "width": 60 * 32,
        "height": 60 * 32,
        "description": "村庄地图，比较复杂"
    },
    "mountain_map": {
        "path": "main/worlds/mountain_maps/mountain_map.tmx",
        "width": 20 * 48,
        "height": 20 * 48,
        "description": "山地地图，有河流"
    }
}


npc_type_map = {
    "enemy_1": {
        "walk": "enemy_1_walk",
        "attack": "enemy_1_attack",
    },
    "enemy_2": {
        "walk": "enemy_2_walk",
        "attack": "enemy_2_attack",
    },
    "enemy_3": {
        "walk": "enemy_3_walk",
        "attack": "enemy_3_attack",
    },
    "hero_1": {
        "walk": "hero_1_walk",
        "attack": "hero_1_attack",
    },
    "hero_2": {
        "walk": "hero_2_walk",
        "attack": "hero_2_attack",
    },
    "hero_3": {
        "walk": "hero_3_walk",
        "attack": "hero_3_attack",
    },
    "vallager_1": {
        "walk": "Female 01-1",
    },
    "vallager_2": {
        "walk": "Female 02-1",
    },
    "vallager_3": {
        "walk": "Male 01-1",
    },
    "vallager_4": {
        "walk": "Male 02-1",
    }
}

# def add_material_basic(map_id: str, material_name: str, coordinates_x: int = None, coordinates_y: int = None, width: int = 25, height: int = 20) -> str:
#     """精确添加材料到图块ID数组，并返回Base64编码的字符串（无压缩）"""
#     try:
#         if material_name not in assets_info:
#             raise ValueError(f"材料 {material_name} 没有在assets_info中定义。")
        
#         # 解析TMX文件
#         # 根据map_id进行解析
#         TEMP_GAME_DIR_PATH = os.environ['TEMP_GAME_DIR_PATH']
#         xml_path = os.path.join(TEMP_GAME_DIR_PATH, map_info[map_id]["path"])
#         desc = map_info[map_id]["description"]
#         tmx_data = parse_tmx_to_dict(xml_path)
#         width = map_info[map_id]["width"]
#         height = map_info[map_id]["height"]
        
#         if coordinates_x < 0 or coordinates_x >= width or coordinates_y < 0 or coordinates_y >= height:
#             raise ValueError(f"坐标 ({coordinates_x}, {coordinates_y}) 超出地图范围。")
        
#         print(tmx_data)
#         new_tileset = copy.deepcopy( tmx_data['tilesets'])

#         # 找到目前拥有的tilecount以及source
#         total_source = []
#         for tileset in tmx_data['tilesets']:
#             total_source.append(tileset['source'])
#         source = assets_info[material_name]["source"]
#         if source not in total_source:
#             new_tileset.append({
#                 "firstgid": assets_info[material_name]["firstgid"],
#                 "source": source,
#             })
#         tmx_data['tilesets'] = new_tileset
        
#         # 更新layer
#         sub_output_info = ""
#         tile_ids_2d = [[0] * width for _ in range(height)]
#         # TMX通常 (0,0) 是左上角，x是列，y是行。数组索引是 [row][col]
#         tile_ids_2d[coordinates_y][coordinates_x] = int(assets_info[material_name]["firstgid"])
#         sub_output_info += f"- 物品名：{material_name}，坐标：({coordinates_x}, {coordinates_y})\n"
#         # TODO: 后面换成可以切换的形式，现在暂时不用base64，而是换成csv
#         # tile_ids_flattern = [item for sublist in tile_ids_2d for item in sublist]
#         # 把tile_ids编码为base64数据 (默认无压缩)
#         # encode_data = encode_tilemap_base64(tile_ids_flattern, compression=None) # Corrected to use tile_ids_flattern
#         # 创建一个dataframe
#         encode_data = ""
#         for idx, row in enumerate(tile_ids_2d):
#             if idx < height - 1:
#                 encode_data += f"{','.join(map(str, row))},\n"
#             else:
#                 encode_data += f"{','.join(map(str, row))}"
        
#        # 添加到layer中
#         nextlayerid = int(tmx_data['map']['nextlayerid'])
#         tmx_data['layers'].append({
#             "id": str(nextlayerid),
#             "name": f"Tile Layer {nextlayerid}",
#             "width": str(width),
#             "height": str(height),
#             "data": encode_data
#         })
#         # 更新nextlayerid
#         tmx_data['map']['nextlayerid'] = str(nextlayerid + 1)

#         # 把修改后的TMX数据写回文件
#         dict_to_tmx(tmx_data, xml_path)

#         output_info = f"已成功在地图{map_id}（{desc}）中添加以下物品：\n{sub_output_info}"
#         return output_info
#     except Exception as e:
#         return f"发生错误: {e}"



def choose_basic_map(map_id: str):
    desc = map_info[map_id]["description"]
    width = map_info[map_id]["width"]
    height = map_info[map_id]["height"]
    TEMP_GAME_DIR_PATH = os.environ['TEMP_GAME_DIR_PATH']
    rpg_toml_json_path = os.path.join(TEMP_GAME_DIR_PATH, 'rpg.toml.json')
    with open(rpg_toml_json_path, 'r') as f:
        rpg_toml_json = json.load(f)
    rpg_toml_json['start']['map'] = map_id
    # demo先Mock住
    # rpg_toml_json['start']['map'] = 'snow_map_mock'
    rpg_toml_path = os.path.join(TEMP_GAME_DIR_PATH, 'rpg.toml')
    with open(rpg_toml_path, 'w') as f:
        toml.dump(rpg_toml_json, f)
    output_info = f"已成功加载地图（{desc}），地图的width={width}，地图的height={height}"
    # 写入到文件中
    return output_info


def add_npc_basic(map_id: str, npc_type: Literal["villager", "enemy", "hero"], npc_name: Literal["enemy_1", "enemy_2", "hero_1", "hero_2"] = None, x: int = None, y: int = None):
    """添加一个NPC到地图中"""
    try:
        # 解析TMX文件
        # 根据map_id进行解析
        TEMP_GAME_DIR_PATH = os.environ['TEMP_GAME_DIR_PATH']
        xml_path = os.path.join(TEMP_GAME_DIR_PATH, map_info[map_id]["path"])
        desc = map_info[map_id]["description"]
        width = map_info[map_id]["width"]
        height = map_info[map_id]["height"]
        if x is None:
            x = random.uniform(32 * 6, (width - 1) * 32)
        if y is None:
            y = random.uniform(32 * 6, (height - 1) * 32)
        if npc_type == "villager":
            npc_name = random.choice(npc_info["villager"])
        elif npc_type == "enemy":
            if npc_name is None or npc_name not in ["enemy_1", "enemy_2"]:
                raise ValueError(f"NPC类型为{npc_type}时，npc_name必须为enemy_1或enemy_2")
        elif npc_type == "hero":
            if npc_name is None or npc_name not in ["hero_1", "hero_2"]:
                raise ValueError(f"NPC类型为{npc_type}时，npc_name必须为hero_1或hero_2")
        
        # 随机生成数字+字母混合组成的十位字符串
        if npc_type == "villager":
            event_name = "env_" + ''.join(random.choices(string.ascii_letters + string.digits, k=10))
            ts_script = npc_template.render(npc_img=npc_name, event_name=event_name, event_class=event_name)
            file_path = os.path.join(TEMP_GAME_DIR_PATH, 'main', 'events', f'villager.ts')
            with open(file_path, 'a') as f:
                f.write(ts_script)
        else:
            event_name = npc_name
        tmx_data = parse_tmx_to_dict(xml_path)
        print(tmx_data)
        objectgroup = tmx_data.get('objectgroups', None)
        if objectgroup is None:
            objectgroup = [{
                "id": "10",
                "name": "Object Group 1",
                "offsetx": "0",
                "offsety": "0",
            }]
        objects = objectgroup[0].get('objects', [])
        next_object_id = tmx_data['map']['nextobjectid']
        objects.append({
            "id": next_object_id,
            "name": event_name,
            "x": str(x),
            "y": str(y),
            "type": "point"
        })
        objectgroup[0]['objects'] = objects
        tmx_data['objectgroups'] = objectgroup
        # 更新nextlayerid
        next_object_id = int(next_object_id) + 1
        tmx_data['map']['nextobjectid'] = str(next_object_id)
        print(tmx_data)
        # 把修改后的TMX数据写回文件
        dict_to_tmx(tmx_data, xml_path)

        output_info = f"已在地图{map_id}（{desc}）成功添加npc（类型：{npc_type},名称：{npc_name}）"
        return output_info
    except Exception as e:
        return f"Error: {e}"


def add_npc(map_id: str, 
            npc_template: Literal["hero_attack", "hero_no_move", "enemy_attack", "villager"], 
            npc_type: Literal["enemy_1", "enemy_2", "enemy_3", "hero_1", "hero_2", "hero_3", "villager"], 
            npc_name: str,
            npc_speak: str,
            x: int = None, 
            y: int = None):
    """添加一个NPC到地图中"""
    try:
        # 解析TMX文件
        # 根据map_id进行解析
        TEMP_GAME_DIR_PATH = os.environ['TEMP_GAME_DIR_PATH']
        xml_path = os.path.join(TEMP_GAME_DIR_PATH, map_info[map_id]["path"])
        desc = map_info[map_id]["description"]
        width = map_info[map_id]["width"]
        height = map_info[map_id]["height"]
        # 设置坐标
        if x is None:
            x = random.uniform(32 * 6, (width - 1) * 32)
        if y is None:
            y = random.uniform(32 * 6, (height - 1) * 32)

        # 写入ts文件
        # 1. 生成事件名称
        event_name = f"env_{npc_type}" + ''.join(random.choices(string.ascii_letters + string.digits, k=10))
        # 2. 根据模版填槽位
        if npc_template == "hero_attack":
            tpl = hero_attack_template
            args = {
                "event_name": event_name,
                "character_name": npc_name,
                "hero_walk_img": npc_type_map[npc_type]['walk'],
                "hero_attack_img": npc_type_map[npc_type]['attack'],
                "character_speak": npc_speak,
            }
        elif npc_template == "hero_no_move":
            tpl = hero_no_move_template
            args = {
                "event_name": event_name,
                "character_name": npc_name,
                "hero_walk_img": npc_type_map[npc_type]['walk'],
                "character_speak": npc_speak,
            }
        elif npc_template == "villager":
            tpl = villager_template
            args = {
                "event_name": event_name,
                "villager_img": npc_type_map[npc_type]['walk'],
                "character_speak": npc_speak,
            }
        elif npc_template == "enemy_attack":
            tpl = enemy_attack_template
        else:
            raise ValueError(f"npc_templete参数错误，只能为hero_attack、hero_no_move、enemy_attack、villager")
            
        ts_script = tpl.render(**args)
        file_path = os.path.join(TEMP_GAME_DIR_PATH, 'main', 'events', f'{event_name}.ts')
        with open(file_path, 'a') as f:
            f.write(ts_script)

        tmx_data = parse_tmx_to_dict(xml_path)
        print(tmx_data)
        objectgroup = tmx_data.get('objectgroups', None)
        if objectgroup is None:
            objectgroup = [{
                "id": "10",
                "name": "Object Group 1",
                "offsetx": "0",
                "offsety": "0",
            }]
        objects = objectgroup[0].get('objects', [])
        next_object_id = tmx_data['map']['nextobjectid']
        objects.append({
            "id": next_object_id,
            "name": event_name,
            "x": str(x),
            "y": str(y),
            "type": "point"
        })
        objectgroup[0]['objects'] = objects
        tmx_data['objectgroups'] = objectgroup
        # 更新nextlayerid
        next_object_id = int(next_object_id) + 1
        tmx_data['map']['nextobjectid'] = str(next_object_id)
        print(tmx_data)
        # 把修改后的TMX数据写回文件
        dict_to_tmx(tmx_data, xml_path)

        output_info = f"已在地图{map_id}（{desc}）成功添加npc（类型：{npc_type}"
        return output_info
    except Exception as e:
        return f"Error: {e}"


def add_material_basic(map_id: str, material_type: Literal["axe", "sword", "food", "sheild", "portion"], x: int = None, y: int = None):
    """添加一个NPC到地图中"""
    try:
        # 解析TMX文件
        # 根据map_id进行解析
        TEMP_GAME_DIR_PATH = os.environ['TEMP_GAME_DIR_PATH']
        xml_path = os.path.join(TEMP_GAME_DIR_PATH, map_info[map_id]["path"])
        desc = map_info[map_id]["description"]
        width = map_info[map_id]["width"]
        height = map_info[map_id]["height"]
        if x is None:
            x = random.uniform(32 * 6, (width - 1) * 32)
        if y is None:
            y = random.uniform(32 * 6, (height - 1) * 32)
        event_name = f"{material_type}_event"
        tmx_data = parse_tmx_to_dict(xml_path)
        print(tmx_data)
        objectgroup = tmx_data.get('objectgroups', None)
        if objectgroup is None:
            objectgroup = [{
                "id": "10",
                "name": "Object Group 1",
                "offsetx": "0",
                "offsety": "0",
            }]
        objects = objectgroup[0].get('objects', [])
        next_object_id = tmx_data['map']['nextobjectid']
        objects.append({
            "id": next_object_id,
            "name": event_name,
            "x": str(x),
            "y": str(y),
            "type": "point"
        })
        objectgroup[0]['objects'] = objects
        tmx_data['objectgroups'] = objectgroup
        # 更新nextlayerid
        next_object_id = int(next_object_id) + 1
        tmx_data['map']['nextobjectid'] = str(next_object_id)
        print(tmx_data)
        # 把修改后的TMX数据写回文件
        dict_to_tmx(tmx_data, xml_path)

        output_info = f"已在地图{map_id}（{desc}）成功添加材料（类型：{material_type}），添加的坐标为({x}, {y})"
        return output_info
    except Exception as e:
        return f"Error: {e}"


def make_plan(plan_list: List[str]):
    """根据计划列表生成一个计划"""
    output_str = "根据已有的剧情以及玩家和角色的聊天记录，制定了以下的游戏生成计划：\n"
    for i in plan_list:
        output_str += f"- {i}\n"
    output_str += "\n现在请按照上述计划调用相应游戏开发工具进行开发"
    return output_str


def attempt_completion():
    return "已完成制定的所有游戏开发任务"

# 用于测试
# os.environ['TEMP_GAME_DIR_PATH'] = '/Users/bytedance/Desktop/project/game_agent/volc_llm_game_demo/rpg-app'
# print(add_material_basic("snow_map", "sword", 10, 10))