package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAllowTrainingMissingKeyStaysOff(t *testing.T) {
	t.Setenv("MUDITA_ALLOW_TRAINING", "")
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	if err := os.WriteFile(path, []byte(`{"host":"127.0.0.1","port":8080}`), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AllowTraining {
		t.Fatal("missing allow_training turned training on")
	}

	t.Setenv("MUDITA_ALLOW_TRAINING", "1")
	cfg, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.AllowTraining {
		t.Fatal("MUDITA_ALLOW_TRAINING=1 did not enable training")
	}

	if err := os.WriteFile(path, []byte(`{"allow_training":true}`), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MUDITA_ALLOW_TRAINING", "")
	cfg, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.AllowTraining {
		t.Fatal("allow_training true was ignored")
	}
	t.Setenv("MUDITA_ALLOW_TRAINING", "0")
	cfg, err = Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AllowTraining {
		t.Fatal("MUDITA_ALLOW_TRAINING=0 left training on")
	}
}
