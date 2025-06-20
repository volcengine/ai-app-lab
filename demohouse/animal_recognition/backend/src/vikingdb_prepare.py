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

from volcengine.viking_db import *
from config import *


def prepare_vikingdb_index(collection_name, index_name):
    vdb_client = VikingDBService(host=DOMAIN, region="cn-beijing", connection_timeout=30, socket_timeout=30)
    vdb_client.set_ak(AK)
    vdb_client.set_sk(SK)
    fields = [
        Field(field_name="upload_time", field_type=FieldType.Int64, default_val=0),
        Field(field_name="image_introduction", field_type=FieldType.String, default_val="default"),
        Field(field_name="image_description", field_type=FieldType.Text),
        Field(field_name="image_tos_path", field_type=FieldType.Image),
        Field(field_name="image_sign", field_type=FieldType.String, default_val="default"),
        Field(field_name="sub_user_id", field_type=FieldType.String, default_val="default"),
        Field(field_name="user_id", field_type=FieldType.Int64, default_val=0)
    ]
    vectorize = [
        VectorizeTuple(
            dense=VectorizeModelConf(
                model_name="doubao-embedding-vision",
                model_version="241215",
                text_field="image_description",
                image_field="image_tos_path",
                dim=3072
            )
        )
    ]

    collection = vdb_client.create_collection(collection_name, fields, vectorize=vectorize)
    print("collection_name: {}, fields: {}".format(collection.collection_name, collection.fields))

    vector_index = VectorIndexParams(distance=DistanceType.IP, index_type=IndexType.FLAT, quant=QuantType.Int8)
    _ = vdb_client.create_index(collection_name, index_name, vector_index, cpu_quota=1)


def main():
    prepare_vikingdb_index(COLLECTION_NAME, INDEX_NAME)


if __name__ == "__main__":
    main()
