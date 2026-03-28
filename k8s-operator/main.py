"""
Bot-Manager — WhatsApp Router operator
========================================
Called by Openclaw-UI to manage WhatsApp number assignments.
Talks to the WhatsApp Router API via router_client.py.
Has optional k8s integration for patching openclaw.json config on each tenant pod.

Architecture:
  Openclaw-UI  →  POST /api/whatsapp/...  →  bot-manager (this)
                                               ├─ router_client.py  →  WhatsApp Router API
                                               └─ k8s CoreV1/AppsV1 →  tenant ConfigMap + rollout

Environment variables (see .env.example):
  OPERATOR_PORT           HTTP port for this service (default 8080)
  OPERATOR_SECRET         Secret the UI sends in X-Operator-Secret header
  WHATSAPP_ROUTER_URL     Base URL of the WhatsApp Router service
  WHATSAPP_ROUTER_SECRET  X-Admin-Secret for the router's admin API
  CONFIGMAP_KEY           Key inside ConfigMap that holds openclaw.json  (default: openclaw.json)
  CONFIGMAP_PREFIX        ConfigMap name prefix  (default: openclaw-config-)
  DEPLOYMENT_PREFIX       Deployment name prefix (default: openclaw-)
  SHARED_NAMESPACE        If set, all tenants live in this one namespace
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, jsonify, request
from kubernetes import client, config as k8s_config
from kubernetes.client.rest import ApiException

import router_client as rc
from router_client import RouterAPIError, TenantConfig

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stdout,
    level=logging.getLevelName(os.getenv("LOG_LEVEL", "INFO")),
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
log = logging.getLogger("bot-manager")

# ─── Config ───────────────────────────────────────────────────────────────────
OPERATOR_SECRET   = os.getenv("OPERATOR_SECRET",   "operator-secret")
SHARED_NAMESPACE  = os.getenv("SHARED_NAMESPACE",  "")
CONFIGMAP_KEY     = os.getenv("CONFIGMAP_KEY",     "openclaw.json")
CONFIGMAP_PREFIX  = os.getenv("CONFIGMAP_PREFIX",  "openclaw-config-")
DEPLOYMENT_PREFIX = os.getenv("DEPLOYMENT_PREFIX", "openclaw-")

# ─── Kubernetes client ────────────────────────────────────────────────────────
try:
    k8s_config.load_incluster_config()
    log.info("Loaded in-cluster k8s config")
except k8s_config.ConfigException:
    try:
        k8s_config.load_kube_config()
        log.info("Loaded local kubeconfig")
    except Exception:
        log.warning("No k8s config available — k8s operations will fail")

core_v1  = client.CoreV1Api()
apps_v1  = client.AppsV1Api()

# ─── k8s helpers ─────────────────────────────────────────────────────────────

def _ns(tenant_id: str) -> str:
    return SHARED_NAMESPACE or tenant_id

def _cm_name(tenant_id: str) -> str:
    return f"{CONFIGMAP_PREFIX}{tenant_id}"

def _deploy_name(tenant_id: str) -> str:
    return f"{DEPLOYMENT_PREFIX}{tenant_id}"

def _load_openclaw_cfg(ns: str, cm_name: str) -> dict:
    cm  = core_v1.read_namespaced_config_map(name=cm_name, namespace=ns)
    raw = (cm.data or {}).get(CONFIGMAP_KEY)
    if raw is None:
        raise KeyError(f"'{CONFIGMAP_KEY}' not found in ConfigMap {cm_name}")
    return json.loads(raw)

def _save_openclaw_cfg(ns: str, cm_name: str, cfg: dict) -> None:
    body = {"data": {CONFIGMAP_KEY: json.dumps(cfg, indent=2)}}
    core_v1.patch_namespaced_config_map(name=cm_name, namespace=ns, body=body)
    log.info(f"ConfigMap {ns}/{cm_name} patched")

def _rollout_restart(ns: str, deploy_name: str) -> None:
    patch = {"spec": {"template": {"metadata": {"annotations": {
        "kubectl.kubernetes.io/restartedAt": datetime.now(timezone.utc).isoformat()
    }}}}}
    apps_v1.patch_namespaced_deployment(name=deploy_name, namespace=ns, body=patch)
    log.info(f"Deployment {ns}/{deploy_name} restart triggered")

def _patch_openclaw_config(tenant_id: str, router_cfg: dict | None) -> None:
    """
    Merge router_cfg into the tenant's openclaw.json ConfigMap and restart the pod.
    Pass None as router_cfg to remove the whatsappRouter block entirely.
    """
    ns      = _ns(tenant_id)
    cm_name = _cm_name(tenant_id)

    try:
        cfg = _load_openclaw_cfg(ns, cm_name)
    except ApiException as e:
        if e.status == 404:
            log.warning(f"ConfigMap {cm_name} not found in namespace {ns} — skipping k8s patch")
            return
        raise

    if router_cfg is None:
        cfg.pop("whatsappRouter", None)
    else:
        cfg["whatsappRouter"] = router_cfg

    _save_openclaw_cfg(ns, cm_name, cfg)
    _rollout_restart(ns, _deploy_name(tenant_id))

# ─── Auth decorator ───────────────────────────────────────────────────────────

def require_secret(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if request.headers.get("X-Operator-Secret", "") != OPERATOR_SECRET:
            log.warning(f"Rejected {request.method} {request.path} from {request.remote_addr}")
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper

# ─── Flask app ────────────────────────────────────────────────────────────────
app = Flask(__name__)

def _err(e: RouterAPIError):
    return jsonify({"error": str(e)}), e.status

@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "bot-manager"})


# ════════════════════════════════════════════════════════════════════════════════
# Tenant registration
# Called by Openclaw-UI when a new OpenClaw instance should be connected
# to the WhatsApp Router.
# ════════════════════════════════════════════════════════════════════════════════

@app.post("/api/whatsapp/tenants")
@require_secret
def create_tenant():
    """
    Register a new tenant in the router AND patch openclaw.json on the pod.

    Body:
    {
      "tenantId":             "tenant-a",
      "openclawExtensionUrl": "http://openclaw-tenant-a.tenant-a.svc:3000/router/inbound",
      "routerSecret":         "router-secret",
      "senderNumbers":        ["919812345678"]
    }
    """
    body = request.get_json(silent=True) or {}

    tenant_id    = body.get("tenantId")
    ext_url      = body.get("openclawExtensionUrl")
    router_secret = body.get("routerSecret", os.getenv("WHATSAPP_ROUTER_SECRET", ""))
    numbers      = body.get("senderNumbers", [])

    if not tenant_id or not ext_url:
        return jsonify({"error": "tenantId and openclawExtensionUrl are required"}), 400

    try:
        result = rc.register_tenant(TenantConfig(
            tenant_id=tenant_id,
            openclaw_extension_url=ext_url,
            sender_numbers=numbers,
        ))
    except RouterAPIError as e:
        return _err(e)

    # Patch openclaw.json on the tenant pod so it loads the extension
    _patch_openclaw_config(tenant_id, {
        "enabled":          True,
        "routerSecret":     router_secret,
        "senderNumbers":    numbers,
        "routerServiceUrl": rc.ROUTER_BASE_URL,
        "configuredAt":     datetime.now(timezone.utc).isoformat(),
    })

    log.info(f"Tenant {tenant_id} registered with {len(numbers)} number(s)")
    return jsonify(result), 201


@app.delete("/api/whatsapp/tenants/<tenant_id>")
@require_secret
def delete_tenant(tenant_id: str):
    """Remove tenant from router and clear whatsappRouter block from openclaw.json."""
    try:
        rc.remove_tenant(tenant_id)
    except RouterAPIError as e:
        return _err(e)

    _patch_openclaw_config(tenant_id, None)
    return jsonify({"tenantId": tenant_id, "removed": True})


# ════════════════════════════════════════════════════════════════════════════════
# Phone number management
# Called by Openclaw-UI when a user adds/removes a WhatsApp number
# ════════════════════════════════════════════════════════════════════════════════

@app.post("/api/whatsapp/tenants/<tenant_id>/numbers")
@require_secret
def add_number(tenant_id: str):
    """
    Link a WhatsApp number to a tenant.

    Body: { "number": "919812345678" }
    """
    body   = request.get_json(silent=True) or {}
    number = body.get("number")
    if not number:
        return jsonify({"error": "number is required"}), 400

    try:
        result = rc.add_number(tenant_id, number)
    except RouterAPIError as e:
        return _err(e)

    # Keep openclaw.json in sync
    try:
        ns, cm_name = _ns(tenant_id), _cm_name(tenant_id)
        cfg = _load_openclaw_cfg(ns, cm_name)
        wa_cfg = cfg.setdefault("whatsappRouter", {})
        nums   = wa_cfg.setdefault("senderNumbers", [])
        if number not in nums:
            nums.append(number)
            wa_cfg["configuredAt"] = datetime.now(timezone.utc).isoformat()
            _save_openclaw_cfg(ns, cm_name, cfg)
            _rollout_restart(ns, _deploy_name(tenant_id))
    except (ApiException, KeyError) as e:
        log.warning(f"Could not sync openclaw.json for tenant {tenant_id}: {e}")

    return jsonify(result), 201


@app.delete("/api/whatsapp/tenants/<tenant_id>/numbers/<number>")
@require_secret
def remove_number(tenant_id: str, number: str):
    """Unlink a WhatsApp number from a tenant."""
    try:
        result = rc.remove_number(tenant_id, number)
    except RouterAPIError as e:
        return _err(e)

    try:
        ns, cm_name = _ns(tenant_id), _cm_name(tenant_id)
        cfg    = _load_openclaw_cfg(ns, cm_name)
        wa_cfg = cfg.get("whatsappRouter", {})
        nums   = wa_cfg.get("senderNumbers", [])
        if number in nums:
            nums.remove(number)
            wa_cfg["configuredAt"] = datetime.now(timezone.utc).isoformat()
            _save_openclaw_cfg(ns, cm_name, cfg)
            _rollout_restart(ns, _deploy_name(tenant_id))
    except (ApiException, KeyError) as e:
        log.warning(f"Could not sync openclaw.json for tenant {tenant_id}: {e}")

    return jsonify(result)


# ════════════════════════════════════════════════════════════════════════════════
# Enable / disable routing
# ════════════════════════════════════════════════════════════════════════════════

@app.post("/api/whatsapp/tenants/<tenant_id>/enable")
@require_secret
def enable_tenant(tenant_id: str):
    try:
        result = rc.enable_tenant(tenant_id)
    except RouterAPIError as e:
        return _err(e)

    try:
        ns, cm_name = _ns(tenant_id), _cm_name(tenant_id)
        cfg = _load_openclaw_cfg(ns, cm_name)
        cfg.setdefault("whatsappRouter", {})["enabled"] = True
        _save_openclaw_cfg(ns, cm_name, cfg)
        _rollout_restart(ns, _deploy_name(tenant_id))
    except (ApiException, KeyError) as e:
        log.warning(f"k8s sync skipped for tenant {tenant_id}: {e}")

    return jsonify(result)


@app.post("/api/whatsapp/tenants/<tenant_id>/disable")
@require_secret
def disable_tenant(tenant_id: str):
    try:
        result = rc.disable_tenant(tenant_id)
    except RouterAPIError as e:
        return _err(e)

    try:
        ns, cm_name = _ns(tenant_id), _cm_name(tenant_id)
        cfg = _load_openclaw_cfg(ns, cm_name)
        cfg.setdefault("whatsappRouter", {})["enabled"] = False
        _save_openclaw_cfg(ns, cm_name, cfg)
        _rollout_restart(ns, _deploy_name(tenant_id))
    except (ApiException, KeyError) as e:
        log.warning(f"k8s sync skipped for tenant {tenant_id}: {e}")

    return jsonify(result)


# ════════════════════════════════════════════════════════════════════════════════
# Status — Openclaw-UI reads these to show connection state
# ════════════════════════════════════════════════════════════════════════════════

@app.get("/api/whatsapp/status")
@require_secret
def whatsapp_status():
    """WhatsApp Router connection status (connecting / qr_ready / open / closed)."""
    try:
        return jsonify(rc.get_whatsapp_status())
    except RouterAPIError as e:
        return _err(e)


@app.get("/api/whatsapp/qr-url")
@require_secret
def qr_url():
    """
    Returns the URL of the QR code PNG.
    Openclaw-UI embeds this URL in an <img> tag so the user can scan it.
    """
    return jsonify({"qrUrl": rc.get_qr_url()})


@app.get("/api/whatsapp/tenants")
@require_secret
def list_tenants():
    try:
        return jsonify({"tenants": rc.list_tenants()})
    except RouterAPIError as e:
        return _err(e)


@app.get("/api/whatsapp/tenants/<tenant_id>")
@require_secret
def get_tenant(tenant_id: str):
    try:
        return jsonify(rc.get_tenant(tenant_id))
    except RouterAPIError as e:
        return _err(e)


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("OPERATOR_PORT", "8080"))
    log.info(f"Bot-manager starting on port {port}")
    app.run(host="0.0.0.0", port=port)
