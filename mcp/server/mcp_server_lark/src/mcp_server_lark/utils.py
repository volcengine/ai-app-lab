from typing import List

from lark_oapi.api.bitable.v1 import AppTableRecord


def format_table_rows(rows: List[AppTableRecord]) -> str:
    # get unique field names
    all_fields = set()
    for row in rows:
        all_fields.update(row.fields.keys())
    sorted_fields = sorted(all_fields)

    # table header
    header = ["ID"] + sorted_fields
    header_line = " | ".join(header)

    # table rows
    table_rows = []
    for row in rows:
        row_values = [row.record_id]
        for field in sorted_fields:
            field_values = row.fields.get(field, [])
            value = field_values[0].get("text", "") if field_values else ""
            row_values.append(value)
        table_rows.append(" | ".join(row_values))

    table_str = (
            header_line + "\n" + "-" * len(header_line) + "\n" + "\n".join(table_rows)
    )
    return table_str
