from acm.colab import setup


def test_setup_returns_path(tmp_path, monkeypatch):
    def dummy_run(*args, **kwargs):
        return 0
    monkeypatch.setattr('subprocess.run', dummy_run)
    monkeypatch.setattr('acm.colab._maybe_mount_drive', lambda: None)
    path = setup(project="DemoPaper", repo_url=None)
    assert path.name == "DemoPaper"

