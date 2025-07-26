from acm.journal import load_guidelines, generate_template


def test_load_guidelines():
    guidelines = load_guidelines()
    assert len(guidelines) > 0


def test_generate_template():
    checklist = generate_template("Science (AAAS)")
    assert checklist.tasks
    assert any("Title limit" in t.item for t in checklist.tasks)
