import pytest
from acm import schema


def test_valid_schema():
    data = {"Section": {"item": "task", "done": True}}
    schema.validate_schema(data)


def test_missing_item():
    bad = {"Section": {"done": True}}
    with pytest.raises(schema.SchemaError):
        schema.validate_schema(bad)


def test_percent_out_of_range():
    bad = {"Section": {"item": "task", "percent": 120}}
    with pytest.raises(schema.SchemaError):
        schema.validate_schema(bad)
