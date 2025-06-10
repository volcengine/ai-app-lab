import base64
import struct
import random
import xml.etree.ElementTree as ET
import zlib
import gzip
from typing import List, Tuple, Dict, Any, Optional, cast # Added Dict, Any, cast

def decode_tilemap_base64(base64_data: str, compression: Optional[str] = None) -> List[int]:
    """
    解码Tilemap的Base64数据为图块ID数组。
    支持可选的解压缩 (zlib, gzip)。
    """
    decoded_data = base64.b64decode(base64_data)
    
    decompressed_data: bytes
    if compression == 'zlib':
        decompressed_data = zlib.decompress(decoded_data)
    elif compression == 'gzip':
        decompressed_data = gzip.decompress(decoded_data)
    elif compression is None or compression == '': # Tiled有时会用空字符串表示无压缩
        decompressed_data = decoded_data
    else:
        raise ValueError(f"不支持的解压缩格式: {compression}")
        
    # TMX GID是32位无符号整数，小端字节序
    # '<' 表示小端序, 'I' 表示32位无符号整数
    num_integers = len(decompressed_data) // 4
    if len(decompressed_data) % 4 != 0:
        print(f"警告: 解压缩后的数据长度 ({len(decompressed_data)}) 不是4的倍数。可能存在数据损坏或格式问题。")

    tile_ids = list(struct.unpack(f'<{num_integers}I', decompressed_data[:num_integers*4]))
    return tile_ids

def encode_tilemap_base64(tile_ids: List[int], compression: Optional[str] = None) -> str:
    """
    将图块ID数组编码为Base64数据。
    支持可选的压缩 (zlib, gzip)。
    """
    byte_data = struct.pack(f'<{len(tile_ids)}I', *tile_ids)
    
    compressed_data: bytes
    if compression == 'zlib':
        compressed_data = zlib.compress(byte_data)
    elif compression == 'gzip':
        compressed_data = gzip.compress(byte_data)
    elif compression is None or compression == '':
        compressed_data = byte_data
    else:
        raise ValueError(f"不支持的压缩格式: {compression}")
        
    encoded_data = base64.b64encode(compressed_data).decode('utf-8')
    return encoded_data


# def random_add_material(material_id: int, width: int = 25, height: int = 20) -> str: # Changed material_id type to int
#     """随机添加材料到图块ID数组，并返回Base64编码的字符串（无压缩）"""
#     tile_ids = [0] * (width * height)
#     if width * height > 0:
#         random_index = random.randint(0, width * height - 1)
#         tile_ids[random_index] = material_id
#     # 把tile_ids编码为base64数据 (默认无压缩)
#     base64_data = encode_tilemap_base64(tile_ids, compression=None)
#     return base64_data


# def precise_add_material(material_ids: List[int], coordinates: List[Tuple[int, int]], width: int = 25, height: int = 20) -> str:
#     """精确添加材料到图块ID数组，并返回Base64编码的字符串（无压缩）"""
#     tile_ids_2d = [[0] * width for _ in range(height)]
#     for m_id, (x, y) in zip(material_ids, coordinates): # Assuming (x,y) from Tiled means (col, row)
#         # TMX通常 (0,0) 是左上角，x是列，y是行。数组索引是 [row][col]
#         if 0 <= y < height and 0 <= x < width:
#             tile_ids_2d[y][x] = m_id
#         else:
#             print(f"警告: 坐标 (x={x}, y={y}) 超出范围 (width={width}, height={height})，跳过材料 ID {m_id}")
            
#     tile_ids_flattern = [item for sublist in tile_ids_2d for item in sublist]
#     # 把tile_ids编码为base64数据 (默认无压缩)
#     base64_data = encode_tilemap_base64(tile_ids_flattern, compression=None) # Corrected to use tile_ids_flattern
#     return base64_data