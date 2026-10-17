"""Static checks only. Does NOT replace `docker compose config --quiet` or Linux tests.
Requires PyYAML in an operator/test environment, never in application containers.
Does not read actual env/secrets files or resolve Compose interpolation.
"""
from pathlib import Path
import yaml

root = Path(__file__).resolve().parent
config = yaml.safe_load((root / "compose.yaml").read_text(encoding="utf-8"))
services = config["services"]
assert set(services) == {"proxy", "frontend", "backend", "pdf-worker"}
for service in services.values():
    assert service["read_only"] is True
    assert service["cap_drop"] == ["ALL"]
    assert "no-new-privileges:true" in service["security_opt"]
    assert service["mem_limit"] and service["cpus"] and service["pids_limit"]
    assert service["restart"] == "unless-stopped"
    assert service["logging"]["driver"] == "local"
    assert "privileged" not in service and "pid" not in service
    assert all("docker.sock" not in str(v) for v in service.get("volumes", []))
worker = services["pdf-worker"]
assert worker["network_mode"] == "none"
assert "networks" not in worker and "ports" not in worker
assert "env_file" not in worker and "secrets" not in worker
assert worker["volumes"] == ["pdf_socket:/run/pdf"]
assert services["backend"]["volumes"] == ["pdf_socket:/run/pdf:ro"]
for name in ("backend", "frontend"):
    assert "ports" not in services[name]
assert services["proxy"]["ports"] == ["80:80", "443:443"]
assert config["networks"]["app"]["internal"] is True
args = services["frontend"]["build"]["args"]
assert set(args) == {"VITE_API_URL", "VITE_SOCKET_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_MAPBOX_ACCESS_TOKEN"}
env = services["backend"]["environment"]
assert env["TRACKING_ENABLED"] == "${TRACKING_ENABLED:-false}"
assert env["POD_PDF_ENABLED"] == "${POD_PDF_ENABLED:-false}"
assert env["PDF_WORKER_PROCESS"] == "false"
assert env["WEB_CONCURRENCY"] == "1"
assert env["TRUST_PROXY_HOPS"] == "1"
for file in ("Dockerfile.backend", "Dockerfile.frontend", "Dockerfile.proxy"):
    assert "USER 1000:1000" in (root / file).read_text(encoding="utf-8")
ignore = (root.parent / ".dockerignore").read_text(encoding="utf-8")
assert "**/.env" in ignore and "deployment/secrets" in ignore
print("YAML syntax and static deployment policy checks passed; Docker engine validation NOT performed.")
