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

from config import language

# Chinese products
PRODUCTS_ZH = {
    "栀子花车载香薰": {
        "name": "栀子花车载香薰",
        "description": "栀子花车载香薰是一款为汽车提供舒适和放松的香薰产品。它可以帮助用户缓解疲劳、缓解压力，提升驾驶体验。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/栀子花车载香薰.PNG",
    },
    "车载手机超级快充": {
        "name": "车载手机超级快充",
        "description": "车载手机超级快充是一款为汽车提供充电功能的产品。它可以为汽车提供充足的电力，延长电池寿命。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/车载手机超级快充.jpeg",
    },
    "车载收纳盒": {
        "name": "车载收纳盒",
        "description": "车载收纳盒是一款为汽车提供收纳功能的产品。它可以帮助用户整理车辆内的物品，提高工作效率。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/车载收纳盒.PNG",
    },
    "车载手机快充普通隐藏式": {
        "name": "车载手机快充普通隐藏式",
        "description": "车载手机快充普通隐藏式是一款为汽车提供充电功能的产品。它可以为汽车提供充足的电力，延长电池寿命。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/车载手机快充普通隐藏式.jpeg",
    },
    "活性炭车载除味包": {
        "name": "活性炭车载除味包",
        "description": "活性炭车载除味包是一款为汽车提供除味功能的产品。它可以帮助用户去除车内的灰尘、污垢，提高车内空气质量。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/活性炭车载除味包.PNG",
    },
    "可爱风腰靠垫": {
        "name": "可爱风腰靠垫",
        "description": "可爱风腰靠垫是一款为汽车提供安全保障的产品。它可以帮助用户避免车辆碰撞，提高车辆安全性。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/可爱风腰靠垫.JPEG",
    },
    "汽车遮阳挡": {
        "name": "汽车遮阳挡",
        "description": "汽车遮阳挡是一款为汽车提供遮阳功能的产品。它可以帮助用户在雨天、雪天等恶劣天气下，提供充足的遮阳保护。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/汽车遮阳挡.PNG",
    },
    "通用型汽车脚垫": {
        "name": "通用型汽车脚垫",
        "description": "通用型汽车脚垫是一款为汽车提供支撑功能的产品。它可以帮助用户在车辆行驶过程中，提供稳定的支撑。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/通用型汽车脚垫.PNG",
    },
    "小动物靠枕": {
        "name": "小动物靠枕",
        "description": "小动物靠枕是一款为汽车提供安全保障的产品。它可以帮助用户避免车辆碰撞，提高车辆安全性。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/小动物靠枕.PNG",
    },
    "折叠旋转电动无线充车载支架": {
        "name": "折叠旋转电动无线充车载支架",
        "description": "折叠旋转电动无线充车载支架是一款为汽车提供充电功能的产品。它可以为汽车提供充足的电力，延长电池寿命。",
        "cover_image": "tos://xiangyuxuan-test/custom_support/product/折叠旋转电动无线充车载支架.PNG",
    },
}

# English products
PRODUCTS_EN = {
    "Women's Floral Graphic T-Shirts": {
        "name": "Women's Floral Graphic T-Shirts",
        "description": "Women's Floral Graphic T-Shirts is a soft, breathable, and easy-to-style top featuring a charming wildflower design, perfect for everyday wear and any casual occasion",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Womens_Floral_Graphic_T-Shirts.png",
    },
    "Men's Straight Cut Pants": {
        "name": "Men's Straight Cut Pants",
        "description": "Men's Straight Cut Pants is a comfortable, all-season essential, featuring a timeless fit and easy machine-wash care.",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Mens_Straight_Cut_Pants.png",
    },
    "Long Sleeve V Neck Blouses": {
        "name": "Long Sleeve V Neck Blouses",
        "description": "Long Sleeve V Neck Blouses is a breathable and stylish blouse, perfect for versatile, year-round wear",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Long_Sleeve_V_Neck_Blouses.png",
    },
    "Women's Strap Flounce Long Dress": {
        "name": "Women's Strap Flounce Long Dress",
        "description": "Women's Strap Flounce Long Dress is a flowing, boho-inspired piece that blends effortless beauty with a flattering design for any occasion",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Womens_Strap_Flounce_Long_Dress.png",
    },
    "Adult Unisex T-Shirt": {
        "name": "Adult Unisex T-Shirt",
        "description": "Adult Unisex T-Shirt is a durable, heavyweight essential offering all-day comfort and timeless style for everyday wear or work",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Adult_Unisex_T-Shirt.png",
    },
    "Unisex Vintage Baseball Cap": {
        "name": "Unisex Vintage Baseball Cap",
        "description": "Unisex Vintage Baseball Cap is a relaxed, vintage-washed essential with an unstructured crown, available in 10 colors to match any style effortlessly",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Unisex_Vintage_Baseball_Cap.png",
    },
    "Pink Large Shoulder Tote Bag": {
        "name": "Pink Large Shoulder Tote Bag",
        "description": "Pink Large Shoulder Tote Bag is a stylish and spacious everyday essential, crafted from soft, durable material with a charming bow accent for a perfect blend of fashion and function",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Pink_Large_Shoulder_Tote_Bag.png",
    },
    "Ballet Flat": {
        "name": "Ballet Flat",
        "description": "Ballet Flat is an elegant shoe featuring a sweet bow detail and a comfortable low heel for effortless style and comfort",
        "cover_image": "tos://bp-custom-support-product/custom_support/product/Ballet_Flat.png",
    },
}


# Get products based on language configuration
def get_products():
    return PRODUCTS_ZH if language == "zh" else PRODUCTS_EN


# For backward compatibility
PRODUCTS = get_products()
