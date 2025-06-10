from .function import (
    add_material_basic,
    choose_basic_map,
    add_npc,
    make_plan,
    attempt_completion,
)

func_map = {
    "add_material_basic": add_material_basic,
    "choose_basic_map": choose_basic_map,
    "add_npc": add_npc,
    "make_plan": make_plan,
    "attempt_completion": attempt_completion
}

__all__ = [
    "func_map",
    "make_plan",
    "attempt_completion",
    "add_material_basic",
    "choose_basic_map",
    "add_npc"
]